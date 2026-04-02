"""
Periodic ETL Celery tasks.

  run_etl_licitaciones_activas — every hour, fetch active tenders from API
                                  + TF-IDF matching for newly-extracted licitaciones
  run_etl_licitaciones_diario  — 02:00 SCL, fetch previous day by fecha_desde/hasta
  watchdog                     — every 30 min, verify critical tasks ran
"""
import logging
import os
import subprocess
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.celery_app import celery_app
from app.db import SyncSessionLocal as SessionLocal
from app.models.task_failure import TaskFailure

logger = logging.getLogger(__name__)

ETL_WORKSPACE = os.environ.get("ETL_WORKSPACE", "/workspace")
_SCL_TZ = ZoneInfo("America/Santiago")


def _log_task_failure(task_name: str, error_msg: str, task_args: dict | None = None) -> None:
    db = SessionLocal()
    try:
        failure = TaskFailure(
            task_name=task_name,
            task_args=task_args,
            error_msg=error_msg[:5000],  # cap at 5K chars
        )
        db.add(failure)
        db.commit()
    except Exception as exc:
        logger.error("Could not persist task failure: %s", exc)
    finally:
        db.close()


@celery_app.task(
    name="app.tasks.etl_tasks.run_etl_licitaciones_activas",
    max_retries=2,
    default_retry_delay=120,
)
def run_etl_licitaciones_activas() -> dict:
    """Hourly: extract active licitaciones from Mercado Público API and upsert to DB."""
    logger.info("[ETL] Starting hourly licitaciones extraction")
    etl_dir = os.path.join(ETL_WORKSPACE, "etl")

    try:
        result = subprocess.run(
            ["python", "main.py", "--only-extraer-nuevos"],
            cwd=etl_dir,
            capture_output=True,
            text=True,
            timeout=1800,  # 30 min hard limit
            env={**os.environ, "PYTHONPATH": ETL_WORKSPACE},
        )
    except subprocess.TimeoutExpired:
        msg = "ETL licitaciones timed out after 30 minutes"
        logger.error(msg)
        _log_task_failure("run_etl_licitaciones_activas", msg)
        raise

    if result.returncode != 0:
        msg = f"ETL licitaciones exited {result.returncode}:\n{result.stderr[-2000:]}"
        logger.error(msg)
        _log_task_failure("run_etl_licitaciones_activas", msg)
        raise RuntimeError(msg)

    logger.info("[ETL] Licitaciones extraction complete:\n%s", result.stdout[-500:])

    # ── TF-IDF matching for newly-extracted licitaciones ─────────────────────
    _run_matching_for_new_licitaciones()

    return {"status": "ok", "returncode": result.returncode}


def _run_matching_for_new_licitaciones() -> None:
    """
    Query licitaciones extracted in the last 2 hours and run TF-IDF matching
    for each. Called after the hourly and daily ETL tasks complete.
    """
    from app.models.licitacion import Licitacion
    from app.services.alert_engine import AlertEngine

    db = SessionLocal()
    try:
        since = datetime.now(_SCL_TZ) - timedelta(hours=2)
        new_lics = (
            db.query(Licitacion)
            .filter(Licitacion.fecha_extraccion >= since)
            .all()
        )
        if not new_lics:
            logger.info("[Matching] No new licitaciones in last 2h — skipping")
            return

        engine = AlertEngine(db)
        total_created = 0
        for lic in new_lics:
            r = engine.match_nueva_licitacion(lic)
            total_created += r.get("created", 0)

        logger.info(
            "[Matching] Processed %d new licitaciones, %d alerts created",
            len(new_lics), total_created,
        )
    except Exception as exc:
        logger.error("[Matching] Step failed: %s", exc)
    finally:
        db.close()


