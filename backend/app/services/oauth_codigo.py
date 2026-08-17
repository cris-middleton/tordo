"""Emisión y canje del código de un solo uso del login con Google.

Ver `app/models/oauth_codigo.py` para el porqué. Aquí sólo está la mecánica, y
es deliberadamente aburrida: emitir, canjear una vez, caducar rápido.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.oauth_codigo import OAuthCodigo

#: 256 bits. El código viaja por una URL, así que no puede ser adivinable ni
#: siquiera durante los sesenta segundos que vive.
BYTES_DE_CODIGO = 32

#: Un redirect del navegador tarda milisegundos. Un minuto cubre una red lenta
#: sin dejar una ventana que valga la pena atacar.
VIDA = timedelta(seconds=60)


class ErrorDeCodigo(Exception):
    """El código no vale. El mensaje llega al cliente, así que no da detalles."""


def _hash(codigo: str) -> str:
    """SHA-256, no bcrypt: son 256 bits aleatorios, no una contraseña.

    Un hash lento aquí sólo añadiría latencia al inicio de sesión sin proteger
    de nada — no hay diccionario que sirva contra 32 bytes de `secrets`.
    """
    return hashlib.sha256(codigo.encode()).hexdigest()


async def emitir(db: AsyncSession, user_id: int) -> str:
    """Crea un código y devuelve el valor **en claro**, que es lo único que sale.

    El que se guarda es el hash. Quien lea la fila después no puede reconstruir
    el código.
    """
    codigo = secrets.token_urlsafe(BYTES_DE_CODIGO)
    db.add(
        OAuthCodigo(
            codigo_hash=_hash(codigo),
            user_id=user_id,
            expira_en=datetime.now(UTC) + VIDA,
        )
    )
    await db.flush()
    return codigo


async def canjear(db: AsyncSession, codigo: str) -> int:
    """Gasta el código y devuelve el `user_id`. Levanta `ErrorDeCodigo` si no vale.

    **Marca el uso antes de devolver**, en la misma transacción que lo valida:
    dos canjes simultáneos no pueden salir los dos bien, porque el segundo
    encuentra `usado_en` puesto.

    Los tres motivos de rechazo —no existe, ya se usó, caducó— devuelven el
    mismo error a propósito. Distinguirlos le diría a quien pruebe códigos
    cuáles existieron.
    """
    if not codigo:
        raise ErrorDeCodigo("código inválido")

    fila = (
        await db.execute(select(OAuthCodigo).where(OAuthCodigo.codigo_hash == _hash(codigo)))
    ).scalar_one_or_none()

    if fila is None or fila.usado_en is not None:
        raise ErrorDeCodigo("código inválido")

    expira = fila.expira_en
    # Postgres devuelve el timestamp con zona; otros drivers lo devuelven sin
    # ella, y comparar ambos lanza TypeError. Un valor sin zona se interpreta
    # como UTC, que es como se guarda.
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=UTC)
    if expira <= datetime.now(UTC):
        raise ErrorDeCodigo("código inválido")

    fila.usado_en = datetime.now(UTC)
    await db.flush()
    return fila.user_id
