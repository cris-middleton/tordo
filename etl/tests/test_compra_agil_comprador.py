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
    tabla, ruts, _ = cac.run_compra_agil_comprador(tmp_path, frames=[ARCHIVO], limites=VENTANA)
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
    tabla, _, _ = cac.run_compra_agil_comprador(tmp_path, frames=[ARCHIVO], limites=VENTANA)
    assert tabla["publicadas"].is_null().all()
    assert set(tabla["CodigoOrganismoPublico"]) == {"7084", "115167"}


def test_sin_nada_salen_tablas_vacias_con_su_esquema(tmp_path):
    tabla, ruts, unidad = cac.run_compra_agil_comprador(tmp_path, frames=[], limites=None)
    assert tabla.is_empty() and ruts.is_empty() and unidad.is_empty()
    assert {c: tabla.schema[c] for c in cac.ESQUEMA} == cac.ESQUEMA
    assert {c: unidad.schema[c] for c in cac.ESQUEMA_UNIDAD} == cac.ESQUEMA_UNIDAD
    for salida in (cac.SALIDA, cac.SALIDA_RUT, cac.SALIDA_UNIDAD):
        assert (tmp_path / salida).exists()


# ── Por unidad de compra (rediseño 0a) ──────────────────────────────────────

#: El organismo 6946 (FACh) con dos unidades de RUT propio, y 7084 con una.
#: Medido en las OC 2025-10..2026-03: la FACh son 14 RUT bajo un solo código.
UNIDADES = _frame(
    ("9-1-AG26", "6946", "61.103.007-K", "2026-05-02", "Si", "Aceptada", "P1", "100000"),
    ("9-2-AG26", "6946", "61.103.007-K", "2026-05-03", "Si", "Aceptada", "P2", "200000"),
    ("9-3-AG26", "6946", "61.103.007-K", "2026-05-04", "Si", "Aceptada", "P2", "300000"),
    ("9-4-AG26", "6946", "61.103.006-1", "2026-05-05", "Si", "Aceptada", "P3", "400000"),
    ("8-1-AG26", "7084", RUT_A, "2026-06-01", "Si", "Aceptada", "P4", "50000"),
    ("8-2-AG26", "7084", RUT_A, "2026-06-02", "Si", "Aceptada", "P4", "60000"),
)


@pytest.fixture
def unidades(tmp_path):
    _, _, unidad = cac.run_compra_agil_comprador(tmp_path, frames=[UNIDADES], limites=VENTANA)
    return {r["rut"]: r for r in unidad.to_dicts()}


def test_la_historia_de_la_unidad_es_la_suya_no_la_del_organismo(unidades):
    # Por organismo, las dos unidades de 6946 saldrían con 4 órdenes.
    assert unidades["61103007K"]["ordenes"] == 3
    assert unidades["611030061"]["ordenes"] == 1
    assert unidades["61103007K"]["proveedores_distintos"] == 2
    assert unidades["61103007K"]["monto_mediana"] == 200000.0


def test_percentil_de_ordenes_entre_unidades(unidades):
    # 1 < 2 < 3 órdenes → percent_rank 0, 0,5 y 1.
    assert unidades["611030061"]["percentil_ordenes"] == 0.0
    assert unidades["616087002"]["percentil_ordenes"] == 0.5
    assert unidades["61103007K"]["percentil_ordenes"] == 1.0


def test_los_empates_comparten_percentil(tmp_path):
    archivo = _frame(
        ("1-AG", "1", "61.000.001-1", "2026-05-02", "Si", "Aceptada", "P1", "1"),
        ("2-AG", "2", "61.000.002-2", "2026-05-02", "Si", "Aceptada", "P1", "1"),
        ("3-AG", "3", "61.000.003-3", "2026-05-02", "Si", "Aceptada", "P1", "1"),
        ("4-AG", "3", "61.000.003-3", "2026-05-03", "Si", "Aceptada", "P1", "1"),
    )
    _, _, unidad = cac.run_compra_agil_comprador(tmp_path, frames=[archivo], limites=VENTANA)
    por_rut = dict(zip(unidad["rut"], unidad["percentil_ordenes"], strict=True))
    assert por_rut["610000011"] == por_rut["610000022"] == 0.0
    assert por_rut["610000033"] == 1.0


