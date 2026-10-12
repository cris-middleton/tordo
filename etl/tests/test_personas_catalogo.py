"""Personas naturales en lo que se GUARDA del catálogo, no sólo en lo que se sirve.

El payload de la API se limpia una vez, al entrar (`personas.enmascarar_payload`),
y de él sale todo lo demás: `items`, `informacion_adicional` y
`proveedor_adjudicado` (el payload entero, la lista de oferentes y el historial
de cambios ya no se guardan desde el paso 7 del pivote).
"""

import copy

import pytest

from etl.analytics.personas import NOMBRE_ENMASCARADO, enmascarar_payload
from etl.transformers import LicitacionTransformer
from etl.transformers.compra_agil_transformer import CompraAgilTransformer
from etl.utils.adjudicacion import extraer_datos_adjudicacion

PERSONA_RUT, PERSONA = "12.708.987-6", "RAÚL MAURICIO HERNÁNDEZ CÁRCAMO"
EMPRESA_RUT, EMPRESA = "76.543.210-3", "PYME GANADORA SPA"


def _item(rut, nombre, monto=1_000_000):
    return {
        "CodigoProducto": "46171600",
        "NombreProducto": "Servicio de guardia",
        "Adjudicacion": {
            "RutProveedor": rut,
            "NombreProveedor": nombre,
            "CantidadAdjudicada": 1,
            "MontoUnitario": monto,
        },
    }


def _detalle():
    """La forma documentada del detalle de la API clásica."""
    return {
        "Listado": [
            {
                "CodigoExterno": "1234-5-LE26",
                "Nombre": "Servicio de guardia",
                "Comprador": {
                    "RutUnidad": "61.608.700-2",
                    "NombreOrganismo": "HOSPITAL DEL SALVADOR",
                    "CodigoOrganismo": "7084",
                    "NombreUsuario": "Funcionaria responsable",
                },
                "Items": {
                    "Cantidad": 2,
                    "Listado": [_item(PERSONA_RUT, PERSONA), _item(EMPRESA_RUT, EMPRESA)],
                },
                # Forma no documentada: claves genéricas dentro de un contexto
                # de oferentes. Tiene que reconocerse igual.
                "Participantes": [
                    {"Rut": PERSONA_RUT, "Nombre": PERSONA, "Monto": 900_000},
                    {"Rut": "9.876.543-2", "RazonSocial": "MARÍA JOSÉ SOTO", "Monto": 950_000},
                    {"Rut": EMPRESA_RUT, "RazonSocial": EMPRESA, "Monto": 1_000_000},
                ],
            }
        ]
    }


def _texto(dato) -> str:
    return repr(dato).lower()


def _sin_rastro(dato):
    texto = _texto(dato)
    for aguja in ("hernández", "hernandez", "soto", "12.708.987", "9.876.543"):
        assert aguja not in texto, f"«{aguja}» sigue en {dato!r}"


def test_el_detalle_queda_sin_personas_y_con_la_empresa():
    limpio = enmascarar_payload(_detalle())
    _sin_rastro(limpio)
    assert EMPRESA in repr(limpio) and EMPRESA_RUT in repr(limpio)

    principal = limpio["Listado"][0]
    adj_persona = principal["Items"]["Listado"][0]["Adjudicacion"]
    assert adj_persona["NombreProveedor"] == NOMBRE_ENMASCARADO
    assert adj_persona["RutProveedor"] is None
    # Lo que no es identidad se queda: el monto sigue sumando.
    assert adj_persona["MontoUnitario"] == 1_000_000
    assert principal["Participantes"][1]["RazonSocial"] == NOMBRE_ENMASCARADO


def test_el_lado_del_comprador_no_se_toca():
    comprador = enmascarar_payload(_detalle())["Listado"][0]["Comprador"]
    assert comprador == _detalle()["Listado"][0]["Comprador"]


def test_no_toca_el_original_y_es_idempotente():
    original = _detalle()
    copia = copy.deepcopy(original)
    una = enmascarar_payload(original)
    assert original == copia
    assert enmascarar_payload(una) == una


