"""
Twilio WhatsApp notification service.

Safe-to-import always. When feature_whatsapp=False or credentials are missing,
send_whatsapp_alert() logs the message and returns True (mock mode).

Twilio WhatsApp uses the sandbox number (whatsapp:+14155238886) in dev.
In production, replace with the approved WABA number once approved.

Mock mode is intentional — the service structure is production-ready so that
enabling it only requires setting TWILIO_ACCOUNT_SID + FEATURE_WHATSAPP=true.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def _is_live() -> bool:
    from app.config import settings

    return bool(
        settings.feature_whatsapp
        and settings.twilio_account_sid
        and settings.twilio_auth_token
    )


def send_whatsapp_alert(to_number: str, message: str) -> bool:
    """
    Send a WhatsApp message via Twilio.

    Parameters
    ----------
    to_number : str
        Recipient's WhatsApp number in E.164 format (e.g. +56912345678).
        The 'whatsapp:' prefix is added automatically.
    message : str
        Message body (max 4096 chars for WhatsApp).

    Returns
    -------
    bool
        True on success or mock mode, False on delivery error.
    """
    if not to_number:
        return False

    # Ensure E.164 format
    to_wa = f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number

    if not _is_live():
        logger.info(
            "[MOCK WhatsApp] → %s: %s",
            to_wa,
            message[:120] + ("…" if len(message) > 120 else ""),
        )
        return True

    try:
        from twilio.rest import Client  # lazy import
        from app.config import settings

        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        msg = client.messages.create(
            from_=settings.twilio_whatsapp_from,
            to=to_wa,
            body=message,
        )
        logger.info("WhatsApp sent: sid=%s status=%s", msg.sid, msg.status)
        return True
    except Exception as exc:
        logger.error("WhatsApp delivery failed to %s: %s", to_wa, exc)
        return False


# ─── Template helpers ─────────────────────────────────────────────────────────


def msg_estado_habil_cambio(empresa: str, estado_nuevo: str) -> str:
    emoji = "✅" if estado_nuevo == "habil" else "⚠️"
    return (
        f"{emoji} *TORDO — Estado Hábil*\n\n"
        f"La empresa *{empresa}* cambió su estado hábil a: *{estado_nuevo.upper()}*.\n\n"
        "Ingresa a la plataforma para más detalles."
    )


def msg_plazo_urgente(licitacion: str, horas: int) -> str:
    return (
        f"⏰ *TORDO — Plazo urgente*\n\n"
        f"La licitación *{licitacion[:80]}* cierra en *{horas} horas*.\n\n"
        "Revisa el checklist antes de que sea tarde."
    )


def msg_documento_vencido(empresa: str, documento: str) -> str:
    return (
        f"📄 *TORDO — Documento por vencer*\n\n"
        f"El documento *{documento}* de *{empresa}* vence próximamente.\n\n"
        "Renuévalo para mantener el expediente al día."
    )
