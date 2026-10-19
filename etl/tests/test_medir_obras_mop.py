"""El cruce de licitaciones de Obras Públicas con órdenes de compra.

`etl/scripts/medir_obras_mop.py` respalda la nota «Las obras del MOP no están en
las órdenes de compra». Lo que fija este test es el cruce: que una licitación
cuente como «con orden» si una orden la nombra en `CodigoLicitacion` o en su
`Nombre`, que se separen obra (O1, O2) y el resto, MOP y MINVU, y que el monto
del sector se sume como `sector_dashboard` (saneado, sin las canceladas).
"""

from __future__ import annotations

import polars as pl
from analytics import compra_agil_mensual

from etl.scripts import medir_obras_mop as m


def _orden(codigo, nombre, licitacion, monto, estado="Aceptada", sector=m.SECTOR):
    return {
        "Codigo": codigo,
        "Nombre": nombre,
        "CodigoLicitacion": licitacion,
        "sector": sector,
        "Estado": estado,
        "TipoMonedaOC": "CLP",
        "MontoTotalOC": monto,
        "MontoTotalOC_PesosChilenos": monto,
        "monedaItem": "CLP",
        "OrganismoPublico": "MINISTERIO DE OBRAS PUBLICAS",
    }


def _licitacion(codigo, organismo, tipo, adjudicado, seleccionada="Seleccionada"):
    return {
        "CodigoExterno": codigo,
        "sector": m.SECTOR,
        "NombreOrganismo": organismo,
        "Tipo": tipo,
        "FechaAdjudicacion": "2025-06-30",
        "Monto Estimado Adjudicado": adjudicado,
        "Oferta seleccionada": seleccionada,
    }


MOP = "MINISTERIO DE OBRAS PUBLICAS DIREC CION GRAL DE OO PP DCYF"
SERVIU = "SERVICIO DE VIVIENDA Y URBANIZACION IX REGION"


def test_una_licitacion_tiene_orden_si_alguna_la_nombra():
    ordenes = m.resumir_ordenes(
        pl.DataFrame(
            [
                _orden("1-1-SE25", "ORDEN DE COMPRA DESDE 1151-5-o125", "NA", "30000000000"),
                _orden("1-2-SE25", "Obra", "712307-45-O125", "1000"),
                _orden("1-3-SE25", "Compra de papel", "NA", "50000"),
            ]
        ),
        "2025-6",
    )
    licitaciones = m.resumir_licitaciones(
        pl.DataFrame(
            [
                _licitacion("1151-5-O125", MOP, "O1", "30000000000"),
                _licitacion("5048-96-O224", MOP, "O2", "58100000000"),
                _licitacion("5048-96-O224", MOP, "O2", "58100000000", "No Seleccionada"),
                _licitacion("712307-45-O125", SERVIU, "O1", "600000000"),
                _licitacion("1020-1-LE25", MOP, "LE", "1000000"),
            ]
        )
    )

    tabla = m.cruzar(licitaciones, ordenes, "2025")
    filas = {(f["ministerio"], f["clase"]): f for f in tabla.iter_rows(named=True)}

    obra_mop = filas[("MOP", "obra")]
    assert obra_mop["licitaciones"] == 2
    assert obra_mop["pct_con_orden"] == 50
    assert obra_mop["sin_orden_billones"] == 0.06
    assert filas[("MINVU y SERVIU", "obra")]["pct_con_orden"] == 100
    assert filas[("MOP", "otra")]["pct_con_orden"] == 0


def test_el_monto_del_sector_es_el_de_sector_dashboard():
    ordenes = m.resumir_ordenes(
        pl.DataFrame(
            [
                _orden("1-1-SE25", "a", "NA", "500000000000"),
                _orden("1-2-SE25", "b", "NA", "1440000000000", estado="Cancelacion solicitada"),
                _orden("1-3-SE25", "c", "NA", "900000000000", sector="Salud"),
            ]
        ),
        "2025-3",
    )
    assert m.monto_del_sector(ordenes, "2025") == 0.5
    assert m.monto_del_sector(ordenes, "2024") == 0


def test_los_estados_cancelados_son_los_del_tablero():
    assert m.ESTADOS_CANCELADOS == compra_agil_mensual.ESTADOS_CANCELADOS
