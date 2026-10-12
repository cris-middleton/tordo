"""Extraer el resultado de una licitación desde el detalle de la API clásica.

**La forma de este payload no está verificada contra producción.** No hay
ticket de Mercado Público en este entorno (`MERCADO_PUBLICO_TICKET` vacío), así
que nada de lo de abajo se contrastó nunca contra una respuesta real. Se basa
en dos fuentes, ninguna de las cuales es una captura real:

1. `docs/Documentación API Mercado Publico - Licitaciones.pdf` (filas 79-97 de
   la tabla de campos): documenta la fecha de adjudicación anidada bajo
   `Fechas.FechaAdjudicacion`, y el proveedor/monto ganador **por ítem**,
   anidados bajo `Items.Listado[].Adjudicacion.{RutProveedor, NombreProveedor,
   CantidadAdjudicada, MontoUnitario}`. No hay documentado un campo único de
   "monto total adjudicado" a nivel de licitación — sólo por línea, y una
   licitación puede tener más de un proveedor ganador (`Adjudicacion.
   NumeroOferentes` cuenta "proveedores adjudicados", en plural).
2. `LicitacionTransformer._parse_date` (`etl/transformers/licitacion_transformer.py`)
   ya lee `FechaCierre` como campo **plano** al nivel raíz del objeto, no
   anidado bajo `Fechas` como documenta el PDF, y ese código corre en
   producción hoy. Es la única evidencia indirecta de que el JSON real aplana
   lo que un documento de origen XML/WSDL describe anidado — así que aquí se
   prueba primero la forma plana y la anidada queda como respaldo, no al
   revés.

Por eso cada campo se busca en varias formas plausibles y, si ninguna calza,
se devuelve `None` en vez de inventar un valor: es preferible no saber el
resultado todavía a decirle a una empresa algo que no se pudo confirmar.
El payload íntegro ya no se guarda (paso 7 del pivote): para confirmar o
corregir las rutas de abajo, hay que pedir detalles reales a la API con ticket.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from etl.analytics.personas import NOMBRE_ENMASCARADO, es_persona_natural, rut_numero

# Mismos formatos que `LicitacionTransformer._parse_date`: duplicado a propósito,
# en vez de hacer que este módulo dependa de una instancia de transformer.
_FORMATOS_FECHA = [
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
]


def _primero(*valores: Any) -> Any:
    """El primer valor no vacío, probando varias formas plausibles del mismo campo."""
    for v in valores:
        if v not in (None, ""):
            return v
    return None


def _parsear_fecha(valor: Any) -> datetime | None:
    if not valor:
        return None
    if isinstance(valor, datetime):
        return valor
    for fmt in _FORMATOS_FECHA:
        try:
            return datetime.strptime(str(valor), fmt)
        except (ValueError, TypeError):
            continue
    return None


def _a_float(valor: Any) -> float | None:
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    try:
        return float(str(valor).replace(",", "."))
    except ValueError:
        return None


def _items_de(main_obj: dict) -> list[dict]:
    """`Items` documentado como `{Cantidad, Listado}`. Se admite también una
    lista plana, por si la API real no envuelve como documenta el PDF (ver
    docstring del módulo)."""
    items = _primero(main_obj.get("Items"), main_obj.get("items"))
    if isinstance(items, dict):
        items = _primero(items.get("Listado"), items.get("listado"))
    if not isinstance(items, list):
        return []
    return [i for i in items if isinstance(i, dict)]


def componer_proveedores(partes: list[str], hay_personas_naturales: bool) -> str | None:
    """Las empresas, «NOMBRE (RUT)», y al final «Persona natural» si ganó alguna.

    Sin contar cuántas: en un payload ya enmascarado (`personas.
    enmascarar_payload`) dos personas distintas son indistinguibles, y el texto
    tiene que salir igual se calcule del payload crudo o del guardado.
    """
    todas = partes + ([NOMBRE_ENMASCARADO] if hay_personas_naturales else [])
    if not todas:
        return None
    # String(500) en la base: se trunca en vez de fallar la carga por un
    # nombre de proveedor largo.
    return "; ".join(todas)[:500]


def _formatear_proveedores(ganadores: dict[str, dict[str, Any]]) -> str | None:
    """Un texto legible con cada EMPRESA ganadora y su RUT entre paréntesis.

    **Las personas naturales no se nombran** (spec del pivote §8): el catálogo
    es público y `proveedor_adjudicado` se sirve tal cual. Se reconocen con la
    misma regla que analytics (`personas.es_persona_natural`): RUT bajo
    50.000.000 **o sin RUT legible**.
    """
    partes = []
    hay_personas = False
    for datos in ganadores.values():
        nombre = (datos.get("nombre") or "").strip()
        rut = (datos.get("rut") or "").strip()
        if es_persona_natural(rut_numero(rut)):
            hay_personas = True
        elif nombre:
            partes.append(f"{nombre} ({rut})")
        else:
            partes.append(rut)
    return componer_proveedores(partes, hay_personas)


def extraer_datos_adjudicacion(main_obj: dict) -> dict[str, Any]:
    """Fecha, monto total y proveedor(es) ganadores de una licitación.

    `main_obj` es el objeto de la licitación **ya desenvuelto** de
    `{"Listado": [...]}`  (lo que en `database_loader_v2.py` se llama
    `_get_main_object`) — esta función no conoce ese envoltorio.

    Devuelve las tres claves con `None` cuando el payload no trae todavía
    ninguna señal de adjudicación conocida (fecha ni proveedores), que es el
    estado normal de una licitación mientras sigue abierta.
    """
    vacio = {"fecha_adjudicacion": None, "monto_adjudicado": None, "proveedor_adjudicado": None}
    if not isinstance(main_obj, dict):
        return vacio

    fechas = main_obj.get("Fechas")
    if not isinstance(fechas, dict):
        fechas = main_obj.get("fechas")
    if not isinstance(fechas, dict):
        fechas = {}

    fecha_adjudicacion = _parsear_fecha(
        _primero(
            main_obj.get("FechaAdjudicacion"),
            main_obj.get("fechaAdjudicacion"),
            fechas.get("FechaAdjudicacion"),
            fechas.get("fechaAdjudicacion"),
        )
    )

    # rut o nombre crudo -> {"nombre", "rut", "monto"}. Se agrupa por
    # proveedor porque una licitación con varias líneas puede repetir al
    # mismo ganador en más de una, y el monto total debe sumarlas, no
    # duplicar el nombre en el texto.
    ganadores: dict[str, dict[str, Any]] = {}
    for item in _items_de(main_obj):
        adj = _primero(item.get("Adjudicacion"), item.get("adjudicacion"))
        if not isinstance(adj, dict):
            continue

        rut = _primero(adj.get("RutProveedor"), adj.get("rutProveedor"))
        nombre = _primero(adj.get("NombreProveedor"), adj.get("nombreProveedor"))
        if not rut and not nombre:
            continue

        cantidad = _a_float(_primero(adj.get("CantidadAdjudicada"), adj.get("cantidadAdjudicada")))
        monto_unitario = _a_float(_primero(adj.get("MontoUnitario"), adj.get("montoUnitario")))
        subtotal = (cantidad or 0.0) * (monto_unitario or 0.0)

        clave = str(rut or nombre)
        entrada = ganadores.setdefault(clave, {"nombre": nombre, "rut": rut, "monto": 0.0})
        entrada["monto"] += subtotal

    if fecha_adjudicacion is None and not ganadores:
        return vacio

    monto_total = sum(g["monto"] for g in ganadores.values())

    return {
        "fecha_adjudicacion": fecha_adjudicacion,
        # Sin puntos de miles NI punto decimal: `monto_adjudicado` es
        # String(50) en la base, y el consumidor
        # (`services/resultados.py::_a_numero`) interpreta el punto como
        # separador de miles al estilo chileno. Formatear "3100000.0" se
        # leería allá como 31.000.000 — diez veces el monto real. El peso
        # chileno no tiene decimales en la práctica, así que se redondea.
        "monto_adjudicado": (f"{monto_total:.0f}" if monto_total else None),
        "proveedor_adjudicado": _formatear_proveedores(ganadores),
    }
