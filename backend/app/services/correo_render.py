"""Cómo se ven los correos de alerta: asunto, texto plano y HTML.

Separado del despacho por el mismo motivo que `informe_render` lo está de
`informe_semanal`: **qué se manda** y **cómo se pinta** cambian por razones
distintas, y mezclarlos convierte cualquier retoque de maquetación en un riesgo
para la lógica de envío.

Lo que estaba mal antes y aquí se corrige:

- **El correo estaba en inglés.** Decía «New Alert» y «Hello» sobre un verde
  Material `#4CAF50`, en un producto que sólo habla español y que tiene un
  sistema de diseño propio.
- **El texto de fuera no se escapaba.** Los nombres vienen de ChileCompra: un
  `&` rompía la maqueta, y de ahí a inyectar etiquetas hay muy poco.
- **El cuerpo de texto plano era el HTML.** Quien lo leyera sin HTML recibía el
  marcado en crudo.

Y lo que se añade, que es la razón de existir del módulo: **el aviso lleva el BI
dentro**. Donde la competencia manda «esta licitación calza con tu perfil»,
aquí va además cuánto paga ese comprador por eso, cuántos compiten y qué tan
predecible es el precio. Es el mismo canal y la misma frecuencia; lo que cambia
es que la respuesta sólo la puede escribir quien tiene el histórico.
"""

from __future__ import annotations

import html
from collections.abc import Sequence
from typing import Any

from app.config import settings
from app.models.alert import Alert, AlertType

#: Tokens de la paleta, duplicados a propósito: un correo no puede leer el CSS
#: de la aplicación, y los clientes de correo ignoran casi todo lo que no sea
#: estilo en línea. Copiarlos se nota menos que inventarlos.
NAVY = "#111B3A"
GRIS = "#475569"
SUAVE = "#94a3b8"
TEAL = "#0F766E"
BORDE = "#e2e8f0"

#: Cuántas novedades entran en un correo antes de resumir. Un correo de quince
#: tarjetas no se lee: se archiva.
MAX_EN_TANDA = 5


def _url_app() -> str:
    return (settings.frontend_url or "").rstrip("/")


def _enlace(ruta: str | None) -> str:
    return f"{_url_app()}{ruta}" if ruta else _url_app()


def _e(texto: Any) -> str:
    return html.escape(str(texto or ""))


def _plata(monto: float | int | None) -> str:
    """Formato chileno: punto de miles, sin decimales.

    Los decimales en un peso chileno son ruido — no existe una moneda menor —
    y en una columna de cifras estorban para comparar.
    """
    if monto is None:
        return ""
    return f"${monto:,.0f}".replace(",", ".")


# ── Las líneas de BI ─────────────────────────────────────────────────────────


def lineas_de_bi(contexto: dict | None) -> list[str]:
    """Traduce el panel de BI a frases sueltas, listas para pintar.

    **Una línea sin dato se omite, no se rellena.** El BI ya trae su nivel de
    confianza y su tamaño de muestra: si no llega al umbral, la frase no va. Un
    «sin datos» en un correo enseña a no leerlo.
    """
    if not contexto:
        return []

    lineas: list[str] = []

    precio = (contexto.get("precios") or [None])[0]
    if precio and precio.get("p25") and precio.get("p75"):
        rango = f"{_plata(precio['p25'])}–{_plata(precio['p75'])}"
        pred = precio.get("predictibilidad")
        if pred == "baja":
            # La dispersión ES el hallazgo. Un comprador que paga cualquier cosa
            # por lo mismo está diciendo que el precio no es lo que decide, y
            # eso vale más que un número inventado con aspecto de respuesta.
            lineas.append(
                f"Ha pagado entre {rango} por esto — muy disperso, "
                f"aquí el precio no parece ser lo que decide"
            )
        else:
            lineas.append(f"Este comprador paga entre {rango} por esto")

    comp = contexto.get("competidores") or {}
    top5 = comp.get("top5") or []
    if comp.get("disponible") and top5:
        lineas.append(f"{len(top5)} proveedores habituales en este comprador")

    comprador = contexto.get("comprador") or {}
    dias = comprador.get("mediana_dias_pago")
    if dias:
        lineas.append(f"Paga a {int(dias)} días en promedio")

    ventana = contexto.get("ventana") or {}
    if ventana.get("alerta_ventana_corta"):
        lineas.append("Plazo de preparación más corto de lo habitual para este tipo")

    return lineas


