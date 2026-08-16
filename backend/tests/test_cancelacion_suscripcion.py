"""Cancelar la suscripción desde el producto.

El endpoint existe porque MercadoPago no hospeda portal: sin él, la única forma
de dejar de pagar sería escribirle al desarrollador. Lo que se comprueba:

- que sólo puede cancelar quien manda en la empresa (un `viewer` no);
- que se le pide a la pasarela de verdad, no sólo se marca en la base;
- que un fallo de la pasarela NO deja la base diciendo "cancelada" mientras el
  cobro sigue vivo — que es la forma cara de equivocarse aquí.
"""

from __future__ import annotations

import pytest
import pytest_asyncio

from app.domain.billing import ErrorDeCobro


@pytest_asyncio.fixture
async def cliente(async_db):
    """Cliente HTTP sobre ASGI, compartiendo el mismo bucle de eventos que la
    sesión de test. `TestClient` levanta la app en otro hilo con su propio
    bucle, y compartir ahí la conexión asyncpg de `async_db` revienta con
    "got result for unknown protocol state"."""
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
def pasarela(monkeypatch):
    """Sustituye al proveedor por uno que registra lo que le piden."""
    from app.infra import billing as infra

    llamadas: list[str] = []

    class Falsa:
        nombre = "mercadopago"
        soporta_suscripcion_recurrente = True
        tiene_portal_de_gestion = False
        fallar = False

        def cancelar_suscripcion(self, subscription_id: str) -> str | None:
            if Falsa.fallar:
                raise ErrorDeCobro("MercadoPago respondió 500")
            llamadas.append(subscription_id)
            return "2026-09-01T00:00:00-04:00"

    falsa = Falsa()
    monkeypatch.setattr(infra, "obtener_proveedor", lambda: falsa)
    monkeypatch.setattr("app.api.billing.obtener_proveedor", lambda: falsa)
    falsa.llamadas = llamadas
    Falsa.fallar = False
    return falsa


@pytest.mark.asyncio
async def test_cancelar_le_pide_la_baja_a_la_pasarela(
    cliente, async_db, sample_empresa, cabeceras_owner, pasarela
):
    sample_empresa.plan_tier = "pro"
    sample_empresa.subscription_status = "active"
    sample_empresa.billing_subscription_id = "preapproval-123"
    await async_db.flush()

    respuesta = await cliente.post(
        f"/api/v1/billing/cancelar?empresa_id={sample_empresa.id}", headers=cabeceras_owner
    )

    assert respuesta.status_code == 200, respuesta.text
    assert pasarela.llamadas == ["preapproval-123"], (
        "se marcó la baja en la base sin pedírsela a la pasarela: el cobro seguiría vivo"
    )
    assert respuesta.json()["subscription_status"] == "canceled"
    assert respuesta.json()["vigente_hasta"].startswith("2026-09-01")


@pytest.mark.asyncio
async def test_cancelar_sin_indicar_empresa_usa_la_unica_del_usuario(
    cliente, async_db, sample_empresa, cabeceras_owner, pasarela
):
    """El caso normal: onboarding crea una sola empresa y el frontend no manda
    `empresa_id`. Si `/billing/cancelar` lo exigiera como los demás endpoints de
    `/billing` no lo hacen, esto respondería 422 en vez de 200."""
    sample_empresa.plan_tier = "pro"
    sample_empresa.subscription_status = "active"
    sample_empresa.billing_subscription_id = "preapproval-123"
    await async_db.flush()

    respuesta = await cliente.post("/api/v1/billing/cancelar", headers=cabeceras_owner)

    assert respuesta.status_code == 200, respuesta.text
    assert pasarela.llamadas == ["preapproval-123"]
    assert respuesta.json()["subscription_status"] == "canceled"


@pytest.mark.asyncio
async def test_si_la_pasarela_falla_la_empresa_no_queda_cancelada(
    cliente, async_db, sample_empresa, cabeceras_owner, pasarela
):
    sample_empresa.plan_tier = "pro"
    sample_empresa.subscription_status = "active"
    sample_empresa.billing_subscription_id = "preapproval-123"
    await async_db.flush()
    type(pasarela).fallar = True

    respuesta = await cliente.post(
        f"/api/v1/billing/cancelar?empresa_id={sample_empresa.id}", headers=cabeceras_owner
    )

    assert respuesta.status_code == 502
    await async_db.refresh(sample_empresa)
    assert sample_empresa.subscription_status == "active", (
        "la base dice 'cancelada' y la pasarela sigue cobrando: el peor de los dos mundos"
    )


@pytest.mark.asyncio
async def test_un_viewer_no_puede_cancelar(
    cliente, async_db, sample_empresa, cabeceras_viewer, pasarela
):
    sample_empresa.billing_subscription_id = "preapproval-123"
    await async_db.flush()

    respuesta = await cliente.post(
        f"/api/v1/billing/cancelar?empresa_id={sample_empresa.id}", headers=cabeceras_viewer
    )
    assert respuesta.status_code == 403
    assert pasarela.llamadas == []


@pytest.mark.asyncio
async def test_sin_suscripcion_activa_se_dice_claro(
    cliente, async_db, sample_empresa, cabeceras_owner, pasarela
):
    sample_empresa.billing_subscription_id = None
    await async_db.flush()

    respuesta = await cliente.post(
        f"/api/v1/billing/cancelar?empresa_id={sample_empresa.id}", headers=cabeceras_owner
    )
    assert respuesta.status_code == 400
    assert "suscripción" in respuesta.json()["detail"].lower()
