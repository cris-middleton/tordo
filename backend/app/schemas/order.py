from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict


class OrdenCompraDetalleResponse(BaseModel):
    """Schema for orden compra detalle information"""

    id: int
    orden_compra_id: int
    codigo_oc: str
    fecha_primera_extraccion: datetime | None = None
    fecha_ultima_actualizacion: datetime | None = None
    numero_actualizaciones: int | None = None
    hash_contenido: str | None = None
    datos_completos: Dict[str, Any] | None = None
    items: List[Dict[str, Any]] | None = None
    documentos: List[Dict[str, Any]] | None = None
    comprador_detalle: Dict[str, Any] | None = None
    proveedor_detalle: Dict[str, Any] | None = None
    estado_actual: str | None = None
    estado_proveedor_actual: str | None = None
    fecha_aceptacion_real: datetime | None = None
    fecha_entrega_real: datetime | None = None
    fecha_recepcion_real: datetime | None = None
    monto_final: Decimal | None = None

    model_config = ConfigDict(from_attributes=True)
