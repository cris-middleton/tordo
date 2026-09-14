"""Estado hábil read endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import EmpresaContext, empresa_ctx
from app.api.empresas import _get_empresa_or_404
from app.db import get_db
from app.repositories import empresas as repo_empresas

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


@router.get("/empresas/{empresa_id}/estado-habil", response_model=EstadoHabilResponse)
async def get_estado_habil(
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    empresa = await _get_empresa_or_404(ctx.empresa_id, db)
    logs = await repo_empresas.historial_estado_habil(db, ctx.empresa_id, limite=30)
    return EstadoHabilResponse(
        empresa_id=str(empresa.id),
        rut_empresa=empresa.rut_empresa,
        estado_habil=empresa.estado_habil,
        estado_habil_updated_at=(
            empresa.estado_habil_updated_at.isoformat() if empresa.estado_habil_updated_at else None
        ),
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
