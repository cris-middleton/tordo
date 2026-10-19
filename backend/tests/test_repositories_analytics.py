"""Tests del repositorio de analytics (`analytics_sync`, el que usan los servicios).

Necesitan un PostgreSQL real: el punto de estos tests es justamente que los
filtros se empujen a SQL y que la búsqueda use el índice GIN de pg_trgm. Nada de
eso existe en SQLite.

Antes probaban una copia async del repositorio que sólo usaban ellos; la copia
se borró y los casos pasaron aquí. Del async queda `existe_tabla`, que usa
`repositories/compra_agil.py`.

En local se saltan si no hay base (`make dev-up-d`). En CI son obligatorios.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text

from app.db import sync_engine
from app.repositories import analytics as repo_async
from app.repositories import analytics_sync as repo

IN_CI = os.getenv("CI", "").lower() in ("1", "true")

TABLA = "tabla_repo_prueba"


@pytest.fixture
def tabla():
    try:
        with sync_engine.begin() as conn:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {repo.SCHEMA}"))
            conn.execute(text(f"DROP TABLE IF EXISTS {repo.SCHEMA}.{TABLA}"))
            conn.execute(
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
            conn.execute(
                text(
                    f"""INSERT INTO {repo.SCHEMA}.{TABLA} VALUES
                        ('43211500', 'Computador portátil', '7001', 'Unidad', 125000, 42),
                        ('43211500', 'Computador portatil', '7002', 'Unidad', 145000, 31),
                        ('72101500', 'Servicio de mantencion', '7001', NULL, 60000, 12)"""
                )
            )
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos disponible ({type(exc).__name__}) — usa `make dev-up-d`")
    repo.invalidar_cache_existencia()
    yield TABLA
    with sync_engine.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {repo.SCHEMA}.{TABLA}"))
    repo.invalidar_cache_existencia()


def test_tabla_inexistente_devuelve_none_y_no_revienta(tabla):
    """El pipeline no genera todos los parquets: eso es 'no disponible', no un 500."""
    assert repo.existe_tabla("tabla_que_no_existe") is False
    assert repo.consultar("tabla_que_no_existe") is None


def test_filtra_empujando_a_sql(tabla):
    df = repo.consultar(
        tabla, filtros={"codigoProductoONU": "43211500", "CodigoOrganismoPublico": "7001"}
    )
    assert len(df) == 1
    assert df["p50"][0] == 125000


def test_filtro_por_null(tabla):
    """UnidadMedida ausente se filtra con IS NULL, no con = NULL."""
    df = repo.consultar(tabla, filtros={"UnidadMedida": None})
    assert len(df) == 1
    assert df["codigoProductoONU"][0] == "72101500"


def test_filtro_por_lista_es_un_in(tabla):
    df = repo.consultar(tabla, filtros={"CodigoOrganismoPublico": ["7002", "9999"]})
    assert df["CodigoOrganismoPublico"].to_list() == ["7002"]


def test_sin_coincidencias_devuelve_dataframe_vacio_no_none(tabla):
    """None significa 'la tabla no existe'; vacío significa 'no hay filas', y
    conserva las columnas: hay servicios que deciden por `"col" in df.columns`."""
    df = repo.consultar(tabla, filtros={"codigoProductoONU": "00000000"})
    assert df is not None
    assert df.is_empty()
    assert "NombreroductoGenerico" in df.columns


def test_proyeccion_orden_y_limite(tabla):
    df = repo.consultar(
        tabla, columnas=["codigoProductoONU", "n"], orden="n", descendente=True, limite=2
    )
    assert df.columns == ["codigoProductoONU", "n"]
    assert df["n"].to_list() == [42, 31]


def test_busqueda_sin_distinguir_mayusculas_ni_tildes(tabla):
    """«PORTATIL» encuentra «portátil» y «portatil»: el nombre se normaliza al
    vuelo porque esta tabla no trae la columna generada `COLUMNA_BUSCABLE`."""
    df = repo.buscar_texto(tabla, "NombreroductoGenerico", "PORTATIL", columnas=["n"])
    assert sorted(df["n"].to_list()) == [31, 42]


def test_los_comodines_del_usuario_no_alteran_el_patron(tabla):
    """Un '%' escrito por el usuario debe buscarse literal, no como comodín."""
    df = repo.buscar_texto(tabla, "NombreroductoGenerico", "%")
    assert df.is_empty()


def test_columnas_de_detecta_el_nombre_historico(tabla):
    cols = repo.columnas_de(tabla)
    assert "NombreroductoGenerico" in cols
    assert "codigoProductoONU" in cols


@pytest.mark.asyncio
async def test_existe_tabla_async(async_db):
    """La variante async que queda, la de `repositories/compra_agil.py`."""
    assert await repo_async.existe_tabla(async_db, "tabla_que_no_existe") is False
    await async_db.execute(text(f"CREATE SCHEMA IF NOT EXISTS {repo_async.SCHEMA}"))
    await async_db.execute(text(f"CREATE TABLE {repo_async.SCHEMA}.tabla_async_prueba (x INT)"))
    assert await repo_async.existe_tabla(async_db, "tabla_async_prueba") is True
