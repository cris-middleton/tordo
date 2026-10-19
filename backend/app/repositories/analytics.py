"""Lectura de las tablas materializadas de analytics.

El pipeline materializa cada parquet en `analytics.<tabla>` con índices sobre las
columnas por las que se filtra (ver etl/loaders/analytics_catalog.py). Aquí se
consultan con los filtros **empujados a SQL**, en vez de traer la tabla entera a
memoria y filtrarla en Python.

Por qué importa: `product_price_bands_l1` tiene ~722.000 filas. Antes se cargaba
completa en cada worker de uvicorn y se recorría linealmente por request. Ahora
es un index scan que devuelve las filas que hacen falta.

Ver docs/decisiones/0006-analytics-en-postgres.md.
"""

from __future__ import annotations

import logging
from typing import Any

import polars as pl
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories._analytics_sql import parametros_busqueda, sql_busqueda_texto

logger = logging.getLogger(__name__)

SCHEMA = "analytics"


def _ident(nombre: str) -> str:
    """Cita un identificador. Las columnas vienen en camelCase desde el parquet."""
    return '"' + nombre.replace('"', '""') + '"'


async def existe_tabla(db: AsyncSession, tabla: str) -> bool:
    """True si el pipeline ya materializó esa tabla.

    Los endpoints de BI devuelven `disponible: false` en vez de un 500 cuando el
    pipeline todavía no corrió, que es el comportamiento que ya tenían cuando el
    parquet no existía.
    """
    res = await db.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = :schema AND table_name = :tabla"
        ),
        {"schema": SCHEMA, "tabla": tabla},
    )
    return res.first() is not None


async def consultar(
    db: AsyncSession,
    tabla: str,
    *,
    filtros: dict[str, Any] | None = None,
    columnas: list[str] | None = None,
    orden: str | None = None,
    descendente: bool = True,
    limite: int | None = None,
) -> pl.DataFrame | None:
    """Consulta una tabla de analytics y devuelve un DataFrame de Polars.

    `filtros` son igualdades por columna; un valor None significa "esta columna
    es NULL". Se pasan siempre como parámetros ligados, nunca interpolados.

    Devuelve None si la tabla no existe todavía — el pipeline no genera todos los
    parquets en toda corrida.

    Se devuelve Polars y no dicts porque el resto de `bi_service` ya opera sobre
    DataFrames; así la conversión es incremental y no hay que reescribir de golpe
    las 19 funciones.
    """
    if not await existe_tabla(db, tabla):
        return None

    proyeccion = ", ".join(_ident(c) for c in columnas) if columnas else "*"
    sql = f"SELECT {proyeccion} FROM {_ident(SCHEMA)}.{_ident(tabla)}"

    params: dict[str, Any] = {}
    if filtros:
        clausulas = []
        for i, (col, valor) in enumerate(filtros.items()):
            if valor is None:
                clausulas.append(f"{_ident(col)} IS NULL")
            else:
                clave = f"p{i}"
                clausulas.append(f"{_ident(col)} = :{clave}")
                params[clave] = valor
        if clausulas:
            sql += " WHERE " + " AND ".join(clausulas)

    if orden:
        sql += f" ORDER BY {_ident(orden)} {'DESC' if descendente else 'ASC'}"
    if limite:
        sql += f" LIMIT {int(limite)}"

    res = await db.execute(text(sql), params)
    filas = res.mappings().all()
    if not filas:
        return pl.DataFrame()
    return pl.DataFrame([dict(f) for f in filas])


async def buscar_texto(
    db: AsyncSession,
    tabla: str,
    columna: str,
    consulta: str,
    *,
    columnas: list[str] | None = None,
    orden: str | None = None,
    limite: int = 20,
) -> pl.DataFrame | None:
    """El término al comienzo de una palabra, sin distinguir mayúsculas.

    La regla está en `repositories/busqueda.py` («mesa» no encuentra
    «parmesano») y el SQL es el de la variante síncrona. La sirve el índice GIN
    con pg_trgm que crea el pipeline sobre `lower(col)`.
    """
    if not await existe_tabla(db, tabla):
        return None

    params = parametros_busqueda(consulta)
    if params is None:
        return pl.DataFrame()
    res = await db.execute(
        text(sql_busqueda_texto(tabla, columna, columnas=columnas, orden=orden)),
        {**params, "limite": limite},
    )
    filas = res.mappings().all()
    if not filas:
        return pl.DataFrame()
    return pl.DataFrame([dict(f) for f in filas])


async def columnas_de(db: AsyncSession, tabla: str) -> set[str]:
    """Columnas materializadas de una tabla.

    Hace falta porque el pipeline ha cambiado nombres a lo largo del tiempo
    (`NombreroductoGenerico` frente a `NombreProductoGenerico`) y el código
    elige la que exista en vez de asumir.
    """
    res = await db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = :schema AND table_name = :tabla"
        ),
        {"schema": SCHEMA, "tabla": tabla},
    )
    return {r[0] for r in res}
