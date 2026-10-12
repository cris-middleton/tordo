"""La copia congelada de la regla en la migración dice lo mismo que la viva.

La migración `6e47ba0cd7c9` lleva su propia copia de `personas` porque una
migración no puede importar código que cambia. Este test es lo que impide que
las dos se separen sin que nadie se entere: lo ya guardado y lo que entra desde
ahora tienen que quedar igual de limpios.
"""

import importlib.util
from pathlib import Path

import pytest

from etl.analytics import personas
from etl.utils.adjudicacion import _formatear_proveedores

RUTA = next(
    (Path(__file__).resolve().parents[2] / "backend" / "alembic" / "versions").glob(
        "6e47ba0cd7c9_*.py"
    )
)
_spec = importlib.util.spec_from_file_location("migracion_personas", RUTA)
migracion = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migracion)

PERSONA_RUT, PERSONA = "12.708.987-6", "RAÚL HERNÁNDEZ"
EMPRESA_RUT, EMPRESA = "76.543.210-3", "PYME GANADORA SPA"

PAYLOADS = [
    {
        "Listado": [
            {
                "Comprador": {"RutUnidad": "61.608.700-2", "NombreOrganismo": "HOSPITAL"},
                "Items": {
                    "Listado": [
                        {"Adjudicacion": {"RutProveedor": PERSONA_RUT, "NombreProveedor": PERSONA}},
                        {"Adjudicacion": {"RutProveedor": EMPRESA_RUT, "NombreProveedor": EMPRESA}},
                    ]
                },
                "Participantes": [
                    {"Rut": PERSONA_RUT, "Nombre": PERSONA},
                    {"Rut": "NA", "RazonSocial": "SIN RUT"},
                    {"Rut": EMPRESA_RUT, "RazonSocial": EMPRESA},
                ],
            }
        ]
    },
    {"proveedores_cotizando": [{"rut": PERSONA_RUT, "nombre": PERSONA, "total": 1}]},
    {"proveedor_seleccionado": PERSONA, "codigo": "1-2-COT26"},
    {"CodigoProveedor": "123", "NombreProveedor": PERSONA, "RutSucursal": PERSONA_RUT},
    [1, "texto", None, {"a": {"b": [{"rutOferente": EMPRESA_RUT, "nombreOferente": EMPRESA}]}}],
    None,
]


@pytest.mark.parametrize("en_contexto", [False, True])
@pytest.mark.parametrize("payload", PAYLOADS)
def test_el_recorrido_congelado_y_el_vivo_coinciden(payload, en_contexto):
    assert migracion.enmascarar_payload(
        payload, en_contexto=en_contexto
    ) == personas.enmascarar_payload(payload, en_contexto=en_contexto)


@pytest.mark.parametrize(
    "texto", ["12.708.987-6", "76.543.210-3", "77563796-K", "NA", "", None, "abc", " 9.876.543-2 "]
)
def test_la_regla_congelada_y_la_viva_coinciden(texto):
    assert migracion.rut_numero(texto) == personas.rut_numero(texto)
    numero = personas.rut_numero(texto)
    assert migracion.es_persona_natural(numero) == personas.es_persona_natural(numero)


def _formato_anterior(ganadores: dict) -> str | None:
    """Cómo escribía `_formatear_proveedores` ANTES de enmascarar (copia literal)."""
    partes = []
    for datos in ganadores.values():
        nombre = (datos.get("nombre") or "").strip()
        rut = (datos.get("rut") or "").strip()
        if nombre and rut:
            partes.append(f"{nombre} ({rut})")
        elif nombre:
            partes.append(nombre)
        elif rut:
            partes.append(rut)
    return "; ".join(partes)[:500] if partes else None


GANADORES = [
    {"a": {"nombre": EMPRESA, "rut": EMPRESA_RUT}},
    {"a": {"nombre": PERSONA, "rut": PERSONA_RUT}},
    {"a": {"nombre": EMPRESA, "rut": EMPRESA_RUT}, "b": {"nombre": PERSONA, "rut": PERSONA_RUT}},
    {"a": {"nombre": PERSONA, "rut": PERSONA_RUT}, "b": {"nombre": EMPRESA, "rut": EMPRESA_RUT}},
    {"a": {"nombre": "SOLO NOMBRE", "rut": None}},
    {"a": {"nombre": None, "rut": EMPRESA_RUT}},
    {"a": {"nombre": None, "rut": PERSONA_RUT}},
    {
        "a": {"nombre": PERSONA, "rut": PERSONA_RUT},
        "b": {"nombre": "OTRA PERSONA", "rut": "9.876.543-2"},
        "c": {"nombre": "CONSTRUCTORA RIVAL LTDA", "rut": "99.888.777-1"},
    },
]


@pytest.mark.parametrize("ganadores", GANADORES)
def test_proveedor_adjudicado_guardado_queda_como_el_nuevo(ganadores):
    guardado = _formato_anterior(ganadores)
    assert migracion.reescribir_proveedor_adjudicado(guardado) == _formatear_proveedores(ganadores)


def test_reescribir_lo_ya_limpio_no_cambia_nada():
    for ganadores in GANADORES:
        nuevo = _formatear_proveedores(ganadores)
        assert migracion.reescribir_proveedor_adjudicado(nuevo) == nuevo
