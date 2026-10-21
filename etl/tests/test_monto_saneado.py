"""El monto en pesos de una orden en UF o UTM, saneado en un solo sitio.

ChileCompra convierte a pesos (`MontoTotalOC_PesosChilenos`) multiplicando
`MontoTotalOC` por el valor de la moneda de la orden. Cuando la orden dice
«CLF» (UF) pero su monto ya estaba en pesos, el resultado sale ~39.700 veces
más grande. En producción, Municipalidades sumaba ~$14,4 billones al año contra
~$4,1 de la cifra oficial de ChileCompra.

Las órdenes de estos tests son sintéticas, con los montos de casos reales del
archivo de órdenes (auditoría del 2026-10-16):

- `4973-36-SE26`: una Gran Compra del MOP por 36.111.480 «UF» (→ $1,44 billones),
  con «Cancelación solicitada».
- `3833-76-SE26` y dos más: «ARRIENDO VEHICULOS» de una municipalidad, en CLF con
  los ítems en CLP: 5.276.900 pesos convertidos como si fueran UF (→ $209 mil
  millones cada una).
- `2699-120-SE25`: una municipalidad por 4.267.521 «UF» (→ $170 mil millones),
  ítems también en CLF.
- Órdenes legítimas grandes que tienen que quedarse: un servicio de red de
  comunicaciones por 609.561 UF ($24 mil millones) y un contrato municipal por
  406.089 UTM ($28 mil millones).
"""

from __future__ import annotations

import logging

import polars as pl
import pytest
from analytics import compra_agil_mensual, data_loader, sector_intelligence
from analytics.data_loader import (
    con_monto_por_linea,
    con_monto_saneado,
    con_numeros,
    con_vacios,
)

from etl.analytics import data_loader as cargador

UF = 39_841.0
UTM = 69_542.0


def _linea(codigo, moneda, monto, pesos, moneda_item, neto, **extra):
    return {
        "Codigo": codigo,
        "TipoMonedaOC": moneda,
        "MontoTotalOC": monto,
        "MontoTotalOC_PesosChilenos": pesos,
        "monedaItem": moneda_item,
        "totalLineaNeto": neto,
        **extra,
    }


def _comun(organismo, sector, estado="Aceptada"):
    return {
        "OrganismoPublico": organismo,
        "CodigoOrganismoPublico": organismo[:6],
        "sector": sector,
        "Estado": estado,
        "CodigoProveedor": "P1",
        "RubroN2": "Servicios",
        "FechaCreacion": "2026-01-15",
        "_periodo_archivo": "2026-1",
    }


MOP = _comun("DIRECCION GENERAL DE OBRAS PUBLICAS", "Obras Públicas", "Cancelacion solicitada")
MUNI_A = _comun("MUNICIPALIDAD A", "Municipalidades")
MUNI_B = _comun("MUNICIPALIDAD B", "Municipalidades")
SALUD = _comun("SUBSECRETARIA DE SALUD", "Salud")

#: Así viene el parquet: todo texto, coma decimal incluida.
LINEAS = [
    # La Gran Compra cancelada: 36 M «UF», dos líneas.
    _linea("MOP-36", "CLF", "36111480", "1438700000000", "CLF", "18000000", **MOP),
    _linea("MOP-36", "CLF", "36111480", "1438700000000", "CLF", "18111480", **MOP),
    # El arriendo de vehículos: CLF con los ítems en pesos.
    _linea("RB-76", "CLF", "5276900", "209580000000", "CLP", "4434374", **MUNI_A),
    # 4,27 M «UF» con los ítems en CLF.
    _linea("LR-120", "CLF", "4267521", "169520000000", "CLF", "3586152", **MUNI_B),
    # Legítimas y grandes: se quedan.
    _linea("RED-64", "CLF", "609561,554", "24206000000", "CLF", "512236,6", **SALUD),
    _linea("LC-105", "UTM", "406088,78", "28240000000", "UTM", "341251,07", **MUNI_B),
    # Una en UF con un ítem en pesos y otro en UF: no está «toda en pesos».
    _linea("MIX-1", "CLF", "1000", str(1000 * UF), "CLF", "500", **SALUD),
    _linea("MIX-1", "CLF", "1000", str(1000 * UF), "CLP", "500", **SALUD),
    # Una orden en pesos, la inmensa mayoría.
    _linea("CLP-1", "CLP", "1190000", "1190000", "CLP", "1000000", **MUNI_A),
]


