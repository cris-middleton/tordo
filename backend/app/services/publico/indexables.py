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
  (L0N) tiene `n ≥ MIN_COMPRAS_PRODUCTO` y predictibilidad alta o media: una
  banda dispersa o con pocas compras no responde «¿a qué precio?», y publicarla
  sería inventar un número con aspecto de respuesta. Copia local, con el
  precio unitario corregido (2026-10-16): 51.559 firmas, 15.711 pasan el filtro;
  tras resolver colisiones de slug (casi todas variantes con y sin tilde o
  recortadas a 80 caracteres) quedan **15.452** indexables. Antes de la
  corrección eran 6.561: la división por la cantidad volvía «baja» la mayoría.
  Las no indexables también tienen página —200 con `indexable: false`, que el
  frontend marca `noindex`— y se llega por búsqueda.

**Caché.** Construir el índice lee ~100.000 filas pequeñas (las firmas de L0N
son la mayoría). Se guarda `TTL_SEGUNDOS` en memoria del proceso: analytics se
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

from app.services.bi._base import _distintos, _load, periodo_de
from app.utils.slug import slug

logger = logging.getLogger(__name__)

#: Órdenes mínimas para indexar a un comprador. Con menos, el score y las tasas
#: del perfil salen de un puñado de compras y se mueven con cada una.
MIN_ORDENES_COMPRADOR = 50

#: Compras mínimas de una banda nacional para indexar el producto. Es el mismo
#: orden de magnitud que el mínimo con que el ETL ya publica una banda: por
#: debajo, P10 y P90 son prácticamente el mínimo y el máximo observados.
MIN_COMPRAS_PRODUCTO = 10

#: Predictibilidades que se indexan. «baja» significa que el precio no decide
#: la adjudicación (CLAUDE.md, «El precio se agrupa por PRODUCTO»): la página
#: existe, pero no es una respuesta que convenga ofrecer a un buscador.
PREDICTIBILIDAD_INDEXABLE = ("alta", "media")

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


def _compradores(mercados: pl.DataFrame | None) -> pl.DataFrame:
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
    if mercados is not None and not mercados.is_empty():
        partes.append(
            mercados.unique(subset="CodigoOrganismoPublico", keep="first").select(
                pl.col("CodigoOrganismoPublico").cast(pl.Utf8).alias("codigo"),
                pl.col("OrganismoPublico").cast(pl.Utf8).alias("nombre"),
                pl.lit(None, dtype=pl.Boolean).alias("con_volumen"),
            )
        )
    if not partes:
        return vacio

    con_mercado = (
        set(mercados.get_column("CodigoOrganismoPublico").cast(pl.Utf8).to_list())
        if mercados is not None
        else set()
    )
    # El perfil va primero: su nombre gana, y `con_volumen` sólo lo tiene él.
    return (
        pl.concat(partes)
        .unique(subset="codigo", keep="first", maintain_order=True)
        .with_columns(
            (
                pl.col("con_volumen").fill_null(False) & pl.col("codigo").is_in(list(con_mercado))
            ).alias("indexable")
        )
        .select("codigo", "nombre", "indexable")
        .sort("codigo")
    )


def _rubros(mercados: pl.DataFrame | None, con_competencia: set[str]) -> pl.DataFrame:
    """Los rubros con página; `indexable` si tienen competidores (ver docstring)."""
    if mercados is None or mercados.is_empty():
        return pl.DataFrame(
            schema={"slug": pl.Utf8, "nombre": pl.Utf8, "n": pl.Int64, "indexable": pl.Boolean}
        )
    por_rubro = (
        mercados.filter(
            pl.col("RubroN2").is_not_null() & ~pl.col("RubroN2").is_in(list(_RUBROS_VACIOS))
        )
        .group_by("RubroN2")
        .agg(pl.col("n_transacciones").cast(pl.Int64).sum().alias("n"))
        .rename({"RubroN2": "nombre"})
    )
    # La colisión de slug se resuelve ANTES de mirar si es indexable: si no, un
    # rubro sin datos podría quedarse la URL que el otro sí llenaría.
    return _ganador_por_slug(por_rubro, "nombre").select(
        "slug",
        "nombre",
        "n",
        pl.col("nombre").is_in(list(con_competencia)).alias("indexable"),
    )


def _productos() -> pl.DataFrame:
    vacio = pl.DataFrame(
        schema={"slug": pl.Utf8, "firma": pl.Utf8, "n": pl.Int64, "indexable": pl.Boolean}
    )
    bandas = _load(
        "product_price_bands_L0N.parquet",
        columnas=["firma_producto", "n", "predictibilidad"],
    )
    if bandas is None or bandas.is_empty():
        return vacio
    por_firma = (
        bandas.filter(pl.col("firma_producto").is_not_null())
        .group_by("firma_producto")
        .agg(
            pl.col("n").cast(pl.Int64).sum().alias("n"),
            (
                (pl.col("n") >= MIN_COMPRAS_PRODUCTO)
                & pl.col("predictibilidad").is_in(list(PREDICTIBILIDAD_INDEXABLE))
            )
            .any()
            .alias("indexable"),
        )
        .rename({"firma_producto": "firma"})
    )
    return _ganador_por_slug(por_firma, "firma").select("slug", "firma", "n", "indexable")


def construir() -> Indice:
    """Lee analytics y arma el índice. Sin caché: para eso está `indice()`."""
    mercados = _load(
        "market_concentration.parquet",
        columnas=["CodigoOrganismoPublico", "OrganismoPublico", "RubroN2", "n_transacciones"],
    )
    # La ventana es la misma en todas las filas: basta una. Se pide aparte y sin
    # lista de columnas porque una tabla materializada antes de que existiera
    # la ventana no tiene esas columnas, y pedirlas por nombre levantaría error.
    primera = _load("market_concentration.parquet", limite=1)
    con_competencia = {
        str(r) for r in (_distintos("competitors_by_market.parquet", "RubroN2") or [])
    }
    return Indice(
        compradores=_compradores(mercados),
        rubros=_rubros(mercados, con_competencia),
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
