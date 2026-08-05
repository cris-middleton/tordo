from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict


class TenderBase(BaseModel):
    codigo_externo: str
    nombre: str
    descripcion: str | None = None
    fecha_publicacion: datetime
    fecha_cierre: datetime | None = None
    monto_estimado: Decimal | None = None
    estado: str | None = None
    tipo_licitacion: str | None = None
    region: str | None = None
    comuna: str | None = None


class TenderCreate(TenderBase):
    codigo_interno: str | None = None
    organismo_id: int | None = None


class TenderUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    fecha_cierre: datetime | None = None
    monto_estimado: Decimal | None = None
    estado: str | None = None
    organismo_id: int | None = None


class LicitacionDetalleResponse(BaseModel):
    """Schema for licitacion detalle information"""

    id: int
    licitacion_id: int
    codigo_externo: str
    fecha_primera_extraccion: datetime | None = None
    fecha_ultima_actualizacion: datetime | None = None
    numero_actualizaciones: int | None = None
    hash_contenido: str | None = None
    datos_completos: Dict[str, Any] | None = None
    items: Any | None = None
    documentos: Any | None = None
    participantes: Any | None = None
    etapas: Any | None = None
    adjuntos: Any | None = None
    estado_actual: str | None = None
    fecha_cierre_real: datetime | None = None
    fecha_adjudicacion: datetime | None = None
    monto_adjudicado: str | None = None
    proveedor_adjudicado: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TenderResponse(TenderBase):
    id: int
    codigo_interno: str | None = None
    monto_total: Decimal | None = None
    moneda: str | None = None
    tipo_moneda: str | None = None
    codigo_organismo: str | None = None
    nombre_organismo: str | None = None
    rut_organismo: str | None = None
    organismo_id: int | None = None
    fecha_inicio: datetime | None = None
    fecha_final: datetime | None = None
    informacion_adicional: Dict[str, Any] | None = None
    items: List[Dict[str, Any]] | None = None
    url_acta: str | None = None
    url_licitacion: str | None = None
    fecha_extraccion: datetime
    fecha_actualizacion: datetime | None = None
    detalle: LicitacionDetalleResponse | None = None

    # Populated only when TF-IDF re-ranking or empresa-fit scoring is applied.
    similarity_score: float | None = None
    score_encaje: float | None = None
    nivel_encaje: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TenderListResponse(BaseModel):
    items: List[TenderResponse]
    total: int
    page: int
    size: int
    pages: int