# ── Alerta suelta ────────────────────────────────────────────────────────────

#: El asunto por tipo. Escritos como los diría una persona: sin «Notificación
#: de» delante y sin el nombre del producto repetido dentro.
_ASUNTOS: dict[AlertType, str] = {
    AlertType.PLAZO_24H: "Cierra mañana: {titulo}",
    AlertType.PLAZO_48H: "Cierra en 2 días: {titulo}",
    AlertType.ESTADO_HABIL_CAMBIO: "Cambió tu estado hábil en Mercado Público",
    AlertType.DOCUMENTO_VENCIDO: "Se te vence un documento: {titulo}",
    AlertType.CAMBIO_PRECIO: "Cambió el precio de {titulo}",
    AlertType.RESULTADO_LICITACION: "{titulo}",
}


def asunto_de(alerta: Alert) -> str:
    plantilla = _ASUNTOS.get(alerta.alert_type, "{titulo}")
    titulo = (alerta.title or "").strip()
    if len(titulo) > 70:
        titulo = titulo[:67].rstrip() + "…"
    return plantilla.format(titulo=titulo)


def alerta_individual(alerta: Alert, contexto: dict | None = None) -> tuple[str, str, str]:
    """Devuelve (asunto, texto plano, HTML) de una alerta urgente."""
    bi = lineas_de_bi(contexto)
    url = _url_de(alerta)

    texto = [alerta.title or "", ""]
    if alerta.message:
        texto += [alerta.message, ""]
    if bi:
        texto += bi + [""]
    texto += [_enlace(url), "", _pie_texto()]

    cuerpo_bi = ""
    if bi:
        items = "".join(
            f'<li style="margin-bottom:6px;color:{GRIS};font-size:14px;">{_e(x)}</li>' for x in bi
        )
        cuerpo_bi = (
            f'<ul style="list-style:none;padding:12px 14px;margin:16px 0 0;'
            f'background:#f8fafc;border-radius:8px;border:1px solid {BORDE};">{items}</ul>'
        )

    mensaje = (
        f'<p style="color:{GRIS};font-size:15px;margin:0 0 4px;">{_e(alerta.message)}</p>'
        if alerta.message
        else ""
    )

    html_ = f"""{_cabecera()}
  <h2 style="margin:0 0 12px;font-size:19px;color:{NAVY};">{_e(alerta.title)}</h2>
  {mensaje}
  {cuerpo_bi}
  <p style="margin:22px 0 0;">
    <a href="{_e(_enlace(url))}"
       style="display:inline-block;background:{TEAL};color:#ffffff;text-decoration:none;
              padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">
      Verlo en {_e(settings.app_name)}
    </a>
  </p>
{_pie_html()}"""

    return asunto_de(alerta), "\n".join(texto), html_


# ── Tanda ────────────────────────────────────────────────────────────────────


def asunto_tanda(alertas: Sequence[Alert]) -> str:
    n = len(alertas)
    if n == 1:
        return asunto_de(alertas[0])
    return f"{settings.app_name} · {n} oportunidades que calzan contigo"


