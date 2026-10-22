"""El panel de una licitación corre fuera del bucle de eventos.

`GET /bi/licitacion/{codigo}/panel` es `async` (lee la licitación con la sesión
async) y después llamaba al servicio de BI, que es SÍNCRONO (psycopg2, una
decena de consultas), directamente desde la corrutina: mientras se armaba un
panel, el único worker no atendía ninguna otra petición. El MCP ya lo corría en
un hilo (`app/mcp/servidor.py`, `_en_hilo`); la ruta REST, no.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
import pytest_asyncio

from app.config import settings
from app.core.versionado import PREFIJO_API
from app.models.licitacion import Licitacion
from app.services import bi as bi_service


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
async def test_el_servicio_del_panel_no_corre_en_el_bucle(cliente, async_db, monkeypatch):
    async_db.add(
        Licitacion(
            codigo_externo="PANEL-HILO-1",
            nombre="Compra de prueba",
            estado="Publicada",
            codigo_organismo="7777",
            fecha_publicacion=datetime.now(UTC),
            items=[{"codigoProductoONU": "44122103"}],
            activo=True,
        )
    )
    await async_db.flush()
    monkeypatch.setattr(settings, "feature_analytics", True)

    llamadas = []

    def panel_falso(**kwargs):
        try:
            asyncio.get_running_loop()
            en_el_bucle = True
        except RuntimeError:
            en_el_bucle = False
        llamadas.append((en_el_bucle, kwargs))
        return {
            "codigo_externo": kwargs["codigo_externo"],
            "organismo_id": kwargs["organismo_id"],
            "comprador": {"disponible": False, "n_flags": 0},
            "ventana": {"disponible": False},
            "competidores": {"disponible": False},
            "precios": [],
        }

    monkeypatch.setattr(bi_service, "get_licitacion_panel", panel_falso)

    r = await cliente.get(f"{PREFIJO_API}/bi/licitacion/PANEL-HILO-1/panel")

    assert r.status_code == 200, r.text
    assert len(llamadas) == 1
    en_el_bucle, kwargs = llamadas[0]
    assert not en_el_bucle, "el servicio síncrono del panel bloqueaba el bucle de eventos"
    assert kwargs == {
        "codigo_externo": "PANEL-HILO-1",
        "organismo_id": "7777",
        "product_codes": ["44122103"],
    }
