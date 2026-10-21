"""`GET /publico/mercado`: el gasto mensual por sector y la concentración de los mercados.

Necesitan un PostgreSQL real, como `test_repositories_analytics.py`: el punto es
que **la agregación la hace Postgres** (GROUP BY, tramos con `floor`), porque
traer `time_series` entera a la API la mató por memoria el 2026-10-14. Un doble
en memoria probaría otro código.

Las tablas de juguete tienen nombre propio y el servicio se apunta a ellas
(`TABLA_GASTO`, `TABLA_CONCENTRACION`): las del golden master no se tocan. Contra
esas corre el último test.

En local se saltan si no hay base (`make dev-up-d`). En CI son obligatorios.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.core.versionado import PREFIJO_API
from app.db import sync_engine
from app.main import app
from app.repositories import analytics_sync as repo
from app.services.publico import mercado

IN_CI = os.getenv("CI", "").lower() in ("1", "true")
URL = f"{PREFIJO_API}/publico/mercado"

GASTO = "time_series_prueba_portada"
CONCENTRACION = "market_concentration_prueba_portada"
INEXISTENTE = "tabla_que_no_existe_portada"


def _crear(conn, tabla: str, columnas: str, filas: str) -> None:
    conn.execute(text(f"DROP TABLE IF EXISTS {repo.SCHEMA}.{tabla}"))
    conn.execute(text(f"CREATE TABLE {repo.SCHEMA}.{tabla} ({columnas})"))
    conn.execute(text(f"INSERT INTO {repo.SCHEMA}.{tabla} VALUES {filas}"))


@pytest.fixture
def tablas(monkeypatch):
    try:
        with sync_engine.begin() as conn:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {repo.SCHEMA}"))
            _crear(
                conn,
                GASTO,
                '"CodigoOrganismoPublico" TEXT, "RubroN2" TEXT, sector TEXT, anio INTEGER, '
                'mes INTEGER, n_oc BIGINT, monto_total DOUBLE PRECISION, "OrganismoPublico" TEXT',
                # Dos meses, el más reciente insertado primero. En 2025-10: dos
                # filas de Salud (se suman), un vacío, un nulo y un «Otros»
                # (los tres se funden en uno), y un mes sin año que no cuenta.
                """('1', 'Aseo', 'Salud', 2025, 11, 4, 400, 'H'),
                   ('1', 'Aseo', 'Salud', 2025, 10, 3, 300, 'H'),
                   ('2', 'Aseo', 'Salud', 2025, 10, 2, 200, 'H2'),
                   ('3', 'Aseo', '', 2025, 10, 1, 10, 'X'),
                   ('4', 'Aseo', NULL, 2025, 10, 1, 20, 'Y'),
                   ('5', 'Aseo', 'Otros', 2025, 10, 5, 30, 'Z'),
                   ('6', 'Aseo', 'Municipalidades', 2025, 10, 7, 700, 'M'),
                   ('7', 'Aseo', 'Salud', NULL, 10, 99, 9999, 'S')""",
            )
            _crear(
                conn,
                CONCENTRACION,
                '"CodigoOrganismoPublico" TEXT, "RubroN2" TEXT, hhi DOUBLE PRECISION, '
                '"OrganismoPublico" TEXT, n_proveedores BIGINT, n_transacciones BIGINT, '
                "monto_total_mercado DOUBLE PRECISION, top_proveedor TEXT, "
                "top_share_pct DOUBLE PRECISION, tipo_mercado TEXT, "
                "ventana_desde DATE, ventana_hasta DATE",
                # Cuotas en los bordes: 0, 9,99, 10, 49,9, 50, 100 (al último
                # tramo) y una sin cuota, que no cuenta en nada.
                """('1', 'A', 9000, 'H', 1, 3, 1000, 'P', 100, 'monopolio', '2023-10-01', '2026-09-30'),
                   ('1', 'B', 5000, 'H', 2, 3, 500, 'P', 50, 'x', '2023-10-01', '2026-09-30'),
                   ('2', 'A', 2000, 'H', 5, 3, 200, 'P', 49.9, 'x', '2023-10-01', '2026-09-30'),
                   ('2', 'B', 1000, 'H', 9, 3, 100, 'P', 10, 'x', '2023-10-01', '2026-09-30'),
                   ('3', 'A', 900, 'H', 9, 3, 90, 'P', 9.99, 'x', '2023-10-01', '2026-09-30'),
                   ('3', 'B', 0, 'H', 9, 3, 10, 'P', 0, 'x', '2023-10-01', '2026-09-30'),
                   ('4', 'A', NULL, 'H', 1, 3, 7777, 'P', NULL, 'x', '2023-10-01', '2026-09-30')""",
            )
    except Exception as exc:
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos disponible ({type(exc).__name__}) — usa `make dev-up-d`")
    repo.invalidar_cache_existencia()
    mercado.invalidar()
    monkeypatch.setattr(mercado, "TABLA_GASTO", GASTO)
    monkeypatch.setattr(mercado, "TABLA_CONCENTRACION", CONCENTRACION)
    yield
    with sync_engine.begin() as conn:
        for tabla in (GASTO, CONCENTRACION):
            conn.execute(text(f"DROP TABLE IF EXISTS {repo.SCHEMA}.{tabla}"))
    repo.invalidar_cache_existencia()
    mercado.invalidar()


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setattr(settings, "feature_analytics", True)
    return TestClient(app)


def test_gasto_mensual_suma_por_mes_y_sector_y_funde_los_vacios_en_otros(tablas, cliente):
    r = cliente.get(URL)
    assert r.status_code == 200
    assert r.json()["gasto_mensual"] == [
        {"anio": 2025, "mes": 10, "sector": "Municipalidades", "monto": 700.0},
        {"anio": 2025, "mes": 10, "sector": "Otros", "monto": 60.0},
        {"anio": 2025, "mes": 10, "sector": "Salud", "monto": 500.0},
        {"anio": 2025, "mes": 11, "sector": "Salud", "monto": 400.0},
    ]


def test_concentracion_cuenta_suma_y_reparte_en_diez_tramos(tablas, cliente):
    c = cliente.get(URL).json()["concentracion"]
    tramos = c.pop("tramos")
    assert c == {
        "mercados": 6,
        "sobre_la_mitad": 2,
        "un_proveedor": 1,
        "monto_total": 1900.0,
        "monto_sobre_la_mitad": 1500.0,
        "ventana_desde": "2023-10-01",
        "ventana_hasta": "2026-09-30",
    }
    assert [(t["desde"], t["hasta"]) for t in tramos] == [(i * 10, i * 10 + 10) for i in range(10)]
    por_tramo = {t["desde"]: (t["mercados"], t["monto"]) for t in tramos}
    assert por_tramo[0] == (2, 100.0)  # 0 y 9,99
    assert por_tramo[10] == (1, 100.0)  # 10 abre su tramo
    assert por_tramo[40] == (1, 200.0)  # 49,9
    assert por_tramo[50] == (1, 500.0)  # 50 abre «la mitad o más»
    assert por_tramo[90] == (1, 1000.0)  # 100 cae en el último tramo
    assert all(por_tramo[d] == (0, 0.0) for d in (20, 30, 60, 70, 80))
    # Los tramos suman los mercados y el monto; desde el 50, la mitad o más.
    assert sum(t["mercados"] for t in tramos) == c["mercados"]
    assert sum(t["monto"] for t in tramos) == c["monto_total"]
    assert sum(t["mercados"] for t in tramos if t["desde"] >= 50) == c["sobre_la_mitad"]


def test_la_respuesta_es_plana_sin_sobre(tablas, cliente):
    assert set(cliente.get(URL).json()) == {"gasto_mensual", "concentracion"}


def test_sin_tablas_cada_bloque_sale_nulo_y_no_500(tablas, cliente, monkeypatch):
    monkeypatch.setattr(mercado, "TABLA_GASTO", INEXISTENTE)
    r = cliente.get(URL)
    assert r.status_code == 200
    assert r.json()["gasto_mensual"] is None
    assert r.json()["concentracion"]["mercados"] == 6

    monkeypatch.setattr(mercado, "TABLA_CONCENTRACION", INEXISTENTE)
    assert cliente.get(URL).json() == {"gasto_mensual": None, "concentracion": None}


def test_una_respuesta_a_medias_no_se_guarda_en_la_cache(tablas, cliente, monkeypatch):
    """Antes de la primera corrida semanal falta una tabla; cuando aparece, la
    portada tiene que verla sin esperar al TTL."""
    monkeypatch.setattr(mercado, "TABLA_GASTO", INEXISTENTE)
    assert cliente.get(URL).json()["gasto_mensual"] is None
    monkeypatch.setattr(mercado, "TABLA_GASTO", GASTO)
    assert cliente.get(URL).json()["gasto_mensual"] is not None


def test_la_respuesta_completa_se_guarda_hasta_el_ttl(tablas, cliente, monkeypatch):
    reloj = [1000.0]
    monkeypatch.setattr(mercado, "_reloj", lambda: reloj[0])
    primera = cliente.get(URL).json()
    with sync_engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {repo.SCHEMA}.{GASTO}"))
    assert cliente.get(URL).json() == primera
    reloj[0] += mercado.TTL_SEGUNDOS + 1
    assert cliente.get(URL).json()["gasto_mensual"] == []


def test_una_tabla_sin_ventana_la_devuelve_nula(tablas, cliente):
    with sync_engine.begin() as conn:
        conn.execute(
            text(
                f"ALTER TABLE {repo.SCHEMA}.{CONCENTRACION} "
                "DROP COLUMN ventana_desde, DROP COLUMN ventana_hasta"
            )
        )
    c = cliente.get(URL).json()["concentracion"]
    assert c["ventana_desde"] is None and c["ventana_hasta"] is None
    assert c["mercados"] == 6


def test_con_analytics_apagado_responde_503_como_las_fichas(tablas, monkeypatch):
    monkeypatch.setattr(settings, "feature_analytics", False)
    r = TestClient(app).get(URL)
    assert r.status_code == 503
    assert r.json()["detail"]


def test_no_pide_autorizacion(tablas, cliente):
    """Pública y anónima: ni cabecera ni cookie."""
    r = cliente.get(URL, headers={})
    assert r.status_code == 200


def test_sobre_las_tablas_del_golden(cliente):
    """Los nombres de tabla y de columna de verdad: lo que produce el materializador."""
    repo.invalidar_cache_existencia()
    mercado.invalidar()
    try:
        hay = repo.existe_tabla("time_series", usar_cache=False) and repo.existe_tabla(
            "market_concentration", usar_cache=False
        )
    except Exception as exc:  # noqa: BLE001
        if IN_CI:
            raise
        pytest.skip(f"sin base de datos ({type(exc).__name__})")
    if not hay:
        if IN_CI:
            raise AssertionError("el esquema analytics no está materializado")
        pytest.skip("el esquema analytics no está materializado")
    cuerpo = cliente.get(URL).json()
    mercado.invalidar()
    gasto, c = cuerpo["gasto_mensual"], cuerpo["concentracion"]
    # Guardas: con las tablas vacías el resto comprobaría el vacío.
    assert len(gasto) >= 1 and c["mercados"] >= 1
    claves = [(g["anio"], g["mes"], g["sector"]) for g in gasto]
    assert len(claves) == len(set(claves)), "un (mes, sector) repetido"
    assert claves == sorted(claves, key=lambda k: (k[0], k[1], k[2].encode()))
    assert all(g["sector"].strip() for g in gasto)
    assert len(c["tramos"]) == 10
    assert sum(t["mercados"] for t in c["tramos"]) == c["mercados"]
    assert c["sobre_la_mitad"] <= c["mercados"]
    assert c["monto_sobre_la_mitad"] <= c["monto_total"]
