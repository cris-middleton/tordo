"""`sector_dashboard` escribe su ventana (identidad §3.3).

La portada dice de qué meses es el gasto por sector; sin `ventana_desde` y
`ventana_hasta`, una cifra se lee como «de siempre». Como las bandas y
`competitors_by_market`: se ancla en el último mes de los DATOS, no en hoy
(ver `test_ventana_analytics.py`).
"""

from datetime import date

import polars as pl
import pytest

from etl.analytics import data_loader, sector_intelligence


def _ordenes(anio: int, mes: int) -> pl.DataFrame:
    """Tres órdenes de un mes: dos de Salud y una municipal."""
    return pl.DataFrame(
        {
            "Codigo": [f"{anio}-{mes}-1", f"{anio}-{mes}-2", f"{anio}-{mes}-3"],
            "FechaCreacion": [f"{anio}-{mes:02d}-05"] * 3,
            "FechaEnvio": [f"{anio}-{mes:02d}-05"] * 3,
            "FechaAceptacion": [f"{anio}-{mes:02d}-06"] * 3,
            "CodigoOrganismoPublico": ["7248", "7248", "1001"],
            "OrganismoPublico": ["HOSPITAL A", "HOSPITAL A", "MUNICIPALIDAD B"],
            "sector": ["Salud", "Salud", "Municipalidades"],
            "CodigoProveedor": ["P1", "P2", "P1"],
            "NombreProveedor": ["EMPRESA UNO SPA", "EMPRESA DOS SPA", "EMPRESA UNO SPA"],
            "RutSucursal": ["76.111.111-1", "76.222.222-2", "76.111.111-1"],
            "RubroN2": ["Aseo", "Aseo", "Aseo"],
            "MontoTotalOC_PesosChilenos": ["1000000", "2000000", "500000"],
            "totalLineaNeto": ["1000000", "2000000", "500000"],
            "_periodo_archivo": [f"{anio}-{mes}"] * 3,
        }
    )


@pytest.fixture
def salida(tmp_path, monkeypatch):
    """Dos meses de OC (mayo y junio de 2025) y una carpeta de salida propia."""
    oc = tmp_path / "oc"
    oc.mkdir()
    for anio, mes in [(2025, 5), (2025, 6)]:
        _ordenes(anio, mes).write_parquet(oc / f"{anio}-{mes}.parquet")
    analytics = tmp_path / "analytics"
    analytics.mkdir()
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")
    # El módulo importó la ruta al cargarse: hay que moverla también ahí.
    monkeypatch.setattr(sector_intelligence, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(sector_intelligence, "OUTPUT_DIR", analytics)
    return analytics


def test_el_tablero_escribe_la_ventana_de_36_meses_en_cada_fila(salida):
    sector_intelligence.run_sector_intelligence()

    tabla = pl.read_parquet(salida / "sector_dashboard.parquet")
    assert set(tabla["sector"]) == {"Salud", "Municipalidades"}
    # Junio de 2025 hacia atrás 36 meses: desde julio de 2022. El último día es el fin
    # de junio, que ya pasó (no pasa de hoy).
    assert set(tabla["ventana_desde"]) == {date(2022, 7, 1)}
    assert set(tabla["ventana_hasta"]) == {date(2025, 6, 30)}
    # Las cifras no cambian por llevar ventana.
    salud = tabla.filter(pl.col("sector") == "Salud").row(0, named=True)
    assert (salud["n_oc"], salud["monto_total"]) == (4, 6_000_000.0)


def test_sin_ordenes_no_aparece_una_fila_fantasma(tmp_path, monkeypatch):
    """`con_ventana` sobre un DataFrame vacío fabricaría una fila de puras fechas."""
    vacio = tmp_path / "oc"
    vacio.mkdir()
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", vacio)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")
    monkeypatch.setattr(sector_intelligence, "OC_PARQUET_DIR", vacio)
    monkeypatch.setattr(sector_intelligence, "OUTPUT_DIR", tmp_path)

    tablero = sector_intelligence.run_sector_intelligence()["sector"]

    assert tablero.height == 0
