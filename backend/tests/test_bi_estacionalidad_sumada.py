"""`/bi/estacionalidad/{organismo}` sin rubro: los rubros sumados mes a mes."""

from __future__ import annotations

import pytest

from app.services.bi import temporal
from tests.analytics_en_memoria import AnalyticsEnMemoria


def _fila(rubro: str, mes: int, compras: int) -> dict:
    return {"CodigoOrganismoPublico": "7297", "RubroN2": rubro, "mes": mes, "compras_mes": compras}


@pytest.fixture
def datos(monkeypatch):
    datos = AnalyticsEnMemoria()
    datos.instalar(monkeypatch, temporal)
    return datos


def test_doce_meses_con_cero_en_los_que_no_compro(datos):
    datos["seasonality_patterns.parquet"] = [_fila("Aseo", 3, 40), _fila("Salud", 3, 10)]
    filas = temporal.get_estacionalidad("7297")["patrones"]
    assert [f["mes"] for f in filas] == list(range(1, 13))
    assert [f["compras_mes"] for f in filas] == [0, 0, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0]


def test_un_solo_mes_de_compras_es_el_mas_marcado_no_un_cero(datos):
    """Sobre los meses con compras, comprar sólo en marzo daba desviación nula y
    z = 0: la estacionalidad más marcada no salía nunca como pico."""
    datos["seasonality_patterns.parquet"] = [_fila("Aseo", 3, 40), _fila("Salud", 3, 10)]
    filas = {f["mes"]: f for f in temporal.get_estacionalidad("7297")["patrones"]}
    assert filas[3]["z_score"] > 3
    assert filas[1]["z_score"] < 0
