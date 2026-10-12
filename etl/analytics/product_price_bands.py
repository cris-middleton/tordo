"""
Bandas de Precio por Producto Específico — Predictor Jerárquico

Calcula bandas de precio unitario a la mayor granularidad posible,
con fallback a niveles más amplios cuando no hay datos suficientes.

Jerarquía de niveles (de más a menos preciso):

  Nivel 0 — Firma del producto + Organismo + Unidad
    "Este hospital paga $980–$1.150 por 'guantes nitrilo talla m'"
    La firma sale de `EspecificacionComprador` (ver `normalizacion.py`).
    Es el único nivel donde el grupo contiene *el mismo producto*.

  Nivel 0N — Firma del producto + Unidad (nacional)
    Mismo producto, cualquier comprador.

  Nivel 1 — Producto UNSPSC + Organismo + Unidad
    "Este hospital paga $800–$1.200 por unidad de este reactivo"
    Requiere: ≥5 transacciones en el par.

  Nivel 2 — Producto UNSPSC + Sector + Unidad
    "Los hospitales (sector Salud) pagan $700–$1.500 por este reactivo"

  Nivel 3 — Producto UNSPSC + Unidad (nacional)
    Fallback final, menos preciso pero cubre más productos.

**Por qué el nivel 0 existe y va primero.** `codigoProductoONU` es una categoría
del catálogo UNSPSC, no un producto: medido sobre 2026-03, dentro de la misma
categoría, comprador, mes y unidad conviven artículos que difieren en cinco
órdenes de magnitud. Los niveles 1–3 no miden un mercado, miden una categoría.

El caso concreto, con datos reales: «Reactivos o soluciones químicos» en el
Servicio de Salud Antofagasta daba **una** banda de $7.351–$82.500 con n=282 y
QCD 0,84 — un número con aspecto de respuesta que no lo es. Con la firma se
convierte en los cuatro productos que había ahí dentro, cada uno con su rango.

Medido con este mismo código sobre 1–3 meses: **QCD mediano 0,21–0,26 en el
nivel 0 contra 0,57–0,59 en el nivel 1.** La banda es más de dos veces más
estrecha. El razonamiento completo está en `normalizacion.py`.

**Lo que el nivel 0 NO hace**, dicho para que nadie lo espere: no aumenta mucho
la proporción global de bandas fiables. Cubre el 22–29 % de los ítems, y en el
resto sigue mandando el nivel 1. Lo que aporta es que, donde aplica, la
respuesta es sobre el producto que el usuario está cotizando y no sobre la
estantería entera.

Para cada banda se calcula:
  - p10, p25, p50 (mediana), p75, p90
  - n: cantidad de transacciones
  - qcd: coeficiente cuartílico de dispersión — la medida principal
  - cv: coeficiente de variación (se conserva por compatibilidad)
  - confianza: score 0–1 combinando muestra y dispersión
  - predictibilidad: alta | media | baja — la lectura de producto
  - nivel: 0, 1, 2 o 3 (indica qué tan específica es la banda)

Filtrado de outliers:
  Se usa IQR × 1.5 (método de Tukey) dentro de cada grupo para eliminar
  precios unitarios anómalos antes de calcular bandas.

Output:
  - product_price_bands_L0.parquet:  firma+organismo+unidad
  - product_price_bands_L0N.parquet: firma+unidad (nacional)
  - product_price_bands_L1.parquet:  UNSPSC+organismo+unidad
  - product_price_bands_L2.parquet:  UNSPSC+sector+unidad
  - product_price_bands_L3.parquet:  UNSPSC+unidad (nacional)
  - product_price_coverage.parquet:  resumen de cobertura por producto
"""

import logging

import polars as pl

from .config import OC_PARQUET_DIR, OUTPUT_DIR
from .data_loader import con_ventana, iter_oc_parquets, limites_ventana
from .normalizacion import canonizar_unidad, firma_es_utilizable, firma_producto

logger = logging.getLogger(__name__)

#: Las bandas miran sólo los últimos 12 meses de datos, no los 36 del resto de
#: analytics. Un precio de hace tres años no informa el de hoy, y deflactarlo no
#: lo arregla (medido: el CV dentro de un solo mes es 0,83–0,88 y mezclando
#: 2016–2026 es 0,88; ver CLAUDE.md). Además es el módulo que más RAM pide —0,5 GB
#: por mes de historia, medido—, así que su ventana fija el tamaño del semanal.
#: La API lo devuelve como `periodo`: nadie debe leer la banda como histórica.
VENTANA_BANDAS_PRECIO_MESES = 12

