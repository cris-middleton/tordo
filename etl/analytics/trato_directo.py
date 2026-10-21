"""Cuánto de lo que compra un organismo llega por trato directo.

**Sale de las órdenes de compra, no de las licitaciones.** Un trato directo no
es una licitación: no aparece en la descarga masiva de licitaciones, que sólo
trae los tipos L1, LE, LP, LQ, LR, las de obra del MOP y las privadas (medido en
42 meses: cero filas con «TD»). `buyer_scoring` y `buyer_transparency` lo
buscaban ahí (`CodigoTipo == "TD"` en LIC), así que el porcentaje era 0 % para
todo comprador: la ficha pública decía «Trato directo: 0 %» y el componente de
transparencia de la nota valía el máximo para todos.

En las órdenes sí está: `Tipo = "TD"` es «Proveniente de Ficha de Trato
Directo» (`DescripcionTipoOC`), el 4,2 % de las órdenes de un mes (19.740 de
466.457 en 2025-10). Se cuenta por ORDEN (`orden_por_fila`) y sin las
canceladas, que no llegaron a comprar nada.

Una sola regla para los dos módulos: `contar` sobre un archivo y `combinar`
sobre lo acumulado. `buyer_scoring` la aplica dentro de su propia pasada por las
órdenes; `buyer_transparency`, que sólo leía licitaciones, con
`por_organismo()`, que lee tres columnas.
"""

from __future__ import annotations

import polars as pl

from .data_loader import iter_oc_parquets, orden_por_fila, sin_canceladas

#: `Tipo` de una orden que viene de un trato directo.
TIPO_TRATO_DIRECTO = "TD"

ORGANISMO = "CodigoOrganismoPublico"

#: Lo que hace falta leer de las órdenes.
COLUMNAS = ["Codigo", ORGANISMO, "Tipo", "Estado"]


def contar(df: pl.DataFrame) -> pl.DataFrame:
    """Órdenes y órdenes por trato directo de cada organismo, en un archivo.

    `df` trae una fila por LÍNEA; aquí se cuenta una por orden, sin canceladas.
    """
    if ORGANISMO not in df.columns or "Tipo" not in df.columns:
        return pl.DataFrame(
            schema={ORGANISMO: pl.Utf8, "n_ordenes": pl.UInt32, "n_trato_directo": pl.UInt32}
        )
    ordenes = orden_por_fila(sin_canceladas(df) if "Estado" in df.columns else df)
    return (
        ordenes.filter(pl.col(ORGANISMO).is_not_null())
        .group_by(ORGANISMO)
        .agg(
            pl.len().alias("n_ordenes"),
            (pl.col("Tipo") == TIPO_TRATO_DIRECTO).sum().alias("n_trato_directo"),
        )
    )


def combinar(parciales: list[pl.DataFrame]) -> pl.DataFrame:
    """Suma los conteos de varios archivos y calcula `pct_trato_directo`."""
    if not parciales:
        return pl.DataFrame(
            schema={
                ORGANISMO: pl.Utf8,
                "n_ordenes": pl.UInt32,
                "n_trato_directo": pl.UInt32,
                "pct_trato_directo": pl.Float64,
            }
        )
    return (
        pl.concat(parciales, how="diagonal_relaxed")
        .group_by(ORGANISMO)
        .agg(pl.col("n_ordenes").sum(), pl.col("n_trato_directo").sum())
        .with_columns(
            (pl.col("n_trato_directo") / pl.col("n_ordenes").clip(lower_bound=1)).alias(
                "pct_trato_directo"
            )
        )
    )


def por_organismo() -> pl.DataFrame:
    """`combinar` sobre todas las órdenes de la ventana, leyendo sólo `COLUMNAS`."""
    return combinar([contar(df) for _periodo, df in iter_oc_parquets(columns=COLUMNAS)])
