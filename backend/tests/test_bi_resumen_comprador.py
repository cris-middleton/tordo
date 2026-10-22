"""El comprador más activo del resumen de un rubro (`services/bi/mercado.get_resumen`)."""

from __future__ import annotations

import pytest

from app.services.bi import mercado, temporal
from tests.analytics_en_memoria import AnalyticsEnMemoria

RUBRO = "Aseo / Limpieza"


def _oportunidad(codigo: str, n: int) -> dict:
    return {"CodigoOrganismoPublico": codigo, "RubroN2": RUBRO, "n_transacciones": n}


def _perfil(codigo: str, nombre: str | None) -> dict:
    return {"CodigoOrganismoPublico": codigo, "NombreOrganismo": nombre, "n_oc_total": 900}


@pytest.fixture
def datos(monkeypatch):
    datos = AnalyticsEnMemoria()
    datos["market_concentration.parquet"] = [
        {"CodigoOrganismoPublico": "200", "OrganismoPublico": "HOSPITAL DOS", "RubroN2": RUBRO},
        {"CodigoOrganismoPublico": "100", "OrganismoPublico": "HOSPITAL UNO", "RubroN2": RUBRO},
    ]
    datos.instalar(monkeypatch, mercado, temporal)
    return datos


@pytest.mark.parametrize("orden", [["200", "100"], ["100", "200"]])
def test_un_empate_lo_gana_siempre_el_mismo(datos, orden):
    """Dos compradores igual de activos: antes salía uno u otro según el orden de la tabla."""
    datos["opportunity_scores.parquet"] = [_oportunidad(c, 50) for c in orden]
    datos["buyer_scores.parquet"] = [_perfil("100", "HOSPITAL UNO"), _perfil("200", "HOSPITAL DOS")]
    assert mercado.get_resumen(RUBRO)["top_comprador"]["codigo"] == "100"


@pytest.mark.parametrize("sin_nombre", [None, "", "  "])
def test_un_perfil_sin_nombre_toma_el_de_sus_mercados(datos, sin_nombre):
    """`buyer_scores` saca el nombre de las licitaciones: con órdenes y sin
    licitaciones en la ventana, el resumen nombraba a un comprador vacío."""
    datos["opportunity_scores.parquet"] = [_oportunidad("200", 80)]
    datos["buyer_scores.parquet"] = [_perfil("200", sin_nombre)]
    assert mercado.get_resumen(RUBRO)["top_comprador"]["nombre"] == "HOSPITAL DOS"
