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

**El parseo de la respuesta es provisional.** Está escrito contra la forma
documentada y NUNCA se ha ejecutado contra la API real, porque no hay ticket con
el que probar. Por eso `_estado_de_respuesta` lanza en vez de suponer cuando no
reconoce lo que llega: un parseo que se inventa un valor por defecto convertiría
un contrato equivocado en un dato plausible y falso. Lo primero que hay que hacer
con un ticket de verdad es correr una consulta y contrastar (ver
`docs/deploy_steps/tareas_manuales.md` §1).
"""

from __future__ import annotations

import logging
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
ESTADO_NO_ENCONTRADO = "no_encontrado"
ESTADO_DESCONOCIDO = "desconocido"


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


def _formatear_rut(rut: str) -> str:
    """Normaliza el RUT al formato que usa ChileCompra en sus APIs: sin puntos,
    con guión ('12345678-9'). Misma convención documentada en
    `services/bi/competencia._normalize_rut`, la única parte del sistema que ya
    contrastó el formato contra datos reales de ChileCompra."""
    cleaned = rut.upper().replace(".", "").replace(" ", "")
    if "-" not in cleaned and len(cleaned) > 1:
        cleaned = f"{cleaned[:-1]}-{cleaned[-1]}"
    return cleaned


def _estado_de_respuesta(data: dict) -> str:
    """Interpreta la respuesta de BuscarProveedor.

    **Provisional.** Escrita contra la forma documentada de la API clásica de
    Mercado Público —el mismo patrón que `BuscarLicitaciones`/`BuscarOrdenes`:
    un objeto con un `Listado` y un registro por resultado (ver
    `etl/extractors/mercado_publico_licitaciones.py`)— y nunca ejecutada contra
    la API real, porque no hay ticket con el que probar. Cualquier forma que no
    reconoce levanta `ErrorDeConsulta` en vez de adivinar un estado: devolver
    'inhabil' ante una forma inesperada dispararía una alerta falsa a toda la
    empresa.

    **Decisión explícita sobre `Listado` vacío**: aunque es una instancia bien
    formada de la forma documentada —y otros endpoints de Mercado Público sí
    usan "lista vacía" para "sin resultados"— acá se trata igual que una forma
    no reconocida, y levanta `ErrorDeConsulta` en vez de `ESTADO_NO_ENCONTRADO`.
    No es un olvido: es la misma asimetría de costos que el resto del módulo.
    `_create_estado_habil_alert` dispara ante CUALQUIER cambio de estado, así
    que adivinar mal acá manda "ya no encontramos tu empresa en el registro" a
    toda la empresa por error; equivocarse en la otra dirección cuesta una
    línea más en `docs/deploy_steps/tareas_manuales.md` §1 el día que llegue un
    ticket real y se pueda confirmar qué significa de verdad un `Listado` vacío.
    """
    listado = data.get("Listado") if isinstance(data, dict) else None
    if not isinstance(listado, list):
        raise ErrorDeConsulta(f"Respuesta de {API_MP} sin 'Listado' reconocible: {data!r}")

    if not listado:
        raise ErrorDeConsulta(
            f"{API_MP} devolvió 'Listado' vacío: forma válida en teoría, pero sin "
            "confirmar contra la API real si significa 'proveedor no existe' o "
            "algo distinto (RUT malformado, cuota agotada, etc.) — ver docstring."
        )

    proveedor = listado[0]
    estado = proveedor.get("Estado") if isinstance(proveedor, dict) else None
    if not isinstance(estado, str) or not estado.strip():
        raise ErrorDeConsulta(
            f"Respuesta de {API_MP} sin campo 'Estado' reconocible: {proveedor!r}"
        )

    estado_norm = estado.strip().lower()
    if estado_norm in ("hábil", "habil", "activo", "vigente"):
        return ESTADO_HABIL
    if estado_norm in ("inhábil", "inhabil", "inactivo", "suspendido"):
        return ESTADO_INHABIL
    raise ErrorDeConsulta(f"{API_MP} devolvió un Estado no reconocido: {estado!r}")


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
        raise ErrorDeConsulta(f"No se pudo consultar {API_MP}: {exc}") from exc

    if respuesta.status_code == 203:
        # Forma documentada en que esta API avisa un ticket inválido —
        # comprobado en vivo, ver docs/deploy_steps/tareas_manuales.md §1. No
        # es un 4xx, así que sin este chequeo pasaría el filtro de abajo y
        # terminaría en el parseo como si fuera una respuesta cualquiera.
        raise ErrorDeConsulta(
            f"{API_MP} respondió 203 Ticket no válido: revisa MERCADO_PUBLICO_TICKET "
            "(puede ser el placeholder de .env.example, o un ticket vencido/incorrecto)."
        )

    if respuesta.status_code >= 400:
        raise ErrorDeConsulta(f"{API_MP} respondió {respuesta.status_code}")

    try:
        payload = respuesta.json()
    except ValueError as exc:
        raise ErrorDeConsulta(f"{API_MP} no devolvió JSON: {exc}") from exc

    return _estado_de_respuesta(payload)


def _titulo_para(empresa: Empresa) -> str:
    if empresa.estado_habil == ESTADO_INHABIL:
        return f"{empresa.nombre_empresa} quedó inhábil"
    if empresa.estado_habil == ESTADO_HABIL:
        return f"{empresa.nombre_empresa} volvió a estar hábil"
    return f"No encontramos a {empresa.nombre_empresa} en el registro"


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
    return (
        f"{empresa.nombre_empresa} ({empresa.rut_empresa}) no aparece en la lista de "
        "proveedores hábiles que publica ChileCompra. Puede ser que el RUT esté mal "
        "escrito o que la empresa aún no esté inscrita en el Registro de Proveedores; "
        "sin esa inscripción no se puede ofertar."
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
    for empresa in empresas:
        new_state = consultar_rut(empresa.rut_empresa)
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

        # Create alerts for empresa users
        nuevas.extend(_create_estado_habil_alert(empresa, db))

    db.commit()
    # Quedar inhábil deja a la empresa fuera de todo lo que postule. Es de lo
    # poco que justifica un correo inmediato: enterarse al entrar a la
    # aplicación es enterarse cuando ya rechazaron la oferta.
    enviado = notificaciones.despachar_pendientes(db, [a.id for a in nuevas])
    logger.info(
        "Estado hábil check complete: checked=%d changed=%d notificadas=%d",
        checked,
        changed,
        enviado.get("inmediatas", 0),
    )
    return {"checked": checked, "changed": changed, **enviado}


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


def get_estado_habil_history(empresa_id: str, db: Session, limit: int = 30) -> list[EstadoHabilLog]:
    """Return the last `limit` estado hábil log entries for an empresa."""
    return (
        db.query(EstadoHabilLog)
        .filter(EstadoHabilLog.empresa_id == empresa_id)
        .order_by(EstadoHabilLog.checked_at.desc())
        .limit(limit)
        .all()
    )
