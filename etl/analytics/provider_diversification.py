"""
Score de Diversificación del Proveedor

Mide el riesgo de concentración de un proveedor PYME en sus clientes y mercados.
Una PYME muy dependiente de un solo organismo es vulnerable:
si ese cliente deja de comprar, la empresa pierde sus ingresos.

Métricas calculadas por proveedor:

  1. HHI de clientes (organismos)
     hhi_org = Σ(share_organismo²)  ∈ [0, 1]
     hhi=1 → todo el revenue en 1 cliente
     hhi<0.15 → diversificado (> ~7 clientes igualitarios)

  2. Número de sectores activos (Salud, Educación, etc.)
  3. Número de regiones activas
  4. Número de rubros activos (Rubro2)
  5. Antigüedad como proveedor (años desde primera OC)
  6. Recurrencia: porcentaje de organismos que repiten compra

Score de diversificación (0 = muy concentrado, 1 = muy diversificado):
  score_div = 0.40 × (1 - hhi_org)
            + 0.20 × clamp(n_sectores / 5, 0, 1)
            + 0.20 × clamp(n_regiones / 8, 0, 1)
            + 0.10 × clamp(n_rubros / 10, 0, 1)
            + 0.10 × clamp(pct_clientes_recurrentes, 0, 1)

Alerta de concentración:
  Si hhi_org > 0.50 Y n_oc_total > 20 → "riesgo alto de dependencia"

Output:
  - provider_diversification.parquet: scores por proveedor
  - provider_concentration_alerts.parquet: proveedores con riesgo alto
"""

import logging

import polars as pl

from .config import OUTPUT_DIR
from .data_loader import iter_oc_parquets

logger = logging.getLogger(__name__)

MIN_OC = 10  # mínimo de OC para calcular métricas confiables


