"""El precio unitario de las bandas es `precioNeto`, no `precioNeto / cantidad`.

En las órdenes de compra masivas `precioNeto` YA es el precio de UNA unidad:
`totalLineaNeto` es `precioNeto × cantidad`. Medido en los seis meses locales
(2025-10 a 2026-03), sobre 2.387.370 líneas en pesos: la igualdad se cumple
(±1 % o ±$1) en el 99,98 %. Las bandas dividían otra vez por la cantidad, así
que publicaban el precio de un paquete repartido entre los paquetes de la
orden: «Papel higiénico jumbo», que se compra a $16.850 el paquete, salía «entre
$843 y $2.106».

Las filas imitan el archivo real: todo es texto, con coma decimal, y la línea
trae su moneda (`monedaItem`).
"""

from __future__ import annotations

import polars as pl
import pytest
from analytics import data_loader
from analytics.product_price_bands import build_level_0_nacional, extract_unit_prices

PAPEL = "PAPEL HIGIÉNICO JUMBO 6X600"
PRECIO_PAPEL = 16850


def _linea(
    codigo: str,
    precio: str,
    cantidad: str,
    total: str,
    *,
    especificacion: str = PAPEL,
    moneda: str = "CLP",
    organismo: str = "7001",
) -> dict:
    """Una línea de orden de compra con la forma del archivo masivo."""
    return {
        "Codigo": codigo,
        "FechaCreacion": "2026-03-05",
        "CodigoOrganismoPublico": organismo,
        "OrganismoPublico": f"MUNICIPALIDAD {organismo}",
        "sector": "Municipalidades",
        "CodigoProveedor": "192955",
        "NombreProveedor": "CRECER SPA",
        "RutSucursal": "76.473.150-6",
        "codigoProductoONU": "14111704",
        "NombreroductoGenerico": "Papel higiénico",
        "EspecificacionComprador": especificacion,
        "cantidad": cantidad,
        "UnidadMedida": "Paquete",
        "monedaItem": moneda,
        "precioNeto": precio,
        "totalLineaNeto": total,
        "MontoTotalOC_PesosChilenos": total,
        "_periodo_archivo": "2026-3",
    }


#: Seis compras del mismo paquete, al mismo precio y en cantidades distintas.
#: Con la división, la «banda» iba de $169 a $3.370 según cuánto se compró.
COMPRAS_PAPEL = [
    _linea(f"OC-{i}", str(PRECIO_PAPEL), str(q), str(PRECIO_PAPEL * q), organismo=org)
    for i, (q, org) in enumerate(
        [(5, "7001"), (10, "7002"), (20, "7003"), (30, "7004"), (50, "7005"), (100, "7006")]
    )
]


def _escribir(tmp_path, monkeypatch, lineas: list[dict]) -> None:
    oc = tmp_path / "oc"
    oc.mkdir()
    pl.DataFrame(lineas).write_parquet(oc / "2026-3.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")


def test_el_precio_unitario_es_el_precio_neto_sin_dividir(tmp_path, monkeypatch):
    _escribir(tmp_path, monkeypatch, COMPRAS_PAPEL)

    items = extract_unit_prices()

    assert items["pu"].to_list() == [float(PRECIO_PAPEL)] * len(COMPRAS_PAPEL)


def test_la_banda_del_producto_es_el_precio_del_paquete(tmp_path, monkeypatch):
    _escribir(tmp_path, monkeypatch, COMPRAS_PAPEL)

    banda = build_level_0_nacional(extract_unit_prices())

    assert banda.height == 1
    fila = banda.row(0, named=True)
    assert fila["firma_producto"] == "higiénico jumbo papel"
    assert (fila["p25"], fila["p50"], fila["p75"]) == (PRECIO_PAPEL,) * 3
    assert fila["predictibilidad"] == "alta"


def test_la_coma_decimal_se_lee_como_decimal(tmp_path, monkeypatch):
    # 2,5 kg a $1.234,50 el kilo: la línea suma $3.086,25.
    _escribir(tmp_path, monkeypatch, [_linea("OC-1", "1234,5", "2,5", "3086,25")])

    assert extract_unit_prices()["pu"].to_list() == [1234.5]


@pytest.mark.parametrize(
    ("precio", "cantidad", "total", "por_que"),
    [
        # Un descuento o un cargo de la línea: el total ya no es precio ×
        # cantidad y no se sabe cuál de los dos es el precio pagado. Es el
        # 0,02 % de las líneas en pesos; descartarlas no mueve ninguna banda.
        ("6280", "4", "22608", "descuento en la línea"),
        ("42000", "3", "273528", "cargo en la línea"),
        # Sin total no hay con qué comprobar el precio.
        ("16850", "5", "0", "sin total"),
    ],
)
def test_una_linea_incoherente_no_entra(tmp_path, monkeypatch, precio, cantidad, total, por_que):
    _escribir(tmp_path, monkeypatch, [*COMPRAS_PAPEL, _linea("OC-X", precio, cantidad, total)])

    items = extract_unit_prices()

    assert items.height == len(COMPRAS_PAPEL), por_que
    assert set(items["pu"].to_list()) == {float(PRECIO_PAPEL)}


@pytest.mark.parametrize("moneda", ["CLF", "USD", "UTM", "EUR"])
def test_un_precio_en_otra_moneda_no_entra(tmp_path, monkeypatch, moneda):
    # 1,03 UF la hora: leído como pesos, una banda de «$1».
    _escribir(
        tmp_path,
        monkeypatch,
        [*COMPRAS_PAPEL, _linea("OC-X", "1,03", "104", "107,12", moneda=moneda)],
    )

    assert extract_unit_prices().height == len(COMPRAS_PAPEL)


def test_un_archivo_sin_total_ni_moneda_usa_el_precio_neto(tmp_path, monkeypatch):
    """Los ZIP antiguos pueden no traer esas columnas: no hay con qué comprobar,
    pero `precioNeto` sigue siendo el precio unitario."""
    viejas = [
        {k: v for k, v in f.items() if k not in ("totalLineaNeto", "monedaItem")}
        for f in COMPRAS_PAPEL
    ]
    _escribir(tmp_path, monkeypatch, viejas)

    assert extract_unit_prices()["pu"].to_list() == [float(PRECIO_PAPEL)] * len(COMPRAS_PAPEL)