@celery_app.task(
    name="app.tasks.etl_tasks.run_etl_licitaciones_diario",
    max_retries=1,
    default_retry_delay=300,
)
def run_etl_licitaciones_diario() -> dict:
    """
    Daily at 02:00 SCL: fetch licitaciones published on the previous calendar day.

    Uses --fecha-desde / --fecha-hasta with yesterday's date in Santiago time to
    catch any licitaciones that the hourly API scan may have missed (e.g. API
    hiccups, recently-published records not yet in the active list endpoint).
    """
    yesterday = (datetime.now(_SCL_TZ) - timedelta(days=1)).date().isoformat()
    etl_dir = os.path.join(ETL_WORKSPACE, "etl")

    logger.info("[ETL-diario] Fetching licitaciones for %s", yesterday)

    try:
        result = subprocess.run(
            [
                "python", "main.py",
                "--fecha-desde", yesterday,
                "--fecha-hasta", yesterday,
            ],
            cwd=etl_dir,
            capture_output=True,
            text=True,
            timeout=1800,
            env={**os.environ, "PYTHONPATH": ETL_WORKSPACE},
        )
    except subprocess.TimeoutExpired:
        msg = f"Daily ETL licitaciones timed out after 30 min (fecha={yesterday})"
        logger.error(msg)
        _log_task_failure("run_etl_licitaciones_diario", msg, {"fecha": yesterday})
        raise

    if result.returncode != 0:
        msg = (
            f"Daily ETL licitaciones exited {result.returncode} (fecha={yesterday}):\n"
            f"{result.stderr[-2000:]}"
        )
        logger.error(msg)
        _log_task_failure("run_etl_licitaciones_diario", msg, {"fecha": yesterday})
        raise RuntimeError(msg)

    logger.info("[ETL-diario] Complete for %s:\n%s", yesterday, result.stdout[-500:])

    # Run TF-IDF matching for any licitaciones loaded in this run
    _run_matching_for_new_licitaciones()

    return {"status": "ok", "fecha": yesterday, "returncode": result.returncode}


def _periodos_recientes(n_meses: int = 3) -> list[tuple[str, str]]:
    """
    Return the last *n_meses* (year, month_no_pad) tuples ending at the current
    Santiago-time month.  E.g. on 2026-03-23 with n_meses=3:
      [("2026", "1"), ("2026", "2"), ("2026", "3")]
    """
    scl_now = datetime.now(_SCL_TZ)
    periodos: list[tuple[str, str]] = []
    year, month = scl_now.year, scl_now.month
    for i in range(n_meses - 1, -1, -1):
        # Go back exactly i months using calendar arithmetic (no day-length ambiguity)
        m = month - i
        y = year
        while m <= 0:
            m += 12
            y -= 1
        periodos.append((str(y), str(m)))
    return periodos


def _purge_cached_zips(periodos: list[tuple[str, str]]) -> None:
    """
    Delete locally-cached raw ZIPs for the given periods so that the download
    script is forced to re-fetch them.  Files live at:
      {ETL_WORKSPACE}/etl/data/raw/{oc|lic}/{year}-{month}.zip
    """
    raw_root = os.path.join(ETL_WORKSPACE, "etl", "data", "raw")
    for tipo in ("oc", "lic"):
        for year, month in periodos:
            path = os.path.join(raw_root, tipo, f"{year}-{month}.zip")
            if os.path.exists(path):
                os.remove(path)
                logger.info("[Bulk] Removed cached %s", path)


