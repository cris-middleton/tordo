"""Integration tests for GET /api/dashboard/home.

Uses the async SQLite fixtures plus FastAPI dependency overrides to exercise
the full async stack without a live Postgres.
"""
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
async def test_home_endpoint_free_tier_caps_matches_visible_at_1(async_db, sample_user):
    sample_user.plan_tier = "free"
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