def test_una_sola_unidad_vale_el_neutro(tmp_path):
    solo = UNIDADES.filter(pl.col("CodigoOrganismoPublico") == "7084")
    _, _, unidad = cac.run_compra_agil_comprador(tmp_path, frames=[solo], limites=VENTANA)
    assert unidad["percentil_ordenes"].to_list() == [0.5]


def test_la_tabla_de_unidades_no_lleva_proveedores(tmp_path):
    cac.run_compra_agil_comprador(tmp_path, frames=[UNIDADES], limites=VENTANA)
    tabla = pl.read_parquet(tmp_path / cac.SALIDA_UNIDAD)
    assert not [c for c in tabla.columns if "Proveedor" in c]
    assert "P1" not in str(tabla.to_dicts())
    assert (
        tabla["ventana_desde"].unique().to_list(),
        tabla["ventana_hasta"].unique().to_list(),
    ) == (
        [VENTANA[0]],
        [VENTANA[1]],
    )


# ── El RUT: una sola normalización (ceros a la izquierda incluidos) ─────────


def test_dos_escrituras_del_mismo_rut_son_una_sola_unidad(tmp_path):
    """`061.608.700-2` y `61.608.700-2` son el mismo RUT. Con los ceros sin quitar, la
    población del percentil las contaba como dos unidades —la API las fusiona—, y el
    percentil de todas se movía."""
    archivo = _frame(
        ("1-AG", "1", "061.608.700-2", "2026-05-02", "Si", "Aceptada", "P1", "1"),
        ("2-AG", "1", "61.608.700-2", "2026-05-03", "Si", "Aceptada", "P1", "1"),
        ("3-AG", "2", "61.000.002-2", "2026-05-02", "Si", "Aceptada", "P1", "1"),
        ("4-AG", "2", "61.000.002-2", "2026-05-03", "Si", "Aceptada", "P1", "1"),
        ("5-AG", "2", "61.000.002-2", "2026-05-04", "Si", "Aceptada", "P1", "1"),
    )
    _, ruts, unidad = cac.run_compra_agil_comprador(tmp_path, frames=[archivo], limites=VENTANA)
    por_rut = {r["rut"]: r for r in unidad.to_dicts()}
    assert set(por_rut) == {"616087002", "610000022"}  # una sola, sin ceros
    assert por_rut["616087002"]["ordenes"] == 2
    # Dos unidades en la población: 0 y 1. Con tres (la variante con cero aparte) la
    # de dos órdenes habría quedado en 0,5.
    assert por_rut["616087002"]["percentil_ordenes"] == 0.0
    assert por_rut["610000022"]["percentil_ordenes"] == 1.0
    assert dict(ruts.iter_rows()) == {"616087002": "1", "610000022": "2"}


def test_un_rut_de_puros_ceros_o_vacio_no_es_una_unidad(tmp_path):
    archivo = _frame(
        ("1-AG", "1", "0", "2026-05-02", "Si", "Aceptada", "P1", "1"),
        ("2-AG", "1", "000-0", "2026-05-02", "Si", "Aceptada", "P1", "1"),
        ("3-AG", "1", "", "2026-05-02", "Si", "Aceptada", "P1", "1"),
        ("4-AG", "1", None, "2026-05-02", "Si", "Aceptada", "P1", "1"),
        ("5-AG", "1", RUT_A, "2026-05-02", "Si", "Aceptada", "P1", "1"),
    )
    tabla, ruts, unidad = cac.run_compra_agil_comprador(tmp_path, frames=[archivo], limites=VENTANA)
    assert unidad["rut"].to_list() == ["616087002"]
    assert ruts["rut"].to_list() == ["616087002"]
    assert tabla.filter(pl.col("CodigoOrganismoPublico") == "1")["ordenes"].to_list() == [5]


def test_las_publicadas_de_un_rut_con_ceros_se_traducen(tmp_path):
    """El RUT de la Compra Ágil ingerida sale de Postgres tal como viene: con ceros, no
    traducía a ningún código y la publicada se contaba con código nulo."""
    tabla = cam.publicadas_por_mes(
        pl.DataFrame(
            [("0616087002", date(2026, 5, 1), 3), ("616087002", date(2026, 5, 1), 4)],
            schema={"rut": pl.Utf8, "mes": pl.Date, "n": pl.Int64},
            orient="row",
        ),
        pl.DataFrame({"rut": ["616087002"], "CodigoOrganismoPublico": ["7084"]}),
    )
    assert tabla.to_dicts() == [
        {"CodigoOrganismoPublico": "7084", "mes": date(2026, 5, 1), "publicadas": 7}
    ]
