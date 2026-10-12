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
    columnas: list[str] | None = None,
    orden: str | None = None,
    descendente: bool = True,
    limite: int | None = None,
) -> Any:
    """Devuelve un DataFrame de Polars con las filas pedidas, o None si la tabla
    no existe todavía.

    `filtros` viaja a la cláusula WHERE. Empujar el filtro es el punto: la tabla
    de bandas L1 tiene cientos de miles de filas y antes se traían todas a
    memoria para descartarlas en Polars.
    """
    return repo.consultar(
        _tabla(filename),
        filtros=filtros,
        columnas=columnas,
        orden=orden,
        descendente=descendente,
        limite=limite,
    )


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
