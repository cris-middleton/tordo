"""Un percentil de la ventana sale de todas sus observaciones, no de promediar los de cada mes.

`price_benchmarking` (la banda L4 de la API de precio), `sector_dashboard`
(`ticket_mediana`) y `buyer_scoring` (los días de aceptación, que deciden dos
banderas de la ficha del comprador) calculaban la mediana y los percentiles de
cada archivo mensual y luego los promediaban ponderando por el número de
observaciones. El promedio de las medianas de cada mes no es la mediana de la
ventana: en un comprador que compra una vez al mes, el p10, la mediana y el p90
de cada mes son esa única compra, y la banda de 36 meses salía con p10 = p90.
"""

from __future__ import annotations

import polars as pl
import pytest

from etl.analytics import buyer_scoring, data_loader, price_benchmarking, sector_intelligence

#: Una compra por mes, de montos muy distintos: lo peor para el promedio de percentiles.
MONTOS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 10_000]
#: Y un mes con muchas compras chicas, para que la mediana real y el promedio se separen.
MES_GRANDE = [10] * 20


def _orden(codigo, mes, monto, dias=1):
    fecha = f"2025-{mes:02d}-03"
    acepta = f"2025-{mes:02d}-{3 + dias:02d}"
    return {
        "Codigo": codigo,
        "CodigoOrganismoPublico": "7084",
        "OrganismoPublico": "HOSPITAL",
        "sector": "Salud",
        "RubroN2": "Papelería",
        "CodigoProveedor": f"P{codigo}",
        "NombreProveedor": "EMPRESA SPA",
        "RutSucursal": "77.000.000-1",
        "FechaCreacion": fecha,
        "FechaEnvio": fecha,
        "FechaAceptacion": acepta,
        "Estado": "Aceptada",
        "Tipo": "SE",
        "MontoTotalOC": str(monto),
        "TipoMonedaOC": "CLP",
        "MontoTotalOC_PesosChilenos": str(monto),
        "totalLineaNeto": str(monto),
        "monedaItem": "CLP",
        "PromedioCalificacion": "4",
        "_periodo_archivo": f"2025-{mes}",
    }


@pytest.fixture
def ordenes(tmp_path, monkeypatch):
    oc = tmp_path / "oc"
    oc.mkdir()
    for mes, monto in enumerate(MONTOS, start=1):
        filas = [_orden(f"{mes}-a", mes, monto, dias=mes)]
        if mes == len(MONTOS):  # el último mes, además, muchas compras chicas y rápidas
            filas += [_orden(f"{mes}-c{i}", mes, m, dias=0) for i, m in enumerate(MES_GRANDE)]
        pl.DataFrame(filas).write_parquet(oc / f"2025-{mes}.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")
    return oc


def _todas():
    return pl.Series([float(m) for m in MONTOS + MES_GRANDE])


def test_la_banda_del_organismo_es_la_de_todas_sus_ordenes(ordenes):
    banda = price_benchmarking.build_price_aggregates().row(0, named=True)
    todas = _todas()
    assert banda["n_transacciones"] == len(todas)
    assert banda["precio_mediana"] == pytest.approx(todas.median())
    assert banda["p10"] == pytest.approx(todas.quantile(0.10))
    assert banda["p90"] == pytest.approx(todas.quantile(0.90))
    assert banda["p10"] < banda["p90"]


def test_el_ticket_mediano_del_sector_es_la_mediana_de_sus_ordenes(ordenes):
    fila = sector_intelligence.build_sector_dashboard().row(0, named=True)
    todas = _todas()
    assert fila["n_oc"] == len(todas)
    assert fila["ticket_mediana"] == pytest.approx(todas.median())
    assert fila["ticket_promedio"] == pytest.approx(todas.mean())


def test_los_dias_de_aceptacion_son_los_de_todas_sus_ordenes(ordenes):
    fila = buyer_scoring.build_oc_buyer_metrics().row(0, named=True)
    dias = pl.Series([float(m) for m in range(1, 11)] + [0.0] * len(MES_GRANDE))
    assert fila["n_con_fecha_aceptacion"] == len(dias)
    assert fila["mediana_dias_aceptacion"] == pytest.approx(dias.median())
    assert fila["p90_dias_aceptacion"] == pytest.approx(dias.quantile(0.90))
