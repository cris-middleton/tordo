"""Dashboard stats endpoint."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plan_limits import effective_plan_tier
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.user import User
from app.repositories import empresas as repo_empresas
from app.repositories import panel
from app.schemas.dashboard_home import (
    DashboardHomeResponse,
    EmpresaSummary,
    PipelineCounts,
    PlanInfo,
    ResumenStats,
    TrendStats,
)
from app.services.dashboard_home_service import (
    compose_pipeline,
    compose_resumen,
    compose_trend,
    compose_urgencias,
    load_matches,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Cada número responde a un sujeto distinto —catálogo, usuario, empresas—
    # y por eso los nombres del repositorio lo dicen: leídos aquí seguidos, es
    # fácil suponer que todos filtran por lo mismo.
    empresa_ids = await repo_empresas.ids_de_empresas_del_usuario(db, current_user.id)

    licitaciones_activas = await panel.licitaciones_publicadas(db)
    ordenes_activas = await panel.ordenes_en_proceso(db)
    alertas_no_leidas = await panel.alertas_no_leidas(db, current_user.id)
    postulaciones_activas = await panel.postulaciones_activas(db, empresa_ids)
    documentos_por_vencer = await panel.documentos_por_vencer(db, empresa_ids)
    tiene_empresa = bool(empresa_ids)

    return {
        "licitaciones_activas": licitaciones_activas,
        "ordenes_activas": ordenes_activas,
        "alertas_no_leidas": alertas_no_leidas,
        "postulaciones_activas": postulaciones_activas,
        "documentos_por_vencer": documentos_por_vencer,
        "tiene_empresa": tiene_empresa,
    }


@router.get("/home", response_model=DashboardHomeResponse)
async def get_dashboard_home(
    empresa_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> DashboardHomeResponse:
    """Single-roundtrip aggregator for the operational home."""
    memberships = await repo_empresas.membresias_del_usuario(db, current_user.id)

    if not memberships:
        # Sin empresa no hay plan que aplicar: la suscripción es de la empresa
        # (ADR 0002). Se responde el mínimo.
        plan_tier, matches_visibles = "free", 1
        return DashboardHomeResponse(
            empresa=None,
            resumen=ResumenStats(),
            urgencias=[],
            matches=[],
            matches_cached_at=None,
            matches_total_disponibles=0,
            pipeline=PipelineCounts(),
            trend=TrendStats(),
            plan=PlanInfo(tier=plan_tier, matches_visibles=matches_visibles),
        )

    member_ids = {m.empresa_id for m in memberships}
    if empresa_id is None:
        empresa_id = memberships[0].empresa_id
    elif empresa_id not in member_ids:
        raise HTTPException(status_code=403, detail="No eres miembro de esta empresa")

    empresa = await repo_empresas.obtener(db, empresa_id)
    if empresa is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    # El plan sale de la EMPRESA resuelta, no del usuario. Un trial activo
    # resuelve a 'pro' aunque el plan_tier guardado siga en 'basico'; de pyme
    # hacia arriba cuenta como de pago.
    resolved_tier = effective_plan_tier(empresa)
    plan_tier = "paid" if resolved_tier not in ("free", "basico") else "free"
    matches_visibles = 3 if plan_tier == "paid" else 1

    resumen = await compose_resumen(db, current_user.id, empresa_id)
    urgencias = await compose_urgencias(db, current_user.id, empresa_id)
    pipeline = await compose_pipeline(db, empresa_id)
    trend = await compose_trend(db, empresa_id)
    matches, cached_at, total = await load_matches(db, empresa_id)

    return DashboardHomeResponse(
        empresa=EmpresaSummary(
            id=empresa.id,
            nombre=empresa.nombre_empresa,
            rut=empresa.rut_empresa,
            estado_habil=empresa.estado_habil,
            estado_habil_updated_at=empresa.estado_habil_updated_at,
        ),
        resumen=resumen,
        urgencias=urgencias,
        matches=matches[:matches_visibles],
        matches_cached_at=cached_at,
        matches_total_disponibles=total,
        pipeline=pipeline,
        trend=trend,
        plan=PlanInfo(tier=plan_tier, matches_visibles=matches_visibles),
    )
