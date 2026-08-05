"""
Score Combinado de Oportunidad

Combina todas las señales analíticas en un score 0-10 para cada par
(organismo, rubro), respondiendo: "¿Qué tan buena oportunidad es este
mercado para un proveedor?"

Componentes del score:
1. Predictibilidad de precio (CV bajo = más predecible = más ventaja informacional)
2. Nivel de competencia (HHI bajo = más competitivo = más espacio para entrar)
3. Estacionalidad clara (consistencia alta = se puede anticipar)
4. Tendencia de crecimiento (CAGR positivo = mercado en expansión)
5. Volumen de mercado (más OC = más oportunidades recurrentes)

Score = weighted sum normalizado a 0-10.

Output:
  - opportunity_scores.parquet: score por (organismo, rubro) con desglose
"""

import logging

import polars as pl

from .config import OUTPUT_DIR

logger = logging.getLogger(__name__)

# Pesos de cada componente en el score final
WEIGHTS = {
    "precio_predecible": 0.25,  # Ventaja informacional
    "competencia_accesible": 0.20,  # No dominado por un solo proveedor
    "estacionalidad_clara": 0.15,  # Se puede anticipar y planificar
    "tendencia_positiva": 0.20,  # Mercado en expansión
    "volumen_alto": 0.20,  # Recurrencia de oportunidades
}


def _normalize_0_10(series: pl.Series) -> pl.Series:
    """Normaliza una serie a rango 0-10."""
    min_val = series.min()
    max_val = series.max()
    if min_val == max_val:
        return pl.Series([5.0] * len(series))
    return ((series - min_val) / (max_val - min_val) * 10).round(2)


