from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal


class OrdenCompraDetalleResponse(BaseModel):
    """Schema for orden compra detalle information"""
    id: int
    orden_compra_id: int
    codigo_oc: str
    fecha_primera_extraccion: Optional[datetime] = None
    fecha_ultima_actualizacion: Optional[datetime] = None
    numero_actualizaciones: Optional[int] = None
    hash_contenido: Optional[str] = None
    datos_completos: Optional[Dict[str, Any]] = None
    items: Optional[List[Dict[str, Any]]] = None
    documentos: Optional[List[Dict[str, Any]]] = None
    comprador_detalle: Optional[Dict[str, Any]] = None
    proveedor_detalle: Optional[Dict[str, Any]] = None
    estado_actual: Optional[str] = None
    estado_proveedor_actual: Optional[str] = None
    fecha_aceptacion_real: Optional[datetime] = None
    fecha_entrega_real: Optional[datetime] = None
    fecha_recepcion_real: Optional[datetime] = None
    monto_final: Optional[Decimal] = None
    
    model_config = ConfigDict(from_attributes=True)

