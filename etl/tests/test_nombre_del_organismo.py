"""Un organismo, un nombre en `competitors_by_market` y `market_concentration`.

El nombre vigente se elegía por fila (organismo, rubro, proveedor): un proveedor
que sólo le vendió antes del cambio de nombre dejaba al comprador con el nombre
viejo en esa fila, y `market_concentration` toma el de la fila del líder.
"""

from __future__ import annotations

import polars as pl

from etl.analytics import competitor_analysis, data_loader


def _orden(codigo, proveedor, nombre_org, periodo, monto):
    anio, mes = periodo.split("-")
    return {
        "Codigo": codigo,
        "CodigoOrganismoPublico": "6941",
        "OrganismoPublico": nombre_org,
        "RubroN2": "Aseo",
        "CodigoProveedor": proveedor,
        "NombreProveedor": f"EMPRESA {proveedor}",
        "RutSucursal": "77.000.000-1",
        "RegionUnidadCompra": "Región de Coquimbo",
        "FechaCreacion": f"{anio}-{int(mes):02d}-05",
        "Estado": "Aceptada",
        "MontoTotalOC": str(monto),
        "TipoMonedaOC": "CLP",
        "MontoTotalOC_PesosChilenos": str(monto),
        "totalLineaNeto": str(monto),
        "monedaItem": "CLP",
        "_periodo_archivo": periodo,
    }


def test_el_lider_que_vendio_antes_del_cambio_de_nombre_no_trae_el_nombre_viejo(
    tmp_path, monkeypatch
):
    oc = tmp_path / "oc"
    oc.mkdir()
    # El líder sólo vendió en septiembre, con el nombre viejo.
    pl.DataFrame(
        [
            _orden(f"9-{i}", "LIDER", "GOBERNACION PROVINCIAL DE LIMARI", "2025-9", 1000)
            for i in range(5)
        ]
    ).write_parquet(oc / "2025-9.parquet")
    pl.DataFrame(
        [
            _orden(f"12-{i}", "OTRO", "DELEGACION PRESIDENCIAL DE LIMARI", "2025-12", 10)
            for i in range(5)
        ]
    ).write_parquet(oc / "2025-12.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")

    markets, _ = competitor_analysis.build_competitor_aggregates()
    assert markets["OrganismoPublico"].unique().to_list() == ["DELEGACION PRESIDENCIAL DE LIMARI"]
    concentracion = competitor_analysis.compute_market_concentration(
        competitor_analysis.compute_market_shares(markets)
    )
    assert concentracion["OrganismoPublico"].to_list() == ["DELEGACION PRESIDENCIAL DE LIMARI"]
