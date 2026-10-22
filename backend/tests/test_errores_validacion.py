"""Los 422 de validación llegan en español, con la forma de siempre.

El `msg` de Pydantic viene en inglés y `frontend/lib/errores.ts` lo enseña tal
cual. El test recorre el OpenAPI y viola cada cota declarada, así que un
parámetro nuevo queda cubierto sin que nadie se acuerde de él.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.errores_validacion import mensaje
from app.main import app

#: Palabras del inglés de Pydantic que no pueden quedar en un `msg`.
INGLES = ("should", "Input", "Field required", "String", "valid", "unable")


@pytest.fixture
def cliente():
    # Sin `with`: todo se rechaza en la validación, antes de tocar la base.
    return TestClient(app)


def _violaciones():
    """(ruta, params) que rompen una cota declarada en el OpenAPI."""
    for ruta, metodos in app.openapi()["paths"].items():
        operacion = metodos.get("get")
        if not operacion or not ruta.startswith("/api/"):
            continue
        parametros = operacion.get("parameters", [])
        path = {p["name"]: "1" for p in parametros if p["in"] == "path"}
        requeridos = {
            p["name"]: "abc" for p in parametros if p["in"] == "query" and p.get("required")
        }
        url = ruta.format(**path)
        for p in parametros:
            if p["in"] != "query":
                continue
            for esquema in p["schema"].get("anyOf", [p["schema"]]):
                tipo = esquema.get("type")
                malos = []
                if tipo in ("integer", "number"):
                    malos.append("abc")
                    if "maximum" in esquema:
                        malos.append(str(esquema["maximum"] * 10 + 1))
                    if "minimum" in esquema:
                        malos.append(str(esquema["minimum"] - 1))
                if tipo == "string" and "maxLength" in esquema:
                    malos.append("x" * (esquema["maxLength"] + 1))
                if tipo == "string" and "pattern" in esquema:
                    malos.append("¿?")
                if tipo == "string" and "enum" in esquema:
                    malos.append("otro")
                if tipo == "boolean":
                    malos.append("quizas")
                for malo in malos:
                    yield url, {**requeridos, p["name"]: malo}
        if requeridos:
            yield url, {}


VIOLACIONES = list(_violaciones())


def test_hay_violaciones_que_probar():
    """La guarda de siempre: sin ninguna, el test de abajo no probaría nada."""
    assert len(VIOLACIONES) >= 40, f"se esperaban ≥40, hay {len(VIOLACIONES)}"


@pytest.mark.parametrize("url,params", VIOLACIONES, ids=[f"{u} {p}"[:90] for u, p in VIOLACIONES])
def test_cada_422_viene_en_espanol(cliente, url, params):
    r = cliente.get(url, params=params)
    assert r.status_code == 422, r.text
    for error in r.json()["detail"]:
        # La forma de FastAPI no cambia: la leen el frontend y los integradores.
        assert {"type", "loc", "msg"} <= set(error)
        assert not any(palabra in error["msg"] for palabra in INGLES), error


def test_el_mensaje_nombra_el_campo_y_la_cota(cliente):
    r = cliente.get("/api/v1/tenders/", params={"offset": 100_001})
    (error,) = r.json()["detail"]
    assert error["loc"] == ["query", "offset"]
    assert error["type"] == "less_than_equal"
    assert error["msg"] == "«offset» tiene que ser 100.000 o menos."


def test_un_tipo_desconocido_conserva_el_mensaje():
    assert mensaje({"type": "algo_nuevo", "msg": "Something", "loc": ["query", "x"]}) == "Something"
