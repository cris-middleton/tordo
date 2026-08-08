"""Acceso a empresas, membresías y usuarios invitables.

**El control de acceso NO vive aquí, vive en `api/deps.py`.** Estas funciones
leen; quien decide si el usuario puede ver una empresa es la dependencia
`empresa_ctx` / `require_rol`, y ése es el único sitio donde debe decidirse.
Duplicar la comprobación aquí la haría parecer opcional allí.

Lo que sí concentra este módulo es el conteo de miembros, que aparece en dos
sitios con significados distintos y es fácil de confundir: uno alimenta el tope
de asientos del plan y el otro la pantalla del equipo.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.empresa import Empresa, EmpresaUsuario, TFIDFPerfil
from app.models.user import User


async def obtener(db: AsyncSession, empresa_id: UUID) -> Empresa | None:
    return (await db.execute(select(Empresa).where(Empresa.id == empresa_id))).scalar_one_or_none()


async def buscar_por_rut(db: AsyncSession, rut: str) -> Empresa | None:
    """Sostiene la unicidad del RUT al crear: dos empresas con el mismo RUT
    serían dos cuentas para el mismo contribuyente."""
    return (
        await db.execute(select(Empresa).where(Empresa.rut_empresa == rut))
    ).scalar_one_or_none()


async def membresias_del_usuario(db: AsyncSession, usuario_id: int) -> list[EmpresaUsuario]:
    """Las membresías con la empresa ya cargada.

    `selectinload` no es una optimización: sin él, leer `m.empresa` al construir
    la respuesta dispara IO sobre una sesión async fuera de contexto, y eso no
    es lento, es un error en tiempo de ejecución.
    """
    return list(
        (
            await db.execute(
                select(EmpresaUsuario)
                .options(selectinload(EmpresaUsuario.empresa))
                .where(EmpresaUsuario.user_id == usuario_id)
            )
        )
        .scalars()
        .all()
    )


async def membresia(db: AsyncSession, empresa_id: UUID, usuario_id: int) -> EmpresaUsuario | None:
    return (
        await db.execute(
            select(EmpresaUsuario).where(
                EmpresaUsuario.empresa_id == empresa_id,
                EmpresaUsuario.user_id == usuario_id,
            )
        )
    ).scalar_one_or_none()


async def contar_miembros(db: AsyncSession, empresa_id: UUID) -> int:
    """Cuántas personas ocupan asiento en la empresa.

    Es el número contra el que se compara `max_usuarios` del plan, así que
    cuenta MEMBRESÍAS y no usuarios distintos: la misma persona en dos empresas
    ocupa un asiento en cada una.
    """
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(EmpresaUsuario)
                .where(EmpresaUsuario.empresa_id == empresa_id)
            )
        ).scalar_one()
    )


async def miembros_con_usuario(
    db: AsyncSession, empresa_id: UUID
) -> list[tuple[EmpresaUsuario, User]]:
    """Membresías junto al usuario, en orden de incorporación."""
    return list(
        (
            await db.execute(
                select(EmpresaUsuario, User)
                .join(User, EmpresaUsuario.user_id == User.id)
                .where(EmpresaUsuario.empresa_id == empresa_id)
                .order_by(EmpresaUsuario.created_at)
            )
        ).all()
    )


async def buscar_usuario_por_email(db: AsyncSession, email: str) -> User | None:
    """Para invitar: hay que tener cuenta antes de que te sumen a un equipo."""
    return (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()


async def ids_de_empresas_del_usuario(db: AsyncSession, usuario_id: int) -> list[UUID]:
    """Sólo los ids, para los conteos del panel.

    Se usa donde el panel agrega sobre TODAS las empresas del usuario. Traer las
    membresías enteras para quedarse con una columna es traer filas que nadie
    mira.
    """
    return list(
        (
            await db.execute(
                select(EmpresaUsuario.empresa_id).where(EmpresaUsuario.user_id == usuario_id)
            )
        )
        .scalars()
        .all()
    )


async def perfil_tfidf(db: AsyncSession, empresa_id: UUID) -> TFIDFPerfil | None:
    """El vector TF-IDF que representa a la empresa, si ya se calculó.

    Puede no existir: se genera desde el histórico de órdenes de compra, y una
    empresa recién registrada no tiene ninguna.
    """
    return (
        await db.execute(select(TFIDFPerfil).where(TFIDFPerfil.empresa_id == empresa_id))
    ).scalar_one_or_none()
