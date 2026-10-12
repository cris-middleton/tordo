"""compra_agil_comprador: la historia del comprador en «lo mejor de hoy».

Frames inyectados, como `test_compra_agil_mensual.py`. Lo que se fija: la
ventana recorta, el monto es POR ORDEN y no por línea, las canceladas no
cuentan, y las personas naturales se cuentan sin nombrarse.
"""

from datetime import date

import polars as pl
import pytest

from etl.analytics import compra_agil_comprador as cac
from etl.analytics import compra_agil_mensual as cam

COLUMNAS = [
    "Codigo",
    "CodigoOrganismoPublico",
    "RutUnidadCompra",
    "FechaCreacion",
    "EsCompraAgil",
    "Estado",
    "CodigoProveedor",
    "MontoTotalOC_PesosChilenos",
]
VENTANA = (date(2026, 4, 1), date(2026, 9, 30))
RUT_A = "61.608.700-2"
RUT_B = "69.255.600-3"


def _frame(*filas):
    return pl.DataFrame([dict(zip(COLUMNAS, f, strict=True)) for f in filas])


ARCHIVO = _frame(
    # Comprador 7084: tres órdenes vigentes, la primera con TRES líneas.
    ("1-1-AG26", "7084", RUT_A, "2026-05-02", "Si", "Aceptada", "P1", "100000"),
    ("1-1-AG26", "7084", RUT_A, "2026-05-02", "Si", "Aceptada", "P1", "100000"),
    ("1-1-AG26", "7084", RUT_A, "2026-05-02", "Si", "Aceptada", "P1", "100000"),
    ("1-2-AG26", "7084", RUT_A, "2026-06-10", "Si", "Recepcion Conforme", "P1", "200000"),
    ("1-3-AG26", "7084", RUT_A, "2026-07-11", "Si", "Aceptada", "PN-abc123", "300000,5"),
    # Cancelada y otra que no es Compra Ágil: no cuentan.
    ("1-4-AG26", "7084", RUT_A, "2026-07-12", "Si", "Cancelacion solicitada", "P9", "9e9"),
    ("1-5-SE26", "7084", RUT_A, "2026-07-12", "No", "Aceptada", "P9", "9e9"),
    # Antes de la ventana: fuera.
    ("1-6-AG26", "7084", RUT_A, "2026-03-31", "Si", "Aceptada", "P8", "9e9"),
    # Comprador 115167: dos personas naturales distintas (dos seudónimos).
    ("2-1-AG26", "115167", RUT_B, "2026-09-01", "Si", "Aceptada", "PN-aaa", "50000"),
    ("2-2-AG26", "115167", RUT_B, "2026-09-02", "Si", "Aceptada", "PN-bbb", "70000"),
)


def _mensual(*filas):
    return pl.DataFrame(list(filas), schema=cam.ESQUEMA, orient="row")


@pytest.fixture
def salida(tmp_path):
    _mensual(
        ("7084", date(2026, 3, 1), 99, 1),  # fuera de la ventana
        ("7084", date(2026, 5, 1), 4, 1),
        ("7084", date(2026, 6, 1), None, 1),
        ("7084", date(2026, 7, 1), 6, 1),
        ("115167", date(2026, 9, 1), None, 2),
        ("555", date(2026, 8, 1), 12, None),  # publica y no adjudica
    ).write_parquet(tmp_path / cam.SALIDA)
    tabla, ruts = cac.run_compra_agil_comprador(tmp_path, frames=[ARCHIVO], limites=VENTANA)
    return {r["CodigoOrganismoPublico"]: r for r in tabla.to_dicts()}, ruts, tmp_path


def test_cuenta_ordenes_vigentes_de_la_ventana(salida):
    filas, _, _ = salida
    assert filas["7084"]["ordenes"] == 3
    assert filas["115167"]["ordenes"] == 2


def test_el_monto_es_por_orden_no_por_linea(salida):
    """Con la orden de tres líneas contada tres veces, la mediana sería 100.000."""
    fila = salida[0]["7084"]
    assert fila["monto_mediana"] == 200000.0
    assert fila["monto_p25"] == 150000.0
    assert fila["monto_p75"] == pytest.approx(250000.25)


def test_publicadas_suma_la_ventana_y_nula_sin_dato(salida):
    filas, _, _ = salida
    assert filas["7084"]["publicadas"] == 10  # 4 + 6; marzo queda fuera
    assert filas["115167"]["publicadas"] is None  # sin dato no es cero
    assert filas["555"]["publicadas"] == 12
    assert filas["555"]["ordenes"] == 0


def test_proveedores_y_cuota_del_lider(salida):
    filas, _, _ = salida
    assert filas["7084"]["proveedores_distintos"] == 2
    assert filas["7084"]["cuota_lider_pct"] == pytest.approx(66.7)
    # Dos personas naturales: se cuentan como dos, y nada las nombra.
    assert filas["115167"]["proveedores_distintos"] == 2
    assert filas["115167"]["cuota_lider_pct"] == 50.0


def test_ninguna_columna_lleva_proveedores(salida):
    _, _, directorio = salida
    tabla = pl.read_parquet(directorio / cac.SALIDA)
    assert not [c for c in tabla.columns if "Proveedor" in c]
    texto = str(tabla.to_dicts())
    assert "PN-" not in texto and "P1" not in texto


def test_la_ventana_queda_escrita(salida):
    filas, _, _ = salida
    assert (filas["7084"]["ventana_desde"], filas["7084"]["ventana_hasta"]) == VENTANA


def test_comprador_rut_traduce_rut_normalizado_a_codigo(salida):
    _, ruts, _ = salida
    assert dict(ruts.iter_rows()) == {"616087002": "7084", "692556003": "115167"}


def test_sin_la_tabla_mensual_las_publicadas_quedan_nulas(tmp_path):
    tabla, _ = cac.run_compra_agil_comprador(tmp_path, frames=[ARCHIVO], limites=VENTANA)
    assert tabla["publicadas"].is_null().all()
    assert set(tabla["CodigoOrganismoPublico"]) == {"7084", "115167"}


def test_sin_nada_salen_tablas_vacias_con_su_esquema(tmp_path):
    tabla, ruts = cac.run_compra_agil_comprador(tmp_path, frames=[], limites=None)
    assert tabla.is_empty() and ruts.is_empty()
    assert {c: tabla.schema[c] for c in cac.ESQUEMA} == cac.ESQUEMA
    assert (tmp_path / cac.SALIDA).exists() and (tmp_path / cac.SALIDA_RUT).exists()
