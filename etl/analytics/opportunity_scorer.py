"""
Score Combinado de Oportunidad

Combina todas las señales analíticas en un score 0-10 para cada par
(organismo, rubro), respondiendo: "¿Qué tan buena oportunidad es este
mercado para un proveedor?"

Componentes del score:
1. Predictibilidad de precio (CV bajo = más predecible = más ventaja informacional)
2. Nivel de competencia (el score es máximo en HHI≈1500 y cae hacia los dos
   extremos: un monopolio no deja entrar, y un mercado atomizado no deja margen)
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

NEUTRO_POR_COMPONENTE = {
    "score_precio_raw": 0.5,
    "score_competencia_raw": 0.5,
    # Sin pico estacional medido no es «media estacionalidad»: es ninguna.
    # El mínimo observado entre los que sí tienen pico es 0,53, así que 0,5
    # los deja justo por debajo, que es donde corresponde.
    "score_estacionalidad_raw": 0.5,
    "score_tendencia_raw": 0.0,
}


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


def _exigir_clave_unica(tablas: dict[str, pl.DataFrame]) -> None:
    """Falla si alguna tabla trae *(organismo, rubro)* repetido.

    Es una precondición del join, no una comprobación defensiva: si se rompe,
    el score deja de ser por mercado sin que nada más lo note.
    """
    claves = ["CodigoOrganismoPublico", "RubroN2"]
    for nombre, df in tablas.items():
        presentes = [c for c in claves if c in df.columns]
        if len(presentes) < len(claves):
            continue
        repetidas = df.height - df.select(presentes).unique().height
        if repetidas:
            raise ValueError(
                f"{nombre} trae {repetidas:,} filas con (organismo, rubro) repetido. "
                "El join de oportunidad las cruzaría y el score dejaría de ser por mercado."
            )


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
    #
    # Los joins son por *(organismo, rubro)* y **exigen que esa clave sea única
    # en cada tabla**. No lo era: con el nombre del comprador dentro de la clave
    # de agregación, un organismo con cuatro grafías producía cuatro filas por
    # mercado en cada tabla, y el join las cruzaba. El resultado tenía 237.946
    # filas para 148.966 mercados reales — el mismo mercado repetido hasta
    # dieciséis veces en «Dónde mirar primero», y la normalización min-max
    # calculada sobre esa población inflada. Arreglado en origen
    # (`identidad.py`); aquí queda la comprobación que lo habría destapado.
    _exigir_clave_unica(
        {
            "price_bands": precio_score,
            "market_concentration": comp_score,
            "seasonality_patterns": season_score,
            "trend_by_market": trend_score,
        }
    )

    # Join progresivo
    combined = (
        precio_score.join(comp_score, on=["CodigoOrganismoPublico", "RubroN2"], how="left")
        .join(season_score, on=["CodigoOrganismoPublico", "RubroN2"], how="left")
        .join(trend_score, on=["CodigoOrganismoPublico", "RubroN2"], how="left")
    )

    # Qué vale un componente cuando NO hay dato.
    #
    # **Todos se rellenaban con 0,5, y eso premiaba la ignorancia.** El 0,5 es
    # un punto medio sólo si el componente vive en [0, 1], que es el caso de
    # precio y competencia. `score_tendencia_raw` es `cagr × r²` y vive en
    # [-0,5, 1,0], con **mediana 0,0008** sobre los datos reales: rellenar con
    # 0,5 dejaba a un mercado sin histórico de tendencia en el **percentil 98,5**
    # de crecimiento. 4.078 mercados (1,7 %) entraban al ranking como si
    # estuvieran entre los que más crecen, por no tener con qué medirlos.
    #
    # El neutro correcto es el de la escala de cada componente: para tendencia,
    # crecimiento cero.
    # Qué vale un componente cuando NO hay dato.
    #
    # **Todos se rellenaban con 0,5, y eso premiaba la ignorancia.** El 0,5 es
    # un punto medio sólo si el componente vive en [0, 1], que es el caso de
    # precio y competencia. `score_tendencia_raw` es `cagr × r²` y vive en
    # [-0,5; 1,0], con mediana 0,0008 sobre los datos reales: rellenar con 0,5
    # dejaba a un mercado sin histórico de tendencia en el percentil 98,5 de
    # crecimiento. 4.078 mercados (1,7 %) entraban al ranking como si estuvieran
    # entre los que más crecen, por no tener con qué medirlos.
    for col_name, neutro in NEUTRO_POR_COMPONENTE.items():
        if col_name in combined.columns:
            combined = combined.with_columns(
                [
                    pl.col(col_name).fill_null(neutro).alias(col_name),
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
