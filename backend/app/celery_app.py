"""
Celery configuration for background tasks.
Timezone: America/Santiago (CLT/CLST)
"""
from celery import Celery
from celery.schedules import crontab

from app.config import settings

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
    task_time_limit=30 * 60,       # 30 min hard limit
    task_soft_time_limit=25 * 60,  # 25 min soft limit
    beat_schedule={
        # Hourly: fetch active licitaciones from Mercado Público API + TF-IDF matching
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
        # Every 6h: check estado hábil for all registered empresas
        "check-estado-habil": {
            "task": "app.tasks.estado_habil_tasks.check_estado_habil",
            "schedule": crontab(minute=0, hour="*/6"),
        },
        # 09:00 SCL daily: alert on tenders closing in ≤48h / ≤24h
        "deadline-reminders": {
            "task": "app.tasks.estado_habil_tasks.send_deadline_reminders",
            "schedule": crontab(hour=9, minute=0),
        },
        # 09:30 SCL daily: alert on documents expiring within 30 days
        "document-expiry": {
            "task": "app.tasks.estado_habil_tasks.check_document_expiry",
            "schedule": crontab(hour=9, minute=30),
        },
        # 06:00 SCL daily: pre-compute TF-IDF matches for the operational home.
        # Reads TFIDFPerfil per empresa, scores all open licitaciones, stores
        # top-20 in dashboard_home_cache. Home endpoint reads from cache only.
        "precompute-dashboard-matches": {
            "task": "app.tasks.dashboard_tasks.precompute_dashboard_matches",
            "schedule": crontab(hour=6, minute=0),
        },
        # Every 30 min: watchdog checks for unresolved task failures
        "watchdog": {
            "task": "app.tasks.etl_tasks.watchdog",
            "schedule": crontab(minute="*/30"),
        },
        # 03:00 SCL daily: downgrade expired reverse-trials
        "trial-downgrade": {
            "task": "app.tasks.trial_tasks.downgrade_expired_trials",
            "schedule": crontab(hour=3, minute=0),
        },
        # 09:00 SCL daily: reverse-trial day-7 / day-12 reminder emails
        "trial-reminders": {
            "task": "app.tasks.trial_tasks.send_trial_reminders",
            "schedule": crontab(hour=9, minute=0),
        },
        # Lunes 09:00 SCL: enviar radar semanal a empresas con perfil TF-IDF
        "radar-semanal": {
            "task": "send_radar_semanal",
            "schedule": crontab(day_of_week=1, hour=9, minute=0),
        },
    },
)

# Register all tasks
from app.tasks import alert_tasks       # noqa
from app.tasks import etl_tasks         # noqa
from app.tasks import estado_habil_tasks  # noqa
from app.tasks import dashboard_tasks   # noqa
from app.tasks import trial_tasks       # noqa
from app.tasks import radar_tasks       # noqa
