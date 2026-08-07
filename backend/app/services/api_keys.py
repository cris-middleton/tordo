"""Emisión, verificación y revocación de claves de API.

El formato es `tordo_<prefijo>_<secreto>`:

- `tordo_` hace la clave **reconocible a simple vista**. Importa más de lo que
  parece: los escáneres de secretos de GitHub y las revisiones humanas detectan
  un prefijo conocido en un commit, y una cadena de 43 caracteres aleatorios sin
  prefijo pasa por cualquier cosa.
- `prefijo` se guarda en claro para poder decir *"la clave `tordo_a1b2c3d4…` no
  se usa desde marzo"* sin conocer el secreto.
- `secreto` son 32 bytes aleatorios. Es lo único que hay que proteger, y sólo
  existe en claro en la respuesta que la crea.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey

PREFIJO_MARCA = "tordo"
BYTES_DE_SECRETO = 32
LARGO_PREFIJO = 8


class ErrorDeClave(Exception):
    """La clave no vale. El mensaje llega al cliente, así que no da detalles."""


def _hash(clave: str) -> str:
    """SHA-256, no bcrypt.

    Como con los tokens de refresco: esto son 256 bits aleatorios, no una
    contraseña corta y adivinable. Un hash lento sólo añadiría latencia a cada
    petición de la API.
    """
    return hashlib.sha256(clave.encode()).hexdigest()


async def crear(
    db: AsyncSession,
    *,
    empresa_id: UUID,
    nombre: str,
    creada_por: int | None = None,
    expira_en: datetime | None = None,
) -> tuple[str, ApiKey]:
    """Emite una clave. Devuelve (clave en claro, fila).

    La clave en claro **no se puede recuperar después**: si el usuario la pierde,
    revoca y crea otra. Es lo que hace que guardar sólo el hash sirva de algo.
    """
    prefijo = secrets.token_hex(LARGO_PREFIJO // 2)
    secreto = secrets.token_urlsafe(BYTES_DE_SECRETO)
    clave = f"{PREFIJO_MARCA}_{prefijo}_{secreto}"

    fila = ApiKey(
        empresa_id=empresa_id,
        nombre=nombre,
        prefijo=prefijo,
        key_hash=_hash(clave),
        creada_por=creada_por,
        expira_en=expira_en,
    )
    db.add(fila)
    await db.flush()
    return clave, fila


def parece_clave(valor: str) -> bool:
    """Distingue una clave de API de un JWT sin tocar la base.

    Es lo que permite que un mismo `Authorization: Bearer …` acepte las dos cosas.
    """
    return valor.startswith(f"{PREFIJO_MARCA}_")


async def verificar(db: AsyncSession, clave: str) -> ApiKey:
    """Devuelve la clave si vale. Lanza `ErrorDeClave` si no.

    Actualiza `ultimo_uso_en`, que es lo único que permite después responder a
    "¿alguien usa todavía esta clave?" antes de revocarla.
    """
    fila = (
        await db.execute(select(ApiKey).where(ApiKey.key_hash == _hash(clave)))
    ).scalar_one_or_none()

    if fila is None:
        raise ErrorDeClave("Clave de API inválida.")
    if fila.revocada_en is not None:
        raise ErrorDeClave("Clave de API revocada.")

    if fila.expira_en is not None:
        expira = fila.expira_en
        if expira.tzinfo is None:
            expira = expira.replace(tzinfo=UTC)
        if expira <= datetime.now(UTC):
            raise ErrorDeClave("Clave de API expirada.")

    fila.ultimo_uso_en = datetime.now(UTC)
    return fila


async def revocar(db: AsyncSession, clave_id: UUID, empresa_id: UUID) -> bool:
    """Revoca una clave de ESA empresa. Devuelve si había algo que revocar.

    El filtro por empresa no es redundante con la autorización del endpoint: es
    lo que impide que un `id` de otra empresa —adivinado o filtrado— se revoque
    desde aquí.
    """
    resultado = await db.execute(
        update(ApiKey)
        .where(
            ApiKey.id == clave_id,
            ApiKey.empresa_id == empresa_id,
            ApiKey.revocada_en.is_(None),
        )
        .values(revocada_en=datetime.now(UTC))
    )
    await db.flush()
    return resultado.rowcount > 0


async def listar(db: AsyncSession, empresa_id: UUID) -> list[ApiKey]:
    """Las claves de una empresa, vigentes y revocadas.

    Las revocadas se listan a propósito: sirven para auditar qué se emitió y
    cuándo dejó de valer.
    """
    return list(
        (
            await db.execute(
                select(ApiKey)
                .where(ApiKey.empresa_id == empresa_id)
                .order_by(ApiKey.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
