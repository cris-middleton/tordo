from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class DocumentoOut(BaseModel):
    id: UUID
    empresa_id: UUID
    nombre: str
    tipo_documento: str
    mime_type: Optional[str] = None
    tamano_bytes: Optional[int] = None
    fecha_emision: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    esta_vigente: bool
    eliminado: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentoDownloadResponse(BaseModel):
    url: str
    nombre: str
    mime_type: Optional[str] = None
