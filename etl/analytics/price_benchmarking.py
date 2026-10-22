"""
Benchmarking de Precios por (organismo, rubro)

Calcula distribuciones de precios históricos por (organismo, rubro):
1. Bandas de precio (percentiles) para cada combinación
2. Coeficiente de variación para medir predictibilidad

Output:
  - price_bands.parquet: distribución de precios por (organismo, rubro)

Ajustaba además una log-normal por par para dar una «probabilidad de
adjudicación dado un precio» (`price_model_params`), que nada leía; se retiró.
"""

import logging

import polars as pl

from .config import MIN_OBSERVATIONS, OC_PARQUET_DIR, OUTPUT_DIR
from .data_loader import VENTANA_ANALYTICS_MESES, con_ventana, iter_oc_parquets, limites_ventana
from .identidad import nombre_vigente

logger = logging.getLogger(__name__)


def build_price_aggregates() -> pl.DataFrame:
    """
    Distribución de lo que gasta cada orden por (organismo, rubro).

    Una observación es lo que una orden gastó en el rubro; los percentiles se
    calculan sobre todas las de la ventana.
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

    # **Los percentiles salen de TODAS las órdenes del grupo, no de promediar
    # los de cada archivo.** Se calculaban por archivo mensual y luego se
    # promediaban ponderando por `n`: el promedio de los p10 mensuales no es el
    # p10 de la ventana, y en un par que compra una vez al mes el p10, la
    # mediana y el p90 de cada mes son esa única compra, así que la banda de 36
    # meses salía con p10 = p90 = el promedio. Se guarda una fila por (orden,
    # organismo, rubro) —pocos millones con la ventana entera— y se agrega una vez.
    frames = []
    for _periodo, df in iter_oc_parquets(columns=cols_needed):
        if "MontoTotalOC_PesosChilenos" not in df.columns:
            continue

        # Una observación = lo que UNA orden gastó en el rubro. Antes cada fila
        # era una línea con el total de la orden repetido: la banda pesaba cada
        # orden por su número de líneas y mezclaba el total de órdenes con
        # ítems de otros rubros. Ver `data_loader.con_monto_por_linea`.
        por_orden = (
            df.filter(
                pl.col("CodigoOrganismoPublico").is_not_null() & pl.col("RubroN2").is_not_null()
            )
            .group_by(["Codigo", "CodigoOrganismoPublico", "RubroN2"])
            .agg(
                pl.col("monto_linea_clp").sum().alias("monto"),
                pl.col("OrganismoPublico").first(),
                pl.col("_periodo_archivo").first(),
            )
            .filter(pl.col("monto").is_not_null() & (pl.col("monto") > 0))
            .drop("Codigo")
        )
        frames.append(por_orden)

    if not frames:
        return pl.DataFrame()

    # La clave es el CÓDIGO del organismo. Con el nombre dentro, un comprador
    # escrito de varias formas partía su propia banda de precio en varias bandas
    # más estrechas y con menos observaciones cada una — justo lo contrario de
    # lo que hace falta. Ver `identidad.py`.
    result = (
        pl.concat(frames, how="diagonal_relaxed")
        .group_by(["CodigoOrganismoPublico", "RubroN2"])
        .agg(
            [
                pl.len().alias("n_transacciones"),
                nombre_vigente("OrganismoPublico"),
                pl.col("monto").sum().alias("sum_monto"),
                (pl.col("monto").pow(2)).sum().alias("sum_sq_monto"),
                pl.col("monto").min().alias("min_monto"),
                pl.col("monto").max().alias("max_monto"),
                pl.col("monto").median().alias("precio_mediana"),
                pl.col("monto").quantile(0.10).alias("p10"),
                pl.col("monto").quantile(0.25).alias("p25"),
                pl.col("monto").quantile(0.75).alias("p75"),
                pl.col("monto").quantile(0.90).alias("p90"),
                # Parámetros log-normales (montos > 0).
                pl.col("monto").log().mean().alias("log_mean"),
                pl.col("monto").log().std().alias("log_std"),
            ]
        )
        .filter(pl.col("n_transacciones") >= MIN_OBSERVATIONS)
        .with_columns(
            (pl.col("sum_monto") / pl.col("n_transacciones")).alias("precio_promedio"),
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


def run_price_benchmarking() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline completo de benchmarking de precios."""
    logger.info("=" * 60)
    logger.info("BENCHMARKING DE PRECIOS")
    logger.info("=" * 60)

    # Bandas de precio
    price_bands = build_price_aggregates()
    if price_bands.is_empty():
        return {}

    # Es el último recurso (L4) de la API de precio, que devuelve su periodo:
    # 36 meses aquí, no los 12 de las bandas por producto.
    bands_path = OUTPUT_DIR / "price_bands.parquet"
    con_ventana(
        price_bands, limites_ventana(OC_PARQUET_DIR, VENTANA_ANALYTICS_MESES)
    ).write_parquet(bands_path, compression="snappy")
    logger.info(f"Guardado: {bands_path.name} ({bands_path.stat().st_size / 1024 / 1024:.1f} MB)")

    return {"price_bands": price_bands}