# Mínimo de transacciones por nivel.
#
# El nivel 0 pide menos que el 1 a propósito, y no es una concesión: un grupo de
# tres observaciones **del mismo producto** dice más que uno de cinco de
# productos distintos. El mínimo protege contra la casualidad, no contra la
# heterogeneidad — y la heterogeneidad ya la resolvió la firma.
MIN_N_L0 = 3  # firma+organismo+unidad
MIN_N_L0N = 5  # firma+unidad (nacional)
MIN_N_L1 = 5  # producto+organismo+unidad
MIN_N_L2 = 10  # producto+sector+unidad
MIN_N_L3 = 20  # producto+unidad (nacional)

# ── Calibración de la confianza ──────────────────────────────────────────────
#
# La fórmula anterior era `min(1, log(n)/log(100)) × (1 − cv/2)`, y tenía un
# problema que sólo se ve midiendo: **saturaba en n = 100**, mientras la mediana
# real de n es 10. Con n = 10 el primer factor vale exactamente 0,5, así que una
# banda típica no podía pasar de 0,5 **aunque su dispersión fuera nula** — y 0,5
# es justo el umbral que el resto del producto usa para decir "esto es fiable".
# El umbral estaba calibrado contra sí mismo: el 10,2 % de bandas que lo
# superaban no eran "las fiables", eran "las que tenían mucha muestra".
#
# Ahora satura en 30, que es un tamaño de muestra que las bandas reales alcanzan,
# y la dispersión entra por QCD en vez de CV.
N_SATURACION = 30.0

# QCD a partir del cual la dispersión no aporta nada. 0,6 significa p75/p25 = 4:
# un rango de cuatro veces no ayuda a cotizar.
QCD_INUTIL = 0.6

# Umbrales de la lectura de producto.
# QCD 0,25 → p75/p25 ≈ 1,67 · QCD 0,45 → p75/p25 ≈ 2,6
QCD_ALTA = 0.25
QCD_MEDIA = 0.45

# Muestra mínima para cada lectura.
#
# `N_ALTA = 5` y no 10, y la diferencia importa: cinco compras del **mismo**
# producto dentro de un ±10 % permiten cotizar; cincuenta compras de una
# categoría que mezcla productos, no. Con el corte en 10, la mejora de dispersión
# del nivel 0 quedaba anulada por el corte de muestra: medido, la proporción de
# bandas "alta" no se movía.
#
# **Y no se arregla con más corpus.** Medido sobre 1, 2 y 3 meses consecutivos,
# la muestra mediana de un grupo del nivel 0 se queda en 3: cada mes trae
# productos nuevos casi al mismo ritmo al que profundiza los que ya estaban. El
# umbral tiene que reflejar cuánta incertidumbre tiene la mediana, no cuántos
# meses lleva descargados el ETL — porque esperar a que la cola larga se cierre
# sola es esperar sentado.
N_ALTA = 5
N_MEDIA = 3


# ─────────────────────────────────────────────────────────────────────
# Paso 1: Extraer ítems con precio unitario válido
# ─────────────────────────────────────────────────────────────────────