def build_provider_metrics() -> pl.DataFrame:
    """
    Agrega métricas de diversificación por proveedor desde OC históricas.
    Map-reduce: procesa un parquet a la vez.
    """
    logger.info("Calculando métricas de diversificación por proveedor...")

    cols_needed = [
        "CodigoProveedor",
        "NombreProveedor",
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "sector",
        "RegionUnidadCompra",
        "RubroN2",
        "MontoTotalOC_PesosChilenos",
        "_periodo_archivo",
    ]

    # Acumuladores (map-reduce)
    org_revenue_frames = []  # proveedor × organismo × monto
    sector_frames = []  # proveedor × sectores únicos
    region_frames = []  # proveedor × regiones únicas
    rubro_frames = []  # proveedor × rubros únicos
    period_frames = []  # proveedor × períodos (para antigüedad y recurrencia)

    for periodo, df in iter_oc_parquets(columns=cols_needed):
        prov_col = "CodigoProveedor"
        if prov_col not in df.columns:
            continue

        base = df.filter(
            pl.col(prov_col).is_not_null() & (pl.col(prov_col) != "null")
        ).with_columns(
            [
                pl.col("MontoTotalOC_PesosChilenos").cast(pl.Float64, strict=False).alias("monto"),
            ]
        )

        # Revenue por organismo
        if "CodigoOrganismoPublico" in df.columns:
            org_rev = base.group_by([prov_col, "CodigoOrganismoPublico"]).agg(
                [
                    pl.col("monto").sum().alias("monto_org"),
                    pl.len().alias("n_oc_org"),
                ]
            )
            org_revenue_frames.append(org_rev)

        # Sectores únicos
        if "sector" in df.columns:
            sec = (
                base.filter(pl.col("sector").is_not_null() & (pl.col("sector") != "null"))
                .select([prov_col, "sector"])
                .unique()
            )
            sector_frames.append(sec)

        # Regiones únicas
        if "RegionUnidadCompra" in df.columns:
            reg = (
                base.filter(pl.col("RegionUnidadCompra").is_not_null())
                .select([prov_col, "RegionUnidadCompra"])
                .unique()
            )
            region_frames.append(reg)

        # Rubros únicos
        if "RubroN2" in df.columns:
            rub = (
                base.filter(pl.col("RubroN2").is_not_null()).select([prov_col, "RubroN2"]).unique()
            )
            rubro_frames.append(rub)

        # Períodos activos y nombre
        if "_periodo_archivo" in df.columns:
            prd = base.group_by([prov_col]).agg(
                [
                    pl.col("NombreProveedor").first(),
                    pl.col("_periodo_archivo").n_unique().alias("n_periodos"),
                    pl.len().alias("n_oc"),
                    pl.col("monto").sum().alias("monto_total"),
                    pl.col("_periodo_archivo").min().alias("primer_periodo"),
                    pl.col("_periodo_archivo").max().alias("ultimo_periodo"),
                ]
            )
            period_frames.append(prd)

    if not period_frames:
        return pl.DataFrame()

    # ─── Re-agregar globalmente ───

    prov_col = "CodigoProveedor"

    # Base: volumen y períodos
    base_df = (
        pl.concat(period_frames, how="diagonal_relaxed")
        .group_by(prov_col)
        .agg(
            [
                pl.col("NombreProveedor").first(),
                pl.col("n_oc").sum(),
                pl.col("monto_total").sum(),
                pl.col("n_periodos").sum().alias("n_periodos_activo"),
                pl.col("primer_periodo").min(),
                pl.col("ultimo_periodo").max(),
            ]
        )
        .filter(pl.col("n_oc") >= MIN_OC)
    )

    logger.info(f"Proveedores con ≥{MIN_OC} OC: {len(base_df):,}")

    # HHI de organismos
    hhi_df = pl.DataFrame()
    if org_revenue_frames:
        org_rev_total = (
            pl.concat(org_revenue_frames, how="diagonal_relaxed")
            .group_by([prov_col, "CodigoOrganismoPublico"])
            .agg(
                [
                    pl.col("monto_org").sum(),
                    pl.col("n_oc_org").sum(),
                ]
            )
        )
        prov_totals = org_rev_total.group_by(prov_col).agg(
            [
                pl.col("monto_org").sum().alias("monto_total_prov"),
                pl.len().alias("n_organismos"),
                pl.col("n_oc_org").sum().alias("n_oc_check"),
            ]
        )
        hhi_df = (
            org_rev_total.join(prov_totals, on=prov_col)
            .with_columns(
                [
                    (
                        (pl.col("monto_org") / pl.col("monto_total_prov").clip(lower_bound=0.01))
                        ** 2
                    ).alias("share_sq"),
                    # Recurrencia: organismos con >1 OC
                    (pl.col("n_oc_org") > 1).cast(pl.Int8).alias("es_recurrente"),
                ]
            )
            .group_by(prov_col)
            .agg(
                [
                    pl.col("share_sq").sum().alias("hhi_org"),
                    pl.col("n_organismos").first(),
                    pl.col("es_recurrente").mean().alias("pct_clientes_recurrentes"),
                    pl.col("monto_org").max().alias("monto_cliente_principal"),
                    pl.col("monto_total_prov").first(),
                ]
            )
        )

    # Diversidad de sectores, regiones, rubros
    n_sectores = (
        (
            pl.concat(sector_frames, how="diagonal_relaxed")
            .select([prov_col, "sector"])
            .unique()
            .group_by(prov_col)
            .agg(pl.len().alias("n_sectores"))
        )
        if sector_frames
        else pl.DataFrame({prov_col: [], "n_sectores": []})
    )

    n_regiones = (
        (
            pl.concat(region_frames, how="diagonal_relaxed")
            .select([prov_col, "RegionUnidadCompra"])
            .unique()
            .group_by(prov_col)
            .agg(pl.len().alias("n_regiones"))
        )
        if region_frames
        else pl.DataFrame({prov_col: [], "n_regiones": []})
    )

    n_rubros = (
        (
            pl.concat(rubro_frames, how="diagonal_relaxed")
            .select([prov_col, "RubroN2"])
            .unique()
            .group_by(prov_col)
            .agg(pl.len().alias("n_rubros"))
        )
        if rubro_frames
        else pl.DataFrame({prov_col: [], "n_rubros": []})
    )

    # Merge todo
    result = (
        base_df.join(hhi_df, on=prov_col, how="left")
        .join(n_sectores, on=prov_col, how="left")
        .join(n_regiones, on=prov_col, how="left")
        .join(n_rubros, on=prov_col, how="left")
        .with_columns(
            [
                pl.col("hhi_org").fill_null(1.0),
                pl.col("n_organismos").fill_null(1),
                pl.col("pct_clientes_recurrentes").fill_null(0.0),
                pl.col("n_sectores").fill_null(1),
                pl.col("n_regiones").fill_null(1),
                pl.col("n_rubros").fill_null(1),
            ]
        )
    )

    # Score de diversificación
    result = (
        result.with_columns(
            [
                (
                    0.40 * (1 - pl.col("hhi_org")).clip(0, 1)
                    + 0.20 * (pl.col("n_sectores") / 5).clip(0, 1)
                    + 0.20 * (pl.col("n_regiones") / 8).clip(0, 1)
                    + 0.10 * (pl.col("n_rubros") / 10).clip(0, 1)
                    + 0.10 * pl.col("pct_clientes_recurrentes")
                )
                .round(4)
                .alias("score_diversificacion"),
            ]
        )
        .with_columns(
            [
                pl.when(pl.col("score_diversificacion") >= 0.70)
                .then(pl.lit("muy_diversificado"))
                .when(pl.col("score_diversificacion") >= 0.50)
                .then(pl.lit("diversificado"))
                .when(pl.col("score_diversificacion") >= 0.30)
                .then(pl.lit("moderado"))
                .when(pl.col("score_diversificacion") >= 0.15)
                .then(pl.lit("concentrado"))
                .otherwise(pl.lit("muy_concentrado"))
                .alias("clasificacion"),
                # Flag de riesgo: alta concentración con suficiente historial
                ((pl.col("hhi_org") > 0.50) & (pl.col("n_oc") >= 20)).alias("alerta_dependencia"),
            ]
        )
        .sort("score_diversificacion", descending=True)
    )

    return result


