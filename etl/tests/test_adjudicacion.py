"""El productor del resultado: lo que faltaba para que el ciclo pudiera cerrar.

PR #76 construyó todo el consumidor (`services/resultados.py`,
`tasks/resultado_tasks.py`, alertas, correo) sobre tres columnas de
`licitaciones_detalle` — `fecha_adjudicacion`, `monto_adjudicado`,
`proveedor_adjudicado` — que **nada llenaba nunca**. `detectar_resultados()`
filtraba por `fecha_adjudicacion IS NOT NULL` y siempre estaba vacío; el ETL
volvía a pedir por la API, cada día, cada licitación seguida y cerrada, para
siempre, porque `fecha_adjudicacion IS NULL` era eternamente verdadero.

Estos tests son la parte pura de la solución: `extraer_datos_adjudicacion` no
toca la base ni la red, así que se puede probar la forma del payload sin
credenciales de Mercado Público (no hay ticket en este entorno). La forma
exacta del payload real no está verificada — ver el docstring del módulo—,
así que aquí se prueban las variantes plausibles, no una única "la correcta".
"""

from __future__ import annotations

from datetime import datetime

from etl.utils.adjudicacion import extraer_datos_adjudicacion

# ── Sin adjudicación conocida ────────────────────────────────────────────────


def test_sin_fecha_ni_items_no_hay_nada_que_contar():
    """El estado normal de una licitación mientras sigue abierta."""
    resultado = extraer_datos_adjudicacion({"CodigoExterno": "LIC-1", "Estado": "Publicada"})

    assert resultado == {
        "fecha_adjudicacion": None,
        "monto_adjudicado": None,
        "proveedor_adjudicado": None,
    }


def test_un_payload_que_no_es_dict_no_revienta():
    assert extraer_datos_adjudicacion(None) == {
        "fecha_adjudicacion": None,
        "monto_adjudicado": None,
        "proveedor_adjudicado": None,
    }
    assert extraer_datos_adjudicacion([])["fecha_adjudicacion"] is None


# ── Fecha: plana vs anidada bajo Fechas ──────────────────────────────────────


def test_fecha_adjudicacion_plana_al_nivel_raiz():
    """`LicitacionTransformer` ya lee `FechaCierre` plano en producción: es la
    evidencia de que el JSON real aplana lo que el PDF documenta anidado."""
    resultado = extraer_datos_adjudicacion({"FechaAdjudicacion": "2026-03-15T00:00:00"})

    assert resultado["fecha_adjudicacion"] == datetime(2026, 3, 15)


def test_fecha_adjudicacion_anidada_bajo_fechas():
    """La forma que sí documenta el PDF (Licitacion/Fechas/FechaAdjudicacion)."""
    resultado = extraer_datos_adjudicacion({"Fechas": {"FechaAdjudicacion": "2026-03-15"}})

    assert resultado["fecha_adjudicacion"] == datetime(2026, 3, 15)


def test_variante_en_minuscula():
    resultado = extraer_datos_adjudicacion({"fechas": {"fechaAdjudicacion": "2026-03-15"}})

    assert resultado["fecha_adjudicacion"] == datetime(2026, 3, 15)


def test_fecha_con_formato_invalido_no_revienta():
    resultado = extraer_datos_adjudicacion({"FechaAdjudicacion": "no es una fecha"})

    assert resultado["fecha_adjudicacion"] is None


# ── Proveedor y monto: por ítem, uno o varios ganadores ─────────────────────


def _item(rut: str, nombre: str, cantidad: float, monto_unitario: float) -> dict:
    return {
        "Correlativo": 1,
        "NombreProducto": "Servicio de prueba",
        "Adjudicacion": {
            "RutProveedor": rut,
            "NombreProveedor": nombre,
            "CantidadAdjudicada": cantidad,
            "MontoUnitario": monto_unitario,
        },
    }


def test_un_solo_proveedor_ganador_con_items_como_listado_anidado():
    """`Items` documentado como `{Cantidad, Listado}`, no una lista plana."""
    payload = {
        "FechaAdjudicacion": "2026-03-15",
        "Items": {
            "Cantidad": 1,
            "Listado": [_item("76543210-3", "PYME DE PRUEBA SPA", 2, 1_550_000)],
        },
    }

    resultado = extraer_datos_adjudicacion(payload)

    assert resultado["proveedor_adjudicado"] == "PYME DE PRUEBA SPA (76543210-3)"
    assert resultado["monto_adjudicado"] == "3100000"


def test_items_como_lista_plana_tambien_se_admite():
    """Por si la API real no envuelve en `{Cantidad, Listado}` como dice el PDF."""
    payload = {
        "FechaAdjudicacion": "2026-03-15",
        "items": [_item("76543210-3", "PYME DE PRUEBA SPA", 1, 2_900_000)],
    }

    resultado = extraer_datos_adjudicacion(payload)

    assert resultado["proveedor_adjudicado"] == "PYME DE PRUEBA SPA (76543210-3)"
    assert resultado["monto_adjudicado"] == "2900000"


