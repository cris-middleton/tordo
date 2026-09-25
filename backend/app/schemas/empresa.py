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


class LimitesPlan(BaseModel):
    """Los topes del plan. `null` significa ilimitado, no cero."""

    max_usuarios: int | None
    max_docs: int | None
    max_docs_mb: int | None
    bi_queries_per_day: int | None
    max_active_alerts: int | None


class UsoPlan(BaseModel):
    """Consumo actual. Sólo lo que se mide de forma central hoy.

    `usuarios` y `consultas_bi_hoy` son de la EMPRESA. Documentos y alertas se
    cuentan por usuario (ver `_exigir_cuota_alertas`), así que no caben aquí sin
    mezclar dos sujetos distintos en el mismo objeto.
    """

    usuarios: int
    consultas_bi_hoy: int


class PlanResumen(BaseModel):
    """Plan efectivo de la empresa y su consumo, para pintar la UI.

    Existe para que el frontend no tenga que replicar `PLAN_QUOTAS`: una copia
    allí se desincroniza en cuanto cambian los precios y nadie se entera hasta
    que un cliente ve un límite que no es el suyo.
    """

    tier: str = Field(..., description="Tier EFECTIVO: en trial es 'pro' aunque se pague otro.")
    etiqueta: str
    en_trial: bool
    trial_termina: datetime | None = Field(
        None, description="Cuándo acaba el trial. Null si la empresa no está en trial."
    )
    tier_contratado: str
    siguiente_tier: str | None = Field(None, description="A qué plan subir. Null si es el mayor.")
    limites: LimitesPlan
    uso: UsoPlan


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


class SuscripcionPrecioCrear(BaseModel):
    """Alta de vigilancia de precio sobre un producto."""

    codigo_producto: str = Field(..., min_length=1, max_length=50)
    unidad_medida: str | None = Field(
        None,
        max_length=100,
        description=(
            "Omitir para que el servidor use la unidad en la que más se compra "
            "el producto. La unidad forma parte de la identidad del precio."
        ),
    )
    nombre_producto: str | None = Field(None, max_length=500)
    umbral_pct: float = Field(
        10.0,
        gt=0,
        le=100,
        description=(
            "Variación mínima en % para avisar. Por debajo del 1 % el ruido del "
            "muestreo domina y el aviso deja de significar nada."
        ),
    )


class SuscripcionPrecioOut(BaseModel):
    id: int
    codigo_producto: str
    unidad_medida: str
    nombre_producto: str | None
    umbral_pct: float
    creada_en: datetime

    model_config = ConfigDict(from_attributes=True)


class CompetidorSeguidoCrear(BaseModel):
    """Alta de seguimiento de un competidor."""

    rut: str = Field(
        ...,
        min_length=7,
        max_length=20,
        description="RUT del proveedor. Se acepta con o sin puntos y guion.",
    )
    nombre: str | None = Field(
        None,
        max_length=500,
        description="Cómo llamarlo en los avisos. Si se omite, se usa el nombre de la orden.",
    )


class CompetidorSeguidoOut(BaseModel):
    id: int
    rut: str
    nombre: str | None
    ultimo_visto_en: datetime | None

    model_config = ConfigDict(from_attributes=True)