def build_opportunity_scores(
    price_bands_path: str = None,
    concentration_path: str = None,
    seasonality_path: str = None,
    trends_path: str = None,
) -> pl.DataFrame:
    """
    Combina outputs de los otros módulos en un score unificado.
    Lee desde archivos parquet generados por los módulos previos.
    """
    logger.info("Construyendo scores de oportunidad...")

    # Cargar datos de cada módulo
    price_bands = pl.read_parquet(price_bands_path or OUTPUT_DIR / "price_bands.parquet")
    concentration = pl.read_parquet(
        concentration_path or OUTPUT_DIR / "market_concentration.parquet"
    )
    seasonality = pl.read_parquet(seasonality_path or OUTPUT_DIR / "seasonality_patterns.parquet")
    trends = pl.read_parquet(trends_path or OUTPUT_DIR / "trend_by_market.parquet")

    # === COMPONENTE 1: Predictibilidad de precio ===
    # CV bajo = más predecible → score alto
    precio_score = price_bands.select(
        [
            "CodigoOrganismoPublico",
            "RubroN2",
            "n_transacciones",
            "coef_variacion",
            "precio_predecible",
        ]
    ).with_columns(
        [
            # Invertir CV: CV bajo = score alto
            (1 - pl.col("coef_variacion").clip(0, 2) / 2).clip(0, 1).alias("score_precio_raw"),
        ]
    )

    # === COMPONENTE 2: Competencia accesible ===
    # HHI intermedio (1000-2000) es ideal: no monopolio, no hiperfragmentado
    comp_score = concentration.select(
        ["CodigoOrganismoPublico", "RubroN2", "hhi", "n_proveedores"]
    ).with_columns(
        [
            # Score máximo para HHI ~1500 (competencia moderada)
            (1 - ((pl.col("hhi") - 1500).abs() / 5000).clip(0, 1)).alias("score_competencia_raw"),
        ]
    )

    # === COMPONENTE 3: Estacionalidad clara ===
    # Mayor consistencia de picos = más predecible
    season_score = (
        seasonality.filter(pl.col("es_pico_estacional"))
        .group_by(["CodigoOrganismoPublico", "RubroN2"])
        .agg(
            [
                pl.col("consistencia").max().alias("max_consistencia"),
                pl.col("z_score").max().alias("max_z_score"),
                pl.len().alias("n_picos"),
            ]
        )
        .with_columns(
            [
                pl.col("max_consistencia").alias("score_estacionalidad_raw"),
            ]
        )
    )

    # === COMPONENTE 4: Tendencia de crecimiento ===
    trend_score = trends.select(
        ["CodigoOrganismoPublico", "RubroN2", "cagr", "r_squared"]
    ).with_columns(
        [
            # CAGR positivo con buen R² = crecimiento real
            (pl.col("cagr").clip(-0.5, 1.0) * pl.col("r_squared").clip(0, 1)).alias(
                "score_tendencia_raw"
            ),
        ]
    )

    # === COMBINAR todos los componentes ===
    # Join progresivo
    combined = (
        precio_score.join(comp_score, on=["CodigoOrganismoPublico", "RubroN2"], how="left")
        .join(season_score, on=["CodigoOrganismoPublico", "RubroN2"], how="left")
        .join(trend_score, on=["CodigoOrganismoPublico", "RubroN2"], how="left")
    )

    # Normalizar cada componente a 0-10
    for col_name in [
        "score_precio_raw",
        "score_competencia_raw",
        "score_estacionalidad_raw",
        "score_tendencia_raw",
    ]:
        if col_name in combined.columns:
            combined = combined.with_columns(
                [
                    pl.col(col_name).fill_null(0.5).alias(col_name),
                ]
            )

    # Componente 5: Volumen (normalizado por log)
    combined = combined.with_columns(
        [
            pl.col("n_transacciones").log().alias("log_volumen"),
        ]
    )

    # Score ponderado
    combined = combined.with_columns(
        [
            (
                _normalize_0_10(combined["score_precio_raw"]) * WEIGHTS["precio_predecible"]
                + _normalize_0_10(combined["score_competencia_raw"])
                * WEIGHTS["competencia_accesible"]
                + _normalize_0_10(combined["score_estacionalidad_raw"])
                * WEIGHTS["estacionalidad_clara"]
                + _normalize_0_10(combined["score_tendencia_raw"]) * WEIGHTS["tendencia_positiva"]
                + _normalize_0_10(combined["log_volumen"]) * WEIGHTS["volumen_alto"]
            )
            .round(1)
            .alias("opportunity_score"),
        ]
    )

    result = combined.select(
        [
            "CodigoOrganismoPublico",
            "RubroN2",
            "opportunity_score",
            "n_transacciones",
            "coef_variacion",
            "hhi",
            "n_proveedores",
            "max_consistencia",
            "n_picos",
            "cagr",
            "r_squared",
            "score_precio_raw",
            "score_competencia_raw",
            "score_estacionalidad_raw",
            "score_tendencia_raw",
        ]
    ).sort("opportunity_score", descending=True)

    logger.info(f"Scores generados: {len(result):,} mercados")
    logger.info(f"  Score promedio: {result['opportunity_score'].mean():.1f}")
    logger.info("  Top mercados (score > 7):")
    top = result.filter(pl.col("opportunity_score") > 7).head(10)
    for row in top.iter_rows(named=True):
        logger.info(
            f"    [{row['opportunity_score']}] Org={row['CodigoOrganismoPublico']} "
            f"Rubro={row['RubroN2']} (n={row['n_transacciones']})"
        )

    return result


def run_opportunity_scorer() -> pl.DataFrame:
    """Ejecuta el scoring de oportunidades."""
    logger.info("=" * 60)
    logger.info("SCORING DE OPORTUNIDADES")
    logger.info("=" * 60)

    scores = build_opportunity_scores()
    out_path = OUTPUT_DIR / "opportunity_scores.parquet"
    scores.write_parquet(out_path, compression="snappy")
    logger.info(f"Guardado: {out_path.name} ({out_path.stat().st_size / 1024 / 1024:.1f} MB)")
    return scores
