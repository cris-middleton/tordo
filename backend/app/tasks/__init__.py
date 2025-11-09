# Celery tasks
from app.tasks.alert_tasks import process_new_licitacion_alert, process_new_orden_compra_alert

__all__ = [
    "process_new_licitacion_alert",
    "process_new_orden_compra_alert",
]