def tanda(
    alertas: Sequence[Alert],
    usuario,
    contextos: dict[int, dict] | None = None,
) -> tuple[str, str, str]:
    """Un correo con varias novedades. `contextos` mapea id de alerta → panel de BI."""
    contextos = contextos or {}
    visibles = list(alertas[:MAX_EN_TANDA])
    resto = len(alertas) - len(visibles)

    # ── Texto plano ──────────────────────────────────────────────────────────
    texto = [f"Novedades en {settings.app_name}", ""]
    for a in visibles:
        texto.append(f"- {a.title}")
        if a.message:
            texto.append(f"  {a.message}")
        for linea in lineas_de_bi(contextos.get(a.id)):
            texto.append(f"  · {linea}")
        texto.append(f"  {_enlace(_url_de(a))}")
        texto.append("")
    if resto > 0:
        texto.append(f"Y {resto} más en {_enlace('/dashboard/tenders')}")
        texto.append("")
    texto.append(_pie_texto())

    # ── HTML ─────────────────────────────────────────────────────────────────
    tarjetas = "".join(_tarjeta(a, contextos.get(a.id)) for a in visibles)
    mas = (
        f'<p style="margin:18px 0 0;font-size:14px;">'
        f'<a href="{_e(_enlace("/dashboard/tenders"))}" style="color:{TEAL};">'
        f"Ver las otras {resto} &rarr;</a></p>"
        if resto > 0
        else ""
    )
    saludo = _e((getattr(usuario, "full_name", "") or "").split(" ")[0])
    hola = f"Hola {saludo}," if saludo else "Hola,"

    html_ = f"""{_cabecera()}
  <p style="color:{GRIS};font-size:15px;margin:0 0 18px;">
    {hola} esto apareció hoy en Mercado Público y calza con lo que vendes.
  </p>
  {tarjetas}
  {mas}
{_pie_html()}"""

    return asunto_tanda(alertas), "\n".join(texto), html_


def _tarjeta(alerta: Alert, contexto: dict | None) -> str:
    bi = lineas_de_bi(contexto)
    filas = "".join(
        f'<div style="color:{GRIS};font-size:13px;margin-top:3px;">· {_e(x)}</div>' for x in bi
    )
    meta = (alerta.alert_metadata or {}) if isinstance(alerta.alert_metadata, dict) else {}
    encaje = ""
    if meta.get("score_encaje") is not None:
        pct = round(float(meta["score_encaje"]) * 100)
        encaje = (
            f'<span style="background:#ecfdf5;color:{TEAL};font-size:12px;font-weight:600;'
            f'padding:2px 8px;border-radius:999px;margin-left:8px;">encaje {pct}%</span>'
        )

    return f"""<div style="border:1px solid {BORDE};border-radius:10px;padding:14px 16px;margin-bottom:12px;">
  <div style="font-weight:600;color:{NAVY};font-size:15px;line-height:1.35;">
    {_e(alerta.title)}{encaje}
  </div>
  {filas}
  <div style="margin-top:8px;">
    <a href="{_e(_enlace(_url_de(alerta)))}" style="color:{TEAL};text-decoration:none;
       font-size:13px;font-weight:600;">Ver la licitación &rarr;</a>
  </div>
</div>"""


# ── Piezas comunes ───────────────────────────────────────────────────────────


def _url_de(alerta: Alert) -> str:
    meta = (alerta.alert_metadata or {}) if isinstance(alerta.alert_metadata, dict) else {}
    codigo = meta.get("codigo_externo")
    if codigo and alerta.entity_type == "licitacion":
        return f"/dashboard/tenders/{codigo}"
    if alerta.alert_type == AlertType.DOCUMENTO_VENCIDO:
        return "/dashboard/documentos"
    if alerta.alert_type == AlertType.ESTADO_HABIL_CAMBIO:
        return "/dashboard/empresa"
    return "/dashboard"


def _cabecera() -> str:
    return f"""<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
max-width:600px;margin:0 auto;padding:24px;color:{NAVY};">
  <div style="font-weight:700;letter-spacing:.14em;font-size:13px;color:{NAVY};
              margin-bottom:20px;text-transform:uppercase;">{_e(settings.app_name)}</div>"""


def _pie_texto() -> str:
    return (
        "Recibes este correo porque tienes las alertas activas. "
        f"Para ajustarlas: {_enlace('/dashboard/settings')}"
    )


def _pie_html() -> str:
    return f"""  <p style="color:{SUAVE};font-size:12px;margin-top:26px;border-top:1px solid {BORDE};
            padding-top:14px;line-height:1.5;">
    Recibes este correo porque tienes las alertas activas en {_e(settings.app_name)}.
    <a href="{_e(_enlace("/dashboard/settings"))}" style="color:{SUAVE};">Ajustar qué te llega</a>.
  </p>
</div>"""
