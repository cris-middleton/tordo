from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class ChecklistItemOut(BaseModel):
    id: UUID
    descripcion: str
    es_obligatorio: bool
    completado: bool
    completado_at: Optional[datetime] = None
    documento_id: Optional[UUID] = None
    orden: int

    class Config:
        from_attributes = True


class ChecklistItemUpdate(BaseModel):
    completado: bool
    documento_id: Optional[UUID] = None


class PostulacionCreate(BaseModel):
    empresa_id: UUID
    licitacion_id: int
    notas: Optional[str] = None


class PostulacionUpdate(BaseModel):
    estado: Optional[str] = None
    notas: Optional[str] = None


class PostulacionOut(BaseModel):
    id: UUID
    empresa_id: UUID
    licitacion_id: int
    estado: str
    notas: Optional[str] = None
    created_at: datetime
    checklist: List[ChecklistItemOut] = []

    class Config:
        from_attributes = True


class PostulacionListItem(BaseModel):
    """Lightweight version for list views."""
    id: UUID
    empresa_id: UUID
    licitacion_id: int
    estado: str
    created_at: datetime
    checklist_total: int = 0
    checklist_completado: int = 0

    class Config:
        from_attributes = True
