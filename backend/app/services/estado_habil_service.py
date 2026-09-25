"""Estado hábil de un proveedor en ChileCompra.

Qué pasó con la fuente
----------------------
Este módulo descargaba un CSV masivo de proveedores hábiles desde el portal de
datos abiertos. **Ese CSV no existe**, y `ESTADO_HABIL_CSV_URL` no tenía valor
por defecto, así que el job devolvía `{"skipped": True}` en cada corrida desde el
primer día. Un skip no es un error: no llega a Sentry, no rompe ningún test, y
deja el panel diciendo `desconocido` indefinidamente.

La segunda fuente que se dio por validada —el endpoint por RUT de
`datos-abiertos.chilecompra.cl`— **tampoco es una API**: devuelve el HTML de un
SPA y responde 200 igual para un RUT real que para uno inventado, así que no
distingue nada.

La fuente real es `BuscarProveedor` de la API clásica de Mercado Público, que
exige `MERCADO_PUBLICO_TICKET`. Mientras esa variable esté vacía, `consultar_rut`
**levanta `FuenteNoConfigurada`**: no adivina, no devuelve `no_encontrado`, y no
se salta en silencio. Preferir un fallo ruidoso a un `desconocido` mudo es la
lección entera de este módulo.

**Contrastado contra la API real (2026-09-24), y no dice lo que se suponía.**
`BuscarProveedor` no devuelve ningún estado de habilidad. Responde:

- inscrito:     200 `{"Cantidad": 1, "listaEmpresas": [{"CodigoEmpresa", "NombreEmpresa"}]}`
- no inscrito:  500 `{"Codigo": 10200, "Mensaje": "No hay resultados de empresas."}`

y sólo encuentra el RUT **con puntos** (`76.286.670-6`); sin ellos responde
«no hay resultados» también para un proveedor real. El parseo anterior buscaba
`Listado[0].Estado` —la forma de otros endpoints— y quitaba los puntos, así que
toda consulta terminaba en error y toda empresa se quedaba en `desconocido`.

Lo que sí se puede afirmar es la **inscripción** (`inscrito` / `no_encontrado`).
Si está hábil lo ve sólo el proveedor, en la sección «Habilidad» de su ficha:
este módulo no lo inventa. `habil` e `inhabil` quedan en el esquema por si algún
día aparece una fuente que los dé.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models.alert import Alert, AlertStatus, AlertType
from app.models.empresa import Empresa, EstadoHabilLog
from app.services import notificaciones

logger = logging.getLogger(__name__)

API_MP = "https://api.mercadopublico.cl/servicios/v1/Publico/Empresas/BuscarProveedor"
TIMEOUT = 20

# El valor que trae MERCADO_PUBLICO_TICKET en `.env.example`. Si el ticket vivo
# es EXACTAMENTE esto, es que alguien copió el marcador de posición y nunca lo
# reemplazó — no es un ticket real, y hay que tratarlo igual que "vacío".
# `tests/test_estado_habil_sin_fuente.py` compara este valor contra el
# contenido real de `.env.example`, para que un cambio ahí no deje este
# chequeo ciego en silencio (el mismo bug que esta tarea cerró, pero para el
# ticket en vez del CSV).
TICKET_PLACEHOLDER = "your-ticket-here"

# Possible estado values stored in our DB
ESTADO_HABIL = "habil"
ESTADO_INHABIL = "inhabil"
ESTADO_INSCRITO = "inscrito"
ESTADO_NO_ENCONTRADO = "no_encontrado"
ESTADO_DESCONOCIDO = "desconocido"

# Los estados que impiden ofertar. Sólo se avisa al entrar o salir de ellos:
# pasar de `desconocido` a `inscrito` es la primera consulta, no una noticia.
PROBLEMAS = {ESTADO_INHABIL, ESTADO_NO_ENCONTRADO}


class FuenteNoConfigurada(Exception):
    """No hay de dónde leer el estado hábil. Distinto de «la fuente falló»."""


class ErrorDeConsulta(Exception):
    """La fuente existe y no respondió. **No** es lo mismo que 'inhábil'."""


def _verificar_fuente_configurada() -> None:
    """Lanza `FuenteNoConfigurada` si falta el ticket.

    La llaman tanto `consultar_rut` (para no intentar la llamada HTTP) como
    `run_estado_habil_check` (para que el job de las 6h falle aunque no haya
    ninguna empresa activa que recorrer: con la base vacía, un chequeo escondido
    dentro del loop no se ejecutaría nunca, y eso es exactamente el tipo de
    fallo silencioso que este módulo existe para evitar).
    """
    ticket = settings.mercado_publico_ticket
    if not ticket:
        raise FuenteNoConfigurada(
            "Falta MERCADO_PUBLICO_TICKET: sin él no hay forma de consultar el "
            "estado hábil. Se solicita en mercadopublico.cl → Portal de APIs."
        )
    if ticket == TICKET_PLACEHOLDER:
        raise FuenteNoConfigurada(
            f"MERCADO_PUBLICO_TICKET tiene el valor de ejemplo de .env.example "
            f"('{TICKET_PLACEHOLDER}'), no un ticket real — nadie lo reemplazó "
            "todavía. Se solicita en mercadopublico.cl → Portal de APIs."
        )


_TICKET_EN_URL = re.compile(r"(ticket=)[^&\s]+", re.IGNORECASE)


def _sin_ticket(texto: object) -> str:
    return _TICKET_EN_URL.sub(r"\1***", str(texto))


def _formatear_rut(rut: str) -> str:
    """El RUT como lo pide `BuscarProveedor`: con puntos y guión ('76.286.670-6').

    Sin puntos la API responde «no hay resultados» incluso para un proveedor
    inscrito — comprobado en vivo. Por eso NO se reutiliza la normalización
    sin puntos de `services/bi/competencia`, que sirve para otra cosa.
    """
    limpio = rut.upper().replace(".", "").replace("-", "").replace(" ", "")
    if len(limpio) < 2:
        return rut
    cuerpo, dv = limpio[:-1], limpio[-1]
    grupos = []
    while cuerpo:
        grupos.insert(0, cuerpo[-3:])
        cuerpo = cuerpo[:-3]
    return f"{'.'.join(grupos)}-{dv}"


# Lo que responde `BuscarProveedor` cuando el RUT no figura en el registro.
CODIGO_SIN_RESULTADOS = 10200


def _estado_de_respuesta(data: dict) -> str:
    """Interpreta la respuesta de BuscarProveedor (forma verificada, ver arriba).

    Sólo distingue inscrito de no inscrito: la API no dice nada más. Cualquier
    otra forma levanta `ErrorDeConsulta` en vez de adivinar — un `no_encontrado`
    inventado mandaría a toda la empresa un aviso de «no puedes ofertar».
    """
    if not isinstance(data, dict):
        raise ErrorDeConsulta(f"Respuesta de {API_MP} no reconocible: {data!r}")

    if data.get("Codigo") == CODIGO_SIN_RESULTADOS:
        return ESTADO_NO_ENCONTRADO

    empresas = data.get("listaEmpresas")
    if isinstance(empresas, list) and empresas:
        return ESTADO_INSCRITO

    raise ErrorDeConsulta(f"Respuesta de {API_MP} no reconocible: {data!r}")


def consultar_rut(rut: str) -> str:
    """Estado hábil de un RUT según el Registro de Proveedores.

    Lanza `FuenteNoConfigurada` si falta el ticket y `ErrorDeConsulta` si la API
    no responde o responde algo que no reconocemos. Devolver 'inhabil' ante un
    fallo mandaría una alerta falsa a todo el equipo de la empresa.
    """
    _verificar_fuente_configurada()

    try:
        respuesta = requests.get(
            API_MP,
            params={
                "rutempresaproveedor": _formatear_rut(rut),
                "ticket": settings.mercado_publico_ticket,
            },
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        # El mensaje de `requests` trae la URL, y la URL trae el ticket.
        raise ErrorDeConsulta(f"No se pudo consultar {API_MP}: {_sin_ticket(exc)}") from exc

    if respuesta.status_code == 203:
        # Forma documentada en que esta API avisa un ticket inválido —
        # comprobado en vivo, ver docs/deploy_steps/tareas_manuales.md §1. No
        # es un 4xx, así que sin este chequeo pasaría el filtro de abajo y
        # terminaría en el parseo como si fuera una respuesta cualquiera.
        raise ErrorDeConsulta(
            f"{API_MP} respondió 203 Ticket no válido: revisa MERCADO_PUBLICO_TICKET "
            "(puede ser el placeholder de .env.example, o un ticket vencido/incorrecto)."
        )

    # «No inscrito» llega como 500 con un código propio, así que el cuerpo se
    # lee antes de mirar el estado HTTP: filtrar primero lo convertía en error.
    try:
        payload = respuesta.json()
    except ValueError as exc:
        raise ErrorDeConsulta(
            f"{API_MP} respondió {respuesta.status_code} sin JSON: {exc}"
        ) from exc

    if respuesta.status_code >= 400 and payload.get("Codigo") != CODIGO_SIN_RESULTADOS:
        raise ErrorDeConsulta(f"{API_MP} respondió {respuesta.status_code}: {payload!r}")

    return _estado_de_respuesta(payload)


def _titulo_para(empresa: Empresa) -> str:
    if empresa.estado_habil == ESTADO_INHABIL:
        return f"{empresa.nombre_empresa} quedó inhábil"
    if empresa.estado_habil == ESTADO_HABIL:
        return f"{empresa.nombre_empresa} volvió a estar hábil"
    if empresa.estado_habil == ESTADO_INSCRITO:
        return f"{empresa.nombre_empresa} vuelve a figurar en el Registro de Proveedores"
    return f"No encontramos a {empresa.nombre_empresa} en el Registro de Proveedores"


def _mensaje_para(empresa: Empresa) -> str:
    """El aviso, en las palabras de quien lo recibe.

    **Este mensaje decía**: «El estado hábil de X (RUT) cambió a 'inhabil'.» —
    el valor crudo de la columna, entre comillas, en el aviso más urgente que
    manda el producto (`Urgencia.INMEDIATA`). Además de leerse a máquina, no
    decía lo único que importa: que así no puedes ofertar.

    **Y no decimos por qué, porque no lo sabemos.** El CSV de proveedores
    hábiles de ChileCompra trae el RUT y el estado, nada más: ni la causa ni la
    fecha. Las causas posibles son varias —la tarifa anual del registro sin
    pagar, datos sin actualizar, deuda tributaria sobre 500 UTM o previsional
    de más de 12 meses, sanciones—, y sólo el proveedor las ve, en la sección
    «Habilidad» de su propia ficha. Nombrar una al azar manda a la persona a
    buscar donde probablemente no está el problema: se gasta el aviso y la
    próxima vez no lo lee. Se dice qué pasó, qué implica y dónde está la razón.
    """
    if empresa.estado_habil == ESTADO_INHABIL:
        return (
            f"{empresa.nombre_empresa} ({empresa.rut_empresa}) aparece inhábil en el "
            "Registro de Proveedores. Mientras siga así no puedes ofertar, aunque "
            "alcances a preparar la oferta. El motivo exacto sale en la sección "
            "«Habilidad» de tu ficha en Mercado Público — puede ser la tarifa anual "
            "del registro, datos por actualizar o una deuda tributaria o previsional."
        )
    if empresa.estado_habil == ESTADO_HABIL:
        return (
            f"{empresa.nombre_empresa} ({empresa.rut_empresa}) vuelve a estar hábil. "
            "Ya puedes ofertar."
        )
    if empresa.estado_habil == ESTADO_INSCRITO:
        return (
            f"{empresa.nombre_empresa} ({empresa.rut_empresa}) vuelve a aparecer en el "
            "Registro de Proveedores de Mercado Público."
        )
    return (
        f"{empresa.nombre_empresa} ({empresa.rut_empresa}) no figura en el Registro de "
        "Proveedores de Mercado Público. Puede ser que el RUT esté mal escrito o que la "
        "empresa aún no esté inscrita; sin esa inscripción no se puede ofertar."
    )


def _create_estado_habil_alert(empresa: Empresa, db: Session) -> list[Alert]:
    """Crea la alerta de cambio de estado hábil para cada miembro de la empresa.

    **La clave de idempotencia lleva el usuario dentro, y no lo llevaba.** Sin
    él, la clave era la misma para toda la empresa: el `autoflush` del segundo
    `query` encontraba la alerta del primer miembro y saltaba, así que en una
    empresa de cinco personas se enteraba una. Quedar inhábil es justo el aviso
    que no puede depender de quién esté mirando.
    """
    from app.models.empresa import EmpresaUsuario

    creadas: list[Alert] = []
    memberships = db.query(EmpresaUsuario).filter(EmpresaUsuario.empresa_id == empresa.id).all()
    for m in memberships:
        idempotency_key = (
            f"estado_habil_{empresa.id}_{empresa.estado_habil}_"
            f"{datetime.now(UTC).strftime('%Y%m%d')}_{m.user_id}"
        )
        # Skip if already sent today
        existing = db.query(Alert).filter(Alert.idempotency_key == idempotency_key).first()
        if existing:
            continue

        alert = Alert(
            user_id=m.user_id,
            alert_type=AlertType.ESTADO_HABIL_CAMBIO,
            status=AlertStatus.PENDING,
            entity_type="empresa",
            entity_id=0,
            title=_titulo_para(empresa),
            message=_mensaje_para(empresa),
            idempotency_key=idempotency_key,
            empresa_id=empresa.id,
            notification_channels=["in_app"],
        )
        db.add(alert)
        creadas.append(alert)
    return creadas


def run_estado_habil_check(db: Session) -> dict:
    """
    Main entry point for the periodic estado hábil check (every 6h).

    Se detiene con `FuenteNoConfigurada` ANTES de tocar la base si falta el
    ticket — incluso si no hay ninguna empresa activa que revisar. Un catálogo
    vacío no puede disfrazar una fuente que falta: es exactamente el fallo
    silencioso que este módulo existe para evitar.

    Returns a summary dict with counts.
    """
    _verificar_fuente_configurada()

    empresas = db.query(Empresa).filter(Empresa.activo.is_(True)).all()

    checked = 0
    changed = 0
    nuevas: list[Alert] = []
    fallidas = 0
    for empresa in empresas:
        # Una consulta fallida es de ESA empresa: antes abortaba la corrida
        # entera y las demás se quedaban sin revisar hasta la siguiente.
        try:
            new_state = consultar_rut(empresa.rut_empresa)
        except ErrorDeConsulta as exc:
            fallidas += 1
            logger.warning("Estado hábil: no se pudo consultar %s — %s", empresa.rut_empresa, exc)
            continue
        checked += 1

        if new_state == empresa.estado_habil:
            continue  # no change

        changed += 1
        old_state = empresa.estado_habil
        logger.info(
            "Estado hábil change: %s %s → %s",
            empresa.rut_empresa,
            old_state,
            new_state,
        )

        # Persist log entry
        log_entry = EstadoHabilLog(
            empresa_id=empresa.id,
            rut_empresa=empresa.rut_empresa,
            estado_anterior=old_state,
            estado_nuevo=new_state,
            fuente="mercado_publico_buscarproveedor",
        )
        db.add(log_entry)

        # Update empresa
        empresa.estado_habil = new_state
        empresa.estado_habil_updated_at = datetime.now(UTC)

        # Sólo es noticia entrar en un problema o salir de él.
        if new_state in PROBLEMAS or old_state in PROBLEMAS:
            nuevas.extend(_create_estado_habil_alert(empresa, db))

    db.commit()
    # Quedar inhábil deja a la empresa fuera de todo lo que postule. Es de lo
    # poco que justifica un correo inmediato: enterarse al entrar a la
    # aplicación es enterarse cuando ya rechazaron la oferta.
    enviado = notificaciones.despachar_pendientes(db, [a.id for a in nuevas])
    logger.info(
        "Estado hábil check complete: checked=%d changed=%d fallidas=%d notificadas=%d",
        checked,
        changed,
        fallidas,
        enviado.get("inmediatas", 0),
    )
    return {"checked": checked, "changed": changed, "fallidas": fallidas, **enviado}


def check_empresa_now(empresa_id, db: Session) -> dict:
    """
    On-demand estado hábil check for a single empresa (used during onboarding).

    A diferencia del job periódico, aquí sí conviene degradar con gracia: es una
    empresa consultando su propio estado por un botón, con un humano mirando la
    respuesta — no una corrida de fondo que nadie lee. Si falta el ticket o la
    consulta falla, se informa el motivo y se conserva el valor que ya había.
    """
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        return {"estado_habil": ESTADO_DESCONOCIDO, "error": "empresa_not_found"}

    try:
        new_state = consultar_rut(empresa.rut_empresa)
    except FuenteNoConfigurada as exc:
        return {
            "estado_habil": empresa.estado_habil,
            "checked": False,
            "motivo": str(exc),
        }
    except ErrorDeConsulta as exc:
        logger.warning("check_empresa_now: consulta fallida para %s — %s", empresa_id, exc)
        return {
            "estado_habil": empresa.estado_habil,
            "checked": False,
            "motivo": "No se pudo consultar el Registro de Proveedores de Mercado Público",
        }

    old_state = empresa.estado_habil

    empresa.estado_habil = new_state
    empresa.estado_habil_updated_at = datetime.now(UTC)

    if new_state != old_state:
        log_entry = EstadoHabilLog(
            empresa_id=empresa.id,
            rut_empresa=empresa.rut_empresa,
            estado_anterior=old_state,
            estado_nuevo=new_state,
            fuente="onboarding",
        )
        db.add(log_entry)

    db.commit()
    return {
        "estado_habil": new_state,
        "rut_empresa": empresa.rut_empresa,
        "checked": True,
    }


# `get_estado_habil_history` vivía aquí y se movió a
# `repositories/empresas.historial_estado_habil`. Era la única función de este
# módulo que la llamaba un router async, y hacía `db.query(...)` —API síncrona—
# sobre una `AsyncSession`: 500 en todas las llamadas. El resto de este archivo
# es síncrono a propósito, porque lo ejecutan las tareas de Celery.
