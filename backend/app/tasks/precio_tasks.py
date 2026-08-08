"""Tarea Celery de vigilancia de precios.

Corre **después** de la reconstrucción semanal de analytics, no en paralelo:
comparar contra una tabla a medio reemplazar daría variaciones inventadas.
"""

from __future__ import annotations

import logging

from app.celery_app import celery_app
from app.db import SyncSessionLocal
from app.services import vigilancia_precios

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.precio_tasks.revisar_cambios_de_precio", ignore_result=True)
def revisar_cambios_de_precio() -> dict:
    """Detecta cambios, avisa a quien los vigila y actualiza la referencia."""
    db = SyncSessionLocal()
    try:
        return vigilancia_precios.revisar_precios(db)
    except Exception as exc:
        db.rollback()
        logger.error("[Precios] la revisión falló: %s", exc, exc_info=True)
        raise
    finally:
        db.close()
