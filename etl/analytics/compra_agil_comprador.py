"""Compra Ágil por comprador: cuántas órdenes emite, a cuántos proveedores y por cuánto.

Paso 9 del pivote público (spec §6.2). `compra_agil_comprador` (por organismo)
sirve hoy a la ficha pública del comprador (`/publico/compradores/{codigo}`) y al
filtro `codigo_organismo` de `GET /compra-agil/destacadas`; el puntaje de «lo
mejor de hoy» lee en cambio `compra_agil_unidad` (más abajo, rediseño 0a).
Sale en tres parquets que se materializan como el resto del BI:

- **`compra_agil_comprador`** — una fila por `CodigoOrganismoPublico`, sobre una
  ventana de `VENTANA_COMPRA_AGIL_MESES` meses anclada en el último mes con
  datos (como la de 36 meses del paso 6D, y por lo mismo: si ChileCompra se
  atrasa, la ventana se queda donde están los datos en vez de vaciarse):

  - `ordenes`: órdenes de Compra Ágil vigentes (ni canceladas ni de otro
    mecanismo). Es «adjudicadas»: medido, 1 Compra Ágil → 1 orden en el
    99,996 % de los casos enlazables (ver `compra_agil_mensual`).
  - `publicadas`: suma de `compra_agil_mensual.publicadas` en la ventana. Nula
    si no hay ningún mes con dato — no es lo mismo que cero.
  - `proveedores_distintos` y `cuota_lider_pct`: cuántos ganaron y qué parte de
    las órdenes se llevó el que más. **Sólo conteos**: las personas naturales
    ya llegan seudonimizadas desde `data_loader` y aquí se cuentan, nunca se
    nombran — no sale ningún código ni nombre de proveedor.
  - `monto_p25` / `monto_mediana` / `monto_p75`: el monto TOTAL de la orden en
    pesos (`MontoTotalOC_PesosChilenos`). El archivo lo repite en cada LÍNEA: se
    toma una vez por orden, o una orden de diez líneas pesaría diez veces.

- **`comprador_rut`** — RUT del comprador (normalizado como
  `compra_agil_mensual.rut_normalizado`) → `CodigoOrganismoPublico`, el más
  frecuente. La Compra Ágil ingerida identifica al comprador SÓLO por RUT; la
  analítica, por código. Es `codigo_por_rut`, persistido para que la API pueda
  unir sin rehacerlo. Sale de la misma ventana: un comprador sin órdenes en
  ella tampoco tendría fila en la tabla de arriba.

- **`compra_agil_unidad`** — lo mismo que `compra_agil_comprador`, pero por RUT
  de la UNIDAD de compra, más `percentil_ordenes` (qué parte de las unidades
  compró menos en la ventana). **Sólo tiene unidades con al menos una orden**: la
  población del percentil son las que compran; la que publica y no compra no
  figura, y la API la trata como percentil 0. Es lo que usa el puntaje de «lo mejor de hoy»
  (rediseño 0a): la Compra Ágil trae el RUT de la unidad, y unir por el código
  del organismo le daba a cada unidad la historia del organismo entero (la FACh
  son 14 RUT bajo un código). `comprador_rut` queda para el filtro por comprador.

**Por qué meses y no 180 días exactos.** Los archivos de la descarga masiva son
mensuales y el resto de la analítica se ancla por mes; seis meses calendario
completos son ~180 días y comparables entre compradores y semanas. Un corte por
días partiría el primer mes y movería las cifras cada día sin cambiar nada.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date
from pathlib import Path

import polars as pl

from etl.analytics.compra_agil_mensual import (
    COLUMNAS_OC,
    COLUMNAS_OC_FILTRO,
    codigo_por_rut,
    ordenes_compra_agil,
)
from etl.analytics.compra_agil_mensual import SALIDA as SALIDA_MENSUAL
from etl.analytics.config import OC_PARQUET_DIR, OUTPUT_DIR
from etl.analytics.data_loader import con_ventana, iter_oc_parquets, limites_ventana

logger = logging.getLogger(__name__)

SALIDA = "compra_agil_comprador.parquet"
SALIDA_RUT = "comprador_rut.parquet"

#: ~180 días, en meses calendario completos (ver el docstring del módulo).
VENTANA_COMPRA_AGIL_MESES = 6

COLUMNAS_ORDEN = ["CodigoProveedor", "MontoTotalOC_PesosChilenos"]

ESQUEMA = {
    "CodigoOrganismoPublico": pl.Utf8,
    "ordenes": pl.Int64,
    "publicadas": pl.Int64,
    "proveedores_distintos": pl.Int64,
    "cuota_lider_pct": pl.Float64,
    "monto_p25": pl.Float64,
    "monto_mediana": pl.Float64,
    "monto_p75": pl.Float64,
}

ESQUEMA_RUT = {"rut": pl.Utf8, "CodigoOrganismoPublico": pl.Utf8}

SALIDA_UNIDAD = "compra_agil_unidad.parquet"

ESQUEMA_UNIDAD = {
    "rut": pl.Utf8,
    "ordenes": pl.Int64,
    "proveedores_distintos": pl.Int64,
    "cuota_lider_pct": pl.Float64,
    "monto_p25": pl.Float64,
    "monto_mediana": pl.Float64,
    "monto_p75": pl.Float64,
    "percentil_ordenes": pl.Float64,
}


def _en_ventana(df: pl.DataFrame, limites: tuple[date, date] | None) -> pl.DataFrame:
    """Sólo los meses de la ventana. `mes` es el primer día del mes."""
    if limites is None:
        return df
    desde, hasta = limites
    return df.filter(pl.col("mes").is_between(pl.lit(desde), pl.lit(hasta)))


def _monto() -> pl.Expr:
    # `iter_oc_parquets` ya lo entrega como número; `ordenes_compra_agil` lo
    # arrastra como texto para que todos los archivos concatenen igual.
    return (
        pl.col("MontoTotalOC_PesosChilenos")
        .cast(pl.Utf8)
        .str.replace(",", ".", literal=True)
        .cast(pl.Float64, strict=False)
    )


def estadisticas_por_comprador(
    ordenes: pl.DataFrame, clave: str = "CodigoOrganismoPublico"
) -> pl.DataFrame:
    """Órdenes, proveedores, cuota del líder y montos, por `clave`.

    `ordenes` trae ya UNA fila por orden (`ordenes_compra_agil`), así que todo
    lo que se cuenta o se promedia aquí es por orden, no por línea. `clave` es el
    código del organismo (la ficha pública) o el RUT de la unidad (el puntaje).
    """
    base = ordenes.filter(pl.col(clave).is_not_null()).with_columns(_monto().alias("monto"))
    generales = base.group_by(clave).agg(
        pl.len().cast(pl.Int64).alias("ordenes"),
        pl.col("CodigoProveedor")
        .drop_nulls()
        .n_unique()
        .cast(pl.Int64)
        .alias("proveedores_distintos"),
        pl.col("monto").quantile(0.25, "linear").alias("monto_p25"),
        pl.col("monto").median().alias("monto_mediana"),
        pl.col("monto").quantile(0.75, "linear").alias("monto_p75"),
    )
    lider = (
        base.filter(pl.col("CodigoProveedor").is_not_null())
        .group_by([clave, "CodigoProveedor"])
        .agg(pl.len().alias("n"))
        .group_by(clave)
        .agg((pl.col("n").max() * 100.0 / pl.col("n").sum()).round(1).alias("cuota_lider_pct"))
    )
    return generales.join(lider, on=clave, how="left", coalesce=True)


def con_percentil(tabla: pl.DataFrame) -> pl.DataFrame:
    """`percentil_ordenes` en [0, 1]: qué parte de las unidades compró MENOS.

    Es `percent_rank`: (rango mínimo − 1) / (n − 1). Los empates comparten valor;
    la que más compra vale 1 y la que menos, 0. Con una sola unidad no hay con
    quién comparar: 0,5, el neutro de la escala.

    La clave `rut` ya viene normalizada sin ceros a la izquierda
    (`compra_agil_mensual.rut_normalizado`), así que `0616087002` y `616087002`
    son UNA unidad y cuentan una vez en la población.
    """
    n = len(tabla)
    if n <= 1:
        return tabla.with_columns(pl.lit(0.5, dtype=pl.Float64).alias("percentil_ordenes"))
    return tabla.with_columns(
        ((pl.col("ordenes").rank("min") - 1) / (n - 1)).cast(pl.Float64).alias("percentil_ordenes")
    )


def estadisticas_por_unidad(ordenes: pl.DataFrame) -> pl.DataFrame:
    """Lo mismo, por UNIDAD de compra: su RUT (`RutUnidadCompra`, normalizado).

    La Compra Ágil ingerida trae el RUT de la unidad, no el código del
    organismo, y un organismo puede tener muchas unidades con RUT propio —medido
    en las OC 2025-10..2026-03: 115 de 1.163 organismos, el 25 % de las órdenes;
    la FACh (6946) son 14 RUT—. Unir por código le daba a cada unidad la historia
    de su organismo entero.
    """
    filtradas = ordenes.filter(pl.col("rut").is_not_null() & (pl.col("rut") != ""))
    tabla = con_percentil(estadisticas_por_comprador(filtradas, clave="rut"))
    return tabla.select([pl.col(c).cast(t) for c, t in ESQUEMA_UNIDAD.items()]).sort("rut")


def publicadas_en_ventana(
    mensual: pl.DataFrame | None, limites: tuple[date, date] | None
) -> pl.DataFrame:
    """Suma de `publicadas` por comprador en la ventana; nula si ningún mes trae dato."""
    if mensual is None or mensual.is_empty():
        return pl.DataFrame(schema={"CodigoOrganismoPublico": pl.Utf8, "publicadas": pl.Int64})
    return (
        _en_ventana(mensual, limites)
        .filter(pl.col("CodigoOrganismoPublico").is_not_null())
        .group_by("CodigoOrganismoPublico")
        .agg(
            pl.when(pl.col("publicadas").is_not_null().any())
            .then(pl.col("publicadas").sum())
            .otherwise(None)
            .cast(pl.Int64)
            .alias("publicadas")
        )
    )


def combinar(estadisticas: pl.DataFrame, publicadas: pl.DataFrame) -> pl.DataFrame:
    """Una fila por comprador con órdenes O con publicadas.

    Un comprador que publica y no adjudica nada entra con `ordenes = 0`: así lo
    muestra la ficha pública del comprador. **El puntaje de «lo mejor de hoy» ya
    no lee esta tabla** sino `compra_agil_unidad`, que sólo tiene unidades con
    órdenes; allí una unidad sin órdenes no tiene fila, y la API le da el factor
    comprador 0 (no el neutro) cuando la tabla está poblada.
    """
    tabla = estadisticas.join(
        publicadas, on="CodigoOrganismoPublico", how="full", coalesce=True
    ).with_columns(pl.col("ordenes").fill_null(0), pl.col("proveedores_distintos").fill_null(0))
    return tabla.select([pl.col(c).cast(t) for c, t in ESQUEMA.items()]).sort(
        "CodigoOrganismoPublico"
    )


def _leer_mensual(output_dir: Path) -> pl.DataFrame | None:
    ruta = Path(output_dir) / SALIDA_MENSUAL
    if not ruta.exists():
        logger.warning("compra_agil_comprador: no existe %s — publicadas quedan nulas", ruta)
        return None
    return pl.read_parquet(ruta)


def run_compra_agil_comprador(
    output_dir: Path = OUTPUT_DIR,
    *,
    frames: Iterable[pl.DataFrame] | None = None,
    limites: tuple[date, date] | None = None,
) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Escribe las tres tablas. `frames` y `limites` se inyectan en los tests.

    Corre DESPUÉS de `compra_agil_mensual`: lee su parquet para `publicadas`.
    """
    if frames is None:
        limites = limites_ventana(OC_PARQUET_DIR, VENTANA_COMPRA_AGIL_MESES)
        frames = (
            df
            for _, df in iter_oc_parquets(
                columns=COLUMNAS_OC + COLUMNAS_OC_FILTRO + COLUMNAS_ORDEN,
                meses=VENTANA_COMPRA_AGIL_MESES,
            )
        )
    ordenes = _en_ventana(ordenes_compra_agil(frames, extra=COLUMNAS_ORDEN), limites)

    tabla = con_ventana(
        combinar(
            estadisticas_por_comprador(ordenes),
            publicadas_en_ventana(_leer_mensual(output_dir), limites),
        ),
        limites,
    )
    ruts = codigo_por_rut(ordenes.filter(pl.col("CodigoOrganismoPublico").is_not_null())).select(
        [pl.col(c).cast(t) for c, t in ESQUEMA_RUT.items()]
    )
    unidad = con_ventana(estadisticas_por_unidad(ordenes), limites)

    tabla.write_parquet(Path(output_dir) / SALIDA)
    ruts.write_parquet(Path(output_dir) / SALIDA_RUT)
    unidad.write_parquet(Path(output_dir) / SALIDA_UNIDAD)
    logger.info(
        "compra_agil_comprador: %d compradores (%d con publicadas), %d RUT traducibles, "
        "%d unidades",
        len(tabla),
        tabla["publicadas"].is_not_null().sum(),
        len(ruts),
        len(unidad),
    )
    return tabla, ruts, unidad