def extract_unit_prices() -> pl.DataFrame:
    """
    Extrae ítems de OC con precio unitario calculable.

    Filtra: qty > 0, precio > 0, unidad distinta de "Global".

    **`qty > 0`, no `qty > 1`.** El filtro anterior descartaba el 25,9 % de los
    ítems —todos los de cantidad 1— sin ganar nada: medido, admitirlos deja la
    dispersión igual (QCD mediano 0,633 contra 0,632) y sube la cobertura. La
    compra de una unidad es una compra como cualquier otra; lo que había que
    excluir era la línea "global", donde la cantidad no es una cantidad, y eso
    lo hace el filtro de unidad.
    """
    logger.info("Extrayendo precios unitarios...")

    cols_needed = [
        "codigoProductoONU",
        "NombreroductoGenerico",
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "sector",
        "precioNeto",
        "cantidad",
        "UnidadMedida",
        "EspecificacionComprador",
        "_periodo_archivo",
    ]

    frames = []

    for _periodo, df in iter_oc_parquets(columns=cols_needed, meses=VENTANA_BANDAS_PRECIO_MESES):
        required = ["codigoProductoONU", "precioNeto", "cantidad", "UnidadMedida"]
        if not all(c in df.columns for c in required):
            continue

        # Los ZIP antiguos no siempre traen la especificación. Sin ella el nivel 0
        # no se puede construir para ese periodo, pero los niveles 1–3 sí: se
        # rellena vacía en vez de descartar el mes entero.
        if "EspecificacionComprador" not in df.columns:
            df = df.with_columns(pl.lit("").alias("EspecificacionComprador"))

        batch = (
            df.with_columns(
                [
                    pl.col("precioNeto").cast(pl.Float64, strict=False).alias("precio"),
                    pl.col("cantidad").cast(pl.Float64, strict=False).alias("qty"),
                ]
            )
            .filter(
                pl.col("precio").is_not_null()
                & (pl.col("precio") > 0)
                & pl.col("qty").is_not_null()
                & (pl.col("qty") > 0)
                & pl.col("codigoProductoONU").is_not_null()
                & (pl.col("codigoProductoONU") != "null")
                & pl.col("UnidadMedida").is_not_null()
                & (pl.col("UnidadMedida") != "Global")
            )
            .with_columns(
                [
                    (pl.col("precio") / pl.col("qty")).alias("pu"),
                ]
            )
            .filter((pl.col("pu") > 0) & (pl.col("pu") < 1e9))
            .with_columns([canonizar_unidad(), firma_producto()])
            .select(
                [
                    "codigoProductoONU",
                    "NombreroductoGenerico",
                    "CodigoOrganismoPublico",
                    "OrganismoPublico",
                    "sector",
                    # La unidad canónica SUSTITUYE a la cruda y conserva su nombre:
                    # es la clave con la que consulta la API, y renombrarla sería
                    # un cambio de contrato invisible hasta que algo devuelve vacío.
                    pl.col("unidad_norm").alias("UnidadMedida"),
                    "firma_producto",
                    "EspecificacionComprador",
                    "pu",
                    "_periodo_archivo",
                ]
            )
        )
        frames.append(batch)

    if not frames:
        return pl.DataFrame()

    result = pl.concat(frames, how="diagonal_relaxed")
    con_firma = result.filter(firma_es_utilizable()).height
    logger.info(
        f"Items con precio unitario: {len(result):,} "
        f"({con_firma:,} con firma de producto utilizable · "
        f"{100 * con_firma / max(len(result), 1):.1f}%)"
    )
    return result


# ─────────────────────────────────────────────────────────────────────
# Paso 2: Filtro de outliers por IQR (Tukey)
# ─────────────────────────────────────────────────────────────────────


def remove_outliers_iqr(
    df: pl.DataFrame, group_cols: list[str], value_col: str = "pu"
) -> pl.DataFrame:
    """
    Elimina outliers usando IQR × 1.5 dentro de cada grupo.
    Conserva solo valores dentro de [Q1 - 1.5·IQR, Q3 + 1.5·IQR].
    """
    bounds = (
        df.group_by(group_cols)
        .agg(
            [
                pl.col(value_col).quantile(0.25).alias("_q1"),
                pl.col(value_col).quantile(0.75).alias("_q3"),
            ]
        )
        .with_columns(
            [
                (pl.col("_q3") - pl.col("_q1")).alias("_iqr"),
            ]
        )
        .with_columns(
            [
                (pl.col("_q1") - 1.5 * pl.col("_iqr")).alias("_lower"),
                (pl.col("_q3") + 1.5 * pl.col("_iqr")).alias("_upper"),
            ]
        )
    )

    filtered = (
        df.join(bounds, on=group_cols, how="left", coalesce=True)
        .filter((pl.col(value_col) >= pl.col("_lower")) & (pl.col(value_col) <= pl.col("_upper")))
        .drop(["_q1", "_q3", "_iqr", "_lower", "_upper"])
    )

    removed = len(df) - len(filtered)
    logger.info(f"  Outliers removidos: {removed:,} ({100 * removed / max(len(df), 1):.1f}%)")
    return filtered


