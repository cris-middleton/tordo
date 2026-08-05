"""Celery tasks for the weekly Radar email."""

import logging

from app.celery_app import celery_app
from app.core.email import send_email
from app.db import SyncSessionLocal
from app.models.empresa import EmpresaUsuario, TFIDFPerfil
from app.models.user import User
from app.services import radar_service

logger = logging.getLogger(__name__)


@celery_app.task(name="send_radar_semanal")
def send_radar_semanal():
    """
    Iterar todas las empresas con TFIDFPerfil configurado, computar radar
    y enviar email a sus owners/admins. Se ejecuta lunes 9am Santiago.
    """
    db = SyncSessionLocal()
    sent = 0
    skipped = 0
    failed = 0

    try:
        # Empresas con perfil TF-IDF configurado (proxy de "han usado el panel BI")
        empresas_ids = db.query(TFIDFPerfil.empresa_id).distinct().all()
        empresas_ids = [row[0] for row in empresas_ids]
        logger.info("send_radar_semanal: %d empresas con perfil TF-IDF", len(empresas_ids))

        for empresa_id in empresas_ids:
            try:
                radar = radar_service.compute_radar_for_empresa(db, empresa_id)
                if not radar.get("disponible"):
                    skipped += 1
                    continue

                # Owners + admins de la empresa
                memberships = (
                    db.query(EmpresaUsuario)
                    .filter(
                        EmpresaUsuario.empresa_id == empresa_id,
                        EmpresaUsuario.rol.in_(["owner", "admin"]),
                    )
                    .all()
                )
                user_ids = [m.user_id for m in memberships]
                if not user_ids:
                    skipped += 1
                    continue

                users = db.query(User).filter(User.id.in_(user_ids)).all()
                subject, html = radar_service.render_radar_email_html(radar)

                for u in users:
                    if not u.email:
                        continue
                    try:
                        send_email(to=u.email, subject=subject, body=html)
                        sent += 1
                    except Exception as exc:
                        logger.warning("send_radar_semanal: email to %s failed: %s", u.email, exc)
                        failed += 1
            except Exception as exc:
                logger.error(
                    "send_radar_semanal: empresa %s failed: %s", empresa_id, exc, exc_info=True
                )
                failed += 1

        logger.info("send_radar_semanal: sent=%d skipped=%d failed=%d", sent, skipped, failed)
        return {"sent": sent, "skipped": skipped, "failed": failed}
    finally:
        db.close()
