"""Los montos de licitaciones llegan como número: coma decimal y notación científica.

El archivo masivo de licitaciones escribe los montos grandes como «2,5e+07». Cada
módulo hacía su propio `cast(Float64, strict=False)`, que los convertía en nulo:
el 21 % de las licitaciones no tenía presupuesto, y sesgado hacia los redondos.
"""

from __future__ import annotations

import polars as pl
import pytest

from etl.analytics import data_loader, discount_optimizer


def _licitacion(codigo, estimado, linea, oferentes="3"):
    return {
        "CodigoExterno": codigo,
        "CodigoTipo": "LE",
        "Rubro2": "Vigilancia",
        "NumeroOferentes": oferentes,
        "MontoEstimado": estimado,
        "MontoLineaAdjudica": linea,
        "Estado": "Adjudicada",
        "CodigoOrganismo": "7084",
        "NombreOrganismo": "HOSPITAL",
        "sector": "Salud",
        "FechaCreacion": "2026-03-02",
    }


@pytest.fixture
def archivo_lic(tmp_path, monkeypatch):
    lic = tmp_path / "lic"
    lic.mkdir()
    pl.DataFrame(
        [
            _licitacion("A-1-LE26", "2,5e+07", "2,1e+07"),
            _licitacion("B-1-LE26", "1000000", "900000,5"),
            _licitacion("C-1-LE26", "1,053e+09", "8,4e+08"),
            _licitacion("D-1-LE26", "NA", "500000"),
        ]
    ).write_parquet(lic / "2026-3.parquet")
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", lic)
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", tmp_path / "oc")
    return lic


def test_el_cargador_lee_la_coma_y_la_notacion_cientifica(archivo_lic):
    ((_, df),) = list(
        data_loader.iter_lic_parquets(
            columns=["CodigoExterno", "MontoEstimado", "MontoLineaAdjudica", "NumeroOferentes"]
        )
    )
    montos = dict(zip(df["CodigoExterno"], df["MontoEstimado"], strict=True))
    assert montos == {
        "A-1-LE26": 25_000_000.0,
        "B-1-LE26": 1_000_000.0,
        "C-1-LE26": 1_053_000_000.0,
        "D-1-LE26": None,  # «NA» es «sin dato», no cero
    }
    assert df["MontoLineaAdjudica"].to_list() == [21_000_000.0, 900_000.5, 840_000_000.0, 500_000.0]
    assert df["NumeroOferentes"].dtype == pl.Float64


def test_el_descuento_cuenta_las_licitaciones_de_presupuesto_redondo(archivo_lic):
    descuentos = discount_optimizer.extract_lic_discounts()
    por_codigo = dict(zip(descuentos["CodigoExterno"], descuentos["discount"], strict=True))
    # Antes sólo entraba la de «1000000»: las de notación científica se perdían.
    assert set(por_codigo) == {"A-1-LE26", "B-1-LE26", "C-1-LE26"}
    assert por_codigo["A-1-LE26"] == pytest.approx(0.16)
    assert por_codigo["C-1-LE26"] == pytest.approx(1 - 840 / 1053)
