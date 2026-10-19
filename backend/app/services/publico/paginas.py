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

import re

import polars as pl

from app.repositories.compra_agil import CAMPOS_HISTORIA
from app.services.bi._base import _load, _primero, periodo_de
from app.services.bi.comprador import get_comprador
from app.services.bi.rubro import get_panorama
from app.services.publico import indexables
from app.utils.firma import terminos_de_busqueda

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
    """Una banda por unidad, con cuántos organismos tiene detrás y si es un
    precio de mercado (la regla vive en `indexables.de_mercado`)."""
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
            "compradores": None if r.get("compradores") is None else int(r["compradores"]),
            "cuota_mayor": r.get("cuota_mayor"),
            "de_mercado": bool(r.get("de_mercado")),
        }
        for r in indexables.con_de_mercado(bandas).iter_rows(named=True)
    ]


_COLUMNAS_COMPRADOR = ["CodigoOrganismoPublico", "OrganismoPublico", "UnidadMedida", "n", "p50"]


def _compradores_del_producto(firma: str) -> list[dict]:
    """Los organismos que más compraron el producto, con la mediana de cada uno.

    Salen de `product_price_compradores`: todos los compradores de las bandas
    nacionales, **sin mínimo de compras**, sobre las mismas filas que la banda
    (su `compradores` es el número de filas). Antes salían de L0, que exige tres
    compras por organismo: «impresora multifuncional» decía 87 compras de 63
    compradores y listaba uno. El `puesto` ya trae el desempate (más compras,
    luego código y unidad), así que el corte en `TOP_ENLACES` es estable.

    Sin esa tabla —un despliegue cuya semanal todavía no la generó— se cae a L0,
    como antes: pocos compradores, pero ninguno inventado.
    """
    df = _load(
        "product_price_compradores.parquet",
        filtros={"firma_producto": firma},
        columnas=_COLUMNAS_COMPRADOR,
        orden="puesto",
        descendente=False,
        limite=TOP_ENLACES,
    )
    if df is None:
        df = _load(
            "product_price_bands_L0.parquet",
            filtros={"firma_producto": firma},
            columnas=_COLUMNAS_COMPRADOR,
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


def _periodo_de_bandas(bandas: pl.DataFrame) -> dict | None:
    """La ventana de las bandas (12 meses), o None si la tabla no la publica.

    Sin periodo la ficha se leería como «de siempre»; y la lectura de precio de
    la portada se oculta (identidad §3.4).
    """
    periodo = periodo_de(bandas)
    if periodo is None:
        return None
    return {"ventana_desde": periodo["desde"], "ventana_hasta": periodo["hasta"]}


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
        "periodo": _periodo_de_bandas(bandas),
    }


def buscar_productos(q: str, limite: int) -> list[dict]:
    """Productos cuya firma contiene todas las palabras de `q` que una firma puede tener.

    El término pasa por **la misma regla que construye la firma**
    (`app/utils/firma.py`, `terminos_de_busqueda`): fuera los artículos y el
    ruido («de», «la», «según detalle adjunto»), las palabras de menos de tres
    letras y las que llevan dígitos. Antes se exigía cada palabra tal cual, y
    «guantes de nitrilo» no encontraba `guantes nitrilo talla` porque la firma ya
    había quitado el «de».

    Se compara slug contra slug, así que la búsqueda **ignora tildes y
    mayúsculas** en los dos sentidos, y el orden de las palabras no importa (la
    firma las guarda ordenadas). Cada palabra se busca al **comienzo** de una
    palabra del slug, que separa las palabras con guiones: «guante» encuentra
    «guantes», no al revés, y «mesa» no encuentra «parmesano» (la regla de
    `repositories/busqueda.py`). Primero los indexables, luego por compras.

    **Sin ninguna palabra que una firma pueda tener** («de la», «pc») devuelve
    `[]` sin mirar el índice. Antes «de la» traía cualquier firma con esas
    letras dentro de otra palabra: 3.691 productos en la copia local.
    """
    palabras = terminos_de_busqueda(q)
    if not palabras:
        return []
    productos = indexables.indice().productos
    condicion = pl.lit(True)
    for palabra in palabras:
        # `palabra` es un slug: sin nada que escapar, pero se escapa igual.
        condicion = condicion & pl.col("slug").str.contains(f"(?:^|-){re.escape(palabra)}")
    encontrados = (
        productos.filter(condicion)
        .sort(["indexable", "n", "slug"], descending=[True, True, False])
        .head(min(limite, MAX_RESULTADOS_BUSQUEDA))
    )
    descripciones = _descripciones(encontrados.get_column("firma").to_list())
    return [
        {
            "slug": r["slug"],
            "firma": r["firma"],
            "descripcion": descripciones.get(r["firma"]),
            "n": r["n"],
            "indexable": r["indexable"],
        }
        for r in encontrados.iter_rows(named=True)
    ]


def _descripciones(firmas: list[str]) -> dict[str, str | None]:
    """La descripción con que se lista cada firma: la de su banda con más compras.

    Se pide aparte, sólo para los resultados (como mucho
    `MAX_RESULTADOS_BUSQUEDA`), en vez de guardarla en el índice: son ~50.000
    textos que ocuparían la memoria de la API para enseñar cincuenta.
    """
    if not firmas:
        return {}
    df = _load(
        "product_price_bands_L0N.parquet",
        filtros={"firma_producto": firmas},
        columnas=["firma_producto", "UnidadMedida", "n", "descripcion"],
    )
    if df is None or df.is_empty():
        return {}
    mejores = df.sort(
        ["firma_producto", "n", "UnidadMedida"], descending=[False, True, False], nulls_last=True
    ).unique(subset="firma_producto", keep="first", maintain_order=True)
    return dict(
        zip(
            mejores.get_column("firma_producto").to_list(),
            mejores.get_column("descripcion").to_list(),
            strict=True,
        )
    )
