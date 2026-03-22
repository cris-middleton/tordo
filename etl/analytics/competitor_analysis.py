"""
Análisis de Competidores

Mapea quién gana qué, dónde, y con qué frecuencia.

Para cada (organismo, rubro):
  - Top proveedores por volumen y monto
  - Market share (% del gasto total)
  - Win rate (frecuencia relativa)
  - Concentración del mercado (HHI - Herfindahl-Hirschman Index)

Para cada proveedor:
  - Organismos donde más vende
  - Rubros de especialización
  - Evolución temporal

Output:
  - competitors_by_market.parquet: top proveedores por (organismo, rubro)
  - provider_profiles.parquet: perfil completo por proveedor
  - market_concentration.parquet: HHI y métricas de concentración
"""

import logging

import polars as pl

from .config import OUTPUT_DIR, MIN_OBSERVATIONS
from .data_loader import iter_oc_parquets

logger = logging.getLogger(__name__)


def build_competitor_aggregates() -> tuple[pl.DataFrame, pl.DataFrame]:
    """
    Pre-agrega proveedores por (organismo, rubro) y por proveedor individual.
    """
    logger.info("Construyendo agregados de competidores...")

    cols_needed = [
        "CodigoOrganismoPublico", "OrganismoPublico", "RubroN2",
        "CodigoProveedor", "NombreProveedor", "MontoTotalOC_PesosChilenos",
        "RegionUnidadCompra", "FechaCreacion", "_periodo_archivo",
    ]

    market_frames = []
    provider_frames = []

    for periodo, df in iter_oc_parquets(columns=cols_needed):
        if "CodigoProveedor" not in df.columns:
            continue

        base = df.with_columns([
            pl.col("MontoTotalOC_PesosChilenos").cast(pl.Float64, strict=False).alias("monto"),
        ]).filter(
            pl.col("monto").is_not_null() &
            (pl.col("monto") > 0) &
            pl.col("CodigoProveedor").is_not_null()
        )

        # Agregado por mercado (organismo + rubro + proveedor)
        market_agg = (
            base
            .group_by(["CodigoOrganismoPublico", "OrganismoPublico",
                       "RubroN2", "CodigoProveedor", "NombreProveedor"])
            .agg([
                pl.len().alias("n_oc"),
                pl.col("monto").sum().alias("monto_total"),
            ])
        )
        market_frames.append(market_agg)

        # Agregado por proveedor (perfil general)
        prov_agg = (
            base
            .group_by(["CodigoProveedor", "NombreProveedor"])
            .agg([
                pl.len().alias("n_oc"),
                pl.col("monto").sum().alias("monto_total"),
                pl.col("CodigoOrganismoPublico").n_unique().alias("n_organismos"),
                pl.col("RubroN2").n_unique().alias("n_rubros"),
                pl.col("RegionUnidadCompra").n_unique().alias("n_regiones"),
            ])
        )
        provider_frames.append(prov_agg)

    # Combinar mercados
    markets = pl.concat(market_frames, how="diagonal_relaxed")
    markets = (
        markets
        .group_by(["CodigoOrganismoPublico", "OrganismoPublico",
                   "RubroN2", "CodigoProveedor", "NombreProveedor"])
        .agg([
            pl.col("n_oc").sum(),
            pl.col("monto_total").sum(),
        ])
    )

    # Combinar proveedores
    providers = pl.concat(provider_frames, how="diagonal_relaxed")
    providers = (
        providers
        .group_by(["CodigoProveedor", "NombreProveedor"])
        .agg([
            pl.col("n_oc").sum(),
            pl.col("monto_total").sum(),
            pl.col("n_organismos").max(),  # approx: max across batches
            pl.col("n_rubros").max(),
            pl.col("n_regiones").max(),
        ])
    )

    logger.info(f"Mercados: {len(markets):,} combinaciones | Proveedores: {len(providers):,}")
    return markets, providers


