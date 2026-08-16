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
