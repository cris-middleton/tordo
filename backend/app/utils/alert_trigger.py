"""
Utility functions to trigger alert processing
Can be called from ETL or API endpoints
"""
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def trigger_licitacion_alert(licitacion_id: int, use_celery: bool = True):
    """
    Trigger alert processing for a new or updated licitacion
    
    Args:
        licitacion_id: ID of the licitacion
        use_celery: If True, use Celery task. If False, process synchronously
    """
    if use_celery:
        try:
            from app.tasks.alert_tasks import process_new_licitacion_alert
            process_new_licitacion_alert.delay(licitacion_id)
            logger.info(f"Triggered Celery task for licitacion {licitacion_id}")
        except Exception as e:
            logger.error(f"Failed to trigger Celery task for licitacion {licitacion_id}: {e}")
            # Fallback to synchronous processing
            trigger_licitacion_alert(licitacion_id, use_celery=False)
    else:
        # Synchronous processing
        try:
            from app.db import SyncSessionLocal as SessionLocal
            from app.services.alert_engine import AlertEngine
            
            db = SessionLocal()
            try:
                engine = AlertEngine(db)
                engine.process_new_licitacion(licitacion_id)
                logger.info(f"Processed alert synchronously for licitacion {licitacion_id}")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to process alert for licitacion {licitacion_id}: {e}")


def trigger_orden_compra_alert(orden_compra_id: int, use_celery: bool = True):
    """
    Trigger alert processing for a new or updated orden_compra
    
    Args:
        orden_compra_id: ID of the orden_compra
        use_celery: If True, use Celery task. If False, process synchronously
    """
    if use_celery:
        try:
            from app.tasks.alert_tasks import process_new_orden_compra_alert
            process_new_orden_compra_alert.delay(orden_compra_id)
            logger.info(f"Triggered Celery task for orden_compra {orden_compra_id}")
        except Exception as e:
            logger.error(f"Failed to trigger Celery task for orden_compra {orden_compra_id}: {e}")
            # Fallback to synchronous processing
            trigger_orden_compra_alert(orden_compra_id, use_celery=False)
    else:
        # Synchronous processing
        try:
            from app.db import SyncSessionLocal as SessionLocal
            from app.services.alert_engine import AlertEngine
            
            db = SessionLocal()
            try:
                engine = AlertEngine(db)
                engine.process_new_orden_compra(orden_compra_id)
                logger.info(f"Processed alert synchronously for orden_compra {orden_compra_id}")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Failed to process alert for orden_compra {orden_compra_id}: {e}")

