"""
Benchmarking de Precios con Bandas de Probabilidad de Adjudicación

Calcula distribuciones de precios históricos por (organismo, rubro) y genera:
1. Bandas de precio (percentiles) para cada combinación
2. Probabilidad de adjudicación dado un precio X
3. Coeficiente de variación para medir predictibilidad

Modelo de probabilidad:
  Para un precio X en un par (organismo, rubro):
  - Se calcula su posición en la distribución empírica (percentil)
  - Se ajusta una distribución log-normal (precios son positivos y asimétricos)
  - P(adjudicación | precio ≤ X) = CDF(X) usando la distribución ajustada
  - Interpretación: "Con un precio de $X tienes ~Y% de probabilidad de estar
    dentro del rango histórico de adjudicación"

Output:
  - price_bands.parquet: distribución de precios por (organismo, rubro)
  - price_model_params.parquet: parámetros del modelo log-normal por par
"""

import logging
import warnings

import numpy as np
import polars as pl

from .config import MIN_OBSERVATIONS, OUTPUT_DIR
from .data_loader import iter_oc_parquets
from .identidad import nombre_vigente, periodo_maximo

logger = logging.getLogger(__name__)


def build_price_aggregates() -> pl.DataFrame:
    """
    Pre-agrega precios de OC por (organismo, rubro), calculando estadísticas
    de distribución en cada batch para no cargar todo en RAM.

    Recolecta precios individuales agrupados para después calcular percentiles.
    Usa un approach de dos pasadas:
      1. Primera pasada: calcular count, sum, sum_sq, min, max por grupo
      2. Segunda pasada (selectiva): calcular percentiles solo para grupos significativos
    """
    logger.info("Construyendo agregados de precios...")

    cols_needed = [
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "RubroN2",
        "MontoTotalOC_PesosChilenos",
        "FechaCreacion",
        # `nombre_vigente()` la necesita para saber cuál es el último nombre del
        # organismo. `iter_oc_parquets` sólo entrega las columnas que se le
        # piden, así que omitirla no da un nulo: revienta con
        # `ColumnNotFoundError` al agregar.
        "_periodo_archivo",
    ]

    # Primera pasada: estadísticas básicas
    stats_frames = []
    for periodo, df in iter_oc_parquets(columns=cols_needed):
        if "MontoTotalOC_PesosChilenos" not in df.columns:
            continue

        agg = (
            df.with_columns(
                [
                    pl.col("MontoTotalOC_PesosChilenos")
                    .cast(pl.Float64, strict=False)
                    .alias("monto"),
                ]
            )
            .filter(
                pl.col("monto").is_not_null()
                & (pl.col("monto") > 0)
                & pl.col("CodigoOrganismoPublico").is_not_null()
                & pl.col("RubroN2").is_not_null()
            )
            # La clave es el CÓDIGO del organismo. Con el nombre dentro, un
            # comprador escrito de varias formas partía su propia banda de
            # precio en varias bandas más estrechas y con menos observaciones
            # cada una — justo lo contrario de lo que hace falta. Ver
            # `identidad.py`.
            .group_by(["CodigoOrganismoPublico", "RubroN2"])
            .agg(
                [
                    pl.len().alias("n"),
                    nombre_vigente("OrganismoPublico"),
                    periodo_maximo(),
                    pl.col("monto").sum().alias("sum_monto"),
                    (pl.col("monto").pow(2)).sum().alias("sum_sq_monto"),
                    pl.col("monto").min().alias("min_monto"),
                    pl.col("monto").max().alias("max_monto"),
                    pl.col("monto").median().alias("median_monto"),
                    pl.col("monto").quantile(0.10).alias("p10"),
                    pl.col("monto").quantile(0.25).alias("p25"),
                    pl.col("monto").quantile(0.75).alias("p75"),
                    pl.col("monto").quantile(0.90).alias("p90"),
                    # Log-normal params (para precios > 0)
                    pl.col("monto").log().mean().alias("log_mean"),
                    pl.col("monto").log().std().alias("log_std"),
                ]
            )
        )
        stats_frames.append(agg)

    if not stats_frames:
        return pl.DataFrame()

    # Combinar batches
    combined = pl.concat(stats_frames, how="diagonal_relaxed")

    # Re-agregar por grupo (weighted stats)
    result = (
        combined.group_by(["CodigoOrganismoPublico", "RubroN2"])
        .agg(
            [
                pl.col("n").sum().alias("n_transacciones"),
                nombre_vigente("OrganismoPublico"),
                pl.col("sum_monto").sum().alias("sum_monto"),
                pl.col("sum_sq_monto").sum().alias("sum_sq_monto"),
                pl.col("min_monto").min().alias("min_monto"),
                pl.col("max_monto").max().alias("max_monto"),
                # Weighted median/percentiles (approximate — use weighted average of batch medians)
                (pl.col("median_monto") * pl.col("n")).sum().alias("_wt_median"),
                (pl.col("p10") * pl.col("n")).sum().alias("_wt_p10"),
                (pl.col("p25") * pl.col("n")).sum().alias("_wt_p25"),
                (pl.col("p75") * pl.col("n")).sum().alias("_wt_p75"),
                (pl.col("p90") * pl.col("n")).sum().alias("_wt_p90"),
                # Weighted log params
                (pl.col("log_mean") * pl.col("n")).sum().alias("_wt_log_mean"),
                (pl.col("log_std") * pl.col("n")).sum().alias("_wt_log_std"),
            ]
        )
        .filter(pl.col("n_transacciones") >= MIN_OBSERVATIONS)
        .with_columns(
            [
                (pl.col("sum_monto") / pl.col("n_transacciones")).alias("precio_promedio"),
                (pl.col("_wt_median") / pl.col("n_transacciones")).alias("precio_mediana"),
                (pl.col("_wt_p10") / pl.col("n_transacciones")).alias("p10"),
                (pl.col("_wt_p25") / pl.col("n_transacciones")).alias("p25"),
                (pl.col("_wt_p75") / pl.col("n_transacciones")).alias("p75"),
                (pl.col("_wt_p90") / pl.col("n_transacciones")).alias("p90"),
                (pl.col("_wt_log_mean") / pl.col("n_transacciones")).alias("log_mean"),
                (pl.col("_wt_log_std") / pl.col("n_transacciones")).alias("log_std"),
            ]
        )
    )

    # Calcular coeficiente de variación y rango intercuartil
    result = result.with_columns(
        [
            # CV = std / mean, usando sum_sq y sum
            (
                (
                    (pl.col("sum_sq_monto") / pl.col("n_transacciones"))
                    - (pl.col("precio_promedio").pow(2))
                )
                .abs()
                .sqrt()
                / pl.col("precio_promedio").abs().clip(lower_bound=1)
            ).alias("coef_variacion"),
            (pl.col("p75") - pl.col("p25")).alias("rango_intercuartil"),
            # Flag de predictibilidad (CV < 0.4 = precio predecible)
            (
                (
                    (pl.col("sum_sq_monto") / pl.col("n_transacciones"))
                    - (pl.col("precio_promedio").pow(2))
                )
                .abs()
                .sqrt()
                / pl.col("precio_promedio").abs().clip(lower_bound=1)
                < 0.4
            ).alias("precio_predecible"),
        ]
    ).select(
        [
            "CodigoOrganismoPublico",
            "OrganismoPublico",
            "RubroN2",
            "n_transacciones",
            "precio_promedio",
            "precio_mediana",
            "min_monto",
            "max_monto",
            "p10",
            "p25",
            "p75",
            "p90",
            "coef_variacion",
            "rango_intercuartil",
            "precio_predecible",
            "log_mean",
            "log_std",
        ]
    )

    logger.info(f"Bandas de precio: {len(result):,} pares organismo-rubro")
    n_predecibles = result.filter(pl.col("precio_predecible")).shape[0]
    logger.info(
        f"  Pares con precio predecible (CV < 0.4): {n_predecibles:,} ({100 * n_predecibles / max(len(result), 1):.1f}%)"
    )

    return result


