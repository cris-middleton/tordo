"""Compra Ágil por comprador y mes: cuántas se publican y cuántas terminan en orden.

Spec del pivote §6.2 (revisión C5): es la «tasa de adjudicación» del ranking de
«lo mejor de hoy». Sale en `compra_agil_mensual.parquet` y se materializa en
`analytics.compra_agil_mensual`, como el resto del BI.

Dos fuentes, porque ninguna tiene las dos cifras:

- **`adjudicadas`** sale de la descarga masiva de órdenes de compra, donde
  Compra Ágil viene marcada (`EsCompraAgil = "Si"`, `Tipo = "AG"`). **Cuenta
  ÓRDENES distintas, no Compras Ágiles**: la orden no tiene un campo que diga de
  qué Compra Ágil viene (`CodigoLicitacion` va vacío en las 172.621 líneas de
  marzo de 2026). Sí lo dice a veces en TEXTO: el `Nombre` que pone el sistema
  («…generada por invitación a compra ágil: 1510-140-COT24») está en el 37,9 % de
  las órdenes (el comprador lo sobrescribe), y algún código `-COT` aparece en el
  texto libre del 78,2 %. Donde se puede enlazar, **1 Compra Ágil → 1 orden en
  138.555 de 138.561 casos (99,996 %)**: contar órdenes es, en la práctica,
  contar Compras Ágiles adjudicadas. Las canceladas no cuentan. El mes es el de
  `FechaCreacion` de la ORDEN.

**`adjudicadas / publicadas` NO es una tasa**: son dos conteos de cosas
distintas, y el mes no se corresponde —la orden sale días después de publicar—,
así que en los bordes de mes el cociente se desplaza y puede pasar de 1. Para una
tasa de verdad haría falta enlazar cada orden con su Compra Ágil (por el código
del texto, con ~78 % de cobertura) y fecharla por la PUBLICACIÓN.
- **`publicadas`** sale de lo que ingiere el ETL de Compra Ágil (`licitaciones`
  con `tipo_convocatoria = 'compra_agil'`), por mes de publicación en Chile.
  **Postgres sólo guarda los últimos 30 días** (§5.2), así que esta cifra no se
  puede recalcular hacia atrás: se ACUMULA. Cada semana se lee la tabla de la
  semana anterior y, por (comprador, mes), se queda el MÁXIMO entre lo que había
  y lo que se ve ahora: un mes a medio purgar nunca rebaja lo ya contado.
  **No hay historia previa**: los meses anteriores al primer despliegue salen con
  `publicadas` nulo y se van llenando.

La Compra Ágil ingerida identifica al comprador por RUT (`rut_organismo`), y
las órdenes por `CodigoOrganismoPublico`. La identidad es el código
(`identidad.py`): el RUT se traduce con las propias órdenes, que traen los dos
(`RutUnidadCompra`), quedándose con el código más frecuente de cada RUT. Lo que
no se pueda traducir se cuenta igual, con código nulo: perderlo rebajaría la
tasa sin avisar.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from pathlib import Path

import polars as pl
from sqlalchemy import create_engine, text

from etl.analytics.config import OUTPUT_DIR
from etl.analytics.data_loader import iter_oc_parquets
from etl.config import config

logger = logging.getLogger(__name__)

SALIDA = "compra_agil_mensual.parquet"
CLAVE = ["CodigoOrganismoPublico", "mes"]

#: Estados de una orden que no llegó a comprar nada.
ESTADOS_CANCELADOS = ("Cancelacion solicitada", "Cancelada", "Cancelación solicitada")

COLUMNAS_OC = ["Codigo", "CodigoOrganismoPublico", "RutUnidadCompra", "FechaCreacion"]
COLUMNAS_OC_FILTRO = ["EsCompraAgil", "Estado"]

ESQUEMA = {
    "CodigoOrganismoPublico": pl.Utf8,
    "mes": pl.Date,
    "publicadas": pl.Int64,
    "adjudicadas": pl.Int64,
}


def rut_normalizado(columna: str) -> pl.Expr:
    """«69.255.600-3» → «692556003». Mayúscula para la K."""
    return pl.col(columna).cast(pl.Utf8).str.to_uppercase().str.replace_all(r"[^0-9K]", "")


def _mes(columna: str) -> pl.Expr:
    return (pl.col(columna).cast(pl.Utf8).str.slice(0, 7) + "-01").str.to_date(
        "%Y-%m-%d", strict=False
    )


def ordenes_compra_agil(frames: Iterable[pl.DataFrame]) -> pl.DataFrame:
    """Una fila por ORDEN de Compra Ágil vigente: código, comprador, RUT y mes."""
    partes = []
    for df in frames:
        if not {"EsCompraAgil", "Codigo"} <= set(df.columns):
            continue
        filtro = pl.col("EsCompraAgil") == "Si"
        if "Estado" in df.columns:
            filtro &= ~pl.col("Estado").is_in(ESTADOS_CANCELADOS)
        partes.append(
            df.filter(filtro).select(
                pl.col("Codigo"),
                pl.col("CodigoOrganismoPublico").cast(pl.Utf8),
                rut_normalizado("RutUnidadCompra").alias("rut"),
                _mes("FechaCreacion").alias("mes"),
            )
        )
    if not partes:
        return pl.DataFrame(
            schema={
                "Codigo": pl.Utf8,
                "CodigoOrganismoPublico": pl.Utf8,
                "rut": pl.Utf8,
                "mes": pl.Date,
            }
        )
    # Un archivo mensual trae órdenes de otros meses, y la misma orden puede
    # aparecer en dos: se cuenta una vez.
    return pl.concat(partes).unique(subset=["Codigo"], keep="first")


def adjudicadas_por_mes(ordenes: pl.DataFrame) -> pl.DataFrame:
    return (
        ordenes.filter(pl.col("CodigoOrganismoPublico").is_not_null() & pl.col("mes").is_not_null())
        .group_by(CLAVE)
        .agg(pl.len().cast(pl.Int64).alias("adjudicadas"))
    )


def codigo_por_rut(ordenes: pl.DataFrame) -> pl.DataFrame:
    """RUT del comprador → `CodigoOrganismoPublico`, el más frecuente."""
    return (
        ordenes.filter(pl.col("rut").is_not_null() & (pl.col("rut") != ""))
        .group_by(["rut", "CodigoOrganismoPublico"])
        .agg(pl.len().alias("n"))
        .sort(["rut", "n", "CodigoOrganismoPublico"], descending=[False, True, False])
        .unique(subset=["rut"], keep="first")
        .select(["rut", "CodigoOrganismoPublico"])
    )


def publicadas_por_mes(publicadas: pl.DataFrame, traduccion: pl.DataFrame) -> pl.DataFrame:
    """`publicadas` trae (rut, mes, n) desde Postgres; sale por código de comprador."""
    return (
        publicadas.join(traduccion, on="rut", how="left", coalesce=True)
        .group_by(CLAVE)
        .agg(pl.col("n").sum().cast(pl.Int64).alias("publicadas"))
    )


def combinar(
    adjudicadas: pl.DataFrame, publicadas: pl.DataFrame, anterior: pl.DataFrame | None
) -> pl.DataFrame:
    """Las tres en una tabla. `publicadas` se ACUMULA: máximo con la anterior."""
    actual = adjudicadas.join(publicadas, on=CLAVE, how="full", coalesce=True)
    if anterior is not None and len(anterior):
        previas = anterior.select(*CLAVE, pl.col("publicadas").alias("publicadas_previas"))
        actual = actual.join(previas, on=CLAVE, how="full", coalesce=True).with_columns(
            pl.max_horizontal("publicadas", "publicadas_previas").alias("publicadas")
        )
    for columna, tipo in ESQUEMA.items():
        if columna not in actual.columns:
            actual = actual.with_columns(pl.lit(None, dtype=tipo).alias(columna))
    return actual.select([pl.col(c).cast(t) for c, t in ESQUEMA.items()]).sort(
        CLAVE, nulls_last=True
    )


def leer_publicadas(engine) -> pl.DataFrame:
    """Compras Ágiles ingeridas, por RUT del comprador y mes de publicación en Chile."""
    consulta = text(
        """
        SELECT regexp_replace(upper(rut_organismo), '[^0-9K]', '', 'g') AS rut,
               date_trunc('month', fecha_publicacion AT TIME ZONE 'America/Santiago')::date AS mes,
               count(DISTINCT codigo_externo) AS n
          FROM licitaciones
         WHERE tipo_convocatoria = 'compra_agil'
         GROUP BY 1, 2
        """
    )
    with engine.connect() as conn:
        filas = conn.execute(consulta).all()
    return pl.DataFrame(
        [(r.rut, r.mes, r.n) for r in filas],
        schema={"rut": pl.Utf8, "mes": pl.Date, "n": pl.Int64},
        orient="row",
    )


def _url_sync() -> str:
    return config.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)


def run_compra_agil_mensual(
    output_dir: Path = OUTPUT_DIR,
    *,
    frames: Iterable[pl.DataFrame] | None = None,
    publicadas: pl.DataFrame | None = None,
) -> pl.DataFrame:
    """Reconstruye la tabla. `frames` y `publicadas` se inyectan en los tests."""
    if frames is None:
        frames = (df for _, df in iter_oc_parquets(columns=COLUMNAS_OC + COLUMNAS_OC_FILTRO))
    ordenes = ordenes_compra_agil(frames)

    if publicadas is None:
        engine = create_engine(_url_sync(), pool_pre_ping=True)
        try:
            publicadas = leer_publicadas(engine)
        finally:
            engine.dispose()

    ruta = Path(output_dir) / SALIDA
    anterior = pl.read_parquet(ruta) if ruta.exists() else None

    tabla = combinar(
        adjudicadas_por_mes(ordenes),
        publicadas_por_mes(publicadas, codigo_por_rut(ordenes)),
        anterior,
    )
    tabla.write_parquet(ruta)
    logger.info(
        "compra_agil_mensual: %d filas (%d con publicadas, %d con adjudicadas)",
        len(tabla),
        tabla["publicadas"].is_not_null().sum(),
        tabla["adjudicadas"].is_not_null().sum(),
    )
    return tabla
