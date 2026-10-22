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

from etl.analytics.personas import enmascarar_payload
from etl.shared_imports import TipoConvocatoria, en_hora_de_chile
from etl.transformers.base import BaseTransformer


def _fecha(valor: Any) -> datetime | None:
    """Una fecha de la API v2, como instante con zona.

    **La API marca sus horas con `Z`, pero son hora de CHILE** (medido, spec del
    pivote §6.1; el extractor ya consulta así). Leer la `Z` como UTC guardaba
    cada cierre y cada publicación 3–4 h antes de la cuenta: una Compra Ágil
    salía cerrada horas antes de cerrar, y el corte de 2 h de «lo mejor de
    hoy» quedaba corrido lo mismo. Así que una `Z`, o una fecha sin zona, se
    lee como hora de pared de `America/Santiago` —con su cambio de hora, no con
    un desfase fijo—. Un desfase explícito distinto de `Z` se respeta.
    """
    if not valor:
        return None
    if isinstance(valor, datetime):
        fecha = valor
    else:
        texto = str(valor).strip()
        if texto.endswith(("Z", "z")):
            texto = texto[:-1]
        try:
            fecha = datetime.fromisoformat(texto)
        except ValueError:
            return None
    return en_hora_de_chile(fecha)


class CompraAgilTransformer(BaseTransformer):
    """De la forma de la API v2 a la del modelo `Licitacion`."""

    def transform(self, data: Dict[str, Any]) -> Dict[str, Any] | None:
        # Personas naturales tapadas al entrar: el resto se guarda tal cual.
        data = enmascarar_payload(data)
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
            # El listado no trae descripción: la pone `campos_desde_detalle`.
            # None y no "": en el upsert, un vacío no borra la que ya haya.
            "descripcion": None,
            "tipo_convocatoria": TipoConvocatoria.COMPRA_AGIL.value,
            "fecha_publicacion": fecha_publicacion,
            "fecha_cierre": _fecha(fechas.get("fecha_cierre")),
            # La glosa y no el código: es lo que se muestra, y el código
            # normalizado queda en `informacion_adicional`.
            "estado": estado.get("glosa") or estado.get("codigo"),
            # El monto normalizado a CLP, no el original: es lo que permite
            # comparar y ordenar junto al resto del catálogo.
            "monto_estimado": montos.get("monto_disponible_clp"),
            # Y por eso la moneda es CLP siempre. Con `montos.moneda`, la
            # original, una Compra Ágil en UF quedaba con la cifra en pesos
            # rotulada «UF». La original va en `informacion_adicional`.
            "moneda": "CLP",
            "nombre_organismo": institucion.get("organismo_comprador"),
            "rut_organismo": institucion.get("rut"),
            # La API la manda con espacios de relleno («Región del Biobío »).
            "region": (institucion.get("nombre_region") or "").strip() or None,
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
                "moneda_original": montos.get("moneda"),
            },
            "items": None,
        }


def campos_desde_detalle(detalle: Dict[str, Any]) -> Dict[str, Any]:
    """Lo que añade el detalle de una Compra Ágil a su fila de `licitaciones`.

    Los ítems se guardan con los nombres de la API clásica (`CodigoProducto`,
    `NombreProducto`…): es lo que leen el panel de BI y el matching, así que
    una Compra Ágil entra a las bandas de precio por producto igual que una
    licitación. Forma verificada contra la API real el 2026-09-24.
    """
    detalle = enmascarar_payload(detalle)
    if not isinstance(detalle, dict):
        return {}
    items = [
        {
            "CodigoProducto": p.get("codigo_producto"),
            "NombreProducto": p.get("nombre"),
            "Descripcion": p.get("descripcion"),
            "Cantidad": p.get("cantidad"),
            "UnidadMedida": p.get("unidad_medida"),
        }
        for p in detalle.get("productos_solicitados") or []
        if isinstance(p, dict)
    ]
    campos: Dict[str, Any] = {
        "descripcion": (detalle.get("descripcion") or "").strip() or None,
        "items": items or None,
    }
    return {k: v for k, v in campos.items() if v is not None}