def _archivo(filas=LINEAS) -> pl.DataFrame:
    return pl.DataFrame(filas).with_columns(pl.all().cast(pl.Utf8))


def _saneado(filas=LINEAS) -> pl.DataFrame:
    return con_monto_saneado(con_numeros(con_vacios(_archivo(filas))))


def _monto(df: pl.DataFrame, codigo: str):
    valores = df.filter(pl.col("Codigo") == codigo)["MontoTotalOC_PesosChilenos"].unique()
    assert valores.len() == 1, f"{codigo}: las líneas no coinciden en el total ({valores})"
    return valores.item()


def test_una_orden_en_uf_con_los_items_en_pesos_vale_su_monto_en_pesos():
    assert _monto(_saneado(), "RB-76") == pytest.approx(5_276_900)


def test_una_orden_en_uf_imposible_queda_sin_monto():
    df = _saneado()
    assert _monto(df, "LR-120") is None
    assert _monto(df, "MOP-36") is None


def test_las_ordenes_grandes_y_legitimas_no_se_tocan():
    df = _saneado()
    assert _monto(df, "RED-64") == pytest.approx(24_206_000_000)
    assert _monto(df, "LC-105") == pytest.approx(28_240_000_000)
    assert _monto(df, "MIX-1") == pytest.approx(1000 * UF)
    assert _monto(df, "CLP-1") == pytest.approx(1_190_000)


def test_la_orden_sigue_contando_aunque_no_tenga_monto():
    """Se quita su monto, no la orden: existió, sólo no se sabe cuánto costó."""
    assert _saneado().height == len(LINEAS)


def test_el_umbral_no_tira_los_contratos_legitimos_mas_grandes():
    """Medido en los 36 meses de la ventana: las órdenes legítimas más grandes en
    UF llegan a 2,7 M UF; por encima de 3 M UF todas son imposibles. Entre medio
    quedan dos imposibles (1,1 y 2,2 M «UF»): es el costo, medido, de no tirar
    las legítimas."""
    df = _saneado(
        [
            # Pago de pensiones (2,70 M UF) y la red de comunicaciones de salud
            # (2,62 M UF): contratos de varios años, se quedan.
            _linea("PAGO", "CLF", "2702900", "107700000000", "CLF", "1", **SALUD),
            _linea("RED", "CLF", "2620400", "107100000000", "CLF", "1", **SALUD),
            # 3,68 M «UF» en una municipalidad chica y 7,28 M «UF» en un seguro
            # de vida del personal: eran pesos.
            _linea("MUNI", "CLF", "3677454", "151200000000", "CLF", "1", **MUNI_B),
            _linea("SEGURO", "CLF", "7278624", "285700000000", "CLF", "1", **SALUD),
            # 135 M «UTM» en control de sotobosque ($9 billones): eran pesos.
            _linea("SOTOBOSQUE", "UTM", "135130000", "9093400000000", "UTM", "1", **MUNI_A),
        ]
    )
    assert _monto(df, "PAGO") == pytest.approx(107_700_000_000)
    assert _monto(df, "RED") == pytest.approx(107_100_000_000)
    assert _monto(df, "MUNI") is None
    assert _monto(df, "SEGURO") is None
    assert _monto(df, "SOTOBOSQUE") is None


def test_el_umbral_es_de_120_mil_millones_en_uf_o_en_utm():
    umbral = data_loader.UMBRAL_PESOS_ORDEN_INDEXADA
    assert umbral == 120_000_000_000  # ≈ 3 M UF
    df = _saneado(
        [
            _linea("ABAJO", "CLF", "1", str(umbral), "CLF", "1", **SALUD),
            _linea("ARRIBA", "CLF", "1", str(umbral + 1), "CLF", "1", **SALUD),
            _linea("UTM", "UTM", "1", str(umbral + 1), "UTM", "1", **SALUD),
        ]
    )
    assert _monto(df, "ABAJO") == pytest.approx(umbral)
    assert _monto(df, "ARRIBA") is None
    assert _monto(df, "UTM") is None


