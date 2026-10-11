"""
Celery configuration for background tasks.
Timezone: America/Santiago (CLT/CLST)
"""

from celery import Celery
from celery.schedules import crontab

from app.config import settings
from app.observability import setup_logging, setup_sentry

# El worker y el beat son procesos aparte del de la API: necesitan su propia
# inicialización. Aquí es donde fallan los jobs de ETL, así que es justo lo que
# hay que tener instrumentado.
setup_logging(level=settings.log_level, json_output=settings.log_json)
setup_sentry(
    dsn=settings.sentry_dsn,
    environment=settings.environment,
    release=settings.app_version,
)

celery_app = Celery(
    "tordo",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Santiago",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 min hard limit
    task_soft_time_limit=25 * 60,  # 25 min soft limit
    beat_schedule={
        # Hourly: fetch active licitaciones from Mercado Público API
        "etl-licitaciones-activas": {
            "task": "app.tasks.etl_tasks.run_etl_licitaciones_activas",
            "schedule": crontab(minute=0),
        },
        # 02:00 SCL daily: backfill previous day by date range (catches API misses)
        "etl-licitaciones-diario": {
            "task": "app.tasks.etl_tasks.run_etl_licitaciones_diario",
            "schedule": crontab(hour=2, minute=0),
        },
        # Monday 03:00 SCL: re-download last 3 months OC + LIC bulk ZIPs + analytics rebuild
        # ChileCompra regenerates bulk files every ~2-4 weeks (both OC and LIC)
        "bulk-semanal": {
            "task": "app.tasks.etl_tasks.run_bulk_semanal",
            "schedule": crontab(day_of_week=1, hour=3, minute=0),
        },
        # Every 30 min: watchdog checks for unresolved task failures
        "watchdog": {
            "task": "app.tasks.etl_tasks.watchdog",
            "schedule": crontab(minute="*/30"),
        },
    },
)

# Register all tasks. `beat_schedule` las nombra por cadena: un módulo sin
# importar aquí da `Received unregistered task` en el worker y nada más.
from app.tasks import etl_tasks  # noqa
