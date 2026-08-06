"""Dependencias compartidas de la API.

El aislamiento entre empresas vive aquí. Hoy cada endpoint que toca datos de una
empresa llama a mano a `_get_membership_or_403`, repetido en 12+ sitios y con
cuatro variantes distintas inlineadas en `bi.py`. **Un endpoint nuevo al que se
le olvide esa llamada es una fuga de datos entre empresas**, y nada lo impide.

Estas dependencias convierten esa garantía en algo declarativo: se pide el
contexto de empresa en la firma y FastAPI se encarga de resolverlo o rechazar con
403 antes de que el handler corra.

    @router.get("/api/algo/{empresa_id}")
    async def leer(ctx: EmpresaContext = Depends(empresa_ctx)): ...

    @router.post("/api/algo/{empresa_id}")
    async def escribir(ctx: EmpresaContext = Depends(require_rol("owner", "admin"))): ...

Ver `.claude/skills/endpoint-empresa/SKILL.md`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from fastapi import Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_active_user
from app.db import get_db
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.user import User

Rol = Literal["owner", "admin", "viewer"]

# Quién puede escribir. `viewer` nunca.
ROLES_ESCRITURA: tuple[Rol, ...] = ("owner", "admin")


@dataclass(frozen=True)
class EmpresaContext:
    """Empresa a la que el usuario tiene acceso probado, y con qué rol.

    Que exista una instancia de esto significa que la membresía ya se verificó.
    Los servicios pueden confiar en `empresa_id` sin volver a comprobar.
    """

    empresa_id: UUID
    rol: Rol

    @property
    def puede_escribir(self) -> bool:
        return self.rol in ROLES_ESCRITURA

    @property
    def es_owner(self) -> bool:
        return self.rol == "owner"


async def verificar_acceso_empresa(
    empresa_id: UUID,
    usuario: User,
    db: AsyncSession,
    *,
    exigir_existencia: bool = False,
) -> EmpresaContext:
    """Comprueba que el usuario pertenece a la empresa. Devuelve el contexto o lanza 403.

    Es la ÚNICA implementación de la comprobación. Las dependencias de abajo la
    envuelven, y los endpoints que reciben el `empresa_id` en el cuerpo del
    request —donde no se puede declarar como dependencia— la llaman directamente.

    `exigir_existencia` añade una consulta para distinguir 404 de 403. Por
    defecto está apagado: responder 403 para una empresa inexistente es
    preferible, porque no revela qué UUIDs existen.
    """
    if exigir_existencia:
        existe = (
            await db.execute(select(Empresa.id).where(Empresa.id == empresa_id))
        ).scalar_one_or_none()
        if existe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada"
            )

    membresia = (
        await db.execute(
            select(EmpresaUsuario).where(
                EmpresaUsuario.empresa_id == empresa_id,
                EmpresaUsuario.user_id == usuario.id,
            )
        )
    ).scalar_one_or_none()

    if membresia is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa"
        )

    return EmpresaContext(empresa_id=empresa_id, rol=membresia.rol)


async def empresa_ctx(
    empresa_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> EmpresaContext:
    """Para rutas con `{empresa_id}` en el path. Lectura: basta con ser miembro."""
    return await verificar_acceso_empresa(empresa_id, current_user, db)


def require_rol(*roles: Rol):
    """Dependencia que además exige un rol concreto.

        ctx: EmpresaContext = Depends(require_rol("owner", "admin"))

    Se usa en todo lo que escribe: `viewer` tiene que recibir 403.
    """

    async def _dep(ctx: EmpresaContext = Depends(empresa_ctx)) -> EmpresaContext:
        if ctx.rol not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Se requiere rol {' o '.join(roles)}",
            )
        return ctx

    return _dep


async def empresa_ctx_opcional(
    empresa_id: UUID | None = Query(None, description="UUID de la empresa"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> EmpresaContext | None:
    """Para endpoints donde `empresa_id` es un filtro opcional de query.

    Devuelve None si no vino. Si vino, la membresía se verifica igual: un
    `empresa_id` que llega del cliente no autoriza nada por sí solo.
    """
    if empresa_id is None:
        return None
    return await verificar_acceso_empresa(empresa_id, current_user, db)


async def resolver_empresa_facturable(
    empresa_id: UUID | None,
    usuario: User,
    db: AsyncSession,
) -> Empresa:
    """Devuelve la empresa cuyo plan gobierna esta petición.

    La suscripción es de la empresa (ADR 0002), así que para decidir si un
    endpoint está permitido hay que saber **de qué empresa** se habla.

    Reglas, en orden:

    1. Si la petición nombra un `empresa_id`, se usa ese — previa verificación
       de membresía.
    2. Si no, y el usuario pertenece a exactamente una empresa, se usa esa. Es
       el caso normal: el onboarding crea una.
    3. Si no, y pertenece a varias, se responde 400 pidiendo que la nombre. Es
       preferible a elegir una en silencio y facturarle cuotas a la equivocada.
    4. Si no pertenece a ninguna, 403: sin empresa no hay plan que aplicar.

    Un header `X-Empresa-Id` con la empresa activa encajaría entre (1) y (2) sin
    cambiar nada de esto; el frontend ya mantiene ese concepto en localStorage.
    """
    if empresa_id is not None:
        await verificar_acceso_empresa(empresa_id, usuario, db)
        empresa = (
            await db.execute(select(Empresa).where(Empresa.id == empresa_id))
        ).scalar_one_or_none()
        if empresa is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa"
            )
        return empresa

    empresas = (
        (
            await db.execute(
                select(Empresa)
                .join(EmpresaUsuario, EmpresaUsuario.empresa_id == Empresa.id)
                .where(EmpresaUsuario.user_id == usuario.id, Empresa.activo.is_(True))
                .order_by(EmpresaUsuario.created_at)
            )
        )
        .scalars()
        .all()
    )

    if not empresas:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Necesitas registrar una empresa para usar esta funcionalidad",
        )
    if len(empresas) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Perteneces a varias empresas: indica cuál con el parámetro "
                "`empresa_id`, porque el plan y las cuotas son por empresa"
            ),
        )
    return empresas[0]


async def empresa_facturable(
    empresa_id: UUID | None = Query(None, description="Empresa cuyo plan aplica"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Empresa:
    """Versión-dependencia de `resolver_empresa_facturable`."""
    return await resolver_empresa_facturable(empresa_id, current_user, db)
