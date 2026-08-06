"""Celery tasks for reverse-trial lifecycle management.

- `downgrade_expired_trials`: daily job that ends trials whose trial_ends_at
   is in the past.
- `send_trial_reminders`: daily job that emails users at day 7 and day 12
   of their trial (idempotent via the *_sent_at columns).

Both tasks use synchronous SQL via psycopg2 because Celery workers don't run
inside an asyncio loop.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import create_engine, text

from app.celery_app import celery_app
from app.config import settings

logger = logging.getLogger(__name__)


def _sync_engine():
    """Build a psycopg2 engine from the async DATABASE_URL."""
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return create_engine(url, pool_pre_ping=True)


def _downgrade_expired_trials_sync() -> int:
    """Baja a inactive las EMPRESAS con el trial vencido.

    El trial es de la empresa, no del usuario (ADR 0002).

    Devuelve cuántas filas se actualizaron.
    """
    engine = _sync_engine()
    with engine.begin() as conn:
        result = conn.execute(
            text(
                """
                UPDATE empresas
                SET subscription_status = 'inactive',
                    trial_ends_at = NULL
                WHERE subscription_status = 'trialing'
                  AND trial_ends_at IS NOT NULL
                  AND trial_ends_at < NOW()
                """
            )
        )
        count = result.rowcount or 0
    logger.info("Bajadas %d empresa(s) con trial vencido a inactive.", count)
    return count


@celery_app.task(name="app.tasks.trial_tasks.downgrade_expired_trials")
def downgrade_expired_trials() -> dict:
    """Beat-scheduled task — runs daily at 03:00 America/Santiago."""
    count = _downgrade_expired_trials_sync()
    return {"downgraded": count, "ran_at": datetime.now(UTC).isoformat()}


# ── Reminder emails ────────────────────────────────────────────────────────────


def _pick_reminder_kind(
    trial_ends_at: datetime,
    day7_sent: datetime | None,
    day12_sent: datetime | None,
) -> str | None:
    """
    Decide which (if any) reminder to send for this trial right now.

    Day 12 window: within 3 days of the end (days remaining in (0, 3]).
    Day 7 window: between 3 and 8 days remaining.
    Priority goes to day12 (closer to end).
    """
    now = datetime.now(UTC)
    remaining = trial_ends_at - now
    days_remaining = remaining.total_seconds() / 86400

    if 0 < days_remaining <= 3 and day12_sent is None:
        return "day12"

    if 3 < days_remaining <= 8 and day7_sent is None:
        return "day7"

    return None


REMINDER_SUBJECTS = {
    "day7": "Vas por la mitad de tu prueba de TORDO",
    "day12": "Te quedan 2 días de prueba en TORDO",
}

REMINDER_BODIES = {
    "day7": (
        "Hola,\n\n"
        "Llevas una semana probando TORDO Pro. ¿Ya revisaste alguna licitación "
        "con los benchmarks de precio y el score de oportunidad?\n\n"
        "Si aún no, ve a tu dashboard: {dashboard_url}\n\n"
        "Te quedan 7 días para aprovecharlo. Si quieres continuar al terminar, "
        "puedes activar tu suscripción en cualquier momento: {billing_url}\n\n"
        "— El equipo de TORDO\n"
    ),
    "day12": (
        "Hola,\n\n"
        "Tu prueba de TORDO Pro termina en 2 días.\n\n"
        "Si quieres seguir con la inteligencia completa (BI, matching, alertas "
        "ilimitadas, checklist), activa tu suscripción antes de que termine: "
        "{billing_url}\n\n"
        "Si no, no te preocupes — tu cuenta queda activa con el plan Free y "
        "podrás seguir explorando licitaciones.\n\n"
        "— El equipo de TORDO\n"
    ),
}


def _send_reminder_email(email: str, kind: str) -> bool:
    """Render + send one reminder email. Returns True if delivery succeeded."""
    from app.core.email import send_email

    dashboard_url = f"{settings.frontend_url}/dashboard"
    billing_url = f"{settings.frontend_url}/dashboard/billing"
    body = REMINDER_BODIES[kind].format(
        dashboard_url=dashboard_url,
        billing_url=billing_url,
    )
    return send_email(to=email, subject=REMINDER_SUBJECTS[kind], body=body)


@celery_app.task(name="app.tasks.trial_tasks.send_trial_reminders")
def send_trial_reminders() -> dict:
    """
    Agendada a diario a las 09:00 SCL. Por cada EMPRESA con trial activo manda
    el recordatorio de día 7 o 12 si toca y no se envió ya, y marca la columna
    *_sent_at para no duplicar.

    El correo va al owner de la empresa: el trial es de ella, y quien decide
    contratar es quien la creó.
    """
    engine = _sync_engine()
    sent_day7 = 0
    sent_day12 = 0
    failures = 0

    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT DISTINCT ON (e.id)
                       e.id, u.email, e.trial_ends_at,
                       e.trial_reminder_day7_sent_at,
                       e.trial_reminder_day12_sent_at
                FROM empresas e
                JOIN empresas_usuario eu ON eu.empresa_id = e.id AND eu.rol = 'owner'
                JOIN users u ON u.id = eu.user_id
                WHERE e.subscription_status = 'trialing'
                  AND e.trial_ends_at IS NOT NULL
                  AND e.trial_ends_at > NOW()
                ORDER BY e.id, eu.created_at ASC
                """
            )
        ).fetchall()

    for row in rows:
        kind = _pick_reminder_kind(
            row.trial_ends_at,
            row.trial_reminder_day7_sent_at,
            row.trial_reminder_day12_sent_at,
        )
        if kind is None:
            continue

        ok = _send_reminder_email(row.email, kind)
        if not ok:
            failures += 1
            logger.warning("Falló el recordatorio %s de la empresa %s", kind, row.id)
            continue

        # Marca condicional: sólo escribe NOW() si otro worker no lo hizo ya.
        # Garantiza un recordatorio por empresa y tipo aunque haya concurrencia.
        column = f"trial_reminder_{kind}_sent_at"
        with engine.begin() as conn:
            result = conn.execute(
                text(f"UPDATE empresas SET {column} = NOW() WHERE id = :eid AND {column} IS NULL"),
                {"eid": row.id},
            )
        if (result.rowcount or 0) == 0:
            # Another worker already stamped this row between our SELECT and UPDATE.
            logger.info(
                "El recordatorio %s de la empresa %s ya lo marcó otro worker; no se cuenta",
                kind,
                row.id,
            )
            continue
        if kind == "day7":
            sent_day7 += 1
        else:
            sent_day12 += 1

    result = {
        "sent_day7": sent_day7,
        "sent_day12": sent_day12,
        "failures": failures,
        "ran_at": datetime.now(UTC).isoformat(),
    }
    logger.info("Trial reminders: %s", result)
    return result
