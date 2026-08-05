"""Tests del materializador de analytics.

Necesitan un PostgreSQL real: el cargador usa COPY, swap atómico de tablas y
renombrado de índices, nada de eso se puede simular con SQLite.

En local se saltan si no hay base (`make dev-up-d` la levanta). En CI son
obligatorios — ahí el servicio de Postgres siempre está arriba.
"""

from __future__ import annotations

import os

import polars as pl
import pytest
from sqlalchemy import create_engine, text

from etl.loaders.analytics_loader import SCHEMA, TablaAnalytics, materializar

IN_CI = os.getenv("CI", "").lower() in ("1", "true")


def _url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


@pytest.fixture(scope="module")
def engine():
    eng = create_engine(_url(), pool_pre_ping=True)
    try:
        with eng.begin() as conn:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos disponible ({type(exc).__name__}) — usa `make dev-up-d`")
    yield eng
    with eng.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {SCHEMA}.tabla_de_prueba CASCADE"))
    eng.dispose()


@pytest.fixture
def df():
    """Reproduce las rarezas reales: camelCase, un typo histórico y NULLs."""
    return pl.DataFrame(
        {
            "codigoProductoONU": ["43211500", "43211500", "72101500"],
            "NombreroductoGenerico": ["Computador", "Computador", "Servicio"],
            "CodigoOrganismoPublico": ["7001", "7002", "7001"],
            "UnidadMedida": ["Unidad", "Unidad", None],
            "p50": [125000.0, 145000.0, 60000.0],
            "n": [42, 31, 12],
        }
    )


SPEC = TablaAnalytics(
    tabla="tabla_de_prueba",
    parquet="irrelevante.parquet",
    indices=[["codigoProductoONU", "CodigoOrganismoPublico"]],
)


def test_materializa_y_preserva_nombres_camelcase(engine, df):
    assert materializar(df, SPEC, engine) == 3

    with engine.begin() as conn:
        cols = {
            r[0]: r[1]
            for r in conn.execute(
                text(
                    "SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_schema = :s AND table_name = :t"
                ),
                {"s": SCHEMA, "t": SPEC.tabla},
            )
        }

    # Postgres plegaría a minúsculas si el cargador no citara los identificadores.
    assert "codigoProductoONU" in cols
    assert "NombreroductoGenerico" in cols
    assert cols["p50"] == "double precision"
    assert cols["n"] == "bigint"
    assert cols["codigoProductoONU"] == "text"


def test_los_null_llegan_como_null_y_no_como_cadena_vacia(engine, df):
    materializar(df, SPEC, engine)
    with engine.begin() as conn:
        nulos = conn.execute(
            text(f'SELECT count(*) FROM {SCHEMA}.{SPEC.tabla} WHERE "UnidadMedida" IS NULL')
        ).scalar()
    assert nulos == 1


def test_crea_los_indices_declarados(engine, df):
    materializar(df, SPEC, engine)
    with engine.begin() as conn:
        indices = {
            r[0]
            for r in conn.execute(
                text("SELECT indexname FROM pg_indexes WHERE schemaname = :s AND tablename = :t"),
                {"s": SCHEMA, "t": SPEC.tabla},
            )
        }
    # Con el nombre definitivo, no el temporal de carga.
    assert any("codigoProductoONU" in i for i in indices)
    assert not any("__cargando" in i for i in indices)


def test_el_swap_es_idempotente_y_reemplaza_el_contenido(engine, df):
    materializar(df, SPEC, engine)
    materializar(df.head(1), SPEC, engine)  # segunda corrida, menos filas

    with engine.begin() as conn:
        filas = conn.execute(text(f"SELECT count(*) FROM {SCHEMA}.{SPEC.tabla}")).scalar()
        temporales = conn.execute(
            text(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = :s AND table_name LIKE '%__cargando'"
            ),
            {"s": SCHEMA},
        ).scalar()

    assert filas == 1, "la tabla debe quedar reemplazada, no acumulada"
    assert temporales == 0, "no debe quedar ninguna tabla temporal huérfana"


def test_omite_un_indice_si_falta_la_columna(engine, df):
    """El pipeline cambia columnas: eso no debe tumbar la carga entera."""
    spec = TablaAnalytics(
        tabla="tabla_de_prueba",
        parquet="irrelevante.parquet",
        indices=[["columna_que_no_existe"], ["codigoProductoONU"]],
    )
    assert materializar(df, spec, engine) == 3

    with engine.begin() as conn:
        indices = {
            r[0]
            for r in conn.execute(
                text("SELECT indexname FROM pg_indexes WHERE schemaname = :s AND tablename = :t"),
                {"s": SCHEMA, "t": spec.tabla},
            )
        }
    assert any("codigoProductoONU" in i for i in indices)
    assert not any("columna_que_no_existe" in i for i in indices)
