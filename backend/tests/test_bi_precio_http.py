"""`/api/v1/bi/precio/{codigo_producto}` se prueba POR HTTP, y ése es el punto.

`services/bi/precio.py` mandaba un string (`"referencial"` / `"baja"`) en
`confianza` para el nivel L4 (referencia general del organismo por rubro),
mientras `schemas/bi.py` declara `confianza: float | None`. FastAPI valida la
respuesta contra ese schema: un string donde se espera `float` revienta con
`ResponseValidationError`, que FastAPI traduce en un 500.

**Es la segunda vez que pasa exactamente este bug** (el comentario junto a
`confianza` en `schemas/bi.py` ya contaba la primera). La primera vez tampoco
la vio ningún test porque `FEATURE_ANALYTICS=false` cortaba con 503 antes de
llegar a construir la respuesta en el entorno donde corrían los tests. Esta
vez el motivo es distinto y más simple: **`test_bi_precio_nivel_producto.py`
llama a `servicio.get_precio_producto()` directamente** — nunca pasa por la
capa HTTP, así que nunca pasa por `response_model=PrecioResponse`, que es
donde Pydantic valida y donde el bug se manifiesta: un atributo que no existe
en el modelo sólo aparece ejecutando la ruta completa. El nivel L4 nunca tuvo
ese tipo de test, ni antes ni ahora — hasta este archivo.

**Cliente propio y no la fixture `client`.** `AsyncClient` sobre
`ASGITransport` habla con la aplicación real sin depender de un servidor de
sesiones que sólo admite un `.run()`.
"""

from __future__ import annotations

import polars as pl
import pytest
import pytest_asyncio

from app.config import settings
from app.core.versionado import PREFIJO_API
from app.services.bi import precio as servicio_precio

CODIGO = "41116000"


@pytest_asyncio.fixture
async def cliente(async_db):
    from httpx import ASGITransport, AsyncClient

    from app.db import get_db
    from app.main import app

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def solo_nivel_4(monkeypatch):
    """Ninguna tabla de producto (L0..L3) tiene datos; sólo la de organismo×rubro
    que alimenta el nivel 4. Fuerza la cascada completa hasta el fallback más
    amplio, que es la rama que tenía el bug.
    """

    def _load(filename, *, filtros=None, columnas=None, **_):
        if filename != "price_bands.parquet":
            return None
        return pl.DataFrame(
            [
                {
                    "CodigoOrganismoPublico": "7416",
                    "OrganismoPublico": "HOSPITAL DE PRUEBA",
                    "RubroN2": "Servicios generales",
                    "n_transacciones": 12,
                    "precio_promedio": 1000.0,
                    "precio_mediana": 1000.0,
                    "p10": 900.0,
                    "p25": 950.0,
                    "p75": 1050.0,
                    "p90": 1100.0,
                    "coef_variacion": 0.1,
                    # Presente en la tabla real aunque `get_precio_producto` ya
                    # no lo use para construir `confianza` — es justo el punto
                    # de esta regresión: que YA NO se use para eso.
                    "precio_predecible": True,
                }
            ]
        )

    monkeypatch.setattr(servicio_precio, "_load", _load)
    # Sin columnas de L0/L0N: esos niveles no se consultan en la base de verdad.
    monkeypatch.setattr(servicio_precio, "_columnas", lambda filename: set())
    monkeypatch.setattr(settings, "feature_analytics", True)


@pytest.mark.asyncio
async def test_nivel_4_no_revienta_con_500(cliente, solo_nivel_4):
    """El fallo real: `ResponseValidationError` por mandar un string donde el
    schema declara `float`. Antes del fix esto devolvía 500 siempre que la
    cascada llegaba a L4 con un organismo — que es su caso normal de uso."""
    r = await cliente.get(
        f"{PREFIJO_API}/bi/precio/{CODIGO}",
        params={"organismo_id": "7416"},
    )

    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["disponible"] is True
    assert cuerpo["nivel_usado"] == "L4"

    banda = cuerpo["resultado"][0]
    # `confianza` no es el string que causaba el 500 — ni ningún otro string:
    # o es un número en la misma escala 0-1 que L0-L3, o no se manda.
    assert not isinstance(banda["confianza"], str)
    assert banda["confianza"] is None or isinstance(banda["confianza"], (int, float))


@pytest.mark.asyncio
async def test_la_unidad_de_medida_llega_al_cliente(cliente, monkeypatch):
    """`UnidadMedida` se seleccionaba en el repositorio pero no estaba declarada
    en `PrecioBanda`: Pydantic la descartaba en silencio al serializar. Un
    precio sin unidad es una respuesta ambigua con forma de respuesta exacta —
    la misma clase de error que la categoría que mezclaba un calibrador y un
    criovial. Se prueba en L1 (que sí trae unidad) para no depender de L0."""

    def _load(filename, *, filtros=None, columnas=None, **_):
        if filename != "product_price_bands_L1.parquet":
            return None
        return pl.DataFrame(
            [
                {
                    "codigoProductoONU": CODIGO,
                    "NombreroductoGenerico": "Reactivos o soluciones químicos",
                    "CodigoOrganismoPublico": "7416",
                    "OrganismoPublico": "HOSPITAL DE PRUEBA",
                    "UnidadMedida": "caja de 100",
                    "p10": 90.0,
                    "p25": 95.0,
                    "p50": 100.0,
                    "p75": 105.0,
                    "p90": 110.0,
                    "pu_mean": 100.0,
                    "cv": 0.05,
                    "qcd": 0.05,
                    "predictibilidad": "alta",
                    "confianza": 0.8,
                    "n": 20,
                }
            ]
        )

    monkeypatch.setattr(servicio_precio, "_load", _load)
    # Sin columnas de L0/L0N: esos niveles no se consultan en la base de verdad.
    monkeypatch.setattr(servicio_precio, "_columnas", lambda filename: set())
    monkeypatch.setattr(settings, "feature_analytics", True)

    r = await cliente.get(
        f"{PREFIJO_API}/bi/precio/{CODIGO}",
        params={"organismo_id": "7416"},
    )

    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["nivel_usado"] == "L1"
    assert cuerpo["resultado"][0]["UnidadMedida"] == "caja de 100"
