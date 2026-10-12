"""`periodo`: de qué meses sale una banda o una cuota. Sin él se lee «de siempre»."""

from datetime import date

import polars as pl

from app.schemas.bi import CompetidoresResponse, PrecioResponse
from app.services.bi._base import periodo_de


def test_periodo_de_una_tabla_con_ventana():
    df = pl.DataFrame(
        {
            "x": [1, 2],
            "ventana_desde": [date(2025, 4, 1)] * 2,
            "ventana_hasta": [date(2026, 3, 31)] * 2,
        }
    )
    assert periodo_de(df) == {"desde": "2025-04-01", "hasta": "2026-03-31"}


def test_sin_columnas_ni_filas_no_hay_periodo():
    assert periodo_de(None) is None
    assert periodo_de(pl.DataFrame({"x": [1]})) is None
    assert periodo_de(pl.DataFrame({"ventana_desde": [], "ventana_hasta": []})) is None


def test_las_respuestas_lo_declaran():
    """Si el esquema no lo declarara, FastAPI lo quitaría en silencio."""
    periodo = {"desde": "2025-04-01", "hasta": "2026-03-31"}
    assert PrecioResponse(disponible=True, periodo=periodo).model_dump()["periodo"] == {
        "desde": date(2025, 4, 1),
        "hasta": date(2026, 3, 31),
    }
    assert CompetidoresResponse(disponible=True, periodo=periodo).periodo.desde == date(2025, 4, 1)
