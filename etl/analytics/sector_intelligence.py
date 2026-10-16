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

Los tableros por región y el cruce sector × región se retiraron: nada los leía.
"""

import logging

import polars as pl

from .agregacion import ContadorDistintos
from .compra_agil_mensual import ESTADOS_CANCELADOS
from .config import OC_PARQUET_DIR, OUTPUT_DIR
from .data_loader import (
    VENTANA_ANALYTICS_MESES,
    con_ventana,
    iter_oc_parquets,
    limites_ventana,
    orden_por_fila,
)

logger = logging.getLogger(__name__)


def build_sector_dashboard() -> pl.DataFrame:
    """Agrega métricas por sector desde OC."""
    logger.info("Construyendo dashboard por sector...")

    cols_needed = [
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "sector",
        "CodigoProveedor",
        "NombreProveedor",
        "RubroN2",
        "MontoTotalOC_PesosChilenos",
        "Estado",
        "FechaEnvio",
        "FechaAceptacion",
        "_periodo_archivo",
    ]

    frames = []
    # Los conteos de entidades distintas NO pueden salir de un `n_unique()` por
    # tanda combinado con `max()`: eso da el mes más movido, no la historia. Ver
    # `agregacion.py` — el dashboard declaraba 49.116 proveedores donde hay
    # 313.129.
    distintos = {
        "n_organismos": ContadorDistintos("sector", "CodigoOrganismoPublico"),
        "n_proveedores": ContadorDistintos("sector", "CodigoProveedor"),
        "n_rubros": ContadorDistintos("sector", "RubroN2"),
    }

    for _periodo, df in iter_oc_parquets(columns=cols_needed):
        if "sector" not in df.columns:
            continue
        # Una orden cancelada no compró nada: ni suma ni cuenta. La Gran Compra
        # de 36 M «UF» del MOP era una de ellas. Las mismas que en Compra Ágil.
        if "Estado" in df.columns:
            df = df.filter(~pl.col("Estado").is_in(ESTADOS_CANCELADOS).fill_null(True))

        for contador in distintos.values():
            contador.añadir(df)

        batch = (
            orden_por_fila(df)
            .filter(
                pl.col("sector").is_not_null()
                & (pl.col("sector") != "null")
                & (pl.col("sector") != "")
            )
            # El total de la ORDEN, una vez por orden: sector y región son de
            # la orden, y el ticket es por orden, no por línea.
            .with_columns(pl.col("MontoTotalOC_PesosChilenos").alias("monto"))
            .group_by("sector")
            .agg(
                [
                    pl.len().alias("n_oc"),
                    pl.col("monto").sum().alias("monto_total"),
                    pl.col("monto").median().alias("ticket_mediana"),
                    pl.col("monto").mean().alias("ticket_promedio"),
                ]
            )
        )
        frames.append(batch)

    if not frames:
        return pl.DataFrame()

    combined = pl.concat(frames, how="diagonal_relaxed")
    result = combined.group_by("sector").agg(
        [
            pl.col("n_oc").sum(),
            pl.col("monto_total").sum(),
            (pl.col("ticket_mediana") * pl.col("n_oc")).sum().alias("_wt_med"),
            (pl.col("ticket_promedio") * pl.col("n_oc")).sum().alias("_wt_avg"),
        ]
    )
    for alias, contador in distintos.items():
        conteos = contador.conteos(alias)
        result = (
            result.join(conteos, on="sector", how="left")
            if not conteos.is_empty()
            else result.with_columns(pl.lit(None, dtype=pl.UInt32).alias(alias))
        )
    result = (
        result.with_columns(
            [
                (pl.col("_wt_med") / pl.col("n_oc")).alias("ticket_mediana"),
                (pl.col("_wt_avg") / pl.col("n_oc")).alias("ticket_promedio"),
                # Accesibilidad: más proveedores por OC = más competitivo pero más accesible
                (pl.col("n_proveedores") / pl.col("n_oc").clip(lower_bound=1)).alias(
                    "ratio_proveedores_oc"
                ),
                # Monto promedio por organismo (tamaño del comprador promedio)
                (pl.col("monto_total") / pl.col("n_organismos").clip(lower_bound=1)).alias(
                    "monto_por_organismo"
                ),
            ]
        )
        .drop(["_wt_med", "_wt_avg"])
        .sort("monto_total", descending=True)
    )

    logger.info(f"Sectores: {len(result):,}")
    return result


def run_sector_intelligence() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline de inteligencia por sector."""
    logger.info("=" * 60)
    logger.info("INTELIGENCIA POR SECTOR Y REGIÓN")
    logger.info("=" * 60)

    sector = build_sector_dashboard()
    # Con su periodo: la portada dice de qué meses es el gasto por sector, y una
    # cifra sin periodo se lee como «de siempre». Sólo si hay filas: `con_ventana`
    # sobre un DataFrame vacío y sin columnas fabrica una fila de puras fechas.
    if not sector.is_empty():
        sector = con_ventana(sector, limites_ventana(OC_PARQUET_DIR, VENTANA_ANALYTICS_MESES))
    sector_path = OUTPUT_DIR / "sector_dashboard.parquet"
    sector.write_parquet(sector_path, compression="snappy")
    logger.info(f"Guardado: {sector_path.name}")

    # Log top sectores
    logger.info("\nTop 10 sectores por monto:")
    for row in sector.head(10).iter_rows(named=True):
        monto_b = row["monto_total"] / 1e9 if row["monto_total"] else 0
        logger.info(
            f"  {row['sector']:30s} — ${monto_b:,.1f}B CLP | {row['n_oc']:>10,} OC | {row['n_proveedores']:>6,} proveedores"
        )

    return {"sector": sector}