# ─────────────────────────────────────────────────────────────────────
# Paso 3: Calcular bandas por nivel
# ─────────────────────────────────────────────────────────────────────


def _compute_bands(df: pl.DataFrame, group_cols: list[str], min_n: int, level: int) -> pl.DataFrame:
    """Calcula bandas de precio para un nivel de agrupación dado."""

    bands = (
        df.group_by(group_cols)
        .agg(
            [
                pl.len().alias("n"),
                pl.col("pu").quantile(0.10).alias("p10"),
                pl.col("pu").quantile(0.25).alias("p25"),
                pl.col("pu").median().alias("p50"),
                pl.col("pu").quantile(0.75).alias("p75"),
                pl.col("pu").quantile(0.90).alias("p90"),
                pl.col("pu").mean().alias("pu_mean"),
                pl.col("pu").std().alias("pu_std"),
                pl.col("pu").min().alias("pu_min"),
                pl.col("pu").max().alias("pu_max"),
            ]
        )
        .filter(pl.col("n") >= min_n)
        .with_columns(
            [
                # Coeficiente de variación. Se conserva porque hay consumidores
                # que ya lo leen, pero NO es la medida principal: los precios
                # unitarios tienen cola larga, y sobre una cola larga la
                # desviación estándar mide el outlier que sobrevivió al filtro,
                # no el mercado.
                (pl.col("pu_std") / pl.col("pu_mean").clip(lower_bound=0.01)).alias("cv"),
                # Ratio intercuartil
                (pl.col("p75") / pl.col("p25").clip(lower_bound=0.01)).alias("ratio_iqr"),
                # Coeficiente cuartílico de dispersión: (p75−p25)/(p75+p25).
                # Acotado a [0,1], insensible a los extremos y directamente
                # traducible — QCD 0,25 es "el 50 % central cabe en 1,67x".
                (
                    (pl.col("p75") - pl.col("p25"))
                    / (pl.col("p75") + pl.col("p25")).clip(lower_bound=0.01)
                )
                .clip(0, 1)
                .round(4)
                .alias("qcd"),
                # Nivel de la banda
                pl.lit(level).alias("nivel"),
            ]
        )
        .with_columns(
            [
                # Confianza = media geométrica de muestra y precisión.
                #
                # Geométrica y no producto: el producto castiga dos veces y deja
                # casi todo por debajo de 0,5, que es exactamente el defecto de
                # la fórmula anterior. La media geométrica sigue exigiendo las
                # dos cosas —si una vale 0, el resultado es 0— sin que una banda
                # razonable en ambas dimensiones acabe pareciendo mala.
                (
                    ((pl.col("n").log() / pl.lit(N_SATURACION).log()).clip(0, 1))
                    * ((1 - pl.col("qcd") / QCD_INUTIL).clip(0, 1))
                )
                .sqrt()
                .clip(0, 1)
                .round(3)
                .alias("confianza"),
                # La lectura de producto. Existe porque "QCD 0,31" no es una
                # frase que se pueda poner en pantalla, y porque la dispersión
                # alta ES información: un comprador impredecible en un producto
                # es un dato que vale, no un hueco que disimular.
                pl.when((pl.col("qcd") < QCD_ALTA) & (pl.col("n") >= N_ALTA))
                .then(pl.lit("alta"))
                .when((pl.col("qcd") < QCD_MEDIA) & (pl.col("n") >= N_MEDIA))
                .then(pl.lit("media"))
                .otherwise(pl.lit("baja"))
                .alias("predictibilidad"),
            ]
        )
    )

    return bands


def _con_descripcion(bands: pl.DataFrame, items: pl.DataFrame, claves: list[str]) -> pl.DataFrame:
    """Añade a cada banda la especificación literal más frecuente del grupo.

    La firma es una bolsa de palabras ordenada alfabéticamente: legible para
    agrupar, ilegible para enseñar. `descripcion` es lo que ve el usuario —
    cómo escribió ese producto quien lo compró más veces.
    """
    ejemplo = (
        items.group_by(claves + ["EspecificacionComprador"])
        .agg(pl.len().alias("_veces"))
        # Se desempata por el texto para que dos corridas sobre los mismos datos
        # elijan la misma descripción. Sin el desempate, `first()` depende del
        # orden de las filas y el parquet cambia sin que cambien los datos.
        .sort(["_veces", "EspecificacionComprador"], descending=[True, False])
        .group_by(claves)
        .first()
        .select(claves + [pl.col("EspecificacionComprador").alias("descripcion")])
    )
    return bands.join(ejemplo, on=claves, how="left", coalesce=True)