def compute_market_shares(markets: pl.DataFrame) -> pl.DataFrame:
    """
    Calcula market share y ranking de cada proveedor dentro de su mercado.
    """
    logger.info("Calculando market shares...")

    # Total por mercado
    market_totals = (
        markets
        .group_by(["CodigoOrganismoPublico", "RubroN2"])
        .agg([
            pl.col("monto_total").sum().alias("monto_mercado"),
            pl.col("n_oc").sum().alias("oc_mercado"),
            pl.col("CodigoProveedor").n_unique().alias("n_proveedores"),
        ])
        .filter(pl.col("oc_mercado") >= MIN_OBSERVATIONS)
    )

    result = (
        markets
        .join(market_totals, on=["CodigoOrganismoPublico", "RubroN2"], how="inner")
        .with_columns([
            (pl.col("monto_total") / pl.col("monto_mercado") * 100).alias("market_share_pct"),
            (pl.col("n_oc") / pl.col("oc_mercado") * 100).alias("win_rate_pct"),
        ])
        # Ranking dentro de cada mercado
        .with_columns([
            pl.col("monto_total")
            .rank(descending=True)
            .over(["CodigoOrganismoPublico", "RubroN2"])
            .alias("rank_monto"),
        ])
        .sort(["CodigoOrganismoPublico", "RubroN2", "rank_monto"])
    )

    logger.info(f"Market shares: {len(result):,} filas")
    return result


def compute_market_concentration(market_shares: pl.DataFrame) -> pl.DataFrame:
    """
    Calcula Herfindahl-Hirschman Index (HHI) por mercado.
    HHI = Σ(market_share_i²)
    - HHI < 1500: mercado competitivo
    - HHI 1500-2500: moderadamente concentrado
    - HHI > 2500: altamente concentrado

    Mercados concentrados = oportunidad para nuevos entrantes es baja.
    Mercados competitivos = más oportunidad pero más competencia.
    """
    logger.info("Calculando concentración de mercados (HHI)...")

    hhi = (
        market_shares
        .with_columns([
            (pl.col("market_share_pct").pow(2)).alias("share_sq"),
        ])
        .group_by(["CodigoOrganismoPublico", "OrganismoPublico", "RubroN2"])
        .agg([
            pl.col("share_sq").sum().alias("hhi"),
            pl.col("CodigoProveedor").n_unique().alias("n_proveedores"),
            pl.col("oc_mercado").first().alias("n_transacciones"),
            pl.col("monto_mercado").first().alias("monto_total_mercado"),
            # Top proveedor
            pl.col("NombreProveedor").sort_by("rank_monto").first().alias("top_proveedor"),
            pl.col("market_share_pct").sort_by("rank_monto", descending=True).first().alias("top_share_pct"),
        ])
        .with_columns([
            pl.when(pl.col("hhi") < 1500).then(pl.lit("competitivo"))
            .when(pl.col("hhi") < 2500).then(pl.lit("moderado"))
            .otherwise(pl.lit("concentrado"))
            .alias("tipo_mercado"),
        ])
        .sort("hhi", descending=True)
    )

    for tipo in ["competitivo", "moderado", "concentrado"]:
        n = hhi.filter(pl.col("tipo_mercado") == tipo).shape[0]
        logger.info(f"  {tipo}: {n:,} mercados")

    return hhi


def build_provider_profiles(providers: pl.DataFrame) -> pl.DataFrame:
    """Enriquece perfiles de proveedores con métricas calculadas."""
    return (
        providers
        .filter(pl.col("n_oc") >= 3)
        .with_columns([
            (pl.col("monto_total") / pl.col("n_oc")).alias("ticket_promedio"),
        ])
        .sort("monto_total", descending=True)
    )


def run_competitor_analysis() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline completo de análisis de competidores."""
    logger.info("=" * 60)
    logger.info("ANÁLISIS DE COMPETIDORES")
    logger.info("=" * 60)

    markets, providers = build_competitor_aggregates()

    # Market shares
    market_shares = compute_market_shares(markets)
    ms_path = OUTPUT_DIR / "competitors_by_market.parquet"
    market_shares.write_parquet(ms_path, compression="snappy")
    logger.info(f"Guardado: {ms_path.name} ({ms_path.stat().st_size / 1024 / 1024:.1f} MB)")

    # Concentración
    concentration = compute_market_concentration(market_shares)
    conc_path = OUTPUT_DIR / "market_concentration.parquet"
    concentration.write_parquet(conc_path, compression="snappy")
    logger.info(f"Guardado: {conc_path.name}")

    # Provider profiles
    profiles = build_provider_profiles(providers)
    prof_path = OUTPUT_DIR / "provider_profiles.parquet"
    profiles.write_parquet(prof_path, compression="snappy")
    logger.info(f"Guardado: {prof_path.name}")

    return {
        "market_shares": market_shares,
        "concentration": concentration,
        "profiles": profiles,
    }
