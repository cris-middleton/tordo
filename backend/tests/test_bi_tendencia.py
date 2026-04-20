"""Tests for /api/bi/tendencia serie_anual extension."""
import pytest


def test_tendencia_sin_rubro_no_serie_anual():
    """Without a rubro filter, serie_anual must be None regardless of data availability."""
    from app.services import bi_service

    result = bi_service.get_tendencia(rubro=None, tendencia=None, solo_emergentes=False, limit=10)
    # disponible depends on whether parquets exist; serie_anual must be None when no rubro filtered
    if result.get("disponible"):
        assert result.get("serie_anual") is None


def test_tendencia_con_rubro_serie_anual_definida_o_none(monkeypatch, tmp_path):
    """With rubro filtered, serie_anual may exist or be None (no parquet).
    The endpoint must not raise regardless."""
    from app.services import bi_service
    from app import config

    monkeypatch.setattr(config.settings, "analytics_data_path", str(tmp_path))
    bi_service._cache.clear()

    result = bi_service.get_tendencia(
        rubro="Algún rubro", tendencia=None, solo_emergentes=False, limit=10
    )
    # Without parquets, serie_anual stays None but the call must not raise
    assert "serie_anual" in result or result.get("disponible") is False


def test_tendencia_response_schema_includes_serie_anual():
    """TendenciaResponse Pydantic schema must include the serie_anual field."""
    from app.schemas.bi import TendenciaResponse, SerieAnualPunto

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