def build_level_0(items: pl.DataFrame) -> pl.DataFrame:
    """Nivel 0: Firma del producto + Organismo + Unidad."""
    logger.info("Calculando bandas Nivel 0 (Firma+Organismo+Unidad)...")

    # `extract_unit_prices` devuelve un DataFrame SIN columnas cuando no hay
    # ningún periodo legible. Filtrar sobre eso lanza ColumnNotFoundError en vez
    # de devolver vacío, y el error aparecería en la corrida nocturna.
    if items.is_empty() or "firma_producto" not in items.columns:
        logger.warning("  sin ítems con firma de producto — se omite el nivel 0")
        return pl.DataFrame()

    utilizables = items.filter(firma_es_utilizable())
    if utilizables.is_empty():
        logger.warning("  L0: ningún ítem tiene firma de producto utilizable")
        return pl.DataFrame()

    group_cols = ["firma_producto", "CodigoOrganismoPublico", "OrganismoPublico", "UnidadMedida"]
    claves = ["firma_producto", "CodigoOrganismoPublico", "UnidadMedida"]

    cleaned = remove_outliers_iqr(utilizables, claves)
    bands = _compute_bands(cleaned, group_cols, MIN_N_L0, level=0)
    if bands.is_empty():
        return bands

    # El código UNSPSC más frecuente del grupo. No es la clave, pero es lo que
    # permite que `get_precio_producto(codigo, organismo)` —que recibe un código
    # y no una firma— encuentre estas bandas.
    onu = (
        cleaned.group_by(claves + ["codigoProductoONU", "NombreroductoGenerico"])
        .agg(pl.len().alias("_veces"))
        .sort(["_veces", "codigoProductoONU"], descending=[True, False])
        .group_by(claves)
        .first()
        .select(claves + ["codigoProductoONU", "NombreroductoGenerico"])
    )
    bands = bands.join(onu, on=claves, how="left", coalesce=True)
    bands = _con_descripcion(bands, cleaned, claves)

    n_alta = bands.filter(pl.col("predictibilidad") == "alta").height
    logger.info(f"  L0: {len(bands):,} bandas ({n_alta:,} con predictibilidad alta)")
    return bands


def build_level_0_nacional(items: pl.DataFrame) -> pl.DataFrame:
    """Nivel 0N: Firma del producto + Unidad, sin distinguir comprador."""
    logger.info("Calculando bandas Nivel 0N (Firma+Unidad, nacional)...")

    # `extract_unit_prices` devuelve un DataFrame SIN columnas cuando no hay
    # ningún periodo legible. Filtrar sobre eso lanza ColumnNotFoundError en vez
    # de devolver vacío, y el error aparecería en la corrida nocturna.
    if items.is_empty() or "firma_producto" not in items.columns:
        logger.warning("  sin ítems con firma de producto — se omite el nivel 0")
        return pl.DataFrame()

    utilizables = items.filter(firma_es_utilizable())
    if utilizables.is_empty():
        return pl.DataFrame()

    claves = ["firma_producto", "UnidadMedida"]

    cleaned = remove_outliers_iqr(utilizables, claves)
    bands = _compute_bands(cleaned, claves, MIN_N_L0N, level=0)
    if bands.is_empty():
        return bands

    onu = (
        cleaned.group_by(claves + ["codigoProductoONU", "NombreroductoGenerico"])
        .agg(pl.len().alias("_veces"))
        .sort(["_veces", "codigoProductoONU"], descending=[True, False])
        .group_by(claves)
        .first()
        .select(claves + ["codigoProductoONU", "NombreroductoGenerico"])
    )
    bands = bands.join(onu, on=claves, how="left", coalesce=True)
    bands = _con_descripcion(bands, cleaned, claves)

    n_alta = bands.filter(pl.col("predictibilidad") == "alta").height
    logger.info(f"  L0N: {len(bands):,} bandas ({n_alta:,} con predictibilidad alta)")
    return bands


