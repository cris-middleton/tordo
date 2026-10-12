"""El contenido de las páginas públicas: comprador, rubro y producto.

Reutiliza el BI tal cual —el perfil de `/bi/comprador` y el panorama de
`/bi/panorama`— y añade lo que esas pantallas no necesitaban: los enlaces entre
páginas (los rubros de un comprador, los compradores de un rubro o de un
producto). Qué existe y qué se indexa no se decide aquí: lo dice `indexables`.

Cada función devuelve `None` cuando la página no existe; el router lo convierte
en 404. **Ninguna devuelve datos de proveedores** más allá de lo que ya publica
el panorama (nombres o seudónimos `PN-` de los líderes, sin código ni RUT).
"""

from __future__ import annotations

import polars as pl

from app.repositories.compra_agil import CAMPOS_HISTORIA
from app.services.bi._base import _load, _primero
from app.services.bi.comprador import get_comprador
from app.services.bi.rubro import get_panorama
from app.services.publico import indexables
from app.utils.slug import slug as hacer_slug

#: Cuántos enlaces a otras páginas lleva cada una. Más de diez no se leen y sí
#: pesan en la respuesta (y en el HTML que se cachea una semana).
TOP_ENLACES = 10

#: Tope de resultados de la búsqueda de productos.
MAX_RESULTADOS_BUSQUEDA = 50


def _periodo(indice: indexables.Indice) -> dict:
    periodo = indice.periodo or {}
    return {"ventana_desde": periodo.get("desde"), "ventana_hasta": periodo.get("hasta")}


def sitemap() -> dict:
    """Sólo lo indexable. `actualizado` es el final de la ventana de analytics."""
    indice = indexables.indice()

    def _indexables(df: pl.DataFrame, columna: str) -> list[str]:
        return sorted(df.filter(pl.col("indexable")).get_column(columna).to_list())

    return {
        "actualizado": (indice.periodo or {}).get("hasta"),
        "compradores": _indexables(indice.compradores, "codigo"),
        "rubros": _indexables(indice.rubros, "slug"),
        "productos": _indexables(indice.productos, "slug"),
    }


# ── Comprador ────────────────────────────────────────────────────────────────


def _compra_agil(codigo: str) -> dict | None:
    """La historia de Compra Ágil del comprador (paso 9), o None sin dato."""
    df = _load(
        "compra_agil_comprador.parquet",
        filtros={"CodigoOrganismoPublico": codigo},
        limite=1,
    )
    if df is None or df.is_empty():
        return None
    fila = df.row(0, named=True)
    return {c: fila.get(c) for c in CAMPOS_HISTORIA}


def _rubros_del_comprador(codigo: str, indice: indexables.Indice) -> list[dict]:
    df = _load(
        "market_concentration.parquet",
        filtros={"CodigoOrganismoPublico": codigo},
        columnas=["RubroN2", "monto_total_mercado", "n_transacciones"],
    )
    if df is None or df.is_empty():
        return []
    # El slug sale del índice y no de recalcularlo: un rubro que perdió su slug
    # en una colisión no tiene página, y enlazarlo llevaría a la de otro.
    slugs = dict(
        zip(
            indice.rubros.get_column("nombre").to_list(),
            indice.rubros.get_column("slug").to_list(),
            strict=True,
        )
    )
    top = (
        df.filter(pl.col("RubroN2").is_not_null())
        .group_by("RubroN2")
        .agg(
            pl.col("monto_total_mercado").sum().alias("monto"),
            pl.col("n_transacciones").cast(pl.Int64).sum().alias("ordenes"),
        )
        .sort(["monto", "RubroN2"], descending=[True, False])
        .head(TOP_ENLACES)
    )
    return [
        {
            "nombre": r["RubroN2"],
            "slug": slugs.get(r["RubroN2"]),
            "monto": float(r["monto"] or 0),
            "ordenes": int(r["ordenes"] or 0),
        }
        for r in top.iter_rows(named=True)
        if r["RubroN2"] not in ("", "NA")
    ]


def comprador(codigo: str) -> dict | None:
    indice = indexables.indice()
    fila = indice.compradores.filter(pl.col("codigo") == codigo)
    if fila.is_empty():
        return None
    conocido = fila.row(0, named=True)
    perfil = get_comprador(codigo)
    return {
        "codigo": codigo,
        "nombre": perfil.get("nombre") or conocido["nombre"],
        "indexable": bool(conocido["indexable"]),
        "periodo": _periodo(indice),
        "perfil": perfil,
        "compra_agil": _compra_agil(codigo),
        "rubros": _rubros_del_comprador(codigo, indice),
    }


# ── Rubro ────────────────────────────────────────────────────────────────────


