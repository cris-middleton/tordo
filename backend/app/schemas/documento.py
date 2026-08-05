from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class DocumentoOut(BaseModel):
    id: UUID
    empresa_id: UUID
    nombre: str
    tipo_documento: str
    mime_type: str | None = None
    tamano_bytes: int | None = None
    fecha_emision: date | None = None
    fecha_vencimiento: date | None = None
    esta_vigente: bool
    eliminado: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentoDownloadResponse(BaseModel):
    url: str
    nombre: str
    mime_type: str | None = None
