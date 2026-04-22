"""Schemas for GET /api/dashboard/home."""
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EmpresaSummary(BaseModel):
    id: UUID
    nombre: str
    rut: str
    estado_habil: str
    estado_habil_updated_at: Optional[datetime] = None


class ResumenStats(BaseModel):
    matches_semana: int = 0
    matches_72h: int = 0
    postulaciones_activas: int = 0
    postulaciones_cierran_72h: int = 0
    docs_por_vencer_30d: int = 0
    docs_por_vencer_7d: int = 0
    adjudicaciones_mes: int = 0
    enviadas_mes: int = 0


class UrgenciaItem(BaseModel):
    id: str
    tipo: Literal[
        "postulacion_cierre",
        "documento_vence",
        "match_alto",
        "estado_inhabil",
        "checklist_incompleto",
        "estado_habil_cambio",
    ]
    severidad: Literal["rojo", "naranja", "amarillo"]
    tiempo_label: str
    titulo: str
    subtitulo: str
    cta_label: str
    cta_href: str


class MatchItem(BaseModel):
    codigo_externo: str
    nombre: str
    organismo: str
    monto_estimado: Optional[float] = None
    moneda: str = "CLP"
    fecha_cierre: Optional[datetime] = None
    score: int = Field(..., ge=0, le=100)
    href: str


class PipelineCounts(BaseModel):
    en_seguimiento: int = 0
    en_preparacion: int = 0
    enviada: int = 0
    adjudicada: int = 0
    no_adjudicada: int = 0
    tasa_adjudicacion_90d: Optional[float] = None
    decididas_90d: int = 0


class TrendStats(BaseModel):
    disponible: bool = False
    postulaciones_semana: list[int] = Field(default_factory=list)
    tasa_adjudicacion_actual: Optional[float] = None
    tasa_adjudicacion_anterior: Optional[float] = None
    delta_enviadas_pp: Optional[int] = None


class PlanInfo(BaseModel):
    tier: Literal["free", "paid"]
    matches_visibles: int


class DashboardHomeResponse(BaseModel):
    empresa: Optional[EmpresaSummary]
    resumen: ResumenStats
    urgencias: list[UrgenciaItem]
    matches: list[MatchItem]
    matches_cached_at: Optional[datetime] = None
    matches_total_disponibles: int = 0
    pipeline: PipelineCounts
    trend: TrendStats
    plan: PlanInfo
