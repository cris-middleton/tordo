"""Verificar que el correo de una cuenta existe y es de quien dice.

**Por qué hace falta antes de cobrar.** `users.is_verified` llevaba existiendo
desde la primera migración sin ningún flujo que la pusiera en `True`: la columna
estaba, la promesa no. Sin verificación, una cuenta puede registrarse con el
correo de otra persona, y todo lo que el producto manda —avisos con datos de
negocio, el informe semanal, los comprobantes de pago— acaba en un buzón ajeno.

Tres decisiones, y las tres son las mismas que en la recuperación de contraseña
porque el riesgo es el mismo:

1. **Reenviar nunca dice si el correo existe.** Responder distinto para un correo
   desconocido convierte el formulario en un verificador de cuentas gratis.
2. **El token no lleva información dentro.** 256 bits aleatorios guardados como
   SHA-256: no hay nada que firmar, y si la base se filtra no hay nada que leer.
3. **Un solo uso.** `usado_en` no es una optimización: sin él, quien tenga el
   correo puede reverificar cuantas veces quiera.

Lo que **no** hace: bloquear el acceso. Una cuenta sin verificar entra igual y
usa el producto. Cerrarle la puerta a alguien porque su proveedor de correo tardó
en entregar es perder al usuario para proteger un caso que casi no ocurre; lo que
sí se acota es cobrarle y mandarle datos de negocio.
"""

from __future__ import annotations

import hashlib
import html
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.email import send_email
from app.models.user import User
from app.models.verificacion_correo import TokenVerificacionCorreo

logger = logging.getLogger(__name__)

BYTES_DE_TOKEN = 32

#: Días que vale el enlace. Alguien se registra un viernes por la tarde y abre
#: el correo el lunes: una hora —lo que dura el de recuperación— lo dejaría
#: fuera por una razón que no es suya.
DIAS_DE_VIGENCIA = 7


class ErrorDeVerificacion(Exception):
    """El enlace no vale. El mensaje llega al usuario, así que no da detalles."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _cuerpo(nombre: str, enlace: str) -> tuple[str, str]:
    texto = (
        f"Hola {nombre},\n\n"
        f"Bienvenido a {settings.app_name}. Confirma tu correo para que podamos "
        f"mandarte los avisos de licitaciones:\n{enlace}\n\n"
        f"El enlace vence en {DIAS_DE_VIGENCIA} días.\n\n"
        "Si no creaste esta cuenta, puedes ignorar este correo.\n"
    )
    # `nombre` es texto libre puesto por el usuario al registrarse: sin escapar,
    # un nombre como "María & José <b>" rompe la maqueta o inyecta HTML en el
    # correo de la propia víctima. Mismo bug ya corregido en informe_semanal.
    nombre_html = html.escape(nombre)
    cuerpo_html = (
        f"<p>Hola {nombre_html},</p>"
        f"<p>Bienvenido a {settings.app_name}. Confirma tu correo para que "
        f"podamos mandarte los avisos de licitaciones.</p>"
        f'<p><a href="{enlace}">Confirmar mi correo</a></p>'
        f"<p>El enlace vence en {DIAS_DE_VIGENCIA} días.</p>"
        "<p>Si no creaste esta cuenta, puedes ignorar este correo.</p>"
    )
    return texto, cuerpo_html


async def emitir(
    db: AsyncSession,
    usuario: User,
    *,
    background_tasks: BackgroundTasks | None = None,
) -> str | None:
    """Emite un token y manda el correo. Devuelve el token (para los tests).

    Ya verificado, no hace nada: reenviar a alguien que ya confirmó sólo genera
    un correo que confunde.
    """
    if usuario.is_verified:
        return None

    token = secrets.token_urlsafe(BYTES_DE_TOKEN)
    db.add(
        TokenVerificacionCorreo(
            user_id=usuario.id,
            token_hash=_hash(token),
            expira_en=datetime.now(UTC) + timedelta(days=DIAS_DE_VIGENCIA),
        )
    )
    await db.commit()

    enlace = f"{(settings.frontend_url or '').rstrip('/')}/verificar?token={token}"
    nombre = usuario.full_name or usuario.username or "hola"
    texto, cuerpo_html = _cuerpo(nombre, enlace)
    argumentos = {
        "to": usuario.email,
        "subject": f"Confirma tu correo en {settings.app_name}",
        "body": texto,
        "html_body": cuerpo_html,
    }

    # `send_email` es `smtplib` síncrono: en el camino de un request se agenda en
    # segundo plano para no dejar al usuario esperando al servidor de correo.
    if background_tasks is not None:
        background_tasks.add_task(send_email, **argumentos)
    else:
        send_email(**argumentos)

    return token


async def reenviar(
    db: AsyncSession,
    email: str,
    *,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Vuelve a mandar el correo de verificación.

    **No dice si la cuenta existe.** El endpoint responde lo mismo en los dos
    casos: distinguir convierte el formulario en un verificador de cuentas.
    """
    fila = await db.execute(select(User).where(User.email == email.lower().strip()))
    usuario = fila.scalar_one_or_none()
    if usuario is None:
        logger.info("reenvío de verificación para un correo no registrado")
        return
    await emitir(db, usuario, background_tasks=background_tasks)


async def confirmar(db: AsyncSession, token: str) -> User:
    """Canjea el token y deja la cuenta verificada."""
    fila = await db.execute(
        select(TokenVerificacionCorreo).where(TokenVerificacionCorreo.token_hash == _hash(token))
    )
    registro = fila.scalar_one_or_none()
    if registro is None:
        raise ErrorDeVerificacion("El enlace no es válido.")
    if registro.usado_en is not None:
        raise ErrorDeVerificacion("Este enlace ya se usó.")

    expira = registro.expira_en
    # Postgres devuelve el timestamp con zona; otros drivers lo devuelven sin
    # ella, y comparar ambos lanza TypeError. Mismo criterio que `esta_en_trial`.
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=UTC)
    if expira < datetime.now(UTC):
        raise ErrorDeVerificacion("El enlace venció. Pide uno nuevo.")

    usuario = await db.get(User, registro.user_id)
    if usuario is None:
        raise ErrorDeVerificacion("El enlace no es válido.")

    usuario.is_verified = True
    registro.usado_en = datetime.now(UTC)
    await db.commit()
    await db.refresh(usuario)
    return usuario
