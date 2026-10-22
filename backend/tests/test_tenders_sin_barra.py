"""`GET /tenders` sin barra responde sin redirigir, y cuenta una vez en el límite.

El navegador pide `/api/proxy/api/v1/tenders/`, Next quita la barra y el proxy
llega a `/api/v1/tenders`. Con sólo la ruta con barra, FastAPI respondía 307 y el
límite por IP contaba las dos peticiones: cada consulta del catálogo gastaba dos
de las 60 por minuto.
"""

from __future__ import annotations

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.versionado import PREFIJO_API
from app.db import get_db
from app.main import app


@pytest_asyncio.fixture
async def cliente(async_db):
    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _restantes(respuesta) -> int:
    return int(respuesta.headers["X-RateLimit-Remaining"])


async def test_sin_barra_no_redirige(cliente):
    r = await cliente.get(f"{PREFIJO_API}/tenders", params={"limit": 1})
    assert r.status_code == 200, r.headers.get("location")
    assert set(r.json()) >= {"items", "total"}


async def test_con_y_sin_barra_responden_lo_mismo(cliente):
    sin = await cliente.get(f"{PREFIJO_API}/tenders", params={"limit": 3})
    con = await cliente.get(f"{PREFIJO_API}/tenders/", params={"limit": 3})
    assert sin.json()["total"] == con.json()["total"]


async def test_una_consulta_sin_barra_gasta_una_sola_del_limite(cliente):
    primera = await cliente.get(f"{PREFIJO_API}/tenders", params={"limit": 1})
    segunda = await cliente.get(f"{PREFIJO_API}/tenders", params={"limit": 1})
    assert _restantes(primera) - _restantes(segunda) == 1


def test_la_ruta_sin_barra_no_duplica_el_openapi():
    rutas = app.openapi()["paths"]
    assert f"{PREFIJO_API}/tenders/" in rutas
    assert f"{PREFIJO_API}/tenders" not in rutas
