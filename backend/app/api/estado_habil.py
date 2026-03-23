"""Estado hábil read endpoints."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.user import User
from app.services.estado_habil_service import get_estado_habil_history
from app.api.empresas import _get_empresa_or_404, _get_membership_or_403

router = APIRouter(tags=["estado_habil"])


class EstadoHabilLogOut(BaseModel):
    estado_anterior: str | None
    estado_nuevo: str
    fuente: str | None
    checked_at: str
    class Config:
        from_attributes = True


class EstadoHabilResponse(BaseModel):
    empresa_id: str
    rut_empresa: str
    estado_habil: str
    estado_habil_updated_at: str | None
    historial: list[EstadoHabilLogOut]


@router.get("/api/empresas/{empresa_id}/estado-habil", response_model=EstadoHabilResponse)
async def get_estado_habil(
    empresa_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    empresa = await _get_empresa_or_404(empresa_id, db)
    await _get_membership_or_403(empresa_id, current_user, db)
    logs = await get_estado_habil_history(empresa_id, db, limit=30)
    return EstadoHabilResponse(
        empresa_id=str(empresa.id),
        rut_empresa=empresa.rut_empresa,
        estado_habil=empresa.estado_habil,
        estado_habil_updated_at=(empresa.estado_habil_updated_at.isoformat() if empresa.estado_habil_updated_at else None),
        historial=[
            EstadoHabilLogOut(
                estado_anterior=log.estado_anterior,
                estado_nuevo=log.estado_nuevo,
                fuente=log.fuente,
                checked_at=log.checked_at.isoformat(),
            )
            for log in logs
        ],
    )
