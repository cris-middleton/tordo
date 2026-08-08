"""Qué parte de la API es pública, declarado a mano.

Sin esta declaración, «la API pública» sería «todo lo que resultó estar
montado» — una promesa de estabilidad que nadie decidió dar, y que se ampliaría
sola con cada router nuevo.

Es el mismo patrón que `test_contrato_bi.py` y que el de tenancy: **un endpoint
nuevo hace fallar el test hasta que alguien decida explícitamente qué es**.
"""

from __future__ import annotations

import pytest

from app.api.documentacion import ETIQUETAS, SUPERFICIE
from app.core.versionado import PREFIJO_API
from app.main import app
from tests.rutas import iter_rutas

ETIQUETAS_EN_USO = sorted({(r.tags or ["sin-etiqueta"])[0] for _, r in iter_rutas(app)})


def test_hay_rutas_que_clasificar():
    """La guarda de siempre: sin ella, los tests de abajo comprobarían el vacío
    en cuanto el recorrido de rutas dejara de encontrar nada."""
    assert len(ETIQUETAS_EN_USO) >= 10, f"se esperaban ≥10 etiquetas, hay {len(ETIQUETAS_EN_USO)}"


@pytest.mark.parametrize("etiqueta", ETIQUETAS_EN_USO, ids=ETIQUETAS_EN_USO)
def test_cada_grupo_declara_si_es_publico(etiqueta: str):
    assert etiqueta in SUPERFICIE, (
        f"«{etiqueta}» no está clasificada en app/api/documentacion.py::SUPERFICIE. "
        f"Decide si es 'publica' (te comprometes a no romperla dentro de "
        f"{PREFIJO_API}) o 'interna'."
    )
    assert SUPERFICIE[etiqueta] in {"publica", "interna"}


@pytest.mark.parametrize("etiqueta", ETIQUETAS_EN_USO, ids=ETIQUETAS_EN_USO)
def test_cada_grupo_esta_documentado(etiqueta: str):
    """Una etiqueta sin descripción sale en `/docs` como un título a secas.

    Es justo el punto donde el integrador decide si el endpoint le sirve.
    """
    documentadas = {e["name"] for e in ETIQUETAS}
    assert etiqueta in documentadas, (
        f"«{etiqueta}» no tiene descripción en app/api/documentacion.py::ETIQUETAS."
    )


def test_no_se_clasifica_lo_que_no_existe():
    """Una entrada sobrante es un router que se borró y una promesa que quedó
    escrita — el tipo de documentación que engaña justo por estar."""
    sobrantes = set(SUPERFICIE) - set(ETIQUETAS_EN_USO)
    assert not sobrantes, f"clasificadas pero inexistentes: {sorted(sobrantes)}"


def test_la_descripcion_llega_al_esquema():
    """Lo que se documenta sólo vale si viaja en el OpenAPI: es de donde salen
    `/docs` y cualquier cliente generado."""
    esquema = app.openapi()

    assert "Clave de API" in esquema["info"]["description"]
    assert "X-RateLimit-Limit" in esquema["info"]["description"]
    assert {e["name"] for e in esquema.get("tags", [])} >= set(ETIQUETAS_EN_USO)
