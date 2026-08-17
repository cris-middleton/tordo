"""
Compliance periodic Celery tasks.

  check_estado_habil     — every 6h: BuscarProveedor por empresa, update states, alert changes
  send_deadline_reminders — 09:00 SCL: alert postulaciones closing in ≤48h / ≤24h
  check_document_expiry  — 09:30 SCL: alert documents expiring within 30 days
"""

import logging
from datetime import UTC, datetime, timedelta

from app.celery_app import celery_app
from app.config import settings
from app.core.tiempo import hoy_chile
from app.db import SyncSessionLocal as SessionLocal
from app.models.alert import Alert, AlertStatus, AlertType
from app.models.empresa import DocumentoEmpresa, EmpresaUsuario
from app.models.licitacion import Licitacion
from app.models.postulacion import Postulacion
from app.services import notificaciones
from app.services.estado_habil_service import run_estado_habil_check

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.estado_habil_tasks.check_estado_habil")
def check_estado_habil() -> dict:
    """Every 6h: consulta BuscarProveedor por cada empresa activa y actualiza su estado.

    Apagar la feature a propósito (`FEATURE_ESTADO_HABIL=false`) sigue siendo un
    `{"skipped": True}` legítimo. Cualquier otra cosa —incluida
    `FuenteNoConfigurada` cuando falta el ticket— se registra y se deja
    propagar: un job que falla en silencio es el bug que esto reemplaza.
    """
    if not settings.feature_estado_habil:
        logger.info("[EstadoHabil] Feature disabled — skipping")
        return {"skipped": True}

    db = SessionLocal()
    try:
        result = run_estado_habil_check(db)
        logger.info("[EstadoHabil] %s", result)
        return result
    except Exception as exc:
        logger.error("[EstadoHabil] Unexpected error: %s", exc)
        raise
    finally:
        db.close()


@celery_app.task(name="app.tasks.estado_habil_tasks.send_deadline_reminders")
def send_deadline_reminders() -> dict:
    """
    09:00 SCL daily: find active postulaciones with licitacion closing in ≤48h or ≤24h.
    Creates PLAZO_48H / PLAZO_24H alerts with idempotency_key to prevent duplicates.
    """
    db = SessionLocal()
    created = 0
    skipped = 0
    nuevas: list[Alert] = []
    try:
        now = datetime.now(UTC)
        cutoff_48h = now + timedelta(hours=48)
        cutoff_24h = now + timedelta(hours=24)

        active_estados = ["en_seguimiento", "en_preparacion"]

        # Licitaciones closing in next 48h
        postulaciones = (
            db.query(Postulacion)
            .join(Licitacion, Postulacion.licitacion_id == Licitacion.id)
            .filter(
                Postulacion.estado.in_(active_estados),
                Licitacion.fecha_cierre.isnot(None),
                Licitacion.fecha_cierre > now,
                Licitacion.fecha_cierre <= cutoff_48h,
            )
            .all()
        )

        for p in postulaciones:
            licitacion = db.query(Licitacion).filter(Licitacion.id == p.licitacion_id).first()
            if not licitacion or not licitacion.fecha_cierre:
                continue

            closes_in_24h = licitacion.fecha_cierre <= cutoff_24h
            alert_type = AlertType.PLAZO_24H if closes_in_24h else AlertType.PLAZO_48H
            hours_label = "24" if closes_in_24h else "48"
            fecha_str = licitacion.fecha_cierre.strftime("%Y-%m-%d")

            # Notify all users of the empresa
            memberships = (
                db.query(EmpresaUsuario).filter(EmpresaUsuario.empresa_id == p.empresa_id).all()
            )
            for m in memberships:
                # Idempotency: one alert per postulacion per day per type PER USER
                idempotency_key = f"{alert_type.value}_{p.id}_{fecha_str}_{m.user_id}"
                if db.query(Alert).filter(Alert.idempotency_key == idempotency_key).first():
                    skipped += 1
                    continue

                alert = Alert(
                    user_id=m.user_id,
                    alert_type=alert_type,
                    status=AlertStatus.PENDING,
                    entity_type="postulacion",
                    entity_id=int(str(p.id).replace("-", ""), 16)
                    % (2**31 - 1),  # UUID → positive int for legacy column
                    title=f"Cierre en {hours_label}h: {licitacion.nombre[:80]}",
                    message=(
                        f"La licitación '{licitacion.nombre}' "
                        f"(código {licitacion.codigo_externo}) cierra el {fecha_str}."
                    ),
                    idempotency_key=idempotency_key,
                    empresa_id=p.empresa_id,
                    notification_channels=["in_app"],
                )
                db.add(alert)
                nuevas.append(alert)
                created += 1

        db.commit()
        # Un recordatorio de plazo que sólo se ve entrando a la aplicación no es
        # un recordatorio. Va por correo y al momento: a 48 o 24 horas del cierre,
        # esperar a la tanda de la noche es llegar tarde.
        enviado = notificaciones.despachar_pendientes(db, [a.id for a in nuevas])
        logger.info(
            "[DeadlineReminders] created=%d skipped=%d notificadas=%d",
            created,
            skipped,
            enviado.get("inmediatas", 0),
        )
        return {"created": created, "skipped": skipped, **enviado}
    except Exception as exc:
        db.rollback()
        logger.error("[DeadlineReminders] Error: %s", exc)
        raise
    finally:
        db.close()