def run_provider_diversification() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline de score de diversificación."""
    logger.info("=" * 60)
    logger.info("SCORE DE DIVERSIFICACIÓN DE PROVEEDORES")
    logger.info("=" * 60)

    metrics = build_provider_metrics()
    if metrics.is_empty():
        logger.error("No se obtuvieron métricas de proveedores")
        return {}

    path = OUTPUT_DIR / "provider_diversification.parquet"
    metrics.write_parquet(path, compression="snappy")
    logger.info(f"Guardado: {path.name} ({path.stat().st_size / 1024 / 1024:.1f} MB)")

    # Alertas de concentración
    alerts = (
        metrics.filter(pl.col("alerta_dependencia"))
        .select(
            [
                "CodigoProveedor",
                "NombreProveedor",
                "score_diversificacion",
                "clasificacion",
                "hhi_org",
                "n_organismos",
                "n_oc",
                "monto_total",
                "n_sectores",
                "n_regiones",
            ]
        )
        .sort("hhi_org", descending=True)
    )
    alerts_path = OUTPUT_DIR / "provider_concentration_alerts.parquet"
    alerts.write_parquet(alerts_path, compression="snappy")
    logger.info(f"Guardado: {alerts_path.name} — {len(alerts):,} proveedores con alerta")

    # Stats de distribución
    logger.info(f"\nProveedores evaluados: {len(metrics):,}")
    for cat in ["muy_diversificado", "diversificado", "moderado", "concentrado", "muy_concentrado"]:
        n = metrics.filter(pl.col("clasificacion") == cat).height
        logger.info(f"  {cat}: {n:,} ({100 * n / max(len(metrics), 1):.1f}%)")

    n_alert = metrics.filter(pl.col("alerta_dependencia")).height
    logger.info(f"\nCon alerta de dependencia: {n_alert:,} proveedores")
    logger.info(f"HHI mediano: {metrics['hhi_org'].median():.3f}")

    return {"diversification": metrics, "alerts": alerts}