def test_un_monto_enorme_en_pesos_o_en_dolares_no_se_toca():
    """El error es de la conversión desde UF o UTM; no se extiende a otra moneda."""
    df = _saneado(
        [
            _linea("CLP-G", "CLP", "90000000000", "90000000000", "CLP", "1", **SALUD),
            _linea("USD-G", "USD", "50000000", "46000000000", "USD", "1", **SALUD),
        ]
    )
    assert _monto(df, "CLP-G") == pytest.approx(9e10)
    assert _monto(df, "USD-G") == pytest.approx(4.6e10)


def test_cada_orden_fuera_queda_en_el_log_para_auditarla(caplog):
    with caplog.at_level(logging.WARNING, logger="analytics.data_loader"):
        _saneado()
    texto = caplog.text
    for codigo, organismo in [("LR-120", "MUNICIPALIDAD B"), ("MOP-36", "OBRAS PUBLICAS")]:
        linea = next(r for r in caplog.messages if codigo in r)
        assert organismo in linea
    # Una vez por orden, no por línea.
    assert texto.count("MOP-36") == 1
    assert "RED-64" not in texto


def test_el_reparto_por_linea_suma_el_monto_saneado():
    df = con_monto_por_linea(_saneado())
    por_orden = dict(df.group_by("Codigo").agg(pl.col("monto_linea_clp").sum()).iter_rows())
    assert por_orden["RB-76"] == pytest.approx(5_276_900)
    assert por_orden["LR-120"] == 0  # la suma de nulos
    assert df.filter(pl.col("Codigo") == "LR-120")["monto_linea_clp"].null_count() == 1


@pytest.fixture
def archivo_oc(tmp_path, monkeypatch):
    oc = tmp_path / "oc"
    oc.mkdir()
    _archivo().write_parquet(oc / "2026-1.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")
    monkeypatch.setattr(sector_intelligence, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(sector_intelligence, "OUTPUT_DIR", tmp_path)
    return oc


def test_todos_los_modulos_lo_heredan_por_iter_oc_parquets(archivo_oc):
    """Un módulo que sólo pide el monto en pesos recibe el saneado..."""
    pedidas = ["CodigoOrganismoPublico", "MontoTotalOC_PesosChilenos"]
    (_, df), *_ = list(data_loader.iter_oc_parquets(columns=pedidas))
    por_orden = dict(df.group_by("Codigo").agg(pl.col("monto_linea_clp").sum()).iter_rows())
    assert por_orden["RB-76"] == pytest.approx(5_276_900)
    assert por_orden["LR-120"] == 0
    # ...y no recibe las columnas que hicieron falta para sanearlo, ni el
    # `Estado` con el que se quitaron las canceladas.
    assert set(df.columns) == {*pedidas, "Codigo", "totalLineaNeto", "monto_linea_clp"}
    # La Gran Compra cancelada no llega.
    assert "MOP-36" not in df["Codigo"].to_list()


def test_el_tablero_por_sector_no_suma_lo_imposible_ni_lo_cancelado(archivo_oc):
    tabla = sector_intelligence.run_sector_intelligence()["sector"]
    fila = {r["sector"]: r for r in tabla.iter_rows(named=True)}

    municipal = fila["Municipalidades"]
    # Río Bueno en pesos + Las Condes + la de pesos; La Reina cuenta, sin monto.
    assert municipal["monto_total"] == pytest.approx(5_276_900 + 28_240_000_000 + 1_190_000)
    assert municipal["n_oc"] == 4
    # La Gran Compra cancelada no es una compra: no está ni en el conteo.
    assert "Obras Públicas" not in fila


def test_las_canceladas_se_definen_una_vez_en_el_cargador():
    # `compra_agil_mensual` importa `etl.analytics.data_loader`, no `analytics.data_loader`.
    assert compra_agil_mensual.ESTADOS_CANCELADOS is cargador.ESTADOS_CANCELADOS
    assert compra_agil_mensual.ESTADOS_CANCELADOS == data_loader.ESTADOS_CANCELADOS
