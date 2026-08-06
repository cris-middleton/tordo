"""Tests for /api/bi/mi_posicion endpoint."""


def test_normalize_rut():
    from app.services.bi.competencia import _normalize_rut

    assert _normalize_rut("12.345.678-9") == "12345678-9"
    assert _normalize_rut("123456789") == "12345678-9"
    assert _normalize_rut("12345678-9") == "12345678-9"
    assert _normalize_rut("12345678-K") == "12345678-K"
    assert _normalize_rut("") == ""
    assert _normalize_rut(None) == ""
    assert _normalize_rut("   ") == ""


def test_mi_posicion_sin_rut_o_rubro_retorna_no_disponible():
    from app.services import bi as bi_service

    result = bi_service.get_mi_posicion("", "Equipos médicos")
    assert result["disponible"] is False
    assert result["tiene_historial"] is False

    result = bi_service.get_mi_posicion("12345678-9", "")
    assert result["disponible"] is False
    assert result["tiene_historial"] is False


def test_mi_posicion_sin_parquets_retorna_no_disponible(monkeypatch, tmp_path):
    # Sin tablas materializadas: el repositorio devuelve None, que es lo que
    # hace el real cuando el pipeline todavía no corrió.
    from app.repositories import analytics_sync
    from app.services import bi as bi_service

    monkeypatch.setattr(analytics_sync, "consultar", lambda *a, **k: None)
    monkeypatch.setattr(analytics_sync, "buscar_texto", lambda *a, **k: None)
    monkeypatch.setattr(analytics_sync, "existe_tabla", lambda *a, **k: False)
    result = bi_service.get_mi_posicion("12345678-9", "Algún rubro")
    assert result["disponible"] is False
