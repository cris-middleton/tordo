"""Alta de un competidor vigilado, vista desde HTTP.

Lo que se fija aquí: un RUT con el dígito verificador equivocado se rechaza
**antes** de guardarse. Sin esto, el seguimiento se crea igual, nunca coincide
con nada de ChileCompra —el RUT que llega en las órdenes es distinto— y el
usuario no se entera de que escribió mal el RUT: sólo de que "nunca avisa".
"""

from __future__ import annotations

import pytest
import pytest_asyncio

from app.core.versionado import PREFIJO_API
from app.services import api_keys


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


@pytest_asyncio.fixture
async def autenticado(cliente, async_db, sample_empresa, sample_user):
    """Cliente que ya lleva credencial de un `owner` de la empresa."""
    clave, _ = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="pruebas", creada_por=sample_user.id
    )
    cliente.headers["Authorization"] = f"Bearer {clave}"
    return cliente


@pytest.mark.asyncio
async def test_un_rut_con_digito_verificador_incorrecto_es_rechazado(autenticado, sample_empresa):
    """76543210-3 es válido; -4 no lo es. Antes sólo se exigía largo mínimo, así
    que esto se guardaba igual y el seguimiento nunca hubiera coincidido con
    nada — fallando en silencio, sin decirle al usuario que escribió mal."""
    r = await autenticado.post(
        f"{PREFIJO_API}/empresas/{sample_empresa.id}/competidores",
        json={"rut": "76543210-4", "nombre": "Constructora Rival"},
    )

    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_un_rut_valido_se_acepta(autenticado, sample_empresa):
    r = await autenticado.post(
        f"{PREFIJO_API}/empresas/{sample_empresa.id}/competidores",
        json={"rut": "76.543.210-3", "nombre": "Constructora Rival"},
    )

    assert r.status_code == 201, r.text
    assert r.json()["rut"] == "76.543.210-3"
