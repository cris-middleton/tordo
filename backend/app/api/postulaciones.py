"""Postulaciones API."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import EmpresaContext, empresa_ctx, verificar_acceso_empresa
from app.core.security import get_current_active_user
from app.db import get_db
from app.models.postulacion import ChecklistPostulacion, Postulacion
from app.models.user import User
from app.repositories import licitaciones as repo_licitaciones
from app.repositories import postulaciones as repo
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
    templates = await repo.plantilla_de_checklist(db, tipo_licitacion)
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


@router.post("/postulaciones", response_model=PostulacionOut, status_code=status.HTTP_201_CREATED)
async def crear_postulacion(
    payload: PostulacionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # El empresa_id llega en el cuerpo, así que no puede resolverse como
    # dependencia: se verifica con la misma función que usan las dependencias.
    await verificar_acceso_empresa(payload.empresa_id, current_user, db)
    # `obtener_para_postular` sólo devuelve licitaciones ACTIVAS. Antes no se
    # filtraba: se podía abrir una postulación sobre algo que Mercado Público ya
    # había retirado, y el usuario preparaba documentos para nada.
    licitacion = await repo_licitaciones.obtener_para_postular(db, payload.licitacion_id)
    if not licitacion:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")
    existing = await repo.buscar_de_empresa_para_licitacion(
        db, payload.empresa_id, payload.licitacion_id
    )
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
    # Se recarga con el checklist: el que se acaba de crear no está en la
    # instancia en memoria, y serializar la relación sin cargarla revienta en
    # async.
    return await repo.obtener(db, postulacion.id)


@router.get("/empresas/{empresa_id}/postulaciones", response_model=list[PostulacionListItem])
async def listar_postulaciones(
    estado: str | None = Query(None),
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    if estado and estado not in VALID_ESTADOS:
        raise HTTPException(
            status_code=400, detail=f"Estado inválido. Valores: {sorted(VALID_ESTADOS)}"
        )
    return await repo.listar_de_empresa(db, ctx.empresa_id, estado=estado)


@router.get("/postulaciones/{postulacion_id}", response_model=PostulacionOut)
async def obtener_postulacion(
    postulacion_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    p = await repo.obtener(db, postulacion_id)
    if not p:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    # El empresa_id sale de la entidad recién cargada, no del request.
    await verificar_acceso_empresa(p.empresa_id, current_user, db)
    return p


@router.put("/postulaciones/{postulacion_id}", response_model=PostulacionOut)
async def actualizar_postulacion(
    postulacion_id: UUID,
    payload: PostulacionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    p = await repo.obtener(db, postulacion_id)
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


@router.put("/postulaciones/{postulacion_id}/checklist/{item_id}", response_model=None)
async def toggle_checklist_item(
    postulacion_id: UUID,
    item_id: UUID,
    payload: ChecklistItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    p = await repo.obtener(db, postulacion_id)
    if not p:
        raise HTTPException(status_code=404, detail="Postulación no encontrada")
    # El empresa_id sale de la entidad recién cargada, no del request.
    await verificar_acceso_empresa(p.empresa_id, current_user, db)
    # El ítem se acota a SU postulación: el acceso se comprobó sobre la de la
    # URL, así que un id de otra no puede colarse por aquí.
    item = await repo.obtener_item_checklist(db, item_id, postulacion_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item de checklist no encontrado")
    item.completado = payload.completado
    item.completado_at = datetime.now(UTC) if payload.completado else None
    if payload.documento_id is not None:
        item.documento_id = payload.documento_id
    await db.commit()
    return {"ok": True}
