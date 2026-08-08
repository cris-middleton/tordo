"""
Celery tasks for alert processing
"""

import logging

from app.celery_app import celery_app
from app.db import SyncSessionLocal as SessionLocal
from app.services.alert_engine import AlertEngine

logger = logging.getLogger(__name__)


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
