"""Integration tests for GET /api/dashboard/home.

Uses the async SQLite fixtures plus FastAPI dependency overrides to exercise
the full async stack without a live Postgres.
"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import get_current_active_user
from app.db import get_db
from app.main import app


def _override(async_db, sample_user):
    async def _get_db():
        yield async_db

    async def _current_user():
        return sample_user

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_active_user] = _current_user


def _clear_overrides():
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_home_endpoint_returns_full_shape(async_db, sample_user, sample_empresa):
    _override(async_db, sample_user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/dashboard/home")
    finally:
        _clear_overrides()

    assert res.status_code == 200, res.text
    body = res.json()
    assert "empresa" in body
    assert body["empresa"] is not None
    assert body["empresa"]["nombre"] == sample_empresa.nombre_empresa
    for key in ("resumen", "urgencias", "matches", "pipeline", "trend", "plan"):
        assert key in body
    assert body["plan"]["tier"] == "paid"
    assert body["plan"]["matches_visibles"] == 3


@pytest.mark.asyncio
async def test_home_endpoint_rejects_empresa_user_is_not_member_of(
    async_db, sample_user, sample_empresa
):
    _override(async_db, sample_user)
    fake_uuid = "00000000-0000-0000-0000-000000000000"
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(f"/api/dashboard/home?empresa_id={fake_uuid}")
    finally:
        _clear_overrides()

    assert res.status_code in (403, 404)


@pytest.mark.asyncio
async def test_home_endpoint_free_tier_caps_matches_visible_at_1(
    async_db, sample_user, sample_empresa
):
    # "Free" significa sin trial: un trial activo resuelve a pro y taparía el
    # caso que este test quiere cubrir.
    sample_empresa.plan_tier = "free"
    sample_empresa.subscription_status = "inactive"
    sample_empresa.trial_ends_at = None
    await async_db.commit()

    _override(async_db, sample_user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/dashboard/home")
    finally:
        _clear_overrides()

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["plan"]["tier"] == "free"
    assert body["plan"]["matches_visibles"] == 1


@pytest.mark.asyncio
async def test_home_endpoint_active_trial_unlocks_paid_tier(async_db, sample_user, sample_empresa):
    """Con un reverse-trial activo, el plan_tier guardado puede seguir en
    'basico' pero se debe ver la experiencia Pro (3 matches, plan.tier='paid').

    El sujeto es la EMPRESA: la suscripción le pertenece a ella (ADR 0002).
    """
    sample_empresa.plan_tier = "basico"
    sample_empresa.subscription_status = "trialing"
    sample_empresa.trial_ends_at = datetime.now(UTC) + timedelta(days=7)
    await async_db.commit()

    _override(async_db, sample_user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/dashboard/home")
    finally:
        _clear_overrides()

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["plan"]["tier"] == "paid"
    assert body["plan"]["matches_visibles"] == 3


@pytest.mark.asyncio
async def test_home_endpoint_expired_trial_falls_back_to_free(
    async_db, sample_user, sample_empresa
):
    """After trial_ends_at passes, user drops back to free-plan UX."""
    sample_empresa.plan_tier = "basico"
    sample_empresa.subscription_status = "trialing"
    sample_empresa.trial_ends_at = datetime.now(UTC) - timedelta(days=1)
    await async_db.commit()

    _override(async_db, sample_user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/dashboard/home")
    finally:
        _clear_overrides()

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["plan"]["tier"] == "free"
    assert body["plan"]["matches_visibles"] == 1
