from datetime import datetime
from typing import List
from uuid import UUID

from pydantic import BaseModel


class ChecklistItemOut(BaseModel):
    id: UUID
    descripcion: str
    es_obligatorio: bool
    completado: bool
    completado_at: datetime | None = None
    documento_id: UUID | None = None
    orden: int

    class Config:
        from_attributes = True


class ChecklistItemUpdate(BaseModel):
    completado: bool
    documento_id: UUID | None = None


class PostulacionCreate(BaseModel):
    empresa_id: UUID
    licitacion_id: int
    notas: str | None = None


class PostulacionUpdate(BaseModel):
    estado: str | None = None
    notas: str | None = None


class PostulacionOut(BaseModel):
    id: UUID
    empresa_id: UUID
    licitacion_id: int
    estado: str
    notas: str | None = None
    created_at: datetime
    checklist: List[ChecklistItemOut] = []

    class Config:
        from_attributes = True


class LicitacionMini(BaseModel):
    """Minimal licitacion data for list views."""

    nombre: str | None = None
    codigo_externo: str | None = None

    class Config:
        from_attributes = True


class PostulacionListItem(BaseModel):
    """Full list item — includes checklist and licitacion for the frontend card."""

    id: UUID
    empresa_id: UUID
    licitacion_id: int
    estado: str
    notas: str | None = None
    created_at: datetime
    checklist: List[ChecklistItemOut] = []
    licitacion: LicitacionMini | None = None

    class Config:
        from_attributes = True
