"""Ningún parámetro de la superficie pública queda sin cota.

Toda la API es anónima desde el pivote público: un parámetro sin cota es una
forma barata de hacer trabajar al servidor —un `search` de un megabyte, un
`offset` de mil millones— o de romperlo: un id mayor que un `integer` de Postgres
llegaba a la base y volvía **500** en vez de 404.

El test recorre el OpenAPI, así que un endpoint nuevo queda cubierto sin que
nadie se acuerde de él. Las cotas viven en `app/api/limites.py`.
"""

from __future__ import annotations

import polars as pl
import pytest
from fastapi.testclient import TestClient

from app.api import limites
from app.main import app
from app.repositories import analytics_sync
from app.services.bi import _base, precio

#: Lo que no es superficie pública de datos.
FUERA = ("/health",)


def _parametros():
    esquema = app.openapi()
    for ruta, metodos in esquema["paths"].items():
        if ruta.startswith(FUERA):
            continue
        for metodo, operacion in metodos.items():
            for parametro in operacion.get("parameters", []):
                yield f"{metodo.upper()} {ruta} · {parametro['name']}", parametro["schema"]


def _tipos(esquema: dict) -> list[dict]:
    """Un `str | None` llega como `anyOf: [{type: string}, {type: null}]`."""
    return esquema.get("anyOf", [esquema])


PARAMETROS = list(_parametros())


def test_hay_parametros_que_revisar():
    """La guarda de siempre: con cero parámetros, el test de abajo no probaría nada."""
    assert len(PARAMETROS) >= 40, f"se esperaban ≥40 parámetros, hay {len(PARAMETROS)}"


@pytest.mark.parametrize("nombre,esquema", PARAMETROS, ids=[n for n, _ in PARAMETROS])
def test_cada_parametro_tiene_cota(nombre, esquema):
    for tipo in _tipos(esquema):
        if tipo.get("type") == "string" and "enum" not in tipo:
            assert "maxLength" in tipo or "pattern" in tipo, (
                f"{nombre}: texto sin max_length. Ponle una cota de app/api/limites.py."
            )
        if tipo.get("type") == "integer":
            assert "maximum" in tipo, f"{nombre}: entero sin le=. Ponle una cota."
        if tipo.get("type") == "number":
            # `1e308` e `inf` son números válidos para Pydantic y no caben en
            # ninguna columna `numeric`: sin cota, 500 en vez de 422.
            assert "maximum" in tipo, f"{nombre}: número sin le=. Ponle una cota."


# ── Lo que la cota evita, por HTTP ───────────────────────────────────────────


@pytest.fixture
def cliente():
    # Sin `with`: no arranca el ciclo de vida, y el gestor de sesiones del MCP
    # sólo puede arrancarse una vez por proceso. Estas rutas no lo necesitan, y
    # todas se rechazan en la validación, antes de tocar la base.
    return TestClient(app)


def test_un_id_mayor_que_un_integer_no_llega_a_la_base(cliente):
    """Antes: 500 (asyncpg no puede enviar 2**31 a una columna `integer`)."""
    r = cliente.get(f"/api/v1/tenders/{limites.ID_MAX + 1}")
    assert r.status_code == 422


def test_un_texto_demasiado_largo_se_rechaza(cliente):
    r = cliente.get("/api/v1/tenders/", params={"search": "x" * (limites.TEXTO + 1)})
    assert r.status_code == 422


@pytest.mark.parametrize("valor", ["1e308", "inf", str(limites.MONTO_MAX + 1)])
@pytest.mark.parametrize("parametro", ["min_amount", "max_amount"])
def test_un_monto_desmedido_se_rechaza(cliente, parametro, valor):
    """Antes: 500 (`numeric field overflow`: la columna es `Numeric(15, 2)`)."""
    r = cliente.get("/api/v1/tenders/", params={parametro: valor})
    assert r.status_code == 422


def test_un_offset_desmedido_se_rechaza(cliente):
    r = cliente.get("/api/v1/tenders/", params={"offset": limites.OFFSET_MAX + 1})
    assert r.status_code == 422


def test_compra_agil_rechaza_demasiadas_palabras(cliente):
    muchas = " ".join(f"p{i}" for i in range(limites.MAX_TERMINOS + 1))
    r = cliente.get("/api/v1/compra-agil/destacadas", params={"search": muchas})
    assert r.status_code == 422
    assert str(limites.MAX_TERMINOS) in r.json()["detail"]


def test_buscar_productos_no_trae_la_tabla_entera(monkeypatch):
    """`/bi/productos?q=` traía `product_price_bands_l3` entera a Polars en cada
    petición y filtraba después: ~70 ms con seis meses de datos, gratis de pedir.
    Ahora el filtro va a SQL, sobre el índice de trigramas, con tope de filas."""

    def sin_filtro(*args, **kwargs):
        raise AssertionError("get_productos no debe leer la tabla sin filtrar")

    llamadas = []

    def buscar_texto(tabla, columna, texto, **kwargs):
        llamadas.append((tabla, texto, kwargs.get("limite")))
        return pl.DataFrame({"codigoProductoONU": [], columna: [], "n": []})

    monkeypatch.setattr(analytics_sync, "consultar", sin_filtro)
    monkeypatch.setattr(analytics_sync, "buscar_texto", buscar_texto)
    monkeypatch.setattr(analytics_sync, "existe_tabla", lambda tabla: True)
    monkeypatch.setattr(
        analytics_sync,
        "columnas_de",
        lambda tabla: {"codigoProductoONU", "NombreroductoGenerico", "n"},
    )

    assert precio.get_productos("guante", 20)["disponible"] is True
    assert llamadas == [("product_price_bands_l3", "guante", _base.MAX_FILAS_BUSQUEDA)]