def test_dos_proveedores_ganadores_en_lineas_distintas():
    """`Adjudicacion.NumeroOferentes` a nivel de licitación cuenta "proveedores
    adjudicados" en plural: una licitación puede repartirse entre varios."""
    payload = {
        "FechaAdjudicacion": "2026-03-15",
        "Items": [
            _item("76543210-3", "PYME DE PRUEBA SPA", 1, 1_000_000),
            _item("99888777-1", "CONSTRUCTORA RIVAL LTDA", 1, 2_000_000),
        ],
    }

    resultado = extraer_datos_adjudicacion(payload)

    assert "PYME DE PRUEBA SPA (76543210-3)" in resultado["proveedor_adjudicado"]
    assert "CONSTRUCTORA RIVAL LTDA (99888777-1)" in resultado["proveedor_adjudicado"]
    # El monto total es de la licitación completa, no de un solo ganador.
    assert resultado["monto_adjudicado"] == "3000000"


def test_el_mismo_proveedor_gana_dos_lineas_se_suma_no_se_duplica():
    payload = {
        "FechaAdjudicacion": "2026-03-15",
        "Items": [
            _item("76543210-3", "PYME DE PRUEBA SPA", 1, 1_000_000),
            _item("76543210-3", "PYME DE PRUEBA SPA", 2, 500_000),
        ],
    }

    resultado = extraer_datos_adjudicacion(payload)

    assert resultado["proveedor_adjudicado"] == "PYME DE PRUEBA SPA (76543210-3)"
    assert resultado["monto_adjudicado"] == "2000000"


def test_item_sin_adjudicacion_se_ignora():
    """Una licitación con adjudicación conocida pero con líneas desiertas
    (sin `Adjudicacion`) no debe fallar ni sumar nada por esas líneas."""
    payload = {
        "FechaAdjudicacion": "2026-03-15",
        "Items": [
            {"Correlativo": 1, "NombreProducto": "Línea desierta"},
            _item("76543210-3", "PYME DE PRUEBA SPA", 1, 500_000),
        ],
    }

    resultado = extraer_datos_adjudicacion(payload)

    assert resultado["monto_adjudicado"] == "500000"


def test_item_con_monto_o_cantidad_faltante_no_revienta():
    payload = {
        "FechaAdjudicacion": "2026-03-15",
        "Items": [
            {
                "Adjudicacion": {
                    "RutProveedor": "76543210-3",
                    "NombreProveedor": "PYME DE PRUEBA SPA",
                    # Sin CantidadAdjudicada ni MontoUnitario.
                }
            }
        ],
    }

    resultado = extraer_datos_adjudicacion(payload)

    assert resultado["proveedor_adjudicado"] == "PYME DE PRUEBA SPA (76543210-3)"
    # No hay monto que sumar: mejor None que un total inventado en cero.
    assert resultado["monto_adjudicado"] is None


def test_fecha_conocida_pero_items_sin_adjudicacion_deja_proveedor_y_monto_en_none():
    """La fecha puede llegar antes que el detalle de las líneas: se guarda lo
    que se sabe, no se descarta todo por lo que falta."""
    payload = {"FechaAdjudicacion": "2026-03-15", "Items": []}

    resultado = extraer_datos_adjudicacion(payload)

    assert resultado["fecha_adjudicacion"] == datetime(2026, 3, 15)
    assert resultado["proveedor_adjudicado"] is None
    assert resultado["monto_adjudicado"] is None


def test_variantes_en_minuscula_del_item():
    payload = {
        "FechaAdjudicacion": "2026-03-15",
        "items": [
            {
                "adjudicacion": {
                    "rutProveedor": "76543210-3",
                    "nombreProveedor": "PYME DE PRUEBA SPA",
                    "cantidadAdjudicada": 1,
                    "montoUnitario": 100,
                }
            }
        ],
    }

    resultado = extraer_datos_adjudicacion(payload)

    assert resultado["proveedor_adjudicado"] == "PYME DE PRUEBA SPA (76543210-3)"
    assert resultado["monto_adjudicado"] == "100"


def test_el_monto_nunca_lleva_punto():
    """Contrato con el consumidor: `services/resultados.py::_a_numero` trata
    el punto como separador de miles al estilo chileno. Un total con "." de
    decimal Python (p. ej. "3100000.0") se leería allá multiplicado por diez."""
    payload = {
        "FechaAdjudicacion": "2026-03-15",
        "Items": [_item("76543210-3", "PYME DE PRUEBA SPA", 3, 333_333.33)],
    }

    resultado = extraer_datos_adjudicacion(payload)

    assert "." not in resultado["monto_adjudicado"]