@celery_app.task(name="app.tasks.estado_habil_tasks.check_document_expiry")
def check_document_expiry() -> dict:
    """
    09:30 SCL daily: alert on documents expiring within 30 days.
    Uses idempotency_key to send at most one alert per document per week.
    """
    if not settings.feature_documentos:
        logger.info("[DocExpiry] Feature disabled — skipping")
        return {"skipped": True}

    db = SessionLocal()
    created = 0
    skipped = 0
    nuevas: list[Alert] = []
    try:
        today = hoy_chile()
        expiry_window = today + timedelta(days=30)

        expiring_docs = (
            db.query(DocumentoEmpresa)
            .filter(
                DocumentoEmpresa.eliminado.is_(False),
                DocumentoEmpresa.fecha_vencimiento.isnot(None),
                DocumentoEmpresa.fecha_vencimiento >= today,
                DocumentoEmpresa.fecha_vencimiento <= expiry_window,
            )
            .all()
        )

        for doc in expiring_docs:
            fecha_str = doc.fecha_vencimiento.isoformat()
            week_str = today.strftime("%Y-W%W")
            days_left = (doc.fecha_vencimiento - today).days
            memberships = (
                db.query(EmpresaUsuario).filter(EmpresaUsuario.empresa_id == doc.empresa_id).all()
            )
            for m in memberships:
                # Idempotency: one alert per document per week PER USER
                idempotency_key = f"doc_expiry_{doc.id}_{week_str}_{m.user_id}"

                if db.query(Alert).filter(Alert.idempotency_key == idempotency_key).first():
                    skipped += 1
                    continue

                alert = Alert(
                    user_id=m.user_id,
                    alert_type=AlertType.DOCUMENTO_VENCIDO,
                    status=AlertStatus.PENDING,
                    entity_type="documento",
                    entity_id=int(str(doc.id).replace("-", ""), 16)
                    % (2**31 - 1),  # UUID → positive int for legacy column
                    title=f"Documento por vencer: {doc.nombre}",
                    message=(
                        f"El documento '{doc.nombre}' vence el {fecha_str} "
                        f"({days_left} días restantes)."
                    ),
                    idempotency_key=idempotency_key,
                    empresa_id=doc.empresa_id,
                    notification_channels=["in_app"],
                )
                db.add(alert)
                nuevas.append(alert)
                created += 1

        db.commit()
        enviado = notificaciones.despachar_pendientes(db, [a.id for a in nuevas])
        logger.info(
            "[DocExpiry] created=%d skipped=%d notificadas=%d",
            created,
            skipped,
            enviado.get("inmediatas", 0),
        )
        return {"created": created, "skipped": skipped, **enviado}
    except Exception as exc:
        db.rollback()
        logger.error("[DocExpiry] Error: %s", exc)
        raise
    finally:
        db.close()
