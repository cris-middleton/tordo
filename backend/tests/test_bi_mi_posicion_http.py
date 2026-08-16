"""`/api/v1/bi/mi_posicion` se prueba POR HTTP, y ése es el punto.

El endpoint leía `empresa.rut` cuando la columna es `rut_empresa`. Devolvía 500
en **todas** las llamadas, en la pantalla principal de BI, durante nueve días
desde que se señaló. No lo destapó nada porque los tests que había llamaban a la
función del servicio: un atributo que no existe en el modelo sólo aparece
ejecutando la ruta completa.

Es la misma lección de `test_mcp.py` —hablar el protocolo en vez de llamar a la
función— aplicada a un endpoint HTTP.

**Cliente propio y no la fixture `client`.** Aquélla usa `TestClient`, que
ejecuta el ciclo de vida de la aplicación en cada test; el gestor de sesiones del
servidor MCP sólo admite un `.run()` por instancia, así que a partir del segundo
revienta. `AsyncClient` sobre `ASGITransport` habla con la misma aplicación sin
levantar su ciclo de vida, que es lo que ya hace `test_limites_por_clave.py`.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio

from app.core.versionado import PREFIJO_API


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


@pytest.mark.asyncio
async def test_mi_posicion_no_revienta(cliente, sample_empresa, cabeceras_owner):
    """Sin analytics materializado la respuesta puede ser «no disponible».
    Lo que NO puede ser es un 500."""
    r = await cliente.get(
        f"{PREFIJO_API}/bi/mi_posicion",
        params={"empresa_id": str(sample_empresa.id), "rubro": "Servicios de aseo"},
        headers=cabeceras_owner,
    )
    assert r.status_code != 500, r.text
    assert r.status_code in (200, 503), r.text


@pytest.mark.asyncio
async def test_mi_posicion_sin_rut_lo_dice_en_vez_de_fallar(
    cliente, async_db, sample_empresa, cabeceras_owner
):
    """El camino que el bug hacía inalcanzable: cuando no hay RUT, hay que
    devolver un motivo legible, no una excepción."""
    sample_empresa.rut_empresa = ""
    await async_db.flush()

    r = await cliente.get(
        f"{PREFIJO_API}/bi/mi_posicion",
        params={"empresa_id": str(sample_empresa.id), "rubro": "Servicios de aseo"},
        headers=cabeceras_owner,
    )
    if r.status_code == 503:
        pytest.skip("FEATURE_ANALYTICS apagada en este entorno")
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["disponible"] is False
    assert "RUT" in (cuerpo.get("motivo") or "")


@pytest.mark.asyncio
async def test_mi_posicion_de_otra_empresa_no_se_puede_mirar(cliente, cabeceras_owner):
    """Tenancy: el endpoint recibe `empresa_id` por query, que es justo la forma
    en que se olvida la comprobación."""
    r = await cliente.get(
        f"{PREFIJO_API}/bi/mi_posicion",
        params={"empresa_id": str(uuid4()), "rubro": "Servicios de aseo"},
        headers=cabeceras_owner,
    )
    assert r.status_code in (403, 404, 503), r.text
