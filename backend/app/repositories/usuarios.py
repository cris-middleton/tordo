"""Acceso a usuarios.

Poco código y una decisión que sí importa: **la búsqueda por email o usuario al
registrarse va en una sola consulta con `OR`**. Hacer dos —una por email, otra
por username— abre una carrera en la que dos altas simultáneas con el mismo
correo pasan las dos comprobaciones antes de que ninguna inserte.

La restricción `UNIQUE` de la base es la garantía de verdad; esto es lo que
convierte el choque en un 400 legible en vez de un 500.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def obtener(db: AsyncSession, usuario_id: int) -> User | None:
    return (await db.execute(select(User).where(User.id == usuario_id))).scalar_one_or_none()


async def buscar_por_username(db: AsyncSession, username: str) -> User | None:
    return (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()


async def buscar_por_email(db: AsyncSession, email: str) -> User | None:
    return (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()


async def buscar_por_identificador(db: AsyncSession, identificador: str) -> User | None:
    """Para entrar: acepta el usuario o el correo, lo que la persona recuerde.

    **No es un `OR` entre las dos columnas, y la diferencia importa.** Con un
    `OR`, alguien que se registrara con el username `victima@empresa.cl`
    quedaría compitiendo por ese identificador con quien tiene ese correo de
    verdad, y cuál de los dos gana lo decidiría el orden de filas. Decidir
    ANTES por la forma del texto —lleva `@`, es un correo— deja una sola
    columna consultada y cierra el solapamiento.

    El correo se compara en minúsculas porque se guarda tal cual lo escribió el
    usuario: sin esto, quien se registró con `Ana@Empresa.cl` no puede entrar
    escribiendo su correo como lo escribe siempre. Eso impide usar el índice de
    `email`, y es deliberado — no se añade uno por expresión (la convención del
    repo los prohíbe: Alembic los compara mal). A esta escala la diferencia no
    se mide; si algún día se mide, la solución es normalizar la columna al
    guardar, no indexar la expresión.
    """
    if "@" in identificador:
        return (
            await db.execute(select(User).where(func.lower(User.email) == identificador.lower()))
        ).scalar_one_or_none()
    return await buscar_por_username(db, identificador)


async def existe_email_o_username(db: AsyncSession, email: str, username: str) -> User | None:
    """El primero que choque, para poder rechazar el registro con un 400."""
    return (
        await db.execute(select(User).where((User.email == email) | (User.username == username)))
    ).scalar_one_or_none()


async def listar(db: AsyncSession, *, salto: int = 0, limite: int = 100) -> list[User]:
    """Sólo para superusuarios: el router es quien lo comprueba."""
    return list((await db.execute(select(User).offset(salto).limit(limite))).scalars().all())
