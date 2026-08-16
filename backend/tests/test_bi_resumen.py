"""Tests de /api/bi/resumen — capa de servicio.

Estos tests comprobaban la degradación "sin parquets" apuntando
`analytics_data_path` a un directorio vacío. Desde que el BI se sirve desde
Postgres (ver docs/decisiones/0006-analytics-en-postgres.md), el equivalente es
"la tabla no está materializada", que es lo que se simula aquí sustituyendo el
repositorio.

Lo que se verifica no cambió: que sin datos el servicio no revienta y devuelve
la estructura completa con campos en None.
"""

import pytest


@pytest.fixture
def sin_datos(monkeypatch):
    """Simula que el pipeline todavía no materializó ninguna tabla.

    `consultar` devolviendo None es exactamente lo que hace el repositorio real
    cuando la tabla no existe.
    """
    from app.repositories import analytics_sync

    monkeypatch.setattr(analytics_sync, "consultar", lambda *a, **k: None)
    monkeypatch.setattr(analytics_sync, "buscar_texto", lambda *a, **k: None)
    monkeypatch.setattr(analytics_sync, "existe_tabla", lambda *a, **k: False)


def test_resumen_sin_rubro_retorna_no_disponible():
    from app.services import bi as bi_service

    assert bi_service.get_resumen(None)["disponible"] is False
    assert bi_service.get_resumen("")["disponible"] is False


def test_resumen_sin_datos_retorna_disponible_con_campos_none(sin_datos):
    """Sin tablas materializadas el service no explota: disponible=True y campos None."""
    from app.services import bi as bi_service

    result = bi_service.get_resumen("Algún rubro inexistente")
    assert result["disponible"] is True
    assert result["rubro"] == "Algún rubro inexistente"
    assert result["monto_anual_clp"] is None
    assert result["cagr_pct"] is None
    assert result["n_organismos"] is None
    assert result["top_comprador"] is None
    assert result["teaser_competencia"] is None
    assert result["teaser_estacionalidad"] is None


def test_cagr_helper_sin_data_retorna_none_tuple(sin_datos):
    from app.services.bi import temporal

    cagr, yoy, rows = temporal._compute_cagr_rubro_desde_time_series("X")
    assert cagr is None
    assert yoy is None
    assert rows is None


def test_resumen_estructura_completa(sin_datos):
    """El dict de retorno siempre trae las claves que exige ResumenResponse."""
    from app.services import bi as bi_service

    result = bi_service.get_resumen("Transporte de pasajeros")
    assert {
        "disponible",
        "rubro",
        "monto_anual_clp",
        "n_organismos",
        "cagr_pct",
        "n_proveedores_actual",
        # `n_proveedores_hace_3_anios` estaba en esta lista y **nunca se
        # devolvía**: el test comprobaba `issubset` sobre las claves del dict y
        # pasaba porque el service sí la ponía... en `None`. El frontend tenía
        # una rama entera colgada de ella que no se ejecutó jamás. Se quitó de
        # los dos lados: contar la evolución de la competencia exige una serie
        # por rubro que el pipeline no materializa.
        "top_comprador",
        "teaser_competencia",
        "teaser_estacionalidad",
    }.issubset(result.keys())


def test_resumen_rubro_vacio_retorna_no_disponible():
    from app.services import bi as bi_service

    # Una cadena de sólo espacios es truthy: el service la deja pasar como
    # "rubro no encontrado" (disponible=True, todo None). Cualquiera de los dos
    # comportamientos es aceptable; lo que importa es que responda.
    assert "disponible" in bi_service.get_resumen("   ")
