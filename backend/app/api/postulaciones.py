"""Postulaciones API."""

from datetime import UTC
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import EmpresaContext, empresa_ctx, verificar_acceso_empresa
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.licitacion import Licitacion
from app.models.postulacion import ChecklistPostulacion, PlantillaChecklist, Postulacion
from app.models.user import User
from app.schemas.postulacion import (
    ChecklistItemUpdate,
    PostulacionCreate,
    PostulacionListItem,
    PostulacionOut,
    PostulacionUpdate,
)

router = APIRouter(tags=["postulaciones"])

VALID_ESTADOS = frozenset(
    ["en_seguimiento", "en_preparacion", "enviada", "adjudicada", "no_adjudicada", "descartada"]
)


async def _generate_checklist(postulacion_id: UUID, tipo_licitacion: str, db: AsyncSession) -> None:
    # Include GENERICO items (apply to all types) alongside type-specific ones
    templates = (
        (
            await db.execute(
                select(PlantillaChecklist)
                .where(
                    PlantillaChecklist.tipo_licitacion.in_([tipo_licitacion, "GENERICO"]),
                    PlantillaChecklist.activo.is_(True),
                )
                .order_by(PlantillaChecklist.tipo_licitacion.desc(), PlantillaChecklist.orden)
            )
        )
        .scalars()
        .all()
    )
    if not templates:
        return
    items = [
        ChecklistPostulacion(
            postulacion_id=postulacion_id,
            descripcion=t.nombre_item,
            es_obligatorio=t.es_obligatorio,
            orden=t.orden,
        )
        for t in templates
    ]
    db.add_all(items)


@router.post(
    "/api/postulaciones", response_model=PostulacionOut, status_code=status.HTTP_201_CREATED
)
async def crear_postulacion(
    payload: PostulacionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # El empresa_id llega en el cuerpo, así que no puede resolverse como
    # dependencia: se verifica con la misma función que usan las dependencias.
    await verificar_acceso_empresa(payload.empresa_id, current_user, db)
    licitacion = (
        await db.execute(select(Licitacion).where(Licitacion.id == payload.licitacion_id))
    ).scalar_one_or_none()
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")
    existing = (
        await db.execute(
            select(Postulacion).where(
                Postulacion.empresa_id == payload.empresa_id,
                Postulacion.licitacion_id == payload.licitacion_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una postulación para esta licitación",
        )

    postulacion = Postulacion(
        empresa_id=payload.empresa_id, licitacion_id=payload.licitacion_id, notas=payload.notas
    )
    db.add(postulacion)
    await db.flush()

    tipo = getattr(licitacion, "tipo_licitacion", None) or "L1"
    await _generate_checklist(postulacion.id, tipo, db)

    await db.commit()
    # Reload with checklist
    postulacion = (
        await db.execute(
            select(Postulacion)
            .options(selectinload(Postulacion.checklist))
            .where(Postulacion.id == postulacion.id)
        )
    ).scalar_one()
    return postulacion


@router.get("/api/empresas/{empresa_id}/postulaciones", response_model=list[PostulacionListItem])
async def listar_postulaciones(
    estado: str | None = Query(None),
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    empresa_id = ctx.empresa_id
    stmt = (
        select(Postulacion)
        .options(selectinload(Postulacion.checklist), selectinload(Postulacion.licitacion))
        .where(Postulacion.empresa_id == empresa_id)
    )
    if estado:
        if estado not in VALID_ESTADOS:
            raise HTTPException(
                status_code=400, detail=f"Estado inválido. Valores: {sorted(VALID_ESTADOS)}"
            )
        stmt = stmt.where(Postulacion.estado == estado)
    postulaciones = (await db.execute(stmt.order_by(Postulacion.created_at.desc()))).scalars().all()
    return postulaciones


@router.get("/api/postulaciones/{postulacion_id}", response_model=PostulacionOut)
async def obtener_postulacion(
    postulacion_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    p = (
        await db.execute(
            select(Postulacion)
            .options(selectinload(Postulacion.checklist))
            .where(Postulacion.id == postulacion_id)
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    # El empresa_id sale de la entidad recién cargada, no del request.
    await verificar_acceso_empresa(p.empresa_id, current_user, db)
    return p


@router.put("/api/postulaciones/{postulacion_id}", response_model=PostulacionOut)
async def actualizar_postulacion(
    postulacion_id: UUID,
    payload: PostulacionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    p = (
        await db.execute(
            select(Postulacion)
            .options(selectinload(Postulacion.checklist))
            .where(Postulacion.id == postulacion_id)
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    # El empresa_id sale de la entidad recién cargada, no del request.
    await verificar_acceso_empresa(p.empresa_id, current_user, db)
    if payload.estado is not None:
        if payload.estado not in VALID_ESTADOS:
            raise HTTPException(
                status_code=400, detail=f"Estado inválido. Valores: {sorted(VALID_ESTADOS)}"
            )
        p.estado = payload.estado
    if payload.notas is not None:
        p.notas = payload.notas
    await db.commit()
    await db.refresh(p)
    return p


@router.put("/api/postulaciones/{postulacion_id}/checklist/{item_id}", response_model=None)
async def toggle_checklist_item(
    postulacion_id: UUID,
    item_id: UUID,
    payload: ChecklistItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    p = (
        await db.execute(select(Postulacion).where(Postulacion.id == postulacion_id))
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    # El empresa_id sale de la entidad recién cargada, no del request.
    await verificar_acceso_empresa(p.empresa_id, current_user, db)
    item = (
        await db.execute(
            select(ChecklistPostulacion).where(
                ChecklistPostulacion.id == item_id,
                ChecklistPostulacion.postulacion_id == postulacion_id,
            )
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item de checklist no encontrado")
    from datetime import datetime

    item.completado = payload.completado
    item.completado_at = datetime.now(UTC) if payload.completado else None
    if payload.documento_id is not None:
        item.documento_id = payload.documento_id
    await db.commit()
    return {"ok": True}
