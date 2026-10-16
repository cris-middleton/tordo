"""`GET /bi/sector` publica la ventana de sus cifras (identidad §3.3).

La portada lee el gasto por sector y dice de qué meses es; sin ventana, la lectura
se oculta, porque una cifra sin periodo se lee como «de siempre». La tabla la
escribe la semanal (`etl/analytics/sector_intelligence.py`); hasta esa corrida,
la tabla no la trae y los campos salen nulos.

El golden master se capturó sobre un `sector_dashboard` SIN ventana y no cambia:
`get_sector` sólo devuelve las columnas que la tabla tiene.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.versionado import PREFIJO_API
from app.main import app
from app.services.bi import mercado
from tests.analytics_en_memoria import AnalyticsEnMemoria

RUTA = f"{PREFIJO_API}/bi/sector"
VENTANA = {"ventana_desde": "2023-11-01", "ventana_hasta": "2026-10-15"}


def _sector(nombre: str, monto: float, **extra) -> dict:
    return {
        "sector": nombre,
        "n_oc": 100,
        "monto_total": monto,
        "ticket_mediana": 1_500_000.0,
        "n_organismos": 10,
        "n_proveedores": 50,
        **extra,
    }


@pytest.fixture
def analytics(monkeypatch):
    datos = AnalyticsEnMemoria()
    datos.instalar(monkeypatch, mercado)
    monkeypatch.setattr(settings, "feature_analytics", True)
    return datos


def test_con_ventana_cada_sector_la_trae(analytics):
    analytics["sector_dashboard.parquet"] = [
        _sector("Municipalidades", 2.95e12, **VENTANA),
        _sector("Salud", 2.98e12, **VENTANA),
    ]

    r = TestClient(app).get(RUTA)

    assert r.status_code == 200, r.text
    sectores = r.json()["sectores"]
    assert [s["sector"] for s in sectores] == ["Salud", "Municipalidades"]
    assert {(s["ventana_desde"], s["ventana_hasta"]) for s in sectores} == {
        ("2023-11-01", "2026-10-15")
    }


def test_sin_ventana_salen_nulas_y_el_servicio_no_las_inventa(analytics):
    analytics["sector_dashboard.parquet"] = [_sector("Salud", 2.98e12)]

    r = TestClient(app).get(RUTA)

    assert r.status_code == 200
    assert r.json()["sectores"][0]["ventana_desde"] is None
    assert r.json()["sectores"][0]["ventana_hasta"] is None
    # Lo que compara el golden master: el dict del servicio, sin columnas que la tabla no tiene.
    assert "ventana_desde" not in mercado.get_sector()["sectores"][0]
