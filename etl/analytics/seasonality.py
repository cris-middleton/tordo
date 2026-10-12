"""
Análisis de Estacionalidad de Compras

Detecta patrones estacionales: "El organismo X compra el rubro Y
con probabilidad Z en el mes M".

Metodología:
1. Pre-agregar por (organismo, rubro, año, mes) → conteo de OC
2. Para cada (organismo, rubro):
   - Calcular distribución mensual de compras (proporción por mes)
   - Detectar meses con actividad significativamente por encima del promedio
   - Calcular consistencia interanual (qué tan predecible es el patrón)

Output:
  - seasonality_patterns.parquet: patrones detectados con probabilidades

Escribía además los agregados mensuales y una predicción a 12 meses, que nada
leía —ni la API ni otro módulo— y se retiraron.
"""

import logging

import polars as pl

from .config import MIN_OBSERVATIONS, OUTPUT_DIR
from .data_loader import iter_oc_parquets

logger = logging.getLogger(__name__)


def build_monthly_aggregates() -> pl.DataFrame:
    """
    Paso 1: Pre-agrega OC por (organismo, rubro, año, mes).
    Procesa un parquet a la vez para controlar memoria.
    Usa operaciones nativas de Polars (str.slice) para parsear fechas rápido.
    """
    logger.info("Construyendo agregados mensuales de OC...")

    cols_needed = [
        "Codigo",
        "FechaCreacion",
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "RubroN2",
        "MontoTotalOC_PesosChilenos",
    ]
    agg_frames = []

    for periodo, df in iter_oc_parquets(columns=cols_needed):
        if "FechaCreacion" not in df.columns:
            continue

        # Extraer año y mes con str.slice nativo (formato YYYY-MM-DD)
        parsed = (
            df.filter(
                pl.col("FechaCreacion").is_not_null()
                & (pl.col("FechaCreacion").str.len_chars() >= 7)
                & (pl.col("FechaCreacion") != "null")
            )
            .with_columns(
                [
                    pl.col("FechaCreacion")
                    .str.slice(0, 4)
                    .cast(pl.Int64, strict=False)
                    .alias("anio"),
                    pl.col("FechaCreacion")
                    .str.slice(5, 2)
                    .cast(pl.Int64, strict=False)
                    .alias("mes"),
                ]
            )
            .filter(pl.col("anio").is_not_null() & pl.col("mes").is_not_null())
        )

        # Por línea (ver `data_loader.con_monto_por_linea`), y órdenes contadas
        # como órdenes: el archivo trae una fila por línea.
        if "monto_linea_clp" in parsed.columns:
            monto_expr = pl.col("monto_linea_clp")
        else:
            monto_expr = pl.lit(0.0)

        agg = parsed.group_by(
            ["CodigoOrganismoPublico", "OrganismoPublico", "RubroN2", "anio", "mes"]
        ).agg(
            [
                pl.col("Codigo").n_unique().alias("n_compras"),
                monto_expr.sum().alias("monto_total"),
                (monto_expr.sum() / pl.col("Codigo").n_unique()).alias("monto_promedio"),
            ]
        )
        agg_frames.append(agg)
        logger.debug(f"  {periodo}: {len(agg)} agregados")

    if not agg_frames:
        logger.error("No se pudieron generar agregados mensuales")
        return pl.DataFrame()

    # Combinar y re-agregar (por si un organismo-rubro aparece en múltiples archivos del mismo mes)
    combined = pl.concat(agg_frames, how="diagonal_relaxed")
    result = combined.group_by(
        ["CodigoOrganismoPublico", "OrganismoPublico", "RubroN2", "anio", "mes"]
    ).agg(
        [
            pl.col("n_compras").sum(),
            pl.col("monto_total").sum(),
        ]
    )
    logger.info(f"Agregados mensuales: {len(result):,} filas")
    return result


