"""Las cotas de una lectura de analytics viajan al SQL.

`/mercado` mataba la API por memoria (spec del rediseño §8.2): los mínimos de
calidad, el `min_score` y el conteo de rubros se hacían en Polars después de
traerse la tabla entera. Aquí se fija el SQL que los empuja, y —contra
Postgres— que el conteo ordena los empates igual que lo hacía Polars.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text

from app.db import sync_engine
from app.repositories import _analytics_sql as sql
from app.repositories import analytics_sync

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
TABLA = "tabla_conteo_prueba"


def test_los_minimos_son_mayor_o_igual_con_parametros_ligados():
    consulta, params = sql.sql_consulta(
        "trend_by_market",
        filtros={"RubroN2": "Aseo"},
        minimos={"n_anios": 3, "total_oc": 15},
        orden="cagr",
        limite=5,
    )

    assert 'WHERE "RubroN2" = :p0 AND "n_anios" >= :m0 AND "total_oc" >= :m1' in consulta
    assert consulta.endswith('ORDER BY "cagr" DESC NULLS LAST, ctid LIMIT 5')
    assert params == {"p0": "Aseo", "m0": 3, "m1": 15}


def test_minimos_sin_filtros_tambien_llevan_where():
    consulta, params = sql.sql_consulta("t", minimos={"opportunity_score": 4.0})

    assert consulta == 'SELECT * FROM "analytics"."t" WHERE "opportunity_score" >= :m0'
    assert params == {"m0": 4.0}


def test_sin_filtros_ni_minimos_no_hay_where():
    consulta, params = sql.sql_consulta("t")

    assert "WHERE" not in consulta
    assert params == {}


def test_contar_por_excluye_agrupa_y_ordena_por_bytes():
    consulta, params = sql.sql_contar_por("opportunity_scores", "RubroN2", excluir=["NA", ""])

    assert '"RubroN2" IS NOT NULL' in consulta
    assert '"RubroN2" NOT IN (:e0, :e1)' in consulta
    assert 'GROUP BY "RubroN2"' in consulta
    assert consulta.endswith('ORDER BY n DESC, "RubroN2" COLLATE "C" ASC LIMIT :limite')
    assert params == {"e0": "NA", "e1": ""}


@pytest.fixture
def tabla_conteo():
    try:
        with sync_engine.begin() as conn:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {sql.SCHEMA}"))
            conn.execute(text(f'DROP TABLE IF EXISTS {sql.SCHEMA}."{TABLA}"'))
            # Intercalación ICU explícita: la de la base depende de la imagen
            # (postgres:15-alpine/musl ordena por bytes, Debian con en_US.utf8
            # no), y con la de bytes este test pasaría aunque faltara el
            # `COLLATE "C"` de la consulta. Con ICU, «Árboles» va antes que
            # «Obras» en cualquier host; si el Postgres no trae ICU, el CREATE
            # falla (en CI, en voz alta) en vez de pasar sin probar nada.
            conn.execute(
                text(f'CREATE TABLE {sql.SCHEMA}."{TABLA}" ("RubroN2" TEXT COLLATE "und-x-icu")')
            )
            conn.execute(
                text(
                    f'INSERT INTO {sql.SCHEMA}."{TABLA}" VALUES '
                    "('Aseo'), ('Aseo'), ('Obras'), ('Zapatos'), ('Árboles'), "
                    "('NA'), (''), (NULL)"
                )
            )
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos disponible ({type(exc).__name__}) — usa `make dev-up-d`")
    analytics_sync.invalidar_cache_existencia()
    yield TABLA
    with sync_engine.begin() as conn:
        conn.execute(text(f'DROP TABLE IF EXISTS {sql.SCHEMA}."{TABLA}"'))
    analytics_sync.invalidar_cache_existencia()


def test_contar_por_contra_postgres_ordena_por_bytes(tabla_conteo):
    """Polars ordenaba los rubros empatados por bytes: «Zapatos» antes que
    «Árboles». Postgres con `en_US.utf8` los ordena al revés, y con `limit` eso
    cambia QUÉ rubros entran. `COLLATE "C"` conserva el orden de antes."""
    conteos = analytics_sync.contar_por(tabla_conteo, "RubroN2", excluir=["NA", ""], limite=10)

    assert conteos == [("Aseo", 2), ("Obras", 1), ("Zapatos", 1), ("Árboles", 1)]


def test_contar_por_tabla_inexistente_devuelve_none():
    analytics_sync.invalidar_cache_existencia()
    try:
        assert analytics_sync.contar_por("tabla_que_no_existe", "RubroN2", limite=10) is None
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos disponible ({type(exc).__name__})")


def test_todo_orden_con_limite_termina_en_un_criterio_unico():
    """Sin él, un `LIMIT` que corta en un empate devuelve cualquiera de las filas
    empatadas, y no siempre las mismas. Las tablas de analytics no tienen clave
    única: el desempate es la posición física (`DESEMPATE`)."""
    con_orden, _ = sql.sql_consulta("t", orden="n", limite=3)
    sin_orden, _ = sql.sql_consulta("t", limite=3)
    busqueda, _ = sql.sql_busqueda_texto("t", "nombre", "guante", orden="n")

    assert con_orden.endswith('ORDER BY "n" DESC NULLS LAST, ctid LIMIT 3')
    assert sin_orden.endswith("ORDER BY ctid LIMIT 3")
    assert busqueda.endswith('DESC, "n" DESC NULLS LAST, ctid LIMIT :limite')


TABLA_EMPATE = "tabla_empate_prueba"


@pytest.fixture
def tabla_empatada():
    try:
        with sync_engine.begin() as conn:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {sql.SCHEMA}"))
            conn.execute(text(f'DROP TABLE IF EXISTS {sql.SCHEMA}."{TABLA_EMPATE}"'))
            conn.execute(text(f'CREATE TABLE {sql.SCHEMA}."{TABLA_EMPATE}" (codigo TEXT, n INT)'))
            # Tres con n = 9 y cinco empatadas con n = 5: un LIMIT 5 corta el empate.
            conn.execute(
                text(
                    f'INSERT INTO {sql.SCHEMA}."{TABLA_EMPATE}" VALUES '
                    "('a', 9), ('b', 5), ('c', 9), ('d', 5), ('e', 5), ('f', 9), ('g', 5), "
                    "('h', 5)"
                )
            )
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos disponible ({type(exc).__name__}) — usa `make dev-up-d`")
    analytics_sync.invalidar_cache_existencia()
    yield TABLA_EMPATE
    with sync_engine.begin() as conn:
        conn.execute(text(f'DROP TABLE IF EXISTS {sql.SCHEMA}."{TABLA_EMPATE}"'))
    analytics_sync.invalidar_cache_existencia()


def test_el_empate_se_rompe_por_el_orden_de_carga(tabla_empatada):
    df = analytics_sync.consultar(tabla_empatada, orden="n", limite=5)

    assert df["codigo"].to_list() == ["a", "c", "f", "b", "d"]
