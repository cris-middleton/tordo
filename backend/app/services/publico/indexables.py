"""Qué páginas públicas existen, cuáles se indexan y cómo se llega a ellas.

**Todo el criterio de calidad vive aquí, en un solo sitio** (paso 10 del pivote
público). El sitemap, el `indexable` de cada página y la resolución slug →
nombre leen el mismo índice: si cada uno decidiera por su cuenta, el sitemap
anunciaría páginas que la propia página marca `noindex`.

Tres tipos de página:

- **Comprador** — por su código de Mercado Público (dígitos, URL segura).
  Indexable si está en `buyer_scores` con al menos `MIN_ORDENES_COMPRADOR`
  órdenes **y** tiene algún mercado en la ventana de analytics
  (`market_concentration`). Lo primero evita publicar un perfil hecho con un
  puñado de órdenes, cuyo score es ruido; lo segundo, una página sin rubros, que
  es lo que le da contenido propio. Medido sobre la copia local (25-09):
  `buyer_scores` trae 1.303 filas (1.192 códigos; 111 duplicados de compradores
  renombrados), 1.041 tienen mercado en la ventana, y **1.039** pasan los dos
  filtros. Con ≥ 200 órdenes serían 1.022 y con ≥ 6 meses activos 1.037: el
  umbral no muerde mucho porque casi todo comprador con mercado en la ventana
  compra bastante, y precisamente por eso es seguro.
- **Rubro** — por slug del nombre RubroN2 (no tienen código). Existe si está en
  `market_concentration`; se indexa sólo si además tiene filas en
  `competitors_by_market`. Sin eso la página pinta «Sin datos históricos para
  el rubro» —o, como mucho, la estacionalidad suelta— y es una página delgada
  que no conviene ofrecer a un buscador.

  **Por qué esa tabla y no el panorama entero.** `get_panorama` da datos si
  cualquiera de sus cuatro bloques los tiene, y dos de ellos (competencia y
  compradores a vigilar) salen de `competitors_by_market`: tener filas ahí
  basta para que el panorama no esté vacío. Es una sola consulta `DISTINCT`
  sobre una columna indexada, en vez de armar cuatro bloques por cada uno de
  ~300 rubros. El criterio es conservador a propósito: un rubro con sólo
  estacionalidad o sólo tamaño (`time_series`, `seasonality_patterns`) queda
  `noindex`, pero su página sigue existiendo. Medido el 12-10 sobre la copia
  local: los 310 rubros de `market_concentration` tienen competidores, y tras
  resolver colisiones quedan **309** indexables. Sobre el fixture recortado del
  golden, 72 de 124 — que es donde se vio el fallo.

  Dos nombres que dan el mismo slug —en la copia local, «Servicios Legales» y
  «Servicios legales»— se resuelven a favor del de más órdenes; el otro no
  tiene página.
- **Producto** — por slug de la firma (`etl/analytics/normalizacion.py`), con
  una banda por unidad de medida. Indexable si alguna de sus bandas nacionales
  (L0N) cumple a la vez tres cosas:

  1. `n ≥ MIN_COMPRAS_PRODUCTO`;
  2. predictibilidad alta o media: una banda muy dispersa no responde «¿a qué
     precio?»;
  3. **es un precio de mercado** (`de_mercado`): al menos
     `MIN_COMPRADORES_PRODUCTO` organismos distintos y ninguno con más de
     `CUOTA_MAXIMA_COMPRADOR` de las compras. Una banda de un solo comprador es
     el precio de SU contrato, y publicarla como «lo que paga el Estado» es
     inventar un número con aspecto de respuesta. Decisión del dueño del
     2026-10-16, tras medir que el 56 % de las bandas indexables venía de un
     único organismo y el 74 % tenía uno sobre la mitad. La misma regla decide
     qué banda puede salir en la portada: la API la manda como `de_mercado` en
     cada unidad y el frontend no la recalcula.

  Copia local, con el precio unitario corregido (2026-10-16, seis meses de
  órdenes y ventana de 12): 50.575 firmas tras resolver colisiones de slug (casi
  todas variantes con y sin tilde o recortadas a 80 caracteres). Con los dos
  primeros criterios se indexaban **15.452**; con el tercero quedan **7.758**.
  Antes de corregir el precio eran 6.561: la división por la cantidad volvía
  «baja» la mayoría.

  Una tabla materializada antes de que la banda contara sus compradores no
  dice si el precio es de mercado: con ella no se indexa ningún producto. Las no
  indexables también tienen página —200 con `indexable: false`, que el
  frontend marca `noindex`— y se llega por búsqueda.

**Se agrega en Postgres y viaja lo justo.** El índice es por naturaleza de la
tabla entera —una fila por comprador, rubro y producto—, pero no hace falta
traer las filas para armarlo. Antes leía `market_concentration` entera (una fila
por comprador y rubro) y las bandas L0N enteras con cinco columnas, y agrupaba
en Polars: +79–97 MiB de RSS en cada construcción con los datos locales y
+207–248 MiB a tres veces esa escala, en un contenedor de 512 MB. Ahora son
+41–45 y +88–95 (medido el 2026-10-21):

- compradores y rubros salen de dos `GROUP BY` sobre `market_concentration`
  (`_agregado`, ~1.000 y ~300 filas), con el nombre de la primera fila en orden
  de carga (`primeros`), que es la que se quedaba Polars;
- los productos, de un `GROUP BY firma_producto` (firma y compras: la única
  lectura que crece con la tabla, porque el índice ES la lista de firmas) y de
  las bandas que ya pasan `n` y predictibilidad en SQL (`filtros`, `minimos`),
  sobre las que se aplica `de_mercado()` en Polars: la regla sigue viviendo en
  un solo sitio.

`tests/test_publico_acotado.py` fija que ninguna otra lectura de `/publico/*`
traiga una tabla sin filtro ni límite, y `tests/test_publico_indice_sql.py` que
el índice sale idéntico al cálculo de antes.

**Caché.** Se guarda `TTL_SEGUNDOS` en memoria del proceso: analytics se
re-materializa una vez por semana, en otro proceso, así que un índice de hasta
diez minutos de antigüedad sólo retrasa diez minutos la aparición de una página
nueva. Va como DataFrame de Polars y no como diccionarios: son ~50.000 firmas, y
en columnas ocupan una fracción de lo que ocuparían como objetos de Python en un
contenedor de 512 MB.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

import polars as pl

from app.services.bi._base import _agregado, _columnas, _distintos, _load, periodo_de
from app.utils.slug import slug

logger = logging.getLogger(__name__)

#: Órdenes mínimas para indexar a un comprador. Con menos, el score y las tasas
#: del perfil salen de un puñado de compras y se mueven con cada una.
MIN_ORDENES_COMPRADOR = 50

#: Compras mínimas de una banda nacional para indexar el producto. Es el mismo
#: orden de magnitud que el mínimo con que el ETL ya publica una banda: por
#: debajo, P10 y P90 son prácticamente el mínimo y el máximo observados.
MIN_COMPRAS_PRODUCTO = 10

#: Predictibilidades que se indexan. «baja» significa que por lo mismo se pagaron
#: precios muy distintos (p75 más de 2,6 veces p25; etl/CLAUDE.md, «El precio se
#: agrupa por PRODUCTO»): la página existe, pero no es una respuesta que
#: convenga ofrecer a un buscador.
PREDICTIBILIDAD_INDEXABLE = ("alta", "media")

#: Organismos distintos que tiene que haber detrás de una banda para que sea un
#: precio de mercado. Ver «Producto» en el docstring del módulo.
MIN_COMPRADORES_PRODUCTO = 3

#: Fracción de las compras de la banda que puede reunir un solo organismo. Con
#: más, la banda dice sobre todo lo que paga él.
CUOTA_MAXIMA_COMPRADOR = 0.5

#: Las columnas de la banda que dicen cuántos compradores tiene detrás
#: (`etl/analytics/product_price_bands.py`, `_con_compradores`).
COLUMNAS_COMPRADORES = ("compradores", "cuota_mayor")


def de_mercado() -> pl.Expr:
    """`True` si la banda es un precio de mercado. Sin las columnas, o nulas, `False`.

    Una sola definición para el índice y para la ficha (`paginas._unidades`).
    """
    return (
        (pl.col("compradores") >= MIN_COMPRADORES_PRODUCTO)
        & (pl.col("cuota_mayor") <= CUOTA_MAXIMA_COMPRADOR)
    ).fill_null(False)


def con_de_mercado(bandas: pl.DataFrame) -> pl.DataFrame:
    """Añade `de_mercado`, y las columnas de compradores nulas si la tabla no las trae."""
    faltan = [c for c in COLUMNAS_COMPRADORES if c not in bandas.columns]
    if faltan:
        bandas = bandas.with_columns(pl.lit(None, dtype=pl.Float64).alias(c) for c in faltan)
    return bandas.with_columns(de_mercado().alias("de_mercado"))


#: De dónde salen compradores y rubros, y las bandas de los productos.
MERCADOS = "market_concentration.parquet"
BANDAS = "product_price_bands_L0N.parquet"

#: Rubros que no son un rubro: el ETL rellena así los vacíos.
_RUBROS_VACIOS = ("", "NA")

#: Cuánto vive el índice en memoria. Ver «Caché» en el docstring del módulo.
TTL_SEGUNDOS = 600


@dataclass(frozen=True)
class Indice:
    """Todo lo que hace falta para decidir si una página existe y si se indexa.

    - `compradores`: codigo, nombre, indexable — todo comprador conocido
      (con perfil o con mercado en la ventana).
    - `rubros`: slug, nombre, n, indexable — sólo los ganadores de su slug.
    - `productos`: slug, firma, n, indexable — sólo los ganadores de su slug.
    """

    compradores: pl.DataFrame
    rubros: pl.DataFrame
    productos: pl.DataFrame
    periodo: dict | None


def _ganador_por_slug(df: pl.DataFrame, nombre: str) -> pl.DataFrame:
    """Una fila por slug: la de más observaciones; desempata el nombre.

    El desempate no es cosmético: sin él, dos construcciones del índice sobre
    los mismos datos podrían dar ganadores distintos y la URL cambiaría de
    destino entre una carga y otra.
    """
    return (
        df.with_columns(pl.col(nombre).map_elements(slug, return_dtype=pl.Utf8).alias("slug"))
        .filter(pl.col("slug") != "")
        .sort(["n", nombre], descending=[True, False])
        .unique(subset="slug", keep="first", maintain_order=True)
    )


def _entero(columna: str) -> pl.Expr:
    """Una suma de SQL como entero: `sum()` llega en `double precision`, y NULL si
    todas las filas del grupo lo eran (Polars daba 0)."""
    return pl.col(columna).cast(pl.Float64).fill_null(0).cast(pl.Int64)


def _mercados_por(clave: str, **kwargs) -> pl.DataFrame | None:
    """Una fila por valor de `clave` en `market_concentration`, agregada en SQL."""
    return _agregado(MERCADOS, clave, sumas=["n_transacciones"], limite=None, **kwargs)


def _compradores(por_comprador: pl.DataFrame | None) -> pl.DataFrame:
    """Los compradores con página. `por_comprador` es una fila por código de
    `market_concentration` (`_mercados_por`), con el nombre de su primera fila."""
    vacio = pl.DataFrame(schema={"codigo": pl.Utf8, "nombre": pl.Utf8, "indexable": pl.Boolean})
    scores = _load(
        "buyer_scores.parquet",
        columnas=["CodigoOrganismoPublico", "NombreOrganismo", "n_oc_total"],
    )
    partes = []
    if scores is not None and not scores.is_empty():
        # Un comprador renombrado puede tener dos filas hasta que se
        # re-materialice (ver services/bi/comprador.py): se queda la de más
        # órdenes, que es la que enseña el perfil.
        partes.append(
            scores.sort("n_oc_total", descending=True, nulls_last=True)
            .unique(subset="CodigoOrganismoPublico", keep="first")
            .select(
                pl.col("CodigoOrganismoPublico").cast(pl.Utf8).alias("codigo"),
                pl.col("NombreOrganismo").cast(pl.Utf8).alias("nombre"),
                (pl.col("n_oc_total").fill_null(0) >= MIN_ORDENES_COMPRADOR).alias("con_volumen"),
            )
        )
    if por_comprador is not None and not por_comprador.is_empty():
        partes.append(
            por_comprador.select(
                pl.col("CodigoOrganismoPublico").cast(pl.Utf8).alias("codigo"),
                pl.col("OrganismoPublico").cast(pl.Utf8).alias("nombre"),
                pl.lit(None, dtype=pl.Boolean).alias("con_volumen"),
            )
        )
    if not partes:
        return vacio

    con_mercado = (
        set(por_comprador.get_column("CodigoOrganismoPublico").cast(pl.Utf8).to_list())
        if por_comprador is not None
        else set()
    )
    # El perfil va primero: su nombre gana, y `con_volumen` sólo lo tiene él.
    # **Salvo que el perfil venga sin nombre**: `buyer_scores` lo saca de las
    # licitaciones, y un comprador con órdenes pero sin licitaciones en la
    # ventana quedaba sin él (47 de 1.303 en la copia local). Su página salía
    # indexable, en el sitemap, con el `h1` vacío. Un nombre en blanco no cuenta,
    # y se toma el de sus mercados.
    nombre = pl.col("nombre").str.strip_chars()
    return (
        pl.concat(partes)
        .with_columns(pl.when(nombre != "").then(nombre).alias("nombre"))
        .group_by("codigo", maintain_order=True)
        .agg(
            pl.col("nombre").drop_nulls().first(),
            pl.col("con_volumen").drop_nulls().first(),
        )
        .with_columns(
            (
                pl.col("con_volumen").fill_null(False) & pl.col("codigo").is_in(list(con_mercado))
            ).alias("indexable")
        )
        .select("codigo", "nombre", "indexable")
        .sort("codigo")
    )


def _rubros(por_rubro: pl.DataFrame | None, con_competencia: set[str]) -> pl.DataFrame:
    """Los rubros con página; `indexable` si tienen competidores (ver docstring).

    `por_rubro` es una fila por rubro de `market_concentration` con sus órdenes
    sumadas (`_mercados_por`)."""
    if por_rubro is None or por_rubro.is_empty():
        return pl.DataFrame(
            schema={"slug": pl.Utf8, "nombre": pl.Utf8, "n": pl.Int64, "indexable": pl.Boolean}
        )
    por_rubro = por_rubro.select(
        pl.col("RubroN2").cast(pl.Utf8).alias("nombre"),
        _entero("n_transacciones").alias("n"),
    ).filter(pl.col("nombre").is_not_null() & ~pl.col("nombre").is_in(list(_RUBROS_VACIOS)))
    # La colisión de slug se resuelve ANTES de mirar si es indexable: si no, un
    # rubro sin datos podría quedarse la URL que el otro sí llenaría.
    return _ganador_por_slug(por_rubro, "nombre").select(
        "slug",
        "nombre",
        "n",
        pl.col("nombre").is_in(list(con_competencia)).alias("indexable"),
    )


def _firmas_indexables(tabla: str) -> set[str]:
    """Las firmas con alguna banda indexable.

    `n` y predictibilidad se filtran en SQL; `de_mercado()` se aplica aquí, sobre
    lo que queda (en la copia local, el 13 % de las bandas), para que la
    regla no se escriba dos veces. Una banda tiene que cumplir las tres cosas a
    la vez: no se suman méritos de dos unidades.
    """
    bandas = _load(
        tabla,
        filtros={"predictibilidad": list(PREDICTIBILIDAD_INDEXABLE)},
        minimos={"n": MIN_COMPRAS_PRODUCTO},
        columnas=["firma_producto", *COLUMNAS_COMPRADORES],
    )
    if bandas is None or bandas.is_empty():
        return set()
    return set(
        con_de_mercado(bandas)
        .filter(pl.col("de_mercado") & pl.col("firma_producto").is_not_null())
        .get_column("firma_producto")
        .cast(pl.Utf8)
        .to_list()
    )


def _productos() -> pl.DataFrame:
    vacio = pl.DataFrame(
        schema={"slug": pl.Utf8, "firma": pl.Utf8, "n": pl.Int64, "indexable": pl.Boolean}
    )
    tabla = BANDAS
    presentes = _columnas(tabla)
    sin_compradores = not set(COLUMNAS_COMPRADORES) <= presentes
    if presentes and sin_compradores:
        logger.warning(
            "%s no trae %s: ningún producto se indexa hasta re-materializar",
            tabla,
            ", ".join(COLUMNAS_COMPRADORES),
        )
    # Una fila por firma con sus compras: es lo único que crece con la tabla.
    por_firma = _agregado(tabla, "firma_producto", sumas=["n"], limite=None)
    if por_firma is None or por_firma.is_empty():
        return vacio
    con_banda_indexable = set() if sin_compradores else _firmas_indexables(tabla)
    por_firma = (
        por_firma.select(
            pl.col("firma_producto").cast(pl.Utf8).alias("firma"),
            _entero("n").alias("n"),
        )
        .filter(pl.col("firma").is_not_null())
        .with_columns(pl.col("firma").is_in(list(con_banda_indexable)).alias("indexable"))
    )
    return _ganador_por_slug(por_firma, "firma").select("slug", "firma", "n", "indexable")


def construir() -> Indice:
    """Lee analytics y arma el índice. Sin caché: para eso está `indice()`."""
    # El nombre de un comprador sin perfil es el de su primera fila en orden de
    # carga (`primeros`): el que se quedaba `unique(keep="first")` en Polars.
    por_comprador = _mercados_por("CodigoOrganismoPublico", primeros=["OrganismoPublico"])
    por_rubro = _mercados_por("RubroN2")
    # La ventana es la misma en todas las filas: basta una. Se pide aparte y sin
    # lista de columnas porque una tabla materializada antes de que existiera
    # la ventana no tiene esas columnas, y pedirlas por nombre levantaría error.
    primera = _load(MERCADOS, limite=1)
    con_competencia = {
        str(r) for r in (_distintos("competitors_by_market.parquet", "RubroN2") or [])
    }
    return Indice(
        compradores=_compradores(por_comprador),
        rubros=_rubros(por_rubro, con_competencia),
        productos=_productos(),
        periodo=periodo_de(primera),
    )


#: El reloj de la caché, aparte para que un test lo mueva sin tocar `time`.
_reloj = time.monotonic

_cerrojo = threading.Lock()
_cache: tuple[float, Indice] | None = None


def indice() -> Indice:
    """El índice, construido como mucho una vez cada `TTL_SEGUNDOS`.

    El cerrojo evita que diez peticiones simultáneas tras expirar lo construyan
    diez veces: FastAPI corre estos endpoints síncronos en un threadpool.
    """
    global _cache
    with _cerrojo:
        ahora = _reloj()
        if _cache is None or ahora - _cache[0] > TTL_SEGUNDOS:
            _cache = (ahora, construir())
        return _cache[1]


def invalidar() -> None:
    """Tira el índice en memoria. Para los tests, que cambian las tablas."""
    global _cache
    with _cerrojo:
        _cache = None
