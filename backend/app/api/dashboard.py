"""Dashboard stats endpoint."""

from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plan_limits import effective_plan_tier
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.alert import Alert, AlertStatus
from app.models.empresa import DocumentoEmpresa, Empresa, EmpresaUsuario
from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra
from app.models.postulacion import Postulacion
from app.models.user import User
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

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    licitaciones_activas = (
        await db.execute(
            select(func.count(Licitacion.id)).where(
                Licitacion.activo == True,
                Licitacion.estado == "Publicada",
            )
        )
    ).scalar() or 0

    ordenes_activas = (
        await db.execute(
            select(func.count(OrdenCompra.id)).where(
                OrdenCompra.estado == "En proceso",
            )
        )
    ).scalar() or 0

    alertas_no_leidas = (
        await db.execute(
            select(func.count(Alert.id)).where(
                Alert.user_id == current_user.id,
                Alert.status != AlertStatus.READ,
            )
        )
    ).scalar() or 0

    memberships = (
        (await db.execute(select(EmpresaUsuario).where(EmpresaUsuario.user_id == current_user.id)))
        .scalars()
        .all()
    )
    empresa_ids = [m.empresa_id for m in memberships]
    tiene_empresa = len(empresa_ids) > 0

    postulaciones_activas = 0
    documentos_por_vencer = 0
    if empresa_ids:
        postulaciones_activas = (
            await db.execute(
                select(func.count(Postulacion.id)).where(
                    Postulacion.empresa_id.in_(empresa_ids),
                    Postulacion.estado.in_(["en_seguimiento", "en_preparacion", "enviada"]),
                )
            )
        ).scalar() or 0

        cutoff = date.today() + timedelta(days=30)
        documentos_por_vencer = (
            await db.execute(
                select(func.count(DocumentoEmpresa.id)).where(
                    DocumentoEmpresa.empresa_id.in_(empresa_ids),
                    DocumentoEmpresa.eliminado.is_(False),
                    DocumentoEmpresa.fecha_vencimiento.isnot(None),
                    DocumentoEmpresa.fecha_vencimiento <= cutoff,
                    DocumentoEmpresa.fecha_vencimiento >= date.today(),
                )
            )
        ).scalar() or 0

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
    memberships = (
        (await db.execute(select(EmpresaUsuario).where(EmpresaUsuario.user_id == current_user.id)))
        .scalars()
        .all()
    )

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

    empresa = (
        await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    ).scalar_one_or_none()
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
