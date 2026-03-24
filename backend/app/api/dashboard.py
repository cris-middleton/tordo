"""Dashboard stats endpoint."""
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.alert import Alert, AlertStatus
from app.models.empresa import DocumentoEmpresa, EmpresaUsuario
from app.models.licitacion import Licitacion
from app.models.postulacion import Postulacion
from app.models.user import User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    licitaciones_activas = (
        await db.execute(
            select(func.count(Licitacion.id)).where(Licitacion.activo == True)
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
        await db.execute(select(EmpresaUsuario).where(EmpresaUsuario.user_id == current_user.id))
    ).scalars().all()
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
        "alertas_no_leidas": alertas_no_leidas,
        "postulaciones_activas": postulaciones_activas,
        "documentos_por_vencer": documentos_por_vencer,
        "tiene_empresa": tiene_empresa,
    }
