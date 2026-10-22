"""`buyer_scoring`: lo que la ficha pública del comprador lee de `buyer_scores`.

El nombre venía sólo del archivo de licitaciones: un comprador con órdenes y sin
licitaciones en la ventana salía sin nombre (47 de 1.303 en la copia local) y su
ficha, con el título vacío. Y sin ningún archivo de licitaciones el módulo
entero reventaba en el join.
"""

from __future__ import annotations

import polars as pl
import pytest

from etl.analytics import buyer_scoring, data_loader


def _orden(codigo, organismo, nombre, periodo, estado="Recepcion Conforme"):
    anio, mes = periodo.split("-")
    fecha = f"{anio}-{int(mes):02d}-05"
    return {
        "Codigo": codigo,
        "CodigoOrganismoPublico": organismo,
        "OrganismoPublico": nombre,
        "sector": "Otros",
        "RegionUnidadCompra": "Región de Los Lagos",
        "FechaCreacion": fecha,
        "FechaEnvio": fecha,
        "FechaAceptacion": fecha,
        "Estado": estado,
        "Tipo": "SE",
        "MontoTotalOC": "1000",
        "TipoMonedaOC": "CLP",
        "MontoTotalOC_PesosChilenos": "1000",
        "totalLineaNeto": "1000",
        "monedaItem": "CLP",
        "PromedioCalificacion": "4,5",
        "CodigoProveedor": "P1",
        "RutSucursal": "77.000.000-1",
        "_periodo_archivo": periodo,
    }


@pytest.fixture
def ordenes(tmp_path, monkeypatch):
    oc = tmp_path / "oc"
    oc.mkdir()
    # 1817958 sólo tiene órdenes, y cambió de nombre en diciembre: vale el de
    # diciembre aunque «2025-9» > «2025-12» como texto.
    for periodo, nombre in (("2025-9", "CORPORACION VIEJA"), ("2025-12", "CORPORACION OSORNO")):
        pl.DataFrame(
            [_orden(f"{periodo}-{i}", "1817958", nombre, periodo) for i in range(8)]
            + [_orden(f"{periodo}-H{i}", "7084", "HOSPITAL (OC)", periodo) for i in range(8)]
        ).write_parquet(oc / f"{periodo}.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")
    return oc


def test_un_comprador_sin_licitaciones_se_llama_como_en_sus_ordenes(ordenes):
    lic = pl.DataFrame(
        {
            "CodigoOrganismo": ["7084"],
            "NombreOrganismo": ["HOSPITAL"],
            "n_lic": [3],
            "tasa_adjudicacion": [1.0],
            "n_revocadas": [0],
            "n_desiertas": [0],
            "prom_oferentes": [2.0],
            "prom_reclamos": [0.0],
        }
    )
    scores = buyer_scoring.compute_buyer_scores(buyer_scoring.build_oc_buyer_metrics(), lic)
    nombres = dict(scores.select("CodigoOrganismoPublico", "NombreOrganismo").iter_rows())
    assert nombres == {"1817958": "CORPORACION OSORNO", "7084": "HOSPITAL"}


def test_sin_archivos_de_licitaciones_el_modulo_no_revienta(ordenes):
    lic = buyer_scoring.build_lic_buyer_metrics()
    assert lic.is_empty()
    assert "CodigoOrganismo" in lic.columns
    scores = buyer_scoring.compute_buyer_scores(buyer_scoring.build_oc_buyer_metrics(), lic)
    assert scores.height == 2
    assert scores["NombreOrganismo"].null_count() == 0
