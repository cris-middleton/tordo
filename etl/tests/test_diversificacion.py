"""`provider_diversification`: el nombre vigente del proveedor y el HHI sin montos.

El nombre salía de la primera fila que llegara (`first()`), no del período más
reciente. Y un proveedor cuyas órdenes no traen monto tenía cuotas 0/0,01 = 0 y
HHI 0: el «más diversificado» posible, por no tener con qué medirlo.
"""

from __future__ import annotations

import polars as pl

from etl.analytics import data_loader, provider_diversification


def _orden(codigo, proveedor, nombre, organismo, periodo, monto="1000"):
    anio, mes = periodo.split("-")
    return {
        "Codigo": codigo,
        "CodigoProveedor": proveedor,
        "NombreProveedor": nombre,
        "RutSucursal": "77.000.000-1",
        "CodigoOrganismoPublico": organismo,
        "OrganismoPublico": f"ORGANISMO {organismo}",
        "sector": "Salud",
        "RegionUnidadCompra": "Región de Los Lagos",
        "RubroN2": "Aseo",
        "FechaCreacion": f"{anio}-{int(mes):02d}-05",
        "Estado": "Aceptada",
        "MontoTotalOC": monto,
        "TipoMonedaOC": "CLP",
        "MontoTotalOC_PesosChilenos": monto,
        "totalLineaNeto": monto,
        "monedaItem": "CLP",
        "_periodo_archivo": periodo,
    }


def test_nombre_vigente_y_hhi_sin_montos(tmp_path, monkeypatch):
    oc = tmp_path / "oc"
    oc.mkdir()
    for periodo, nombre in (("2025-9", "COMERCIAL VIEJA SPA"), ("2025-12", "COMERCIAL NUEVA SPA")):
        filas = [_orden(f"{periodo}-{i}", "P1", nombre, str(i % 4), periodo) for i in range(8)]
        filas += [
            _orden(f"{periodo}-s{i}", "P2", "SIN MONTO SPA", str(i), periodo, "NA")
            for i in range(8)
        ]
        pl.DataFrame(filas).write_parquet(oc / f"{periodo}.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")

    tabla = provider_diversification.build_provider_metrics()
    por = {f["CodigoProveedor"]: f for f in tabla.iter_rows(named=True)}
    assert por["P1"]["NombreProveedor"] == "COMERCIAL NUEVA SPA"
    assert por["P1"]["hhi_org"] == 0.25  # cuatro clientes con el mismo monto
    # Sin montos no hay reparto que medir: «un solo cliente», no «el más repartido».
    assert por["P2"]["hhi_org"] == 1.0