def detect_seasonality_patterns(monthly_agg: pl.DataFrame) -> pl.DataFrame:
    """
    Paso 2: Para cada (organismo, rubro), calcula:
    - prob_mes: proporción de compras en cada mes (1-12)
    - n_anios_activo: en cuántos años distintos compraron ese rubro
    - consistencia: qué fracción de años tiene compras en ese mes
    - z_score: desviación respecto al promedio mensual (detecta picos)
    """
    logger.info("Detectando patrones de estacionalidad...")

    # Calcular total por (organismo, rubro) para filtrar pares con pocas obs
    totals = (
        monthly_agg.group_by(["CodigoOrganismoPublico", "RubroN2"])
        .agg(
            [
                pl.col("n_compras").sum().alias("total_compras"),
                pl.col("anio").n_unique().alias("n_anios_activo"),
            ]
        )
        .filter((pl.col("total_compras") >= MIN_OBSERVATIONS) & (pl.col("n_anios_activo") >= 2))
    )

    # Distribución mensual por (organismo, rubro)
    monthly_dist = monthly_agg.group_by(["CodigoOrganismoPublico", "RubroN2", "mes"]).agg(
        [
            pl.col("n_compras").sum().alias("compras_mes"),
            pl.col("anio").n_unique().alias("anios_con_compra_en_mes"),
        ]
    )

    # Join para obtener totales y filtrar
    patterns = monthly_dist.join(
        totals, on=["CodigoOrganismoPublico", "RubroN2"], how="inner"
    ).with_columns(
        [
            (pl.col("compras_mes") / pl.col("total_compras")).alias("prob_mes"),
            (pl.col("anios_con_compra_en_mes") / pl.col("n_anios_activo")).alias("consistencia"),
        ]
    )

    # Calcular z-score mensual por grupo (qué tan por encima del promedio está cada mes)
    avg_monthly = patterns.group_by(["CodigoOrganismoPublico", "RubroN2"]).agg(
        [
            pl.col("prob_mes").mean().alias("prob_avg"),
            pl.col("prob_mes").std().alias("prob_std"),
        ]
    )

    patterns = (
        patterns.join(avg_monthly, on=["CodigoOrganismoPublico", "RubroN2"], how="left")
        .with_columns(
            [
                pl.when(pl.col("prob_std") > 0)
                .then((pl.col("prob_mes") - pl.col("prob_avg")) / pl.col("prob_std"))
                .otherwise(0.0)
                .alias("z_score"),
            ]
        )
        .with_columns(
            [
                # Flag meses con pico significativo (z > 1.0 y consistencia > 50%)
                ((pl.col("z_score") > 1.0) & (pl.col("consistencia") > 0.5)).alias(
                    "es_pico_estacional"
                ),
            ]
        )
        .drop(["prob_avg", "prob_std"])
        .sort(["CodigoOrganismoPublico", "RubroN2", "mes"])
    )

    n_picos = patterns.filter(pl.col("es_pico_estacional")).shape[0]
    n_pares = totals.shape[0]
    logger.info(
        f"Patrones: {len(patterns):,} filas, {n_pares:,} pares organismo-rubro, {n_picos:,} picos estacionales"
    )
    return patterns


def run_seasonality() -> dict[str, pl.DataFrame]:
    """Ejecuta el pipeline completo de estacionalidad."""
    logger.info("=" * 60)
    logger.info("ANÁLISIS DE ESTACIONALIDAD")
    logger.info("=" * 60)

    # Paso 1: Agregados mensuales
    monthly_agg = build_monthly_aggregates()
    if monthly_agg.is_empty():
        return {}

    # Paso 2: Patrones
    patterns = detect_seasonality_patterns(monthly_agg)
    pat_path = OUTPUT_DIR / "seasonality_patterns.parquet"
    patterns.write_parquet(pat_path, compression="snappy")
    logger.info(f"Guardado: {pat_path.name} ({pat_path.stat().st_size / 1024 / 1024:.1f} MB)")

    return {
        "monthly_agg": monthly_agg,
        "patterns": patterns,
    }
