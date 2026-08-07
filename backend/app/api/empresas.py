import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import EmpresaContext, empresa_ctx, require_rol
from app.core.plan_limits import verificar_asiento_disponible
from app.core.security import get_current_active_user
from app.db import SyncSessionLocal, get_db
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.user import User
from app.schemas.empresa import (
    AddMiembroRequest,
    ApiKeyCreada,
    ApiKeyCrear,
    ApiKeyResumen,
    EmpresaConRol,
    EmpresaCreate,
    EmpresaUpdate,
    MiembroResponse,
)
from app.services import api_keys

router = APIRouter(prefix="/api/empresas", tags=["empresas"])

TRIAL_LENGTH_DAYS = 14


def aplicar_trial_inicial(empresa: Empresa) -> None:
    """Arranca el reverse-trial de 14 días sobre una empresa recién creada.

    Es idempotente: una empresa que ya paga o que ya tuvo trial no se toca, así
    que se puede llamar sin comprobar antes.

    Vive aquí y no en el registro del usuario porque la suscripción es de la
    empresa (ADR 0002). Antes se fijaba al registrarse, cuando todavía no
    existía ninguna empresa a la que asociarla.
    """
    if empresa.subscription_status and empresa.subscription_status != "inactive":
        return
    if empresa.trial_ends_at is not None:
        return
    empresa.subscription_status = "trialing"
    empresa.trial_ends_at = datetime.now(UTC) + timedelta(days=TRIAL_LENGTH_DAYS)


async def _get_empresa_or_404(empresa_id: UUID, db: AsyncSession) -> Empresa:
    empresa = (
        await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    ).scalar_one_or_none()
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return empresa


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
    aplicar_trial_inicial(empresa)
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
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    empresa = await _get_empresa_or_404(ctx.empresa_id, db)
    return EmpresaConRol(**empresa.__dict__, rol=ctx.rol)


@router.put("/{empresa_id}", response_model=EmpresaConRol)
async def actualizar_empresa(
    payload: EmpresaUpdate,
    ctx: EmpresaContext = Depends(require_rol("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    empresa = await _get_empresa_or_404(ctx.empresa_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(empresa, field, value)
    await db.commit()
    await db.refresh(empresa)
    return EmpresaConRol(**empresa.__dict__, rol=ctx.rol)


@router.post("/{empresa_id}/check-estado-habil-now")
async def check_estado_habil_now(
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    await _get_empresa_or_404(ctx.empresa_id, db)
    from app.services.estado_habil_service import check_empresa_now

    def _run_sync():
        sync_db = SyncSessionLocal()
        try:
            return check_empresa_now(ctx.empresa_id, sync_db)
        finally:
            sync_db.close()

    return await asyncio.to_thread(_run_sync)


@router.delete("/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_empresa(
    ctx: EmpresaContext = Depends(require_rol("owner")),
    db: AsyncSession = Depends(get_db),
):
    empresa = await _get_empresa_or_404(ctx.empresa_id, db)
    empresa.activo = False
    await db.commit()


@router.get("/{empresa_id}/members", response_model=list[MiembroResponse])
async def listar_miembros(
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(EmpresaUsuario, User)
            .join(User, EmpresaUsuario.user_id == User.id)
            .where(EmpresaUsuario.empresa_id == ctx.empresa_id)
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
    payload: AddMiembroRequest,
    ctx: EmpresaContext = Depends(require_rol("owner", "admin")),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
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
                EmpresaUsuario.empresa_id == ctx.empresa_id,
                EmpresaUsuario.user_id == target.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Este usuario ya es miembro")

    # Los asientos son una capacidad del plan (ADR 0002). Se comprueba DESPUÉS de
    # descartar que ya sea miembro: reañadir a alguien que ya está dentro no
    # consume un asiento nuevo, y devolver 402 ahí confundiría.
    empresa = await db.get(Empresa, ctx.empresa_id)
    usuarios_actuales = (
        await db.execute(
            select(func.count())
            .select_from(EmpresaUsuario)
            .where(EmpresaUsuario.empresa_id == ctx.empresa_id)
        )
    ).scalar_one()
    verificar_asiento_disponible(empresa, usuarios_actuales)

    db.add(EmpresaUsuario(empresa_id=ctx.empresa_id, user_id=target.id, rol=payload.rol))
    await db.commit()
    return {"ok": True, "user_id": target.id, "email": target.email, "rol": payload.rol}


@router.delete("/{empresa_id}/members/{user_id}", status_code=200)
async def eliminar_miembro(
    user_id: int,
    ctx: EmpresaContext = Depends(require_rol("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):

    target = (
        await db.execute(
            select(EmpresaUsuario).where(
                EmpresaUsuario.empresa_id == ctx.empresa_id,
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


# ── Claves de API ────────────────────────────────────────────────────────────
#
# Son de la EMPRESA, no del usuario: lo que consuman se descuenta de su plan
# (ADR 0002). Crearlas y revocarlas exige rol de escritura — una clave es una
# credencial de larga vida, no una preferencia.


@router.post("/{empresa_id}/api-keys", response_model=ApiKeyCreada, status_code=201)
async def crear_api_key(
    payload: ApiKeyCrear,
    ctx: EmpresaContext = Depends(require_rol("owner", "admin")),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Emite una clave. **El secreto sólo se devuelve aquí.**"""
    clave, fila = await api_keys.crear(
        db,
        empresa_id=ctx.empresa_id,
        nombre=payload.nombre,
        creada_por=current_user.id,
        expira_en=payload.expira_en,
    )
    await db.commit()
    await db.refresh(fila)
    return ApiKeyCreada(**ApiKeyResumen.model_validate(fila).model_dump(), clave=clave)


@router.get("/{empresa_id}/api-keys", response_model=list[ApiKeyResumen])
async def listar_api_keys(
    ctx: EmpresaContext = Depends(empresa_ctx),
    db: AsyncSession = Depends(get_db),
):
    """Las claves de la empresa, vigentes y revocadas. Nunca el secreto."""
    return await api_keys.listar(db, ctx.empresa_id)


@router.delete("/{empresa_id}/api-keys/{clave_id}", status_code=200)
async def revocar_api_key(
    clave_id: UUID,
    ctx: EmpresaContext = Depends(require_rol("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Revoca una clave. Irreversible: para volver a integrar, se emite otra."""
    if not await api_keys.revocar(db, clave_id, ctx.empresa_id):
        raise HTTPException(status_code=404, detail="La clave no existe o ya estaba revocada")
    await db.commit()
    return {"message": "Clave revocada"}