def _compradores_del_rubro(rubro: str) -> list[dict]:
    df = _load(
        "market_concentration.parquet",
        filtros={"RubroN2": rubro},
        columnas=[
            "CodigoOrganismoPublico",
            "OrganismoPublico",
            "monto_total_mercado",
            "n_transacciones",
        ],
    )
    if df is None or df.is_empty():
        return []
    top = (
        df.with_columns(pl.col("CodigoOrganismoPublico").cast(pl.Utf8))
        .group_by("CodigoOrganismoPublico")
        .agg(
            pl.col("OrganismoPublico").first().alias("nombre"),
            pl.col("monto_total_mercado").sum().alias("monto"),
            pl.col("n_transacciones").cast(pl.Int64).sum().alias("ordenes"),
        )
        .sort(["monto", "CodigoOrganismoPublico"], descending=[True, False])
        .head(TOP_ENLACES)
    )
    return [
        {
            "codigo": r["CodigoOrganismoPublico"],
            "nombre": r["nombre"],
            "monto": float(r["monto"] or 0),
            "ordenes": int(r["ordenes"] or 0),
        }
        for r in top.iter_rows(named=True)
    ]


def rubro(slug: str) -> dict | None:
    fila = indexables.indice().rubros.filter(pl.col("slug") == slug)
    if fila.is_empty():
        return None
    conocido = fila.row(0, named=True)
    return {
        "slug": slug,
        "nombre": conocido["nombre"],
        "indexable": bool(conocido["indexable"]),
        "panorama": get_panorama(conocido["nombre"]),
        "compradores": _compradores_del_rubro(conocido["nombre"]),
    }


# ── Producto ─────────────────────────────────────────────────────────────────


def _unidades(bandas: pl.DataFrame) -> list[dict]:
    return [
        {
            "unidad": r.get("UnidadMedida"),
            "n": int(r.get("n") or 0),
            "p10": r.get("p10"),
            "p25": r.get("p25"),
            "p50": r.get("p50"),
            "p75": r.get("p75"),
            "p90": r.get("p90"),
            "predictibilidad": r.get("predictibilidad"),
            "confianza": r.get("confianza"),
        }
        for r in bandas.iter_rows(named=True)
    ]


def _compradores_del_producto(firma: str) -> list[dict]:
    df = _load(
        "product_price_bands_L0.parquet",
        filtros={"firma_producto": firma},
        columnas=["CodigoOrganismoPublico", "OrganismoPublico", "UnidadMedida", "n", "p50"],
        orden="n",
        descendente=True,
        limite=TOP_ENLACES,
    )
    if df is None or df.is_empty():
        return []
    return [
        {
            "codigo": str(r["CodigoOrganismoPublico"]),
            "nombre": r.get("OrganismoPublico"),
            "unidad": r.get("UnidadMedida"),
            "n": int(r.get("n") or 0),
            "p50": r.get("p50"),
        }
        for r in df.iter_rows(named=True)
    ]


def producto(slug: str) -> dict | None:
    """La página de un producto: una banda nacional por unidad de medida.

    Un producto no indexable responde igual —la página existe, con `noindex`—;
    sólo un slug que no corresponde a ninguna firma es 404.
    """
    fila = indexables.indice().productos.filter(pl.col("slug") == slug)
    if fila.is_empty():
        return None
    conocido = fila.row(0, named=True)
    firma = conocido["firma"]

    bandas = _load(
        "product_price_bands_L0N.parquet",
        filtros={"firma_producto": firma},
        orden="n",
        descendente=True,
    )
    if bandas is None or bandas.is_empty():
        # El índice es de hasta diez minutos atrás: si analytics se
        # re-materializó en medio y la firma desapareció, es un 404 honesto.
        return None
    bandas = bandas.sort(["n", "UnidadMedida"], descending=[True, False], nulls_last=True)
    principal = bandas.row(0, named=True)
    return {
        "slug": slug,
        "firma": firma,
        # `NombreroductoGenerico`, con la P perdida, es como viene del parquet
        # (etl/loaders/analytics_catalog.py); el otro nombre es por si un día
        # se corrige.
        "nombre_generico": _primero(principal, "NombreroductoGenerico", "NombreProductoGenerico"),
        "codigo_onu": principal.get("codigoProductoONU"),
        "descripcion": principal.get("descripcion"),
        "indexable": bool(conocido["indexable"]),
        "unidades": _unidades(bandas),
        "compradores": _compradores_del_producto(firma),
    }


def buscar_productos(q: str, limite: int) -> list[dict]:
    """Productos cuya firma contiene todas las palabras de `q`.

    Se compara slug contra slug, así que la búsqueda **ignora tildes y
    mayúsculas** en los dos sentidos, y el orden de las palabras no importa (la
    firma las guarda ordenadas). Primero los indexables, luego por compras.
    """
    palabras = [p for p in hacer_slug(q).split("-") if p]
    if not palabras:
        return []
    productos = indexables.indice().productos
    condicion = pl.lit(True)
    for palabra in palabras:
        condicion = condicion & pl.col("slug").str.contains(palabra, literal=True)
    encontrados = (
        productos.filter(condicion)
        .sort(["indexable", "n", "slug"], descending=[True, True, False])
        .head(min(limite, MAX_RESULTADOS_BUSQUEDA))
    )
    return encontrados.select("slug", "firma", "n", "indexable").to_dicts()
