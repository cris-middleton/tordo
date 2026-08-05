"""Tests del repositorio de analytics.

Necesitan un PostgreSQL real: el punto de estos tests es justamente que los
filtros se empujen a SQL y que la búsqueda por subcadena use el índice GIN de
pg_trgm. Nada de eso existe en SQLite.

En local se saltan si no hay base (`make dev-up-d`). En CI son obligatorios.
"""

from __future__ import annotations

import os

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.repositories import analytics as repo

IN_CI = os.getenv("CI", "").lower() in ("1", "true")

TABLA = "tabla_repo_prueba"


def _url_async() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    engine = create_async_engine(_url_async())
    try:
        async with engine.begin() as conn:
            await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {repo.SCHEMA}"))
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
            await conn.execute(text(f"DROP TABLE IF EXISTS {repo.SCHEMA}.{TABLA}"))
            await conn.execute(
                text(
                    f"""CREATE TABLE {repo.SCHEMA}.{TABLA} (
                        "codigoProductoONU" TEXT,
                        "NombreroductoGenerico" TEXT,
                        "CodigoOrganismoPublico" TEXT,
                        "UnidadMedida" TEXT,
                        p50 DOUBLE PRECISION,
                        n BIGINT
                    )"""
                )
            )
            await conn.execute(
                text(
                    f"""INSERT INTO {repo.SCHEMA}.{TABLA} VALUES
                        ('43211500', 'Computador portatil', '7001', 'Unidad', 125000, 42),
                        ('43211500', 'Computador portatil', '7002', 'Unidad', 145000, 31),
                        ('72101500', 'Servicio de mantencion', '7001', NULL, 60000, 12)"""
                )
            )
            await conn.execute(
                text(
                    f"CREATE INDEX ON {repo.SCHEMA}.{TABLA} "
                    f'USING gin (lower("NombreroductoGenerico") gin_trgm_ops)'
                )
            )
    except Exception as exc:
        await engine.dispose()
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos disponible ({type(exc).__name__}) — usa `make dev-up-d`")

    sesion = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with sesion() as s:
        yield s

    async with engine.begin() as conn:
        await conn.execute(text(f"DROP TABLE IF EXISTS {repo.SCHEMA}.{TABLA}"))
    await engine.dispose()


async def test_tabla_inexistente_devuelve_none_y_no_revienta(db):
    """El pipeline no genera todos los parquets: eso es 'no disponible', no un 500."""
    assert await repo.existe_tabla(db, "tabla_que_no_existe") is False
    assert await repo.consultar(db, "tabla_que_no_existe") is None


async def test_filtra_empujando_a_sql(db):
    df = await repo.consultar(
        db, TABLA, filtros={"codigoProductoONU": "43211500", "CodigoOrganismoPublico": "7001"}
    )
    assert len(df) == 1
    assert df["p50"][0] == 125000


async def test_filtro_por_null(db):
    """UnidadMedida ausente se filtra con IS NULL, no con = NULL."""
    df = await repo.consultar(db, TABLA, filtros={"UnidadMedida": None})
    assert len(df) == 1
    assert df["codigoProductoONU"][0] == "72101500"


async def test_sin_coincidencias_devuelve_dataframe_vacio_no_none(db):
    """None significa 'la tabla no existe'; vacío significa 'no hay filas'."""
    df = await repo.consultar(db, TABLA, filtros={"codigoProductoONU": "00000000"})
    assert df is not None
    assert df.is_empty()


async def test_proyeccion_orden_y_limite(db):
    df = await repo.consultar(
        db, TABLA, columnas=["codigoProductoONU", "n"], orden="n", descendente=True, limite=2
    )
    assert df.columns == ["codigoProductoONU", "n"]
    assert df["n"].to_list() == [42, 31]


async def test_busqueda_por_subcadena_sin_distinguir_mayusculas(db):
    df = await repo.buscar_texto(
        db, TABLA, "NombreroductoGenerico", "PORTATIL", columnas=["codigoProductoONU"]
    )
    assert len(df) == 2
    assert set(df["codigoProductoONU"].to_list()) == {"43211500"}


async def test_los_comodines_del_usuario_no_alteran_el_patron(db):
    """Un '%' escrito por el usuario debe buscarse literal, no como comodín."""
    df = await repo.buscar_texto(db, TABLA, "NombreroductoGenerico", "%")
    assert df.is_empty()


async def test_columnas_de_detecta_el_nombre_historico(db):
    cols = await repo.columnas_de(db, TABLA)
    assert "NombreroductoGenerico" in cols
    assert "codigoProductoONU" in cols
