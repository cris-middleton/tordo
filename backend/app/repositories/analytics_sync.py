"""Lectura síncrona de las tablas de analytics.

`bi_service` es síncrono y FastAPI corre esos endpoints en un threadpool, así que
una consulta bloqueante aquí es correcta y no bloquea el event loop. Convertir el
BI a async es parte de F3, cuando cambie la estructura por capas.

Comparte la construcción de SQL con la variante asíncrona
(`_analytics_sql.py`) para que no puedan divergir.
"""

from __future__ import annotations

import logging
from typing import Any

import polars as pl
from sqlalchemy import text

from app.repositories import _analytics_sql as sql

logger = logging.getLogger(__name__)

SCHEMA = sql.SCHEMA


def _engine():
    # Import diferido a propósito: `app.db` crea los engines al importarse y eso
    # exige configuración de base de datos que los tests unitarios no necesitan.
    from app.db import sync_engine

    return sync_engine


def _a_polars(filas: list[dict], columnas_vacio: list[str] | None = None) -> pl.DataFrame:
    """Convierte filas a Polars preservando el esquema aunque no haya ninguna.

    Un parquet vacío conserva sus columnas; `pl.DataFrame([])` no. Varias
    funciones de bi_service comprueban `"columna" in df.columns` para decidir
    qué camino tomar, así que perder el esquema en el caso vacío cambia el
    comportamiento — get_tendencia reventaba con ColumnNotFoundError cuando
    trend_by_market venía sin filas.
    """
    if filas:
        return pl.DataFrame(filas)
    if columnas_vacio:
        return pl.DataFrame(schema=dict.fromkeys(columnas_vacio, pl.Utf8))
    return pl.DataFrame()


#: Tablas que ya se vieron existir. **Sólo se recuerda el sí.** Con
#: `lru_cache` se recordaba también el no, para siempre: la API del lanzamiento
#: arrancó antes de la primera corrida semanal, guardó «no existe» para cada
#: tabla de analytics y siguió sirviendo sitemap y páginas públicas vacías con
#: los datos ya materializados, hasta reiniciarla. Que una tabla aparezca es lo
#: normal; que desaparezca, no (la materialización la reemplaza en una
#: transacción).
_existentes: set[str] = set()


def _consultar_existencia(tabla: str) -> bool:
    with _engine().connect() as conn:
        r = conn.execute(text(sql.sql_existe_tabla()), {"schema": SCHEMA, "tabla": tabla}).first()
    return r is not None


def existe_tabla(tabla: str, *, usar_cache: bool = True) -> bool:
    """True si el pipeline ya materializó esa tabla.

    Se cachea el sí porque sólo cambia cuando corre el pipeline (una vez por
    semana), y sin caché serían dos consultas por request en vez de una. El no
    se vuelve a preguntar cada vez: es el estado de un despliegue nuevo y dura
    hasta la primera corrida. `usar_cache=False` para los tests, que crean y
    borran tablas.
    """
    if not usar_cache:
        _existentes.clear()
    if tabla in _existentes:
        return True
    hay = _consultar_existencia(tabla)
    if hay:
        _existentes.add(tabla)
    return hay


def invalidar_cache_existencia() -> None:
    """Olvida las tablas vistas. Para tests y para un endpoint de recarga si algún
    día hace falta: el no ya no se cachea, así que tras materializar no hace falta."""
    _existentes.clear()


def columnas_de(tabla: str) -> set[str]:
    with _engine().connect() as conn:
        return {
            r[0] for r in conn.execute(text(sql.sql_columnas()), {"schema": SCHEMA, "tabla": tabla})
        }


def consultar(
    tabla: str,
    *,
    filtros: dict[str, Any] | None = None,
    columnas: list[str] | None = None,
    orden: str | None = None,
    descendente: bool = True,
    limite: int | None = None,
) -> pl.DataFrame | None:
    """Consulta una tabla de analytics con los filtros empujados a SQL.

    Devuelve None si la tabla no existe todavía (el pipeline no genera todos los
    parquets en toda corrida), y un DataFrame vacío si no hay coincidencias.
    Esa distinción importa: los endpoints responden "no disponible" en el primer
    caso y "sin datos para el filtro" en el segundo.
    """
    if not existe_tabla(tabla):
        return None

    consulta, params = sql.sql_consulta(
        tabla,
        filtros=filtros,
        columnas=columnas,
        orden=orden,
        descendente=descendente,
        limite=limite,
    )
    with _engine().connect() as conn:
        filas = conn.execute(text(consulta), params).mappings().all()
    if filas:
        return _a_polars([dict(f) for f in filas])
    # Sin filas: se recupera el esquema para no perder los nombres de columna.
    return _a_polars([], columnas or sorted(columnas_de(tabla)))


def distintos(tabla: str, columna: str) -> list[Any] | None:
    """Los valores distintos de una columna, o None si la tabla no existe.

    Lo usa el índice de páginas públicas para saber qué rubros tienen datos sin
    traer las filas: la columna va indexada, y Postgres lo resuelve sin tocar
    el resto de la tabla.
    """
    if not existe_tabla(tabla):
        return None
    with _engine().connect() as conn:
        return [fila[0] for fila in conn.execute(text(sql.sql_distintos(tabla, columna)))]


def buscar_texto(
    tabla: str,
    columna: str,
    consulta_texto: str,
    *,
    columnas: list[str] | None = None,
    orden: str | None = None,
    limite: int = 20,
) -> pl.DataFrame | None:
    """Búsqueda por subcadena, servida por el índice GIN de pg_trgm."""
    if not existe_tabla(tabla):
        return None

    consulta = sql.sql_busqueda_texto(tabla, columna, columnas=columnas, orden=orden)
    with _engine().connect() as conn:
        filas = (
            conn.execute(
                text(consulta),
                {"patron": sql.patron_like(consulta_texto), "limite": limite},
            )
            .mappings()
            .all()
        )
    if filas:
        return _a_polars([dict(f) for f in filas])
    return _a_polars([], columnas or sorted(columnas_de(tabla)))
