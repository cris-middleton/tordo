"""Emisión, rotación y revocación de tokens de refresco.

El acceso sigue siendo un JWT corto (30 min) sin estado. Lo que este módulo
añade es la parte **con** estado: un token de refresco guardado en la base que
permite renovar el acceso sin volver a pedir la contraseña, y que se puede
revocar — cosa que un JWT no permite.

La rotación sin detección de reutilización no sirve de nada
------------------------------------------------------------
Rotar por rotar sólo acorta la vida de un token robado. Lo que de verdad protege
es qué pasa cuando aparece **un token ya usado**: significa que hay dos partes
con la misma credencial, y no hay forma de saber cuál es la legítima. La única
respuesta segura es invalidar toda la familia y obligar a entrar de nuevo.

Sin eso, el atacante que roba un token lo canjea una vez y se queda con uno
válido para siempre; el usuario legítimo ni se entera.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.refresh_token import RefreshToken

# 256 bits de aleatoriedad. No es un JWT a propósito: un token de refresco no
# tiene por qué llevar información dentro, y si no la lleva no hay nada que
# firmar ni que se pueda leer si se filtra.
BYTES_DE_TOKEN = 32


class ErrorDeRefresco(Exception):
    """El token no vale. El mensaje llega al cliente, así que no da detalles."""


def _hash(token: str) -> str:
    """SHA-256, no bcrypt.

    Para una contraseña haría falta un hash lento, porque una contraseña es corta
    y adivinable. Esto son 256 bits aleatorios: no hay diccionario que sirva, y
    un hash lento sólo añadiría latencia a cada refresco.
    """
    return hashlib.sha256(token.encode()).hexdigest()


async def emitir(db: AsyncSession, user_id: int, *, familia_id: uuid.UUID | None = None) -> str:
    """Crea un token nuevo y devuelve su valor en claro — la única vez que existe."""
    token = secrets.token_urlsafe(BYTES_DE_TOKEN)
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=_hash(token),
            familia_id=familia_id or uuid.uuid4(),
            expira_en=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await db.flush()
    return token


async def _revocar_familia(db: AsyncSession, familia_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.familia_id == familia_id, RefreshToken.revocado_en.is_(None))
        .values(revocado_en=datetime.now(UTC))
    )


async def rotar(db: AsyncSession, token: str) -> tuple[str, int]:
    """Canjea un token por otro. Devuelve (token nuevo, user_id).

    Lanza `ErrorDeRefresco` si no vale. Cuando el motivo es una reutilización,
    además **revoca la familia entera** antes de fallar.
    """
    fila = (
        await db.execute(select(RefreshToken).where(RefreshToken.token_hash == _hash(token)))
    ).scalar_one_or_none()

    if fila is None:
        raise ErrorDeRefresco("Sesión inválida. Vuelve a entrar.")

    if fila.revocado_en is not None:
        # Alguien está usando un token que ya se canjeó. O se filtró, o hay una
        # carrera; en ninguno de los dos casos se puede distinguir al legítimo.
        await _revocar_familia(db, fila.familia_id)
        await db.flush()
        raise ErrorDeRefresco("Sesión invalidada por seguridad. Vuelve a entrar.")

    expira = fila.expira_en
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=UTC)
    if expira <= datetime.now(UTC):
        raise ErrorDeRefresco("Sesión expirada. Vuelve a entrar.")

    # El nuevo hereda la familia y la caducidad ORIGINAL no se extiende: rotar no
    # puede convertir una sesión en eterna.
    nuevo = await emitir(db, fila.user_id, familia_id=fila.familia_id)
    fila.revocado_en = datetime.now(UTC)
    fila.reemplazado_por = (
        await db.execute(select(RefreshToken.id).where(RefreshToken.token_hash == _hash(nuevo)))
    ).scalar_one()
    await db.flush()
    return nuevo, fila.user_id


async def revocar(db: AsyncSession, token: str) -> bool:
    """Cierre de sesión. Devuelve si había algo que revocar.

    Revoca la familia completa, no sólo el token presentado: cerrar sesión debe
    cerrar esa sesión, y los tokens anteriores de la misma cadena son la misma.
    """
    fila = (
        await db.execute(select(RefreshToken).where(RefreshToken.token_hash == _hash(token)))
    ).scalar_one_or_none()
    if fila is None:
        return False
    await _revocar_familia(db, fila.familia_id)
    await db.flush()
    return True


async def revocar_todo_del_usuario(db: AsyncSession, user_id: int) -> None:
    """Echa al usuario de todos sus dispositivos. Se usa al cambiar la contraseña."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revocado_en.is_(None))
        .values(revocado_en=datetime.now(UTC))
    )
    await db.flush()
