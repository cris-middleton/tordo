"""
Inteligencia por Sector

Agrega métricas a nivel de sector para que los usuarios de TORDO
puedan evaluar en qué sectores conviene operar.

Métricas por sector:
  - Volumen total de compras (monto y cantidad)
  - Ticket promedio y mediana
  - Número de organismos compradores
  - Número de proveedores activos
  - Concentración de mercado (HHI promedio)
  - Velocidad de pago promedio (buyer_scores)
  - Tasa de crecimiento (últimos 3 años)
  - Estacionalidad dominante (meses pico)
  - Accesibilidad (qué tan fácil es entrar: n_proveedores / n_oc)

Output:
  - sector_dashboard.parquet: métricas agregadas por sector
  - region_dashboard.parquet: métricas agregadas por región
  - sector_region_matrix.parquet: cruce sector × región
"""

import logging

import numpy as np
import polars as pl

from .config import OUTPUT_DIR
from .data_loader import iter_oc_parquets

logger = logging.getLogger(__name__)


def build_sector_dashboard() -> pl.DataFrame:
    """Agrega métricas por sector desde OC."""
    logger.info("Construyendo dashboard por sector...")

    cols_needed = [
        "CodigoOrganismoPublico", "OrganismoPublico", "sector",
        "CodigoProveedor", "NombreProveedor", "RubroN2",
        "MontoTotalOC_PesosChilenos", "FechaEnvio", "FechaAceptacion",
        "_periodo_archivo",
    ]

    frames = []

    for periodo, df in iter_oc_parquets(columns=cols_needed):
        if "sector" not in df.columns:
            continue

        batch = (
            df
            .filter(
                pl.col("sector").is_not_null() &
                (pl.col("sector") != "null") &
                (pl.col("sector") != "")
            )
            .with_columns([
                pl.col("MontoTotalOC_PesosChilenos").cast(pl.Float64, strict=False).alias("monto"),
            ])
            .group_by("sector")
            .agg([
                pl.len().alias("n_oc"),
                pl.col("monto").sum().alias("monto_total"),
                pl.col("monto").median().alias("ticket_mediana"),
                pl.col("monto").mean().alias("ticket_promedio"),
                pl.col("CodigoOrganismoPublico").n_unique().alias("n_organismos"),
                pl.col("CodigoProveedor").n_unique().alias("n_proveedores"),
                pl.col("RubroN2").n_unique().alias("n_rubros"),
            ])
        )
        frames.append(batch)

    if not frames:
        return pl.DataFrame()

    combined = pl.concat(frames, how="diagonal_relaxed")
    result = (
        combined
        .group_by("sector")
        .agg([
            pl.col("n_oc").sum(),
            pl.col("monto_total").sum(),
            (pl.col("ticket_mediana") * pl.col("n_oc")).sum().alias("_wt_med"),
            (pl.col("ticket_promedio") * pl.col("n_oc")).sum().alias("_wt_avg"),
            pl.col("n_organismos").max().alias("n_organismos"),
            pl.col("n_proveedores").max().alias("n_proveedores"),
            pl.col("n_rubros").max().alias("n_rubros"),
        ])
        .with_columns([
            (pl.col("_wt_med") / pl.col("n_oc")).alias("ticket_mediana"),
            (pl.col("_wt_avg") / pl.col("n_oc")).alias("ticket_promedio"),
            # Accesibilidad: más proveedores por OC = más competitivo pero más accesible
            (pl.col("n_proveedores") / pl.col("n_oc").clip(lower_bound=1)).alias("ratio_proveedores_oc"),
            # Monto promedio por organismo (tamaño del comprador promedio)
            (pl.col("monto_total") / pl.col("n_organismos").clip(lower_bound=1)).alias("monto_por_organismo"),
        ])
        .drop(["_wt_med", "_wt_avg"])
        .sort("monto_total", descending=True)
    )

    logger.info(f"Sectores: {len(result):,}")
    return result