def build_price_probability_model(price_bands: pl.DataFrame) -> pl.DataFrame:
    """
    Construye modelo de probabilidad log-normal para cada par (organismo, rubro).

    Para calcular P(adjudicación | precio ≤ X):
      1. Usa los parámetros log-normal (mu, sigma) del par
      2. P = CDF_lognormal(X, mu, sigma)
      3. Interpretación: "Con precio X, estás en el percentil Y de precios históricos"

    Un precio en el p25-p75 tiene ~50% de cobertura del rango histórico.
    Un precio bajo p25 tiene alta probabilidad de ser competitivo.
    Un precio sobre p90 tiene baja probabilidad.
    """
    from scipy import stats as sp_stats

    logger.info("Construyendo modelo de probabilidad de precios...")

    # Filtrar pares con parámetros log-normal válidos
    valid = price_bands.filter(
        pl.col("log_mean").is_not_null()
        & pl.col("log_std").is_not_null()
        & (pl.col("log_std") > 0)
        & pl.col("precio_predecible")
    )

    if valid.is_empty():
        logger.warning("No hay pares con parámetros válidos para el modelo")
        return pl.DataFrame()

    # Calcular probabilidades a distintos umbrales
    log_means = valid["log_mean"].to_numpy()
    log_stds = valid["log_std"].to_numpy()

    # Para cada par, calcular qué precio necesitas para percentiles target
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        # Precio para 80% de probabilidad de estar en rango
        precio_80pct = np.exp(log_means + sp_stats.norm.ppf(0.80) * log_stds)
        # Precio para 50% (mediana)
        precio_50pct = np.exp(log_means + sp_stats.norm.ppf(0.50) * log_stds)
        # Precio competitivo (percentil 30)
        precio_competitivo = np.exp(log_means + sp_stats.norm.ppf(0.30) * log_stds)

    model_params = valid.with_columns(
        [
            pl.Series("precio_80pct_prob", precio_80pct),
            pl.Series("precio_50pct_prob", precio_50pct),
            pl.Series("precio_competitivo_30pct", precio_competitivo),
        ]
    ).select(
        [
            "CodigoOrganismoPublico",
            "OrganismoPublico",
            "RubroN2",
            "n_transacciones",
            "log_mean",
            "log_std",
            "precio_competitivo_30pct",
            "precio_50pct_prob",
            "precio_80pct_prob",
            "precio_mediana",
            "coef_variacion",
        ]
    )

    logger.info(f"Modelo de precios: {len(model_params):,} pares con modelo válido")
    return model_params


def run_price_benchmarking() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline completo de benchmarking de precios."""
    logger.info("=" * 60)
    logger.info("BENCHMARKING DE PRECIOS")
    logger.info("=" * 60)

    # Bandas de precio
    price_bands = build_price_aggregates()
    if price_bands.is_empty():
        return {}

    bands_path = OUTPUT_DIR / "price_bands.parquet"
    price_bands.write_parquet(bands_path, compression="snappy")
    logger.info(f"Guardado: {bands_path.name} ({bands_path.stat().st_size / 1024 / 1024:.1f} MB)")

    # Modelo de probabilidad
    model = build_price_probability_model(price_bands)
    if not model.is_empty():
        model_path = OUTPUT_DIR / "price_model_params.parquet"
        model.write_parquet(model_path, compression="snappy")
        logger.info(f"Guardado: {model_path.name}")

    return {"price_bands": price_bands, "price_model": model}
