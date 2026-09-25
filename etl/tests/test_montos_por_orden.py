"""Los montos del BI, contra la forma REAL del archivo de órdenes.

Medido en los seis meses locales (2025-10 a 2026-03):

- **El 53 % de las filas trae el monto con COMA decimal** («1449449,75»).
  `cast(Float64, strict=False)` las volvía nulo y cada módulo filtraba los
  nulos: más de la mitad de las compras no contaba en ningún monto del BI.
- **Una fila por LÍNEA, con el total de la ORDEN repetido en cada una**
  (34.333 de 34.333 órdenes de varias líneas). Sumarlo por fila multiplicaba
  cada orden por su número de líneas; contar filas contaba líneas (≈2,9 por
  orden).
- **«NA» como texto** en sector y rubro, que salía como un sector más.
"""

from __future__ import annotations

import polars as pl
import pytest
from analytics import competitor_analysis
from analytics.data_loader import (
    con_monto_por_linea,
    con_numeros,
    con_vacios,
    orden_por_fila,
)


def _archivo(filas: list[dict]) -> pl.DataFrame:
    """Así viene el parquet: todo texto."""
    return pl.DataFrame(filas).with_columns(pl.all().cast(pl.Utf8))


# Una orden de tres líneas por $1.000, y otra de una línea con centavos.
LINEAS = [
    {
        "Codigo": "OC-1",
        "MontoTotalOC_PesosChilenos": "1000",
        "totalLineaNeto": "100",
        "RubroN2": "Aseo",
    },
    {
        "Codigo": "OC-1",
        "MontoTotalOC_PesosChilenos": "1000",
        "totalLineaNeto": "200",
        "RubroN2": "Aseo",
    },
    {
        "Codigo": "OC-1",
        "MontoTotalOC_PesosChilenos": "1000",
        "totalLineaNeto": "700",
        "RubroN2": "Papel",
    },
    {
        "Codigo": "OC-2",
        "MontoTotalOC_PesosChilenos": "1449449,75",
        "totalLineaNeto": "1218025",
        "RubroN2": "NA",
    },
]


def _preparado():
    return con_monto_por_linea(con_numeros(con_vacios(_archivo(LINEAS))))


def test_la_coma_decimal_es_un_numero():
    df = _preparado()
    assert df.filter(pl.col("Codigo") == "OC-2")[
        "MontoTotalOC_PesosChilenos"
    ].item() == pytest.approx(1449449.75)


def test_el_total_se_reparte_entre_las_lineas_y_suma_lo_que_debe():
    df = _preparado()
    lineas = df.filter(pl.col("Codigo") == "OC-1")["monto_linea_clp"].to_list()
    assert lineas == pytest.approx([100, 200, 700])
    # Por rubro: la orden gastó 300 en Aseo y 700 en Papel, no 1.000 en cada uno.
    por_rubro = dict(
        df.filter(pl.col("Codigo") == "OC-1")
        .group_by("RubroN2")
        .agg(pl.col("monto_linea_clp").sum())
        .iter_rows()
    )
    assert por_rubro == pytest.approx({"Aseo": 300, "Papel": 700})


def test_sin_netos_se_reparte_a_partes_iguales():
    df = con_monto_por_linea(
        con_numeros(
            _archivo(
                [
                    {"Codigo": "X", "MontoTotalOC_PesosChilenos": "90", "totalLineaNeto": "0"},
                    {"Codigo": "X", "MontoTotalOC_PesosChilenos": "90", "totalLineaNeto": "0"},
                ]
            )
        )
    )
    assert df["monto_linea_clp"].to_list() == pytest.approx([45, 45])


def test_na_es_un_nulo():
    df = _preparado()
    assert df.filter(pl.col("Codigo") == "OC-2")["RubroN2"].item() is None


def test_una_fila_por_orden():
    assert orden_por_fila(_preparado()).height == 2


def test_la_competencia_cuenta_ordenes_y_montos_de_verdad(monkeypatch):
    """Por el código real del módulo, con el archivo simulado."""
    filas = [
        dict(
            fila,
            CodigoOrganismoPublico="7326",
            OrganismoPublico="Hospital",
            CodigoProveedor="141927",
            NombreProveedor="PRONOMED SPA",
            RegionUnidadCompra="Región Metropolitana de Santiago",
            FechaCreacion="2026-03-10",
            _periodo_archivo="2026-3",
        )
        for fila in LINEAS
    ]
    tanda = con_monto_por_linea(con_numeros(con_vacios(_archivo(filas))))
    monkeypatch.setattr(
        competitor_analysis, "iter_oc_parquets", lambda columns: iter([("2026-3", tanda)])
    )

    mercados, _ = competitor_analysis.build_competitor_aggregates()

    aseo = mercados.filter(pl.col("RubroN2") == "Aseo").row(0, named=True)
    assert aseo["n_oc"] == 1  # una orden, aunque tenga dos líneas de Aseo
    assert aseo["monto_total"] == pytest.approx(300)
    # «NA» no es un rubro.
    assert mercados.filter(pl.col("RubroN2") == "NA").height == 0