def build_region_dashboard() -> pl.DataFrame:
    """Agrega métricas por región."""
    logger.info("Construyendo dashboard por región...")

    cols_needed = [
        "RegionUnidadCompra", "sector", "CodigoOrganismoPublico",
        "CodigoProveedor", "MontoTotalOC_PesosChilenos",
    ]

    frames = []

    for periodo, df in iter_oc_parquets(columns=cols_needed):
        if "RegionUnidadCompra" not in df.columns:
            continue

        batch = (
            df
            .filter(
                pl.col("RegionUnidadCompra").is_not_null() &
                (pl.col("RegionUnidadCompra") != "null") &
                (pl.col("RegionUnidadCompra") != "")
            )
            .with_columns([
                pl.col("MontoTotalOC_PesosChilenos").cast(pl.Float64, strict=False).alias("monto"),
            ])
            .group_by("RegionUnidadCompra")
            .agg([
                pl.len().alias("n_oc"),
                pl.col("monto").sum().alias("monto_total"),
                pl.col("monto").median().alias("ticket_mediana"),
                pl.col("CodigoOrganismoPublico").n_unique().alias("n_organismos"),
                pl.col("CodigoProveedor").n_unique().alias("n_proveedores"),
            ])
        )
        frames.append(batch)

    if not frames:
        return pl.DataFrame()

    combined = pl.concat(frames, how="diagonal_relaxed")
    result = (
        combined
        .group_by("RegionUnidadCompra")
        .agg([
            pl.col("n_oc").sum(),
            pl.col("monto_total").sum(),
            (pl.col("ticket_mediana") * pl.col("n_oc")).sum().alias("_wt_med"),
            pl.col("n_organismos").max().alias("n_organismos"),
            pl.col("n_proveedores").max().alias("n_proveedores"),
        ])
        .with_columns([
            (pl.col("_wt_med") / pl.col("n_oc")).alias("ticket_mediana"),
        ])
        .drop("_wt_med")
        .sort("monto_total", descending=True)
    )

    logger.info(f"Regiones: {len(result):,}")
    return result


def build_sector_region_matrix() -> pl.DataFrame:
    """Cruce sector × región con volumen y monto."""
    logger.info("Construyendo matriz sector × región...")

    cols_needed = [
        "sector", "RegionUnidadCompra",
        "MontoTotalOC_PesosChilenos", "CodigoProveedor",
    ]

    frames = []

    for periodo, df in iter_oc_parquets(columns=cols_needed):
        if "sector" not in df.columns or "RegionUnidadCompra" not in df.columns:
            continue

        batch = (
            df
            .filter(
                pl.col("sector").is_not_null() & (pl.col("sector") != "null") &
                pl.col("RegionUnidadCompra").is_not_null() & (pl.col("RegionUnidadCompra") != "null")
            )
            .with_columns([
                pl.col("MontoTotalOC_PesosChilenos").cast(pl.Float64, strict=False).alias("monto"),
            ])
            .group_by(["sector", "RegionUnidadCompra"])
            .agg([
                pl.len().alias("n_oc"),
                pl.col("monto").sum().alias("monto_total"),
                pl.col("CodigoProveedor").n_unique().alias("n_proveedores"),
            ])
        )
        frames.append(batch)

    if not frames:
        return pl.DataFrame()

    combined = pl.concat(frames, how="diagonal_relaxed")
    result = (
        combined
        .group_by(["sector", "RegionUnidadCompra"])
        .agg([
            pl.col("n_oc").sum(),
            pl.col("monto_total").sum(),
            pl.col("n_proveedores").max(),
        ])
        .sort(["sector", "monto_total"], descending=[False, True])
    )

    logger.info(f"Combinaciones sector×región: {len(result):,}")
    return result


def run_sector_intelligence() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline de inteligencia por sector."""
    logger.info("=" * 60)
    logger.info("INTELIGENCIA POR SECTOR Y REGIÓN")
    logger.info("=" * 60)

    sector = build_sector_dashboard()
    sector_path = OUTPUT_DIR / "sector_dashboard.parquet"
    sector.write_parquet(sector_path, compression="snappy")
    logger.info(f"Guardado: {sector_path.name}")

    region = build_region_dashboard()
    region_path = OUTPUT_DIR / "region_dashboard.parquet"
    region.write_parquet(region_path, compression="snappy")
    logger.info(f"Guardado: {region_path.name}")

    matrix = build_sector_region_matrix()
    matrix_path = OUTPUT_DIR / "sector_region_matrix.parquet"
    matrix.write_parquet(matrix_path, compression="snappy")
    logger.info(f"Guardado: {matrix_path.name}")

    # Log top sectores
    logger.info("\nTop 10 sectores por monto:")
    for row in sector.head(10).iter_rows(named=True):
        monto_b = row["monto_total"] / 1e9 if row["monto_total"] else 0
        logger.info(f"  {row['sector']:30s} — ${monto_b:,.1f}B CLP | {row['n_oc']:>10,} OC | {row['n_proveedores']:>6,} proveedores")

    return {"sector": sector, "region": region, "matrix": matrix}
