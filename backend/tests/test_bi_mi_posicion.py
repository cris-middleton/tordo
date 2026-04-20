"""Tests for /api/bi/mi_posicion endpoint."""
import pytest


def test_normalize_rut():
    from app.services.bi_service import _normalize_rut
    assert _normalize_rut("12.345.678-9") == "12345678-9"
    assert _normalize_rut("123456789") == "12345678-9"
    assert _normalize_rut("12345678-9") == "12345678-9"
    assert _normalize_rut("12345678-K") == "12345678-K"
    assert _normalize_rut("") == ""
    assert _normalize_rut(None) == ""
    assert _normalize_rut("   ") == ""


def test_mi_posicion_sin_rut_o_rubro_retorna_no_disponible():
    from app.services import bi_service
    result = bi_service.get_mi_posicion("", "Equipos médicos")
    assert result["disponible"] is False
    assert result["tiene_historial"] is False

    result = bi_service.get_mi_posicion("12345678-9", "")
    assert result["disponible"] is False
    assert result["tiene_historial"] is False


def test_mi_posicion_sin_parquets_retorna_no_disponible(monkeypatch, tmp_path):
    from app.services import bi_service
    from app import config
    monkeypatch.setattr(config.settings, "analytics_data_path", str(tmp_path))
    bi_service._cache.clear()
    result = bi_service.get_mi_posicion("12345678-9", "Algún rubro")
    assert result["disponible"] is False
