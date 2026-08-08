"""Convierte una Compra Ágil de la API v2 en una fila de `licitaciones`.

Por qué van a la misma tabla
----------------------------
Todo el producto —alertas, matching, postulaciones, checklist, búsqueda— opera
sobre `licitaciones`. Una Compra Ágil es otra forma de convocatoria, no otra
entidad: lo que cambia es el mecanismo, y para eso está `tipo_convocatoria`.
Darle tabla propia obligaría a duplicar cada consulta del producto.

Qué se pierde, dicho claro
--------------------------
El **listado** de la API v2 no trae `descripcion`; sólo el detalle, y el detalle
cuesta una petición por registro contra una API con **cuota diaria**. Se ingiere
desde el listado, así que las Compras Ágiles entran con descripción vacía y su
búsqueda por texto se apoya sólo en el nombre.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from etl.shared_imports import TipoConvocatoria
from etl.transformers.base import BaseTransformer


def _fecha(valor: Any) -> datetime | None:
    """ISO-8601 con `Z` incluido, que Python 3.11 no acepta directamente."""
    if not valor:
        return None
    if isinstance(valor, datetime):
        return valor
    try:
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        return None


class CompraAgilTransformer(BaseTransformer):
    """De la forma de la API v2 a la del modelo `Licitacion`."""

    def transform(self, data: Dict[str, Any]) -> Dict[str, Any] | None:
        codigo = data.get("codigo")
        if not codigo:
            # Sin código no hay clave de negocio: la fila no se puede upsertar
            # ni volver a encontrar. Se descarta en vez de inventar una.
            self.logger.warning("Compra Ágil sin `codigo`, se descarta: %s", data)
            return None

        estado = data.get("estado") or {}
        fechas = data.get("fechas") or {}
        montos = data.get("montos") or {}
        institucion = data.get("institucion") or {}
        convocatoria = data.get("convocatoria") or {}
        resumen = data.get("resumen") or {}

        fecha_publicacion = _fecha(fechas.get("fecha_publicacion"))
        if not fecha_publicacion:
            # `fecha_publicacion` es NOT NULL en el modelo. Sin ella la fila no
            # entra, y adivinarla falsearía el orden del listado.
            self.logger.warning("Compra Ágil %s sin fecha de publicación, se descarta", codigo)
            return None

        return {
            "codigo_externo": str(codigo),
            "nombre": data.get("nombre") or "",
            # El listado no trae descripción; sólo el detalle, y el detalle
            # cuesta una petición por registro contra una API con cuota diaria.
            "descripcion": "",
            "tipo_convocatoria": TipoConvocatoria.COMPRA_AGIL.value,
            "fecha_publicacion": fecha_publicacion,
            "fecha_cierre": _fecha(fechas.get("fecha_cierre")),
            # La glosa y no el código: es lo que se muestra, y el código
            # normalizado queda en `informacion_adicional`.
            "estado": estado.get("glosa") or estado.get("codigo"),
            # El monto normalizado a CLP, no el original: es lo que permite
            # comparar y ordenar junto al resto del catálogo.
            "monto_estimado": montos.get("monto_disponible_clp"),
            "moneda": montos.get("moneda") or "CLP",
            "nombre_organismo": institucion.get("organismo_comprador"),
            "rut_organismo": institucion.get("rut"),
            "region": institucion.get("nombre_region"),
            "activo": True,
            "informacion_adicional": {
                "estado_codigo": estado.get("codigo"),
                "estado_id": estado.get("id_estado"),
                # 1 = primer llamado, 2 = segundo. Una Compra Ágil desierta en el
                # primero se vuelve a abrir, y sin esto los dos llamados serían
                # indistinguibles.
                "estado_convocatoria": convocatoria.get("estado_convocatoria"),
                "convocatoria": convocatoria.get("descripcion"),
                "unidad_compra": institucion.get("unidad_compra"),
                "region_codigo": institucion.get("region"),
                "total_ofertas_recibidas": resumen.get("total_ofertas_recibidas"),
                "fecha_ultimo_cambio": fechas.get("fecha_ultimo_cambio"),
                "fecha_cancelacion": fechas.get("fecha_cancelacion"),
                "motivos": data.get("motivos") or {},
                "monto_disponible_original": montos.get("monto_disponible"),
            },
            "items": [],
        }
