"""Los mecanismos de compra del Estado chileno, y qué se sabe de cada uno.

Vive aparte de los modelos porque lo consultan tres capas —ETL, API y frontend—
y una copia en cada una se desincroniza en cuanto ChileCompra añade un
mecanismo.

Por qué hace falta un discriminador
-----------------------------------
El modelo de datos daba por hecho que todo lo que se ingiere es una licitación.
No lo es: **Compra Ágil y Convenio Marco son cerca de la mitad del mercado
chileno** y hoy no se ven en el producto. Sin una columna que los distinga, no
hay forma de filtrarlos, contarlos ni alertar sobre ellos por separado.
"""

from __future__ import annotations

from enum import StrEnum


class TipoConvocatoria(StrEnum):
    """Cómo el Estado convoca a los proveedores.

    Se guarda como texto y no como enum de Postgres a propósito: añadir un
    mecanismo nuevo no debería exigir una migración con `ALTER TYPE`, que en
    Postgres no se puede revertir dentro de una transacción.
    """

    LICITACION = "licitacion"
    COMPRA_AGIL = "compra_agil"
    CONVENIO_MARCO = "convenio_marco"
    TRATO_DIRECTO = "trato_directo"


#: Cómo se muestran en la interfaz.
ETIQUETAS: dict[str, str] = {
    TipoConvocatoria.LICITACION: "Licitación",
    TipoConvocatoria.COMPRA_AGIL: "Compra Ágil",
    TipoConvocatoria.CONVENIO_MARCO: "Convenio Marco",
    TipoConvocatoria.TRATO_DIRECTO: "Trato Directo",
}


# ── Órdenes de compra ────────────────────────────────────────────────────────
#
# El campo `Tipo` de una orden de compra dice por qué mecanismo se compró.
# Los códigos salen del diccionario de datos oficial de la API
# («Documentación API Mercado Público - Órdenes de Compra», §3.1):
#
#     1  Automática
#     2  Trato Directo Proveedor Único
#     8  SE  Sin emisión automática
#     9  CM  Convenio Marco
#
# Es la ÚNICA forma de ver Convenio Marco en los datos: la API no tiene un
# endpoint propio para ese mecanismo, las compras aparecen como órdenes.
TIPO_OC_A_CONVOCATORIA: dict[str, str] = {
    "2": TipoConvocatoria.TRATO_DIRECTO,
    "9": TipoConvocatoria.CONVENIO_MARCO,
}


def convocatoria_de_orden(tipo_oc: str | int | None) -> str | None:
    """El mecanismo de compra de una orden, o `None` si su tipo no lo identifica.

    `None` no es un error: los tipos 1 y 8 describen **cómo se emitió** la orden
    (automática, sin emisión automática), no por qué mecanismo se compró. Meterlos
    a la fuerza en una categoría sería inventar información.
    """
    if tipo_oc is None:
        return None
    return TIPO_OC_A_CONVOCATORIA.get(str(tipo_oc).strip())
