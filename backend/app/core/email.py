"""
Email service for sending notifications
Supports SMTP (Gmail, SendGrid, AWS SES, etc.)
"""

import logging
import smtplib
from dataclasses import dataclass
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)

#: Segundos antes de rendirse con el servidor SMTP. Cubre el peor caso razonable
#: —DNS lento más handshake TLS— sin dejar un worker de Celery bloqueado.
SMTP_TIMEOUT = 20


@dataclass(frozen=True)
class Adjunto:
    """Un fichero que viaja con el correo."""

    nombre: str
    contenido: bytes
    subtipo: str = "pdf"


def send_email(
    to: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    from_email: str | None = None,
    adjuntos: list[Adjunto] | None = None,
) -> bool:
    """
    Send an email notification

    Args:
        to: Recipient email address
        subject: Email subject
        body: Plain text email body
        html_body: Optional HTML email body
        from_email: Sender email (defaults to settings.smtp_from_email)
        adjuntos: Ficheros adjuntos (el informe semanal manda su PDF)

    Returns:
        True if email was sent successfully, False otherwise

    Nota sobre la estructura MIME: con adjuntos hace falta `mixed` por FUERA y
    `alternative` por DENTRO. Al revés —adjuntar el PDF como una "alternativa"
    al texto— algunos clientes lo tratan como otra versión del mismo contenido y
    lo esconden, y otros muestran el PDF EN LUGAR del mensaje.
    """
    # Check if email is configured
    if not settings.smtp_host or not settings.smtp_user:
        logger.warning("Email not configured. Skipping email send.")
        return False

    try:
        cuerpo = MIMEMultipart("alternative")
        cuerpo.attach(MIMEText(body, "plain", "utf-8"))
        if html_body:
            cuerpo.attach(MIMEText(html_body, "html", "utf-8"))

        if adjuntos:
            msg = MIMEMultipart("mixed")
            msg.attach(cuerpo)
            for adjunto in adjuntos:
                parte = MIMEApplication(adjunto.contenido, _subtype=adjunto.subtipo)
                parte.add_header("Content-Disposition", "attachment", filename=adjunto.nombre)
                msg.attach(parte)
        else:
            msg = cuerpo

        msg["Subject"] = subject
        msg["From"] = from_email or settings.smtp_from_email or settings.smtp_user
        msg["To"] = to

        # Connect to SMTP server.
        #
        # **Con timeout explícito.** `smtplib` sin `timeout` hereda el del socket
        # global, que por defecto es *ninguno*: un servidor que acepta la conexión
        # y no responde deja la tarea de Celery colgada indefinidamente, ocupando
        # un worker. Es el fallo que no aparece en pruebas y sí un martes a las
        # nueve, cuando el proveedor de correo va lento.
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT)

        # Login and send
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)

        server.send_message(msg)
        server.quit()

        logger.info(f"Email sent successfully to {to}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False
