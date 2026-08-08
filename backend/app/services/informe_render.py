"""Cómo se ve el informe semanal: texto, HTML y PDF.

Separado de `informe_semanal.py` a propósito: **qué se cuenta** y **cómo se
pinta** cambian por motivos distintos, y mezclarlos convierte cualquier retoque
de maquetación en un riesgo para los datos.

Dos cosas que aquí importan más de lo que parecen:

- **Todo el texto que viene de fuera se escapa.** Los nombres de licitación son
  datos de ChileCompra: un `&` o un `<` en uno de ellos rompía el correo, y el
  camino corto entre «rompe la maqueta» e «inyecta etiquetas» es muy corto.
- **El cuerpo en texto plano es texto plano.** El correo se mandaba con el HTML
  metido en el hueco del texto, así que a quien lo leyera sin HTML le llegaba el
  marcado en crudo.
"""

from __future__ import annotations

import html
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.config import settings
from app.services.informe_semanal import Informe, Seccion

#: Navy de la marca (`--color-brand-navy`). Duplicado a propósito: el PDF no
#: puede leer los tokens CSS, y un color inventado se nota más que uno copiado.
NAVY = colors.HexColor("#111B3A")
GRIS = colors.HexColor("#475569")


def _url_app() -> str:
    return (settings.frontend_url or "").rstrip("/")


def _enlace(url: str | None) -> str:
    return f"{_url_app()}{url}" if url else ""


def asunto(informe: Informe) -> str:
    return (
        f"{settings.app_name} · tu semana en {informe.empresa_nombre} "
        f"({informe.total_filas} novedades)"
    )


def nombre_pdf(informe: Informe) -> str:
    return f"informe-{informe.semana:%Y-%m-%d}.pdf"


# ── Texto plano ──────────────────────────────────────────────────────────────


def render_texto(informe: Informe) -> str:
    """El cuerpo `text/plain`. No es un adorno: es lo que ve quien no carga HTML,
    y lo que indexa cualquier cliente que lo trate como texto."""
    lineas = [
        f"Tu semana en {informe.empresa_nombre}",
        f"Semana del {informe.semana:%d-%m-%Y}",
        "",
    ]
    for seccion in informe.secciones:
        lineas.append(seccion.titulo.upper())
        if not seccion.filas:
            lineas.append(f"  {seccion.vacio}")
        for fila in seccion.filas:
            lineas.append(f"  - {fila.titulo}")
            lineas.append(f"    {fila.detalle}")
            if fila.url:
                lineas.append(f"    {_enlace(fila.url)}")
        lineas.append("")

    lineas.append(
        "Recibes este correo porque tienes el informe semanal activo. "
        f"Para desactivarlo: {_url_app()}/dashboard/settings"
    )
    return "\n".join(lineas)


# ── HTML ─────────────────────────────────────────────────────────────────────


def _fila_html(titulo: str, detalle: str, url: str | None) -> str:
    enlace = (
        f'<div style="margin-top:4px;font-size:13px;">'
        f'<a href="{html.escape(_enlace(url), quote=True)}" '
        f'style="color:#0F766E;text-decoration:none;">Ver &rarr;</a></div>'
        if url
        else ""
    )
    return (
        f'<li style="margin-bottom:14px;">'
        f'<div style="font-weight:600;color:#111B3A;">{html.escape(titulo)}</div>'
        f'<div style="color:#475569;font-size:14px;margin-top:2px;">{html.escape(detalle)}</div>'
        f"{enlace}</li>"
    )


def _seccion_html(seccion: Seccion) -> str:
    if seccion.filas:
        cuerpo = "".join(_fila_html(f.titulo, f.detalle, f.url) for f in seccion.filas)
        cuerpo = f'<ul style="list-style:none;padding:0;margin:8px 0 0;">{cuerpo}</ul>'
    else:
        # La sección vacía se pinta igual: omitirla dejaría al lector sin saber
        # si es que no hay nada o es que no se miró.
        cuerpo = (
            f'<p style="color:#94a3b8;font-size:14px;margin:6px 0 0;">'
            f"{html.escape(seccion.vacio)}</p>"
        )
    return (
        f'<section style="margin-bottom:22px;">'
        f'<h3 style="color:#111B3A;font-size:15px;margin:0;'
        f'border-bottom:1px solid #e2e8f0;padding-bottom:6px;">'
        f"{html.escape(seccion.titulo)}</h3>{cuerpo}</section>"
    )


def render_html(informe: Informe) -> str:
    secciones = "".join(_seccion_html(s) for s in informe.secciones)
    return f"""<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
max-width:600px;margin:0 auto;padding:24px;color:#111B3A;">
  <h2 style="margin:0 0 4px;">Tu semana en {html.escape(informe.empresa_nombre)}</h2>
  <p style="color:#475569;font-size:13px;margin:0 0 20px;">
    Semana del {informe.semana:%d-%m-%Y} · el detalle completo va en el PDF adjunto.
  </p>
  {secciones}
  <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
    Recibes este correo porque tienes el informe semanal activo.
    <a href="{html.escape(_url_app(), quote=True)}/dashboard/settings"
       style="color:#94a3b8;">Desactivarlo</a>.
  </p>
</div>"""


# ── PDF ──────────────────────────────────────────────────────────────────────


def _estilos() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle(
            "titulo", parent=base["Title"], textColor=NAVY, fontSize=18, alignment=TA_LEFT
        ),
        "seccion": ParagraphStyle(
            "seccion", parent=base["Heading2"], textColor=NAVY, fontSize=12, spaceBefore=14
        ),
        "fila": ParagraphStyle("fila", parent=base["BodyText"], fontSize=10, leading=14),
        "detalle": ParagraphStyle(
            "detalle", parent=base["BodyText"], fontSize=9, leading=12, textColor=GRIS
        ),
    }


def render_pdf(informe: Informe) -> bytes:
    """El informe como PDF, para adjuntar.

    Existe porque un correo no se reenvía a un directorio ni se archiva con la
    postulación; un PDF sí. Se genera con reportlab, que es Python puro: las
    alternativas basadas en navegador necesitan cairo y pango del sistema, y la
    imagen ya se mide contra 512 MB.
    """
    buffer = BytesIO()
    documento = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"{settings.app_name} — informe semanal",
        author=settings.app_name,
    )
    estilos = _estilos()

    elementos = [
        Paragraph(html.escape(f"Tu semana en {informe.empresa_nombre}"), estilos["titulo"]),
        Paragraph(f"Semana del {informe.semana:%d-%m-%Y}", estilos["detalle"]),
    ]

    for seccion in informe.secciones:
        elementos.append(Paragraph(html.escape(seccion.titulo), estilos["seccion"]))
        if not seccion.filas:
            elementos.append(Paragraph(html.escape(seccion.vacio), estilos["detalle"]))
            continue
        for fila in seccion.filas:
            # `Paragraph` interpreta un subconjunto de HTML, así que el texto de
            # fuera se escapa igual que en el correo.
            elementos.append(Paragraph(f"<b>{html.escape(fila.titulo)}</b>", estilos["fila"]))
            elementos.append(Paragraph(html.escape(fila.detalle), estilos["detalle"]))
            elementos.append(Spacer(1, 4))

    documento.build(elementos)
    return buffer.getvalue()
