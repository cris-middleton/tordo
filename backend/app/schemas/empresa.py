from datetime import datetime
from typing import List
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.rut import formatear_rut, validar_rut


class EmpresaCreate(BaseModel):
    rut_empresa: str
    nombre_empresa: str
    rubros_cpv: List[str] | None = None
    regiones: List[str] | None = None

    @field_validator("rut_empresa")
    @classmethod
    def validate_rut(cls, v: str) -> str:
        clean = v.upper().replace(".", "").replace("-", "").replace(" ", "")
        if not validar_rut(clean):
            raise ValueError("RUT inválido (formato esperado: 12345678-9 o 12.345.678-9)")
        return formatear_rut(clean)


class EmpresaUpdate(BaseModel):
    nombre_empresa: str | None = None
    rubros_cpv: List[str] | None = None
    regiones: List[str] | None = None
    activo: bool | None = None


class EmpresaOut(BaseModel):
    id: UUID
    rut_empresa: str
    nombre_empresa: str
    rubros_cpv: List[str] | None = None
    regiones: List[str] | None = None
    activo: bool
    estado_habil: str
    estado_habil_updated_at: datetime | None = None
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


class MiembroResponse(BaseModel):
    user_id: int
    email: str
    full_name: str | None = None
    rol: str
    joined_at: str  # ISO datetime

    model_config = ConfigDict(from_attributes=True)


class AddMiembroRequest(BaseModel):
    email: str
    rol: str = "viewer"

    @field_validator("rol")
    @classmethod
    def valid_rol(cls, v: str) -> str:
        if v not in ("admin", "viewer"):
            raise ValueError("rol must be 'admin' or 'viewer'")
        return v


class ApiKeyCrear(BaseModel):
    """Petición de creación de una clave de API."""

    nombre: str = Field(..., min_length=1, max_length=100)
    expira_en: datetime | None = Field(
        None, description="Caducidad opcional. Sin valor, la clave no caduca."
    )


class ApiKeyResumen(BaseModel):
    """Una clave, SIN el secreto. Es lo que devuelve el listado."""

    id: UUID
    nombre: str
    prefijo: str
    creada_por: int | None
    ultimo_uso_en: datetime | None
    expira_en: datetime | None
    revocada_en: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApiKeyCreada(ApiKeyResumen):
    """La única respuesta que incluye el secreto, y sólo al crearla.

    Después no se puede recuperar: la base guarda el hash. Si se pierde, se
    revoca y se emite otra.
    """

    clave: str = Field(..., description="Guárdala ahora: no se vuelve a mostrar.")