def test_sin_rut_legible_cuenta_como_persona():
    limpio = enmascarar_payload({"Participantes": [{"Rut": "NA", "Nombre": "JUAN PÉREZ"}]})
    assert limpio["Participantes"][0]["Nombre"] == NOMBRE_ENMASCARADO


@pytest.mark.parametrize(
    "cotizacion",
    [
        # Compra Ágil (API v2): `proveedores_cotizando`, formas plausibles.
        {"rut": PERSONA_RUT, "nombre": PERSONA, "es_emt": True, "total": 50_000},
        {"rut_proveedor": PERSONA_RUT, "razon_social": PERSONA, "total": 50_000},
        {"proveedor": PERSONA, "rut": PERSONA_RUT, "total": 50_000},
    ],
)
def test_cotizaciones_de_compra_agil(cotizacion):
    detalle = {"codigo": "1234-5-COT26", "proveedores_cotizando": [cotizacion]}
    _sin_rastro(enmascarar_payload(detalle))


def test_proveedor_seleccionado_como_texto():
    detalle = {"codigo": "1234-5-COT26", "proveedor_seleccionado": PERSONA}
    assert enmascarar_payload(detalle)["proveedor_seleccionado"] == NOMBRE_ENMASCARADO


# ── Lo que se deriva ────────────────────────────────────────────────────────


@pytest.mark.parametrize("desde_guardado", [False, True], ids=["crudo", "guardado"])
def test_proveedor_adjudicado(desde_guardado):
    """Sale igual del payload crudo y del ya guardado (limpio): son los dos
    caminos del loader (`load_licitacion_detalle_inicial` y la sincronización)."""
    detalle = _detalle()["Listado"][0]
    if desde_guardado:
        detalle = enmascarar_payload(detalle)
    texto = extraer_datos_adjudicacion(detalle)["proveedor_adjudicado"]
    assert texto == f"{EMPRESA} ({EMPRESA_RUT}); {NOMBRE_ENMASCARADO}"


def test_dos_personas_ganadoras_se_dicen_una_vez():
    detalle = {"Items": {"Listado": [_item(PERSONA_RUT, PERSONA), _item("9.876.543-2", "MARÍA")]}}
    assert extraer_datos_adjudicacion(detalle)["proveedor_adjudicado"] == NOMBRE_ENMASCARADO


def test_el_monto_adjudicado_no_cambia_al_enmascarar():
    crudo = _detalle()["Listado"][0]
    assert (
        extraer_datos_adjudicacion(crudo)["monto_adjudicado"]
        == extraer_datos_adjudicacion(enmascarar_payload(crudo))["monto_adjudicado"]
        == "2000000"
    )


def test_el_transformador_del_listado_guarda_items_e_informacion_limpios():
    principal = _detalle()["Listado"][0]
    fila = LicitacionTransformer().transform(
        {**principal, "FechaPublicacion": "2026-03-01T10:00:00", "Estado": "Adjudicada"}
    )
    _sin_rastro(fila.get("items"))
    _sin_rastro(fila.get("informacion_adicional"))


def test_el_transformador_de_compra_agil_tambien():
    fila = CompraAgilTransformer().transform(
        {
            "codigo": "1234-5-COT26",
            "nombre": "Compra de pan",
            "proveedores_cotizando": [{"rut": PERSONA_RUT, "nombre": PERSONA}],
        }
    )
    _sin_rastro(fila)


def test_la_lista_de_oferentes_a_secas_necesita_el_contexto():
    """Una lista de oferentes suelta no tiene una clave «Participantes» encima."""
    oferentes = [{"Rut": PERSONA_RUT, "Nombre": PERSONA}, {"Rut": EMPRESA_RUT, "Nombre": EMPRESA}]
    assert enmascarar_payload(oferentes) == oferentes  # sin contexto, nada que decir
    limpio = enmascarar_payload(oferentes, en_contexto=True)
    _sin_rastro(limpio)
    assert limpio[1] == oferentes[1]
