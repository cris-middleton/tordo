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

#: Años en que un mes tiene que estar en los datos para poder ser un pico.
MIN_ANIOS_PICO = 2


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

        # La clave es el CÓDIGO del organismo (`identidad.py`); el nombre no se usa.
        agg = parsed.group_by(["CodigoOrganismoPublico", "RubroN2", "anio", "mes"]).agg(
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
    result = combined.group_by(["CodigoOrganismoPublico", "RubroN2", "anio", "mes"]).agg(
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
    - consistencia: qué fracción de los años activos en que ese mes está en
      los datos tiene compras en ese mes
    - z_score: desviación respecto al promedio mensual (detecta picos), sobre
      todos los meses de calendario de la ventana, con cero en los que no compró

    Sólo se escriben los meses CON compras: un mes en cero nunca es un pico, y
    escribirlos todos agrandaría la tabla en Postgres.
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

    # **Los meses sin compras cuentan, y la consistencia mira sólo los años en
    # que ese mes está en los datos.** La tabla trae sólo los meses CON compras,
    # y el z-score se calculaba sobre ellos: un comprador que compra sólo en
    # marzo tenía una fila, desviación nula y z = 0, así que la estacionalidad
    # más marcada no salía nunca como pico (y uno que compra en dos meses no
    # pasaba de z = 0,71). Ahora la media y la desviación son las de todos los
    # meses de calendario que la ventana cubre, con cero en los que no compró.
    # Y la ventana de 36 meses abarca cuatro años de calendario con tres de cada
    # mes: dividir por los años activos dejaba la consistencia en 3/4 como
    # mucho. Se divide por los años activos en que ese mes está en los datos.
    observados = monthly_agg.select(["anio", "mes"]).unique()
    n_meses = observados["mes"].n_unique()
    observables = (
        monthly_agg.select(["CodigoOrganismoPublico", "RubroN2", "anio"])
        .unique()
        .join(
            totals.select(["CodigoOrganismoPublico", "RubroN2"]),
            on=["CodigoOrganismoPublico", "RubroN2"],
            how="semi",
        )
        .join(observados, on="anio")
        .group_by(["CodigoOrganismoPublico", "RubroN2", "mes"])
        .agg(pl.len().alias("_anios_observables"))
    )

    claves = ["CodigoOrganismoPublico", "RubroN2"]
    patterns = (
        monthly_dist.join(totals, on=claves, how="inner")
        .join(observables, on=[*claves, "mes"], how="left")
        .with_columns(
            [
                (pl.col("compras_mes") / pl.col("total_compras")).alias("prob_mes"),
                (pl.col("anios_con_compra_en_mes") / pl.col("_anios_observables")).alias(
                    "consistencia"
                ),
            ]
        )
    )

    # La media de `prob_mes` sobre los `n_meses` es 1/n_meses (suman 1); la
    # desviación muestral, con los meses en cero incluidos.
    media = 1.0 / n_meses
    dispersion = patterns.group_by(claves).agg(
        (
            ((pl.col("prob_mes").pow(2).sum() - n_meses * media**2) / max(n_meses - 1, 1))
            .clip(lower_bound=0)
            .sqrt()
        ).alias("prob_std")
    )

    patterns = (
        patterns.join(dispersion, on=claves, how="left")
        .with_columns(
            [
                pl.when(pl.col("prob_std") > 1e-12)
                .then((pl.col("prob_mes") - media) / pl.col("prob_std"))
                .otherwise(0.0)
                .alias("z_score"),
            ]
        )
        .with_columns(
            [
                # Pico: z > 1, consistencia > 50 % y el mes visto en al menos
                # dos años (con uno, toda compra es «consistente»).
                (
                    (pl.col("z_score") > 1.0)
                    & (pl.col("consistencia") > 0.5)
                    & (pl.col("_anios_observables") >= MIN_ANIOS_PICO)
                ).alias("es_pico_estacional"),
            ]
        )
        .drop(["prob_std", "_anios_observables"])
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
