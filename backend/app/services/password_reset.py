"""Recuperación de contraseña por correo.

Dos decisiones que el código hace explícitas
--------------------------------------------

1. **Pedir la recuperación nunca dice si el correo existe.** `solicitar` devuelve
   `None` para un correo desconocido y el endpoint responde lo mismo en los dos
   casos. Un formulario que distingue es un verificador de cuentas gratis: se
   prueba una lista de correos y se sabe cuáles están registrados.

2. **Restablecer revoca todas las sesiones.** Es la misma razón que en
   `change-password`: quien recupera su contraseña suele hacerlo porque cree que
   alguien más entró, y dejar viva la sesión del intruso vacía el gesto.

El token es el mismo mecanismo que el de refresco —256 bits aleatorios,
guardados como SHA-256— por el mismo motivo: no lleva información dentro, así
que no hay nada que firmar ni nada que leer si la base se filtra.
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
from app.core.security import get_password_hash
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.services import auth_tokens

logger = logging.getLogger(__name__)

BYTES_DE_TOKEN = 32


class ErrorDeRecuperacion(Exception):
    """El enlace no vale. El mensaje llega al usuario, así que no da detalles."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _cuerpo(nombre: str, enlace: str) -> tuple[str, str]:
    minutos = settings.password_reset_expire_minutes
    texto = (
        f"Hola {nombre},\n\n"
        f"Recibimos una solicitud para restablecer tu contraseña en {settings.app_name}.\n\n"
        f"Abre este enlace para elegir una nueva:\n{enlace}\n\n"
        f"El enlace vence en {minutos} minutos y sirve una sola vez.\n\n"
        "Si no fuiste tú, puedes ignorar este correo: tu contraseña no cambia "
        "hasta que alguien abra el enlace.\n"
    )
    # `nombre` es full_name/username, texto libre puesto por el usuario al
    # registrarse (sin validación de caracteres). Sin escapar, un nombre como
    # "María & José <b>" rompe la maqueta del correo o inyecta HTML en el
    # propio correo de la víctima — el mismo bug ya corregido en
    # informe_semanal.py. El cuerpo en texto plano no lo necesita.
    nombre_html = html.escape(nombre)
    cuerpo_html = (
        f"<p>Hola {nombre_html},</p>"
        f"<p>Recibimos una solicitud para restablecer tu contraseña en "
        f"{settings.app_name}.</p>"
        f'<p><a href="{enlace}">Elegir una nueva contraseña</a></p>'
        f"<p>El enlace vence en {minutos} minutos y sirve una sola vez.</p>"
        "<p>Si no fuiste tú, puedes ignorar este correo: tu contraseña no cambia "
        "hasta que alguien abra el enlace.</p>"
    )
    return texto, cuerpo_html


async def solicitar(
    db: AsyncSession, email: str, *, background_tasks: BackgroundTasks | None = None
) -> str | None:
    """Emite un token y agenda el correo. Devuelve el token, o None si no procede.

    El valor de retorno existe para los tests: el endpoint lo descarta y responde
    siempre lo mismo.

    `background_tasks` lo pasa el endpoint — el servicio no lo crea porque eso
    es alcanzar hacia dentro del request, que no existe cuando este mismo test
    de aquí llama a `solicitar` directo. Cuando lo recibe, agenda `send_email`
    en vez de llamarlo: `send_email` es un `smtplib` síncrono sin timeout (DNS +
    TCP + TLS + login + send), y la rama de "correo conocido" lo pagaría entero
    mientras la de "correo desconocido" sólo hace un SELECT — una diferencia de
    tiempo medible que delata cuál de las dos pasó, exactamente lo que este
    endpoint existe para esconder. `BackgroundTasks` corre la función síncrona
    en un hilo aparte DESPUÉS de que la respuesta ya salió, así que además dejar
    de bloquear el único worker del proceso mientras dura el envío.
    Sin `background_tasks` (llamada directa, como en estos tests) se manda al
    tiro: no hay una respuesta HTTP cuyo tiempo pueda medirse.
    """
    usuario = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

    if usuario is None or not usuario.is_active:
        # A propósito sin distinguir los dos casos en el log tampoco: un log que
        # dice "correo desconocido" es el mismo oráculo, sólo que más tarde.
        logger.info("Solicitud de recuperación sin destinatario válido")
        return None

    token = secrets.token_urlsafe(BYTES_DE_TOKEN)
    db.add(
        PasswordResetToken(
            user_id=usuario.id,
            token_hash=_hash(token),
            expira_en=datetime.now(UTC) + timedelta(minutes=settings.password_reset_expire_minutes),
        )
    )
    await db.flush()

    enlace = f"{settings.frontend_url}/restablecer?token={token}"
    texto, cuerpo_html = _cuerpo(usuario.full_name or usuario.username, enlace)
    argumentos_correo = {
        "to": usuario.email,
        "subject": f"Restablece tu contraseña en {settings.app_name}",
        "body": texto,
        "html_body": cuerpo_html,
    }
    if background_tasks is not None:
        background_tasks.add_task(send_email, **argumentos_correo)
    else:
        send_email(**argumentos_correo)
    return token


async def restablecer(db: AsyncSession, token: str, nueva_password: str) -> int:
    """Canjea el token y cambia la contraseña. Devuelve el user_id.

    Lanza `ErrorDeRecuperacion` si el token no existe, ya se usó o caducó — con
    el mismo mensaje en los tres casos.
    """
    fila = (
        await db.execute(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == _hash(token))
        )
    ).scalar_one_or_none()

    invalido = ErrorDeRecuperacion("El enlace no es válido o ya venció. Pide uno nuevo.")
    if fila is None or fila.usado_en is not None:
        raise invalido

    expira = fila.expira_en
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=UTC)
    if expira <= datetime.now(UTC):
        raise invalido

    usuario = (await db.execute(select(User).where(User.id == fila.user_id))).scalar_one_or_none()
    if usuario is None or not usuario.is_active:
        raise invalido

    usuario.hashed_password = get_password_hash(nueva_password)
    fila.usado_en = datetime.now(UTC)
    await auth_tokens.revocar_todo_del_usuario(db, usuario.id)
    await db.flush()
    logger.info("Contraseña restablecida para el usuario %s", usuario.id)
    return usuario.id
