"""Acceso a las tablas de analytics.

El resto de los módulos de BI consulta a través de aquí, así que este es el
único punto que sabe cómo se llaman las tablas y cómo se empujan los filtros.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging
from typing import Any

from app.repositories import analytics_sync as repo

logger = logging.getLogger(__name__)


def _tabla(filename: str) -> str:
    """Nombre de tabla a partir del nombre del parquet.

    La convención la fija el materializador (etl/loaders/analytics_catalog.py):
    el archivo sin extensión, en minúsculas.
    `product_price_bands_L1.parquet` → `analytics.product_price_bands_l1`.

    Se deriva en vez de duplicar el catálogo, que vive en el ETL: dos listas se
    desincronizarían.
    """
    return filename.removesuffix(".parquet").lower()


def _load(
    filename: str,
    *,
    filtros: dict[str, Any] | None = None,
    minimos: dict[str, float] | None = None,
    columnas: list[str] | None = None,
    orden: str | None = None,
    descendente: bool = True,
    desempate_texto: str | None = None,
    limite: int | None = None,
) -> Any:
    """Devuelve un DataFrame de Polars con las filas pedidas, o None si la tabla
    no existe todavía.

    `filtros` viaja a la cláusula WHERE. Empujar el filtro es el punto: la tabla
    de bandas L1 tiene cientos de miles de filas y antes se traían todas a
    memoria para descartarlas en Polars. `minimos` son cotas `col >= valor` y
    viajan igual: filtrarlas después de traer la tabla mataba la API por memoria.
    """
    return repo.consultar(
        _tabla(filename),
        filtros=filtros,
        minimos=minimos,
        columnas=columnas,
        orden=orden,
        descendente=descendente,
        desempate_texto=desempate_texto,
        limite=limite,
    )


def _contar_filas(filename: str, *, filtros: dict[str, Any] | None = None) -> int | None:
    """Cuántas filas cumplen los filtros, contadas en SQL; None sin tabla."""
    return repo.contar_filas(_tabla(filename), filtros=filtros)


def _agregado(
    filename: str,
    clave: str,
    *,
    filtros: dict[str, Any] | None = None,
    sumas: list[str],
    distintos: list[str] = (),
    primeros: list[str] = (),
    limite: int | None,
) -> Any:
    """Los `limite` grupos de `clave` con más `sumas[0]`, agregados en SQL.

    `limite=None` trae todos los grupos, y hay que pedirlo por escrito: sin
    filtro es una fila por grupo de la tabla entera (lo usa el índice de páginas
    públicas, en caché). Las guardas de lecturas acotadas lo tratan como lectura
    entera.

    Para `competitors_by_market`, que tiene una fila por (organismo, rubro,
    proveedor): «quién gana en este rubro» u «a quién le compra este organismo»
    agregan por proveedor primero, y antes eso se hacía en Polars con todas las
    filas del rubro en la memoria de la API. None si la tabla no existe.
    """
    return repo.agregado(
        _tabla(filename),
        clave,
        filtros=filtros,
        sumas=sumas,
        distintos=distintos,
        primeros=primeros,
        limite=limite,
    )


def _totales(
    filename: str,
    clave: str,
    *,
    filtros: dict[str, Any] | None = None,
    sumas: list[str],
    distintos: list[str] = (),
) -> dict[str, Any] | None:
    """Los totales del mismo agregado: `grupos`, cada suma, `cuadrados` (la suma
    de los cuadrados de `sumas[0]` por grupo, para el HHI) y `distintos_<col>`
    sobre las filas. None si la tabla no existe."""
    return repo.totales(_tabla(filename), clave, filtros=filtros, sumas=sumas, distintos=distintos)


#: Tope de filas que trae una búsqueda por subcadena antes de deduplicar. Un
#: término corto («de») casa con casi toda la tabla: sin tope, cada petición
#: anónima traería decenas de miles de filas a memoria.
MAX_FILAS_BUSQUEDA = 2000


def _buscar(
    filename: str,
    columna: str,
    texto: str,
    *,
    columnas: list[str] | None = None,
    orden: str | None = None,
) -> Any:
    """Búsqueda por subcadena empujada a SQL (`lower(col) LIKE`, índice pg_trgm).

    Devuelve las coincidencias ordenadas por `orden` (descendente), como mucho
    `MAX_FILAS_BUSQUEDA`; None si la tabla no existe todavía.
    """
    return repo.buscar_texto(
        _tabla(filename),
        columna,
        texto,
        columnas=columnas,
        orden=orden,
        limite=MAX_FILAS_BUSQUEDA,
    )


def _distintos(
    filename: str, columna: str, *, filtros: dict[str, Any] | None = None
) -> list[Any] | None:
    """Los valores distintos y no nulos de una columna, o None sin tabla."""
    return repo.distintos(_tabla(filename), columna, filtros=filtros)


def _contar(
    filename: str,
    columna: str,
    *,
    excluir: list[str] | None = None,
    limite: int,
) -> list[tuple[Any, int]] | None:
    """`(valor, filas)` contados en SQL, o None sin tabla."""
    return repo.contar_por(_tabla(filename), columna, excluir=excluir, limite=limite)


def _columnas(filename: str) -> set[str]:
    """Las columnas que la tabla tiene de verdad; vacío si no existe todavía."""
    if not repo.existe_tabla(_tabla(filename)):
        return set()
    return repo.columnas_de(_tabla(filename))


def _columna_presente(filename: str, *candidatas: str) -> str | None:
    """La primera de esas columnas que la tabla tenga de verdad.

    Hace falta para poder empujar un filtro sobre una columna cuyo nombre
    cambia según de dónde venga el dato: `buyer_transparency` identifica al
    comprador con `CodigoOrganismo` (viene de licitaciones) y `buyer_scores` con
    `CodigoOrganismoPublico` (viene de órdenes). Filtrar a ciegas por la que no
    existe no devuelve vacío: Postgres levanta «column does not exist».
    """
    if not repo.existe_tabla(_tabla(filename)):
        return None
    columnas = repo.columnas_de(_tabla(filename))
    return next((c for c in candidatas if c in columnas), None)


def _primero(fila: dict, *claves: str):
    """El primer valor no nulo entre varias claves posibles.

    Existe para sobrevivir a un renombrado de columna sin romper la API en el
    hueco entre desplegar el código y re-materializar analytics: el pipeline
    corre una vez por semana, así que ese hueco dura días. Sin esto, la pantalla
    de comprador devolvería nulos —o peor, un 500— hasta la corrida siguiente.

    Cuando ya no queden tablas con el nombre viejo, la segunda clave sobra.
    """
    for clave in claves:
        valor = fila.get(clave)
        if valor is not None:
            return valor
    return None


#: Cortes del índice de Herfindahl. Son los de la literatura de competencia
#: (DOJ/FTC): por debajo de 1.500 el mercado se considera desconcentrado, entre
#: 1.500 y 2.500 moderadamente concentrado, y por encima concentrado.
HHI_MODERADO = 1500
HHI_CONCENTRADO = 2500


def clasificar_hhi(hhi: float | None) -> str | None:
    """El tramo de un HHI: `concentrado`, `moderado` o `fragmentado`.

    Una sola vez para todo el BI: el panorama del rubro, el resumen y los
    competidores de un organismo lo clasificaban cada uno por su cuenta.
    """
    if hhi is None:
        return None
    if hhi > HHI_CONCENTRADO:
        return "concentrado"
    if hhi > HHI_MODERADO:
        return "moderado"
    return "fragmentado"


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────


def periodo_de(df) -> dict | None:
    """Los meses de datos de los que sale una tabla de analytics, o None.

    El pipeline escribe `ventana_desde`/`ventana_hasta` en las tablas que llevan
    ventana (`etl/analytics/data_loader.py`): 12 meses las bandas por producto,
    36 el resto. Se devuelve en la respuesta porque una banda o una cuota sin
    periodo se lee como «de siempre».
    """
    if df is None or df.is_empty() or "ventana_desde" not in df.columns:
        return None
    fila = df.row(0, named=True)
    desde, hasta = fila.get("ventana_desde"), fila.get("ventana_hasta")
    if desde is None:
        return None
    return {"desde": str(desde)[:10], "hasta": str(hasta)[:10] if hasta else None}
