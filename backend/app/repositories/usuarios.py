"""Acceso a usuarios.

Poco código y una decisión que sí importa: **la búsqueda por email o usuario al
registrarse va en una sola consulta con `OR`**. Hacer dos —una por email, otra
por username— abre una carrera en la que dos altas simultáneas con el mismo
correo pasan las dos comprobaciones antes de que ninguna inserte.

La restricción `UNIQUE` de la base es la garantía de verdad; esto es lo que
convierte el choque en un 400 legible en vez de un 500.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def obtener(db: AsyncSession, usuario_id: int) -> User | None:
    return (await db.execute(select(User).where(User.id == usuario_id))).scalar_one_or_none()


async def buscar_por_username(db: AsyncSession, username: str) -> User | None:
    return (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()


async def buscar_por_email(db: AsyncSession, email: str) -> User | None:
    return (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()


async def existe_email_o_username(db: AsyncSession, email: str, username: str) -> User | None:
    """El primero que choque, para poder rechazar el registro con un 400."""
    return (
        await db.execute(select(User).where((User.email == email) | (User.username == username)))
    ).scalar_one_or_none()


async def listar(db: AsyncSession, *, salto: int = 0, limite: int = 100) -> list[User]:
    """Sólo para superusuarios: el router es quien lo comprueba."""
    return list((await db.execute(select(User).offset(salto).limit(limite))).scalars().all())
