from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal


class TenderBase(BaseModel):
    codigo_externo: str
    nombre: str
    descripcion: Optional[str] = None
    fecha_publicacion: datetime
    fecha_cierre: Optional[datetime] = None
    monto_estimado: Optional[Decimal] = None
    estado: Optional[str] = None
    tipo_licitacion: Optional[str] = None
    region: Optional[str] = None
    comuna: Optional[str] = None


class TenderCreate(TenderBase):
    codigo_interno: Optional[str] = None
    organismo_id: Optional[int] = None


class TenderUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    fecha_cierre: Optional[datetime] = None
    monto_estimado: Optional[Decimal] = None
    estado: Optional[str] = None
    organismo_id: Optional[int] = None


class LicitacionDetalleResponse(BaseModel):
    """Schema for licitacion detalle information"""
    id: int
    licitacion_id: int
    codigo_externo: str
    fecha_primera_extraccion: Optional[datetime] = None
    fecha_ultima_actualizacion: Optional[datetime] = None
    numero_actualizaciones: Optional[int] = None
    hash_contenido: Optional[str] = None
    datos_completos: Optional[Dict[str, Any]] = None
    items: Optional[Any] = None
    documentos: Optional[Any] = None
    participantes: Optional[Any] = None
    etapas: Optional[Any] = None
    adjuntos: Optional[Any] = None
    estado_actual: Optional[str] = None
    fecha_cierre_real: Optional[datetime] = None
    fecha_adjudicacion: Optional[datetime] = None
    monto_adjudicado: Optional[str] = None
    proveedor_adjudicado: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class TenderResponse(TenderBase):
    id: int
    codigo_interno: Optional[str] = None
    monto_total: Optional[Decimal] = None
    moneda: Optional[str] = None
    tipo_moneda: Optional[str] = None
    codigo_organismo: Optional[str] = None
    nombre_organismo: Optional[str] = None
    rut_organismo: Optional[str] = None
    organismo_id: Optional[int] = None
    fecha_inicio: Optional[datetime] = None
    fecha_final: Optional[datetime] = None
    informacion_adicional: Optional[Dict[str, Any]] = None
    items: Optional[List[Dict[str, Any]]] = None
    url_acta: Optional[str] = None
    url_licitacion: Optional[str] = None
    fecha_extraccion: datetime
    fecha_actualizacion: Optional[datetime] = None
    detalle: Optional[LicitacionDetalleResponse] = None

    # Populated only when TF-IDF re-ranking or empresa-fit scoring is applied.
    similarity_score: Optional[float] = None
    score_encaje: Optional[float] = None
    nivel_encaje: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TenderListResponse(BaseModel):
    items: List[TenderResponse]
    total: int
    page: int
    size: int
    pages: int

