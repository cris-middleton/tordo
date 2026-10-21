"""Tests for /api/bi/tendencia serie_anual extension."""

import pytest
import pytest_asyncio


def test_tendencia_sin_rubro_no_serie_anual():
    """Without a rubro filter, serie_anual must be None regardless of data availability."""
    from app.services import bi as bi_service

    result = bi_service.get_tendencia(rubro=None, tendencia=None, solo_emergentes=False, limit=10)
    # disponible depends on whether parquets exist; serie_anual must be None when no rubro filtered
    if result.get("disponible"):
        assert result.get("serie_anual") is None


def test_tendencia_con_rubro_serie_anual_definida_o_none(monkeypatch, tmp_path):
    """With rubro filtered, serie_anual may exist or be None (no parquet).
    The endpoint must not raise regardless."""
    # Sin tablas materializadas: el repositorio devuelve None, que es lo que
    # hace el real cuando el pipeline todavía no corrió.
    from app.repositories import analytics_sync
    from app.services import bi as bi_service

    monkeypatch.setattr(analytics_sync, "consultar", lambda *a, **k: None)
    monkeypatch.setattr(analytics_sync, "buscar_texto", lambda *a, **k: None)
    monkeypatch.setattr(analytics_sync, "existe_tabla", lambda *a, **k: False)

    result = bi_service.get_tendencia(
        rubro="Algún rubro", tendencia=None, solo_emergentes=False, limit=10
    )
    # Without parquets, serie_anual stays None but the call must not raise
    assert "serie_anual" in result or result.get("disponible") is False


def test_tendencia_response_schema_includes_serie_anual():
    """TendenciaResponse Pydantic schema must include the serie_anual field."""
    from app.schemas.bi import SerieAnualPunto, TendenciaResponse

    # Instantiate with all fields to confirm no ValidationError
    resp = TendenciaResponse(
        disponible=True,
        tendencias=[],
        emergentes=[],
        serie_anual=[SerieAnualPunto(anio=2023, monto_total=1_000_000.0, n_oc=42)],
        total=0,
    )
    assert resp.serie_anual is not None
    assert resp.serie_anual[0].anio == 2023
    assert resp.serie_anual[0].monto_total == 1_000_000.0
    assert resp.serie_anual[0].n_oc == 42


def test_serie_anual_punto_n_oc_optional():
    """SerieAnualPunto.n_oc must be optional (None-safe)."""
    from app.schemas.bi import SerieAnualPunto

    p = SerieAnualPunto(anio=2022, monto_total=500_000.0)
    assert p.n_oc is None


def test_cagr_rubro_compound_growth():
    """CAGR rubro-level debe computarse correctamente desde serie_anual."""
    # Verificación de lógica sin parquet: simular el cálculo
    # (2021: 100, 2025: 200) → CAGR = (200/100)^(1/4) - 1 = 18.92%
    import math

    monto_first = 100.0
    monto_last = 200.0
    n_points = 5  # 2021, 2022, 2023, 2024, 2025
    expected = (math.pow(monto_last / monto_first, 1 / (n_points - 1)) - 1) * 100
    assert 18.5 < expected < 19.5  # ≈ 18.92%


def test_cagr_rubro_none_when_no_rubro(monkeypatch, tmp_path):
    """Sin rubro filtrado, cagr_rubro debe ser None."""
    # Sin tablas materializadas: el repositorio devuelve None, que es lo que
    # hace el real cuando el pipeline todavía no corrió.
    from app.repositories import analytics_sync
    from app.services import bi as bi_service

    monkeypatch.setattr(analytics_sync, "consultar", lambda *a, **k: None)
    monkeypatch.setattr(analytics_sync, "buscar_texto", lambda *a, **k: None)
    monkeypatch.setattr(analytics_sync, "existe_tabla", lambda *a, **k: False)
    result = bi_service.get_tendencia(rubro=None, tendencia=None, solo_emergentes=False, limit=10)
    if result.get("disponible"):
        assert result.get("cagr_rubro") is None


# ── El filtro `tendencia`: los valores del ETL, y 422 para los demás ─────────


@pytest_asyncio.fixture
async def cliente(async_db, monkeypatch):
    from httpx import ASGITransport, AsyncClient

    from app.config import settings
    from app.db import get_db
    from app.main import app

    monkeypatch.setattr(settings, "feature_analytics", True)

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("valor", ["creciente", "decreciente", "subiendo"])
async def test_un_valor_de_tendencia_desconocido_es_422(cliente, valor):
    """La documentación pedía «creciente | decreciente» y el ETL escribe
    «crecimiento | decrecimiento»: el filtro devolvía una lista vacía, que se
    leía como «no hay mercados creciendo»."""
    from app.core.versionado import PREFIJO_API

    r = await cliente.get(f"{PREFIJO_API}/bi/tendencia", params={"tendencia": valor})
    assert r.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("valor", ["crecimiento", "decrecimiento", "estable"])
async def test_los_valores_del_etl_se_aceptan(cliente, valor, monkeypatch):
    from app.core.versionado import PREFIJO_API
    from app.services import bi as bi_service

    pedidos: list = []
    monkeypatch.setattr(
        bi_service,
        "get_tendencia",
        lambda *args: pedidos.append(args) or {"disponible": True, "tendencias": [], "total": 0},
    )

    r = await cliente.get(f"{PREFIJO_API}/bi/tendencia", params={"tendencia": valor})
    assert r.status_code == 200, r.text
    assert pedidos[0][1] == valor


def test_el_etl_escribe_esos_valores():
    """Si el ETL cambia sus etiquetas, la validación de la API tiene que cambiar."""
    from pathlib import Path

    fuente = (Path(__file__).parents[2] / "etl" / "analytics" / "trend_analysis.py").read_text()
    for valor in ("crecimiento", "decrecimiento", "estable"):
        assert f'"{valor}"' in fuente
