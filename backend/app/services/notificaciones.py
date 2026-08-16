"""El despacho de alertas: qué sale por dónde, y con qué reintento.

**El problema que resuelve.** `AlertEngine.create_alert_idempotent` insertaba la
alerta con `notification_channels=["in_app"]` y no llamaba a nadie. Todo lo
construido después del camino viejo por preferencias —el encaje semántico, el
recordatorio de plazo a 48 h y 24 h, el vencimiento de documentos, el cambio de
estado hábil y la variación de precio— se quedaba dentro de la aplicación. Es
decir: el producto calculaba el aviso y no lo mandaba.

Tres decisiones que este módulo fija:

- **El canal lo declara el TIPO de alerta, no quien la crea.** Antes cada sitio
  pasaba su lista a mano y todos pasaban la misma. `POLITICA` es la única tabla
  donde eso se decide, y `tests/test_notificaciones.py` falla si aparece un tipo
  de alerta sin política — el mismo trinquete que usa el calendario de Celery.
- **Urgente se manda al momento; el resto va en tanda.** Un correo por
  licitación se convierte en una regla de filtro en Gmail, y a partir de ahí el
  producto deja de existir. Lo urgente es lo que caduca: un plazo a 24 h, un
  documento vencido, quedar inhábil.
- **Fallar al notificar no revienta la tarea que la creó.** La alerta ya está en
  la base; que el SMTP esté caído no puede tumbar la corrida del ETL.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime

import httpx
from sqlalchemy.orm import Session

from app.core.email import send_email
from app.models.alert import Alert, AlertType, NotificationChannel
from app.models.licitacion import Licitacion
from app.models.user import User
from app.services import correo_render
from app.services.bi.panel import get_licitacion_panel

logger = logging.getLogger(__name__)

#: Cuántas veces se reintenta un envío antes de rendirse. El fallo típico del
#: SMTP es momentáneo (límite por minuto, DNS lento); el permanente —dirección
#: inexistente— falla igual las tres veces y no cuesta nada.
INTENTOS = 3


class Urgencia:
    """Cuándo sale el correo.

    `INMEDIATA` es para lo que caduca: si llega media hora tarde ya no sirve de
    nada. `TANDA` es para lo que se acumula sin perder valor — y agrupar es lo
    que evita que el usuario se dé de baja.
    """

    INMEDIATA = "inmediata"
    TANDA = "tanda"
    SIN_CORREO = "sin_correo"


#: Qué le toca a cada tipo de alerta.
#:
#: Un tipo nuevo tiene que aparecer aquí o el test falla. Sin esa obligación, el
#: valor por defecto sería «sólo dentro de la aplicación», que es exactamente el
#: fallo que este módulo viene a arreglar y que nadie vio durante meses.
POLITICA: dict[AlertType, str] = {
    # Lo que caduca.
    AlertType.PLAZO_24H: Urgencia.INMEDIATA,
    AlertType.PLAZO_48H: Urgencia.INMEDIATA,
    AlertType.ESTADO_HABIL_CAMBIO: Urgencia.INMEDIATA,
    AlertType.DOCUMENTO_VENCIDO: Urgencia.INMEDIATA,
    # Lo que se acumula: son varias al día y ninguna urge esta hora.
    AlertType.NUEVA_LICITACION_MATCH: Urgencia.TANDA,
    AlertType.MATCHED_PREFERENCE: Urgencia.TANDA,
    AlertType.NEW_TENDER: Urgencia.TANDA,
    AlertType.CAMBIO_PRECIO: Urgencia.TANDA,
    # Ruido para un correo: son cambios de estado que se miran cuando se entra.
    AlertType.TENDER_UPDATE: Urgencia.SIN_CORREO,
    AlertType.NEW_ORDER: Urgencia.SIN_CORREO,
    AlertType.ORDER_UPDATE: Urgencia.SIN_CORREO,
}


def urgencia_de(tipo: AlertType) -> str:
    """La política del tipo. Lo no declarado no manda correo — pero el test
    impide que algo llegue a producción sin declarar."""
    return POLITICA.get(tipo, Urgencia.SIN_CORREO)


def canales_para(tipo: AlertType, usuario: User) -> list[str]:
    """Los canales por los que sale ESTA alerta para ESTE usuario.

    Cruza lo que el tipo permite con lo que la persona pidió. El orden importa
    poco; lo que importa es que `in_app` está siempre: la campana es el registro,
    no un canal opcional.
    """
    canales = [NotificationChannel.IN_APP.value]

    if urgencia_de(tipo) != Urgencia.SIN_CORREO and getattr(usuario, "notification_email", False):
        canales.append(NotificationChannel.EMAIL.value)

    if getattr(usuario, "notification_webhook", False) and getattr(usuario, "webhook_url", None):
        canales.append(NotificationChannel.WEBHOOK.value)

    return canales


# ── Envío ────────────────────────────────────────────────────────────────────


def _con_reintento(envio, destinatario: str) -> bool:
    for intento in range(1, INTENTOS + 1):
        try:
            if envio():
                return True
        except Exception:
            logger.warning(
                "fallo al notificar a %s (intento %d/%d)",
                destinatario,
                intento,
                INTENTOS,
                exc_info=True,
            )
            continue
        logger.warning("envío rechazado para %s (intento %d/%d)", destinatario, intento, INTENTOS)
    return False


def _enviar_webhook(alerta: Alert, url: str) -> bool:
    payload = {
        "alert_id": alerta.id,
        "alert_type": alerta.alert_type.value,
        "title": alerta.title,
        "message": alerta.message,
        "entity_type": alerta.entity_type,
        "entity_id": alerta.entity_id,
        "alert_metadata": alerta.alert_metadata,
        "created_at": alerta.created_at.isoformat() if alerta.created_at else None,
    }
    with httpx.Client(timeout=10.0) as cliente:
        respuesta = cliente.post(url, json=payload)
        respuesta.raise_for_status()
    return True


def despachar(alerta: Alert, db: Session, contexto: dict | None = None) -> list[str]:
    """Manda una alerta suelta. Devuelve los canales por los que salió.

    Se usa para lo urgente. Lo que va en tanda pasa por `despachar_tanda`, que
    junta varias en un correo.
    """
    usuario = db.query(User).filter(User.id == alerta.user_id).first()
    if not usuario or not usuario.is_active:
        return []

    canales = canales_para(alerta.alert_type, usuario)
    usados = [NotificationChannel.IN_APP.value]

    if NotificationChannel.EMAIL.value in canales:
        asunto, texto, html_ = correo_render.alerta_individual(alerta, contexto)
        if _con_reintento(
            lambda: send_email(to=usuario.email, subject=asunto, body=texto, html_body=html_),
            usuario.email,
        ):
            usados.append(NotificationChannel.EMAIL.value)

    if NotificationChannel.WEBHOOK.value in canales:
        url = usuario.webhook_url
        if _con_reintento(lambda: _enviar_webhook(alerta, url), url):
            usados.append(NotificationChannel.WEBHOOK.value)

    _marcar_enviada(alerta, usados, db)
    return usados


def despachar_tanda(alertas: Sequence[Alert], db: Session) -> dict[str, int]:
    """Agrupa por usuario y manda un correo por persona.

    Es lo que separa un producto de una fuente de spam: quince avisos al día en
    quince correos terminan en una regla de filtro, y a partir de ahí el usuario
    deja de enterarse de todo, incluido lo importante.
    """
    if not alertas:
        return {"usuarios": 0, "correos": 0, "alertas": 0}

    por_usuario: dict[int, list[Alert]] = {}
    for alerta in alertas:
        if urgencia_de(alerta.alert_type) != Urgencia.TANDA:
            continue
        por_usuario.setdefault(alerta.user_id, []).append(alerta)

    if not por_usuario:
        return {"usuarios": 0, "correos": 0, "alertas": 0}

    usuarios = {
        u.id: u for u in db.query(User).filter(User.id.in_(list(por_usuario))).all() if u.is_active
    }

    correos = 0
    total = 0
    for user_id, del_usuario in por_usuario.items():
        usuario = usuarios.get(user_id)
        if usuario is None:
            continue

        total += len(del_usuario)
        for alerta in del_usuario:
            _marcar_enviada(alerta, [NotificationChannel.IN_APP.value], db)

        if not getattr(usuario, "notification_email", False):
            continue

        # El BI se compone sólo de las que van a salir en el correo. Componerlo
        # para las que se quedan fuera del tope sería consultar analytics para
        # nada, y son varias consultas por licitación.
        contextos = {
            a.id: bi
            for a in del_usuario[: correo_render.MAX_EN_TANDA]
            if (bi := contexto_bi(a, db)) is not None
        }
        asunto, texto, html_ = correo_render.tanda(del_usuario, usuario, contextos)
        # Los valores se atan por argumento por defecto y no por cierre: dentro
        # de un bucle, un `lambda` que capture la variable ve el ÚLTIMO valor
        # cuando se ejecuta, así que todos los correos se mandarían al mismo
        # destinatario. Aquí no se nota porque el reintento es síncrono, pero es
        # una bomba de relojería en cuanto el envío se difiera.
        if _con_reintento(
            lambda dest=usuario.email, a=asunto, t=texto, h=html_: send_email(
                to=dest, subject=a, body=t, html_body=h
            ),
            usuario.email,
        ):
            correos += 1
            for alerta in del_usuario:
                _marcar_enviada(alerta, [NotificationChannel.IN_APP.value, "email"], db)

    db.commit()
    return {"usuarios": len(por_usuario), "correos": correos, "alertas": total}


def _marcar_enviada(alerta: Alert, canales: Iterable[str], db: Session) -> None:
    alerta.notification_channels = list(canales)
    alerta.sent_at = datetime.now(UTC)
    db.add(alerta)


# ── El BI dentro del correo ──────────────────────────────────────────────────


def contexto_bi(alerta: Alert, db: Session) -> dict | None:
    """El panel de BI de la licitación a la que se refiere la alerta.

    **Es la razón de ser de este correo.** Donde la competencia manda «esta
    licitación calza con tu perfil», aquí va además cuánto paga ese comprador
    por eso, cuántos proveedores compiten y a cuántos días paga. Mismo canal,
    misma frecuencia; la diferencia es que esa frase sólo la puede escribir
    quien tiene el histórico procesado.

    Falla en silencio a propósito: que el BI no responda no puede impedir que
    salga el aviso. Un correo sin las líneas de contexto sigue siendo útil; no
    mandarlo, no.
    """
    if alerta.entity_type != "licitacion":
        return None

    licitacion = db.query(Licitacion).filter(Licitacion.id == alerta.entity_id).first()
    if licitacion is None:
        return None

    try:
        return get_licitacion_panel(
            codigo_externo=licitacion.codigo_externo,
            # `codigo_organismo` es el código de ChileCompra, que es con el que
            # está construido el BI. `organismo_id` es la clave interna de
            # `buyer_organizations` y no coincide con nada de analytics: pasarla
            # devolvería "sin datos" en vez de un error.
            organismo_id=licitacion.codigo_organismo,
            product_codes=_codigos_de_producto(licitacion),
        )
    except Exception:
        logger.warning("no se pudo componer el BI de %s", alerta.entity_id, exc_info=True)
        return None


def _codigos_de_producto(licitacion, tope: int = 5) -> list[str]:
    """Los códigos UNSPSC de los ítems, con las tres grafías que trae la API.

    Es la misma extracción que hace el endpoint del panel. Vive duplicada aquí
    porque aquélla es `async` y esto corre en Celery; si aparece una cuarta
    grafía hay que tocar los dos sitios, y por eso están nombradas igual.
    """
    if not licitacion.items or not isinstance(licitacion.items, list):
        return []

    codigos: list[str] = []
    vistos: set[str] = set()
    for item in licitacion.items:
        if not isinstance(item, dict):
            continue
        codigo = (
            item.get("codigoProductoONU")
            or item.get("CodigoProducto")
            or item.get("codigo_producto")
        )
        if codigo and str(codigo) not in vistos:
            vistos.add(str(codigo))
            codigos.append(str(codigo))
        if len(codigos) >= tope:
            break
    return codigos


def despachar_pendientes(db: Session, ids: Sequence[int]) -> dict[str, int]:
    """Punto de entrada de las tareas: recibe los IDs recién insertados.

    Recibe IDs y no objetos a propósito. Quien inserta usa
    `INSERT … ON CONFLICT DO NOTHING` y sólo sabe **cuántas** filas entraron;
    releer por ID es lo que garantiza que no se notifique una alerta que ya
    existía — que es como se manda dos veces el mismo correo.
    """
    if not ids:
        return {"inmediatas": 0, "en_tanda": 0}

    alertas = db.query(Alert).filter(Alert.id.in_(list(ids)), Alert.sent_at.is_(None)).all()

    inmediatas = [a for a in alertas if urgencia_de(a.alert_type) == Urgencia.INMEDIATA]
    en_tanda = [a for a in alertas if urgencia_de(a.alert_type) == Urgencia.TANDA]

    for alerta in inmediatas:
        try:
            despachar(alerta, db, contexto_bi(alerta, db))
        except Exception:
            # Una alerta que no sale no puede tumbar la corrida que la creó.
            logger.exception("no se pudo despachar la alerta %s", alerta.id)
    if inmediatas:
        db.commit()

    resumen = despachar_tanda(en_tanda, db)

    return {"inmediatas": len(inmediatas), "en_tanda": resumen["alertas"]}
