"""Llevarse el análisis fuera de la pantalla.

**Se exportan las pantallas de BI, no el listado de licitaciones**, y ésa es la
diferencia con lo que hace la competencia. Exportar un listado de llamados no
sirve de mucho: ya está en Mercado Público. Exportar la banda de precio de un
producto o el mapa de competidores de un comprador **es un entregable**: se pega
en una propuesta interna, se manda al socio que decide, se archiva con la oferta.

Dos reglas que no son obvias:

- **El CSV va con BOM y separador de punto y coma.** Sin BOM, Excel en Windows
  parte los acentos; con coma como separador, Excel en configuración regional
  chilena mete todo en una columna. Es un archivo que se abre en Excel el 95 % de
  las veces, y un CSV que se abre mal no es un entregable.
- **La primera línea es la cita de la fuente, y los encabezados van en la
  segunda.** La *Declaración de Uso de Datos Oficiales*
  (`docs/DECLARACION_USO_DATOS.md`) exige citar a ChileCompra en toda
  publicación de los datos, y un CSV es justo la forma en que los datos salen del
  sitio y se reenvían sin él. En el pie de la web no basta: el archivo viaja solo.
  Quien lo lea con pandas necesita `skiprows=1`.
"""

from __future__ import annotations

import csv
import io
from datetime import UTC, datetime
from typing import Any

#: Excel en Windows necesita el BOM para leer UTF-8. Sin él, cada tilde sale como
#: dos caracteres raros y el archivo parece corrupto.
BOM = "﻿"

#: Separador. Punto y coma y no coma: es lo que espera Excel con configuración
#: regional chilena, donde la coma es el separador decimal.
SEPARADOR = ";"

#: La cita que exige la Declaración, literal. Duplicada a propósito en
#: `frontend/lib/atribucion.ts` (pie de cada página); un test comprueba que las
#: dos digan lo mismo.
ATRIBUCION = "Fuente: Dirección de Compras y Contratación Pública (ChileCompra / Mercado Público)"


def _valor(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        # Coma decimal, que es lo que lee Excel en Chile. Un punto se
        # interpretaría como separador de miles y multiplicaría por mil.
        return f"{v:.2f}".replace(".", ",")
    return str(v)


def a_csv(filas: list[dict], columnas: list[tuple[str, str]]) -> str:
    """Convierte filas a CSV. `columnas` es [(clave, encabezado)].

    Las columnas se declaran explícitamente y no se deducen de la primera fila:
    con `dict.keys()`, un cambio en el orden de un servicio cambiaría el orden
    del archivo, y una fila con una clave de menos lo dejaría desalineado.
    """
    salida = io.StringIO()
    escritor = csv.writer(salida, delimiter=SEPARADOR, quoting=csv.QUOTE_MINIMAL)
    escritor.writerow([ATRIBUCION])
    escritor.writerow([encabezado for _, encabezado in columnas])
    for fila in filas:
        escritor.writerow([_valor(fila.get(clave)) for clave, _ in columnas])
    return BOM + salida.getvalue()


def nombre_archivo(recurso: str, referencia: str) -> str:
    """`tordo-precio-41116000-2026-08-16.csv`.

    Lleva la fecha porque estos archivos acaban en carpetas compartidas: sin
    ella, dos exportaciones del mismo producto en meses distintos se pisan y
    nadie sabe cuál es la buena.
    """
    limpio = "".join(c if c.isalnum() or c in "-_" else "-" for c in referencia)[:40]
    return f"tordo-{recurso}-{limpio}-{datetime.now(UTC):%Y-%m-%d}.csv"


COLUMNAS_PRECIO: list[tuple[str, str]] = [
    ("descripcion", "Producto"),
    ("NombreProductoGenerico", "Categoría"),
    ("OrganismoPublico", "Comprador"),
    ("UnidadMedida", "Unidad"),
    ("n", "Compras"),
    ("p10", "P10"),
    ("p25", "P25"),
    ("p50", "Mediana"),
    ("p75", "P75"),
    ("p90", "P90"),
    ("qcd", "Dispersión (QCD)"),
    ("predictibilidad", "Predictibilidad"),
]

COLUMNAS_COMPETIDORES: list[tuple[str, str]] = [
    ("NombreProveedor", "Proveedor"),
    # `CodigoProveedor` es el identificador interno de Mercado Público, NO un
    # RUT (ver CLAUDE.md). El encabezado decía «RUT», y quien lo cruzara con
    # RUT reales no encontraría coincidencias.
    ("CodigoProveedor", "Código de proveedor"),
    ("n_oc", "Órdenes ganadas"),
    ("monto_total", "Monto total"),
    ("participacion", "Participación"),
]
