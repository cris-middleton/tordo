from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, field_validator
from app.utils.rut import validar_rut, formatear_rut


class EmpresaCreate(BaseModel):
    rut_empresa: str
    nombre_empresa: str
    rubros_cpv: Optional[List[str]] = None
    regiones: Optional[List[str]] = None

    @field_validator("rut_empresa")
    @classmethod
    def validate_rut(cls, v: str) -> str:
        clean = v.upper().replace(".", "").replace("-", "").replace(" ", "")
        if not validar_rut(clean):
            raise ValueError("RUT inválido (formato esperado: 12345678-9 o 12.345.678-9)")
        return formatear_rut(clean)


class EmpresaUpdate(BaseModel):
    nombre_empresa: Optional[str] = None
    rubros_cpv: Optional[List[str]] = None
    regiones: Optional[List[str]] = None
    activo: Optional[bool] = None


class EmpresaOut(BaseModel):
    id: UUID
    rut_empresa: str
    nombre_empresa: str
    rubros_cpv: Optional[List[str]] = None
    regiones: Optional[List[str]] = None
    activo: bool
    estado_habil: str
    estado_habil_updated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmpresaConRol(EmpresaOut):
    """EmpresaOut enriched with the current user's role."""
    rol: str


class EmpresaUsuarioOut(BaseModel):
    empresa_id: UUID
    rol: str
    empresa: EmpresaOut

    class Config:
        from_attributes = True