def build_level_1(items: pl.DataFrame) -> pl.DataFrame:
    """Nivel 1: Producto + Organismo + Unidad de Medida."""
    logger.info("Calculando bandas Nivel 1 (Producto+Organismo+Unidad)...")

    group_cols = [
        "codigoProductoONU",
        "NombreroductoGenerico",
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "UnidadMedida",
    ]

    cleaned = remove_outliers_iqr(items, group_cols[:3] + [group_cols[4]])
    bands = _compute_bands(cleaned, group_cols, MIN_N_L1, level=1)

    n_pred = bands.filter(pl.col("confianza") >= 0.5).height
    logger.info(f"  L1: {len(bands):,} bandas ({n_pred:,} con confianza ≥ 0.5)")
    return bands


def build_level_2(items: pl.DataFrame) -> pl.DataFrame:
    """Nivel 2: Producto + Sector + Unidad de Medida."""
    logger.info("Calculando bandas Nivel 2 (Producto+Sector+Unidad)...")

    group_cols = ["codigoProductoONU", "NombreroductoGenerico", "sector", "UnidadMedida"]

    cleaned = remove_outliers_iqr(items, [group_cols[0], group_cols[2], group_cols[3]])
    bands = _compute_bands(cleaned, group_cols, MIN_N_L2, level=2)

    n_pred = bands.filter(pl.col("confianza") >= 0.5).height
    logger.info(f"  L2: {len(bands):,} bandas ({n_pred:,} con confianza ≥ 0.5)")
    return bands


def build_level_3(items: pl.DataFrame) -> pl.DataFrame:
    """Nivel 3: Producto + Unidad de Medida (nacional)."""
    logger.info("Calculando bandas Nivel 3 (Producto+Unidad, nacional)...")

    group_cols = ["codigoProductoONU", "NombreroductoGenerico", "UnidadMedida"]

    cleaned = remove_outliers_iqr(items, [group_cols[0], group_cols[2]])
    bands = _compute_bands(cleaned, group_cols, MIN_N_L3, level=3)

    n_pred = bands.filter(pl.col("confianza") >= 0.5).height
    logger.info(f"  L3: {len(bands):,} bandas ({n_pred:,} con confianza ≥ 0.5)")
    return bands


# ─────────────────────────────────────────────────────────────────────
# Paso 4: Resumen de cobertura
# ─────────────────────────────────────────────────────────────────────


def build_coverage_summary(l1: pl.DataFrame, l2: pl.DataFrame, l3: pl.DataFrame) -> pl.DataFrame:
    """
    Resumen por producto: en cuántos niveles tiene banda y con qué confianza.
    Útil para saber qué productos se pueden cotizar con confianza.
    """
    logger.info("Generando resumen de cobertura...")

    def _product_summary(df: pl.DataFrame, level_name: str) -> pl.DataFrame:
        return df.group_by("codigoProductoONU").agg(
            [
                pl.len().alias(f"n_bandas_{level_name}"),
                pl.col("confianza").max().alias(f"max_confianza_{level_name}"),
                pl.col("n").sum().alias(f"total_transacciones_{level_name}"),
            ]
        )

    s1 = _product_summary(l1, "L1")
    s2 = _product_summary(l2, "L2")
    s3 = _product_summary(l3, "L3")

    # Nombre del producto (tomar el más frecuente)
    product_names = (
        pl.concat(
            [
                l1.select(["codigoProductoONU", "NombreroductoGenerico"]),
                l2.select(["codigoProductoONU", "NombreroductoGenerico"]),
                l3.select(["codigoProductoONU", "NombreroductoGenerico"]),
            ],
            how="diagonal_relaxed",
        )
        .group_by("codigoProductoONU")
        .first()
    )

    coverage = (
        product_names.join(s1, on="codigoProductoONU", how="left")
        .join(s2, on="codigoProductoONU", how="left")
        .join(s3, on="codigoProductoONU", how="left")
        .with_columns(
            [
                # Mejor nivel disponible
                pl.when(pl.col("n_bandas_L1").is_not_null() & (pl.col("n_bandas_L1") > 0))
                .then(1)
                .when(pl.col("n_bandas_L2").is_not_null() & (pl.col("n_bandas_L2") > 0))
                .then(2)
                .when(pl.col("n_bandas_L3").is_not_null() & (pl.col("n_bandas_L3") > 0))
                .then(3)
                .otherwise(0)
                .alias("mejor_nivel"),
                # Mejor confianza
                pl.max_horizontal(
                    pl.col("max_confianza_L1").fill_null(0),
                    pl.col("max_confianza_L2").fill_null(0),
                    pl.col("max_confianza_L3").fill_null(0),
                ).alias("mejor_confianza"),
            ]
        )
        .sort("mejor_confianza", descending=True)
    )

    for lvl in [1, 2, 3]:
        n = coverage.filter(pl.col("mejor_nivel") == lvl).height
        logger.info(f"  Productos cubiertos en Nivel {lvl}: {n:,}")

    alta_conf = coverage.filter(pl.col("mejor_confianza") >= 0.5).height
    logger.info(f"  Productos con confianza ≥ 0.5: {alta_conf:,}")

    return coverage


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────