@celery_app.task(
    name="app.tasks.etl_tasks.run_bulk_semanal",
    max_retries=1,
    default_retry_delay=600,
)
def run_bulk_semanal() -> dict:
    """
    Weekly (Monday 03:00 SCL): re-download the last 3 months of OC + LIC bulk
    ZIPs and rebuild all analytics parquets.

    ChileCompra regenerates both OC and LIC bulk files every ~2-4 weeks,
    refreshing multiple recent months in each batch.  A weekly cadence ensures
    TORDO picks up new data within ~7 days of publication without unnecessary
    daily downloads.

    Steps:
      0. Purge local cached ZIPs for the 3 target months (forces re-download)
      1. descargar_datos_masivos.py --tipo ambos --desde M-2 --hasta M
      2. python -m etl.analytics.run_all  (full rebuild)

    The TF-IDF model is re-trained as part of the 'tfidf' module, so
    bi_service._cache TTL will cause it to be lazily reloaded within 24h.
    """
    periodos = _periodos_recientes(3)
    desde = f"{periodos[0][0]}-{periodos[0][1]}"
    hasta = f"{periodos[-1][0]}-{periodos[-1][1]}"
    rango_log = f"{desde} → {hasta}"

    logger.info("[Bulk] Weekly download + analytics rebuild for %s", rango_log)

    # ── Step 0: Purge cached ZIPs to force re-download ───────────────────────
    _purge_cached_zips(periodos)

    scripts_dir = os.path.join(ETL_WORKSPACE, "etl", "scripts")
    analytics_dir = ETL_WORKSPACE

    # ── Step 1: Download bulk ZIPs ────────────────────────────────────────────
    try:
        dl_result = subprocess.run(
            [
                "python", "descargar_datos_masivos.py",
                "--tipo", "ambos",
                "--desde", desde,
                "--hasta", hasta,
            ],
            cwd=scripts_dir,
            capture_output=True,
            text=True,
            timeout=3600,  # 1h — 3 months × 2 types
            env={**os.environ, "PYTHONPATH": ETL_WORKSPACE},
        )
    except subprocess.TimeoutExpired:
        msg = f"[Bulk] Download timed out after 1h ({rango_log})"
        logger.error(msg)
        _log_task_failure("run_bulk_semanal", msg, {"rango": rango_log, "step": "download"})
        raise

    if dl_result.returncode != 0:
        msg = (
            f"[Bulk] Download exited {dl_result.returncode} ({rango_log}):\n"
            f"{dl_result.stderr[-2000:]}"
        )
        logger.error(msg)
        _log_task_failure("run_bulk_semanal", msg, {"rango": rango_log, "step": "download"})
        raise RuntimeError(msg)

    logger.info("[Bulk] Download complete:\n%s", dl_result.stdout[-500:])

    # ── Step 2: Rebuild analytics ─────────────────────────────────────────────
    try:
        analytics_result = subprocess.run(
            ["python", "-m", "etl.analytics.run_all"],
            cwd=analytics_dir,
            capture_output=True,
            text=True,
            timeout=7200,  # 2h — full analytics rebuild
            env={**os.environ, "PYTHONPATH": ETL_WORKSPACE},
        )
    except subprocess.TimeoutExpired:
        msg = f"[Bulk] Analytics rebuild timed out after 2h ({rango_log})"
        logger.error(msg)
        _log_task_failure("run_bulk_semanal", msg, {"rango": rango_log, "step": "analytics"})
        raise

    if analytics_result.returncode != 0:
        msg = (
            f"[Bulk] Analytics rebuild exited {analytics_result.returncode} "
            f"({rango_log}):\n{analytics_result.stderr[-2000:]}"
        )
        logger.error(msg)
        _log_task_failure("run_bulk_semanal", msg, {"rango": rango_log, "step": "analytics"})
        raise RuntimeError(msg)

    logger.info("[Bulk] Analytics rebuild complete:\n%s", analytics_result.stdout[-500:])
    return {"status": "ok", "rango": rango_log}


@celery_app.task(name="app.tasks.etl_tasks.watchdog")
def watchdog() -> dict:
    """Every 30 min: check for unresolved task failures and log summary."""
    db = SessionLocal()
    try:
        unresolved = (
            db.query(TaskFailure)
            .filter(TaskFailure.resolved.is_(False))
            .count()
        )
        if unresolved > 0:
            logger.warning("[Watchdog] %d unresolved task failures", unresolved)
        else:
            logger.info("[Watchdog] All tasks healthy — 0 unresolved failures")
        return {"unresolved_failures": unresolved, "checked_at": datetime.now(_SCL_TZ).isoformat()}
    finally:
        db.close()
