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

        # Connect to SMTP server
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port)

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


def send_alert_email(
    user_email: str, alert_title: str, alert_message: str, alert_url: str | None = None
) -> bool:
    """
    Send an alert notification email with formatted template

    Args:
        user_email: Recipient email
        alert_title: Alert title
        alert_message: Alert message
        alert_url: Optional URL to view the alert

    Returns:
        True if email was sent successfully
    """
    subject = f"New Alert: {alert_title}"

    # Plain text body
    body = f"""
Hello,

You have a new alert:

{alert_title}

{alert_message}
"""
    if alert_url:
        body += f"\nView alert: {alert_url}"

    # HTML body
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #4CAF50; color: white; padding: 20px; text-align: center; }}
        .content {{ padding: 20px; background-color: #f9f9f9; }}
        .alert-title {{ font-size: 18px; font-weight: bold; margin-bottom: 10px; }}
        .alert-message {{ margin-bottom: 20px; }}
        .button {{ display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>New Alert</h2>
        </div>
        <div class="content">
            <div class="alert-title">{alert_title}</div>
            <div class="alert-message">{alert_message}</div>
"""
    if alert_url:
        html_body += f'            <a href="{alert_url}" class="button">View Alert</a>'

    html_body += """
        </div>
    </div>
</body>
</html>
"""

    return send_email(
        to=user_email,
        subject=subject,
        body=body,
        html_body=html_body,
    )
