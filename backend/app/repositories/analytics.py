"""Lo único async de analytics: saber si una tabla ya está materializada.

La lectura de las tablas de analytics vive en `analytics_sync.py` (los servicios
de BI son síncronos) y su SQL en `_analytics_sql.py`. Aquí queda sólo lo que
necesita un repositorio async — `compra_agil.py` pregunta si existen las tablas
de la historia antes de unirse con ellas.

Hubo aquí una copia async de `consultar`, `buscar_texto` y `columnas_de` que sólo
usaban los tests: dos implementaciones del mismo SQL que ya habían divergido (sin
`IN`, sin `NULLS LAST`, otro escape del término).

Ver docs/decisiones/0006-analytics-en-postgres.md.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories._analytics_sql import SCHEMA, sql_existe_tabla

__all__ = ["SCHEMA", "existe_tabla"]


async def existe_tabla(db: AsyncSession, tabla: str) -> bool:
    """True si el pipeline ya materializó esa tabla.

    Los endpoints devuelven «no disponible» en vez de un 500 cuando el pipeline
    todavía no corrió.
    """
    res = await db.execute(text(sql_existe_tabla()), {"schema": SCHEMA, "tabla": tabla})
    return res.first() is not None
