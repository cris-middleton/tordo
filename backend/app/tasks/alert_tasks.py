"""
Celery tasks for alert processing
"""

import logging
from datetime import UTC, datetime, timedelta

from app.celery_app import celery_app
from app.db import SyncSessionLocal as SessionLocal
from app.models.alert import Alert, AlertType
from app.services import notificaciones
from app.services.alert_engine import AlertEngine
from app.services.notificaciones import Urgencia, urgencia_de

logger = logging.getLogger(__name__)

#: Margen antes de que una alerta recién fallida sea candidata al barrido. El
#: despacho original (`despachar_pendientes`, llamado justo tras insertar la
#: alerta) es síncrono y termina en segundos; esta gracia evita competir con
#: él por la misma fila si el worker alcanza a correr las dos cosas casi a la
#: vez.
_GRACIA_REINTENTO = timedelta(minutes=5)

#: Horizonte de reintento desde que se creó la alerta. Pasado este tiempo se
#: deja de reintentar: una dirección de correo permanentemente inválida no
#: puede generar un barrido que la reintenta para siempre. La alerta sigue
#: existiendo con `sent_at IS NULL` y su rastro en `task_failures` — no se
#: pierde, sólo deja de reintentarse sola.
_VENTANA_REINTENTO = timedelta(hours=6)


# `ignore_result=True`: nadie consume el resultado de estas tareas, y guardarlo
# obliga a hablar con el backend de resultados al publicarlas.
#
# Medido con Redis caído: publicar costaba 19,7 s POR REGISTRO, de los cuales
# 13 eran reintentos contra el backend de resultados. El ETL publica una tarea
# por cada licitación nueva de la pasada horaria, así que una caída de Redis
# convertía la carga en horas.
#
# Quedan ~6 s por registro que son el intento de conexión al broker, y ésos no
# se han conseguido acotar: `retry=False` y `broker_transport_options` no los
# mueven. Sólo afecta al camino degradado — con el broker arriba, publicar es
# instantáneo.
@celery_app.task(name="process_new_licitacion_alert", ignore_result=True)
def process_new_licitacion_alert(licitacion_id: int):
    """Celery task to process a new licitacion and create alerts"""
    db = SessionLocal()
    try:
        engine = AlertEngine(db)
        engine.process_new_licitacion(licitacion_id)
        logger.info(f"Processed alert for licitacion {licitacion_id}")
    except Exception as e:
        logger.error(f"Error processing alert for licitacion {licitacion_id}: {e}")
        raise
    finally:
        db.close()


@celery_app.task(name="process_new_orden_compra_alert", ignore_result=True)
def process_new_orden_compra_alert(orden_compra_id: int):
    """Celery task to process a new orden_compra and create alerts"""
    db = SessionLocal()
    try:
        engine = AlertEngine(db)
        engine.process_new_orden_compra(orden_compra_id)
        logger.info(f"Processed alert for orden_compra {orden_compra_id}")
    except Exception as e:
        logger.error(f"Error processing alert for orden_compra {orden_compra_id}: {e}")
        raise
    finally:
        db.close()


@celery_app.task(name="app.tasks.alert_tasks.reintentar_notificaciones_fallidas")
def reintentar_notificaciones_fallidas() -> dict:
    """Cada 30 min: reintenta el correo de alertas cuyo primer intento falló.

    Ver `services/notificaciones.py` para la decisión completa sobre qué
    significa `sent_at`. En resumen: significa que el correo salió, no que se
    intentó, así que `sent_at IS NULL` es exactamente lo que ya usaba
    `despachar_pendientes` para no reprocesar una tanda de IDs dos veces —
    reintentar aquí es invocar la misma función con esos mismos IDs, no un
    camino nuevo, y por eso la idempotencia (no reenviar lo que ya salió) sigue
    garantizada por el mismo filtro.

    Sólo se seleccionan tipos que SÍ pueden llevar correo: uno `SIN_CORREO`
    (p. ej. `TENDER_UPDATE`) nunca tendrá `sent_at` —así lo deja
    `despachar_pendientes` a propósito— y de lo contrario el barrido lo
    recogería para siempre sin que hubiera nada que reintentar.
    """
    db = SessionLocal()
    try:
        ahora = datetime.now(UTC)
        tipos_con_correo = [t for t in AlertType if urgencia_de(t) != Urgencia.SIN_CORREO]
        candidatas = (
            db.query(Alert.id)
            .filter(
                Alert.sent_at.is_(None),
                Alert.alert_type.in_(tipos_con_correo),
                Alert.created_at <= ahora - _GRACIA_REINTENTO,
                Alert.created_at >= ahora - _VENTANA_REINTENTO,
            )
            .all()
        )
        ids = [id_ for (id_,) in candidatas]

        resumen = notificaciones.despachar_pendientes(db, ids)
        logger.info("[ReintentoNotificaciones] candidatas=%d %s", len(ids), resumen)
        return {"candidatas": len(ids), **resumen}
    finally:
        db.close()
