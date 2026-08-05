"""
Celery tasks for alert processing
"""

import logging

from app.celery_app import celery_app
from app.db import SyncSessionLocal as SessionLocal
from app.services.alert_engine import AlertEngine

logger = logging.getLogger(__name__)


@celery_app.task(name="process_new_licitacion_alert")
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


@celery_app.task(name="process_new_orden_compra_alert")
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
