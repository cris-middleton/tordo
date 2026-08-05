import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_active_user
from app.db import SyncSessionLocal, get_db
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.user import User
from app.schemas.empresa import (
    AddMiembroRequest,
    EmpresaConRol,
    EmpresaCreate,
    EmpresaUpdate,
    MiembroResponse,
)

router = APIRouter(prefix="/api/empresas", tags=["empresas"])


async def _get_empresa_or_404(empresa_id: UUID, db: AsyncSession) -> Empresa:
    empresa = (
        await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    ).scalar_one_or_none()
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return empresa


async def _get_membership_or_403(empresa_id: UUID, user: User, db: AsyncSession) -> EmpresaUsuario:
    membership = (
        await db.execute(
            select(EmpresaUsuario).where(
                EmpresaUsuario.empresa_id == empresa_id, EmpresaUsuario.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa"
        )
    return membership


@router.get("/", response_model=list[EmpresaConRol])
async def listar_empresas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from sqlalchemy.orm import selectinload

    memberships = (
        (
            await db.execute(
                select(EmpresaUsuario)
                .options(selectinload(EmpresaUsuario.empresa))
                .where(EmpresaUsuario.user_id == current_user.id)
            )
        )
        .scalars()
        .all()
    )
    return [
        EmpresaConRol(
            id=m.empresa.id,
            rut_empresa=m.empresa.rut_empresa,
            nombre_empresa=m.empresa.nombre_empresa,
            rubros_cpv=m.empresa.rubros_cpv,
            regiones=m.empresa.regiones,
            activo=m.empresa.activo,
            estado_habil=m.empresa.estado_habil,
            estado_habil_updated_at=m.empresa.estado_habil_updated_at,
            created_at=m.empresa.created_at,
            updated_at=m.empresa.updated_at,
            rol=m.rol,
        )
        for m in memberships
    ]


@router.post("/", response_model=EmpresaConRol, status_code=status.HTTP_201_CREATED)
async def crear_empresa(
    payload: EmpresaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    existing = (
        await db.execute(select(Empresa).where(Empresa.rut_empresa == payload.rut_empresa))
    ).scalar_one_or_none()
    if existing:
        membership = (
            await db.execute(
                select(EmpresaUsuario).where(
                    EmpresaUsuario.empresa_id == existing.id,
                    EmpresaUsuario.user_id == current_user.id,
                )
            )
        ).scalar_one_or_none()
        if membership:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Ya tienes acceso a esta empresa"
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta empresa ya está registrada por otro usuario",
        )

    empresa = Empresa(
        rut_empresa=payload.rut_empresa,
        nombre_empresa=payload.nombre_empresa,
        rubros_cpv=payload.rubros_cpv,
        regiones=payload.regiones,
    )
    db.add(empresa)
    await db.flush()

    membership = EmpresaUsuario(user_id=current_user.id, empresa_id=empresa.id, rol="owner")
    db.add(membership)
    await db.commit()
    await db.refresh(empresa)

    return EmpresaConRol(
        id=empresa.id,
        rut_empresa=empresa.rut_empresa,
        nombre_empresa=empresa.nombre_empresa,
        rubros_cpv=empresa.rubros_cpv,
        regiones=empresa.regiones,
        activo=empresa.activo,
        estado_habil=empresa.estado_habil,
        estado_habil_updated_at=empresa.estado_habil_updated_at,
        created_at=empresa.created_at,
        updated_at=empresa.updated_at,
        rol="owner",
    )


@router.get("/{empresa_id}", response_model=EmpresaConRol)
async def obtener_empresa(
    empresa_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    empresa = await _get_empresa_or_404(empresa_id, db)
    membership = await _get_membership_or_403(empresa_id, current_user, db)
    return EmpresaConRol(**empresa.__dict__, rol=membership.rol)


@router.put("/{empresa_id}", response_model=EmpresaConRol)
async def actualizar_empresa(
    empresa_id: UUID,
    payload: EmpresaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    empresa = await _get_empresa_or_404(empresa_id, db)
    membership = await _get_membership_or_403(empresa_id, current_user, db)
    if membership.rol not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere rol owner o admin"
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(empresa, field, value)
    await db.commit()
    await db.refresh(empresa)
    return EmpresaConRol(**empresa.__dict__, rol=membership.rol)


@router.post("/{empresa_id}/check-estado-habil-now")
async def check_estado_habil_now(
    empresa_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _get_empresa_or_404(empresa_id, db)
    await _get_membership_or_403(empresa_id, current_user, db)
    from app.services.estado_habil_service import check_empresa_now

    def _run_sync():
        sync_db = SyncSessionLocal()
        try:
            return check_empresa_now(empresa_id, sync_db)
        finally:
            sync_db.close()

    return await asyncio.to_thread(_run_sync)


@router.delete("/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_empresa(
    empresa_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    empresa = await _get_empresa_or_404(empresa_id, db)
    membership = await _get_membership_or_403(empresa_id, current_user, db)
    if membership.rol != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Solo el owner puede eliminar la empresa"
        )
    empresa.activo = False
    await db.commit()


@router.get("/{empresa_id}/members", response_model=list[MiembroResponse])
async def listar_miembros(
    empresa_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _get_membership_or_403(empresa_id, current_user, db)
    rows = (
        await db.execute(
            select(EmpresaUsuario, User)
            .join(User, EmpresaUsuario.user_id == User.id)
            .where(EmpresaUsuario.empresa_id == empresa_id)
            .order_by(EmpresaUsuario.created_at)
        )
    ).all()
    return [
        MiembroResponse(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            rol=eu.rol,
            joined_at=eu.created_at.isoformat(),
        )
        for eu, user in rows
    ]


@router.post("/{empresa_id}/members", status_code=201)
async def agregar_miembro(
    empresa_id: UUID,
    payload: AddMiembroRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    membership = await _get_membership_or_403(empresa_id, current_user, db)
    if membership.rol == "viewer":
        raise HTTPException(status_code=403, detail="Solo owner/admin puede añadir miembros")

    target = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(
            status_code=404, detail=f"No existe un usuario con email {payload.email!r}"
        )
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Ya eres miembro de esta empresa")

    existing = (
        await db.execute(
            select(EmpresaUsuario).where(
                EmpresaUsuario.empresa_id == empresa_id,
                EmpresaUsuario.user_id == target.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Este usuario ya es miembro")

    db.add(EmpresaUsuario(empresa_id=empresa_id, user_id=target.id, rol=payload.rol))
    await db.commit()
    return {"ok": True, "user_id": target.id, "email": target.email, "rol": payload.rol}


@router.delete("/{empresa_id}/members/{user_id}", status_code=200)
async def eliminar_miembro(
    empresa_id: UUID,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    membership = await _get_membership_or_403(empresa_id, current_user, db)
    if membership.rol == "viewer":
        raise HTTPException(status_code=403, detail="Solo owner/admin puede eliminar miembros")

    target = (
        await db.execute(
            select(EmpresaUsuario).where(
                EmpresaUsuario.empresa_id == empresa_id,
                EmpresaUsuario.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    if target.rol == "owner":
        raise HTTPException(status_code=403, detail="No se puede eliminar al owner")

    await db.delete(target)
    await db.commit()
    return {"ok": True}
