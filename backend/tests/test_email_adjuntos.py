"""La estructura MIME del correo con adjunto.

Importa porque **el error no se ve desde el código**: un correo con el PDF
colgado como «alternativa» al texto se envía igual, el SMTP lo acepta y el log
dice «Email sent successfully». Lo que falla es en el cliente de quien lo recibe
— y ahí ya no hay traza.

Con adjuntos hace falta `mixed` por fuera y `alternative` por dentro. Al revés,
algunos clientes tratan el PDF como otra versión del mismo contenido y lo
esconden, y otros muestran el PDF en lugar del mensaje.
"""

from __future__ import annotations

import email
import email.policy

import pytest

from app.core.email import Adjunto, send_email


class SMTPFalso:
    """Recoge el mensaje en vez de mandarlo."""

    enviados: list = []

    def __init__(self, *args, **kwargs):
        pass

    def starttls(self):
        pass

    def login(self, *args):
        pass

    def send_message(self, msg):
        SMTPFalso.enviados.append(msg)

    def quit(self):
        pass


@pytest.fixture
def smtp(monkeypatch):
    import smtplib

    from app.config import settings

    SMTPFalso.enviados = []
    monkeypatch.setattr(smtplib, "SMTP", SMTPFalso)
    monkeypatch.setattr(smtplib, "SMTP_SSL", SMTPFalso)
    # Sin configuración de SMTP, `send_email` se salta el envío y devuelve False:
    # el test pasaría sin haber comprobado nada.
    monkeypatch.setattr(settings, "smtp_host", "smtp.local")
    monkeypatch.setattr(settings, "smtp_user", "envia@tordo-pruebas.cl")
    monkeypatch.setattr(settings, "smtp_password", "x")
    monkeypatch.setattr(settings, "smtp_use_tls", True)
    return SMTPFalso


def _partes(msg) -> list[str]:
    return [p.get_content_type() for p in msg.walk()]


def test_sin_adjuntos_el_mensaje_es_alternative(smtp):
    """El caso de siempre no cambia: texto y HTML son dos versiones de lo mismo."""
    assert send_email(to="a@b.cl", subject="Hola", body="texto", html_body="<p>hola</p>")

    msg = smtp.enviados[0]
    assert msg.get_content_type() == "multipart/alternative"
    assert "text/plain" in _partes(msg) and "text/html" in _partes(msg)


def test_con_adjunto_el_pdf_no_es_una_alternativa_al_texto(smtp):
    assert send_email(
        to="a@b.cl",
        subject="Informe",
        body="texto",
        html_body="<p>hola</p>",
        adjuntos=[Adjunto(nombre="informe.pdf", contenido=b"%PDF-1.4 fake")],
    )

    msg = smtp.enviados[0]
    assert msg.get_content_type() == "multipart/mixed"
    # El texto y el HTML siguen siendo alternativas ENTRE SÍ, dentro del mixed.
    assert "multipart/alternative" in _partes(msg)
    assert "application/pdf" in _partes(msg)


def test_el_adjunto_conserva_su_nombre_y_su_contenido(smtp):
    """Sin `Content-Disposition: attachment` con nombre, el cliente lo guarda
    como «noname» y el usuario no sabe qué acaba de descargar."""
    send_email(
        to="a@b.cl",
        subject="Informe",
        body="texto",
        adjuntos=[Adjunto(nombre="informe-2026-08-03.pdf", contenido=b"%PDF-1.4 fake")],
    )

    crudo = smtp.enviados[0].as_bytes()
    recibido = email.message_from_bytes(crudo, policy=email.policy.default)
    pdf = next(p for p in recibido.walk() if p.get_content_type() == "application/pdf")

    assert pdf.get_filename() == "informe-2026-08-03.pdf"
    assert pdf.get_payload(decode=True) == b"%PDF-1.4 fake"


def test_las_cabeceras_van_una_sola_vez(smtp):
    """Se ponen en el mensaje EXTERIOR. Puestas en el interior antes de envolver,
    viajarían dentro del cuerpo y el correo llegaría sin asunto."""
    send_email(
        to="a@b.cl",
        subject="Informe",
        body="texto",
        adjuntos=[Adjunto(nombre="x.pdf", contenido=b"%PDF-")],
    )

    msg = smtp.enviados[0]
    assert msg.get_all("Subject") == ["Informe"]
    assert msg.get_all("To") == ["a@b.cl"]