def run_product_price_bands() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline completo de bandas de precio por producto."""
    logger.info("=" * 60)
    logger.info("BANDAS DE PRECIO POR PRODUCTO ESPECÍFICO")
    logger.info("=" * 60)

    items = extract_unit_prices()
    if items.is_empty():
        logger.error("No se extrajeron ítems con precio unitario")
        return {}

    # Calcular bandas por nivel
    l0 = build_level_0(items)
    l0n = build_level_0_nacional(items)
    l1 = build_level_1(items)
    l2 = build_level_2(items)
    l3 = build_level_3(items)

    # Guardar, cada nivel con su periodo: la API lo devuelve para que la banda
    # no se lea como histórica.
    limites = limites_ventana(OC_PARQUET_DIR, VENTANA_BANDAS_PRECIO_MESES)
    for name, df in [("L0", l0), ("L0N", l0n), ("L1", l1), ("L2", l2), ("L3", l3)]:
        if df.is_empty():
            logger.warning(f"  {name}: vacío, no se escribe parquet")
            continue
        path = OUTPUT_DIR / f"product_price_bands_{name}.parquet"
        con_ventana(df, limites).write_parquet(path, compression="snappy")
        logger.info(f"Guardado: {path.name} ({path.stat().st_size / 1024 / 1024:.1f} MB)")

    # Cobertura
    coverage = build_coverage_summary(l1, l2, l3)
    cov_path = OUTPUT_DIR / "product_price_coverage.parquet"
    coverage.write_parquet(cov_path, compression="snappy")
    logger.info(f"Guardado: {cov_path.name}")

    _reportar_predictibilidad(l0, l1)

    return {"l0": l0, "l0n": l0n, "l1": l1, "l2": l2, "l3": l3, "coverage": coverage}


def _reportar_predictibilidad(l0: pl.DataFrame, l1: pl.DataFrame) -> None:
    """Deja en el log la comparación que justifica el nivel 0.

    Se imprime en cada corrida a propósito: si algún día el nivel 0 deja de
    mejorar al 1, esa es exactamente la señal de que la firma se rompió — y sin
    esta línea se vería como "las bandas empeoraron" sin saber dónde mirar.
    """
    for etiqueta, df in [("L0 (firma)", l0), ("L1 (UNSPSC)", l1)]:
        if df.is_empty():
            logger.info(f"  {etiqueta:14} sin bandas")
            continue
        total = len(df)
        alta = df.filter(pl.col("predictibilidad") == "alta").height
        qcd_med = df["qcd"].median()
        logger.info(
            f"  {etiqueta:14} bandas={total:>8,}  QCD mediano={qcd_med:.3f}  "
            f"predictibilidad alta={100 * alta / total:5.1f}%"
        )

    if l0.is_empty():
        return
    logger.info("\nEjemplos de bandas con predictibilidad alta (Nivel 0):")
    top = l0.filter(pl.col("predictibilidad") == "alta").sort("n", descending=True).head(10)
    for row in top.iter_rows(named=True):
        desc = (row.get("descripcion") or row["firma_producto"] or "")[:45]
        org = (row.get("OrganismoPublico") or "")[:25]
        print(
            f"  {desc:45s} | {org:25s} | "
            f"${row['p25']:>10,.0f}–${row['p75']:>10,.0f}/{row['UnidadMedida']} | "
            f"n={row['n']:>4} | qcd={row['qcd']:.2f}"
        )
