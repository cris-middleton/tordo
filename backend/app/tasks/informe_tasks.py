"""El envío del informe semanal.

Sustituye a `send_radar_semanal`. Dos correos semanales al mismo lunes serían
dos correos que se ignoran igual de rápido, así que hay uno solo: el informe, que
incluye lo que el radar contaba como una sección más.

Corre los lunes a las 09:00, después de la vigilancia de precios (04:30), para
que los cambios de precio de esta semana ya estén en las alertas que el informe
lee.
"""

from __future__ import annotations

import logging

from app.celery_app import celery_app
from app.core.email import Adjunto, send_email
from app.db import SyncSessionLocal
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.user import User
from app.services import informe_render, informe_semanal

logger = logging.getLogger(__name__)


def _destinatarios(db, empresa_id) -> list[User]:
    """Quién recibe el informe de esa empresa.

    Owners y admins, no todo el equipo: es un resumen de gestión —incluye
    cumplimiento y plazos— y quien sólo consulta no puede actuar sobre él.

    Se respeta `recibe_informe_semanal`. Sin ese filtro, el enlace para
    desactivarlo del pie del correo sería mentira.
    """
    return (
        db.query(User)
        .join(EmpresaUsuario, EmpresaUsuario.user_id == User.id)
        .filter(
            EmpresaUsuario.empresa_id == empresa_id,
            EmpresaUsuario.rol.in_(["owner", "admin"]),
            User.is_active.is_(True),
            User.recibe_informe_semanal.is_(True),
            User.email.is_not(None),
        )
        .all()
    )


@celery_app.task(name="app.tasks.informe_tasks.enviar_informe_semanal", ignore_result=True)
def enviar_informe_semanal() -> dict:
    """Construye y manda el informe de cada empresa activa."""
    db = SyncSessionLocal()
    enviados = sin_contenido = sin_destinatarios = fallidos = 0

    try:
        empresas = db.query(Empresa.id).filter(Empresa.activo.is_(True)).all()
        logger.info("[Informe] %d empresas activas", len(empresas))

        for (empresa_id,) in empresas:
            try:
                informe = informe_semanal.construir(db, empresa_id)
                if informe is None or not informe.tiene_contenido:
                    # Un correo semanal que no dice nada enseña a ignorar el
                    # correo semanal.
                    sin_contenido += 1
                    continue

                usuarios = _destinatarios(db, empresa_id)
                if not usuarios:
                    sin_destinatarios += 1
                    continue

                asunto = informe_render.asunto(informe)
                texto = informe_render.render_texto(informe)
                html = informe_render.render_html(informe)
                # El PDF se genera UNA vez por empresa, no por destinatario: el
                # contenido es el mismo y componerlo cuesta.
                pdf = Adjunto(
                    nombre=informe_render.nombre_pdf(informe),
                    contenido=informe_render.render_pdf(informe),
                )

                for usuario in usuarios:
                    if send_email(
                        to=usuario.email,
                        subject=asunto,
                        body=texto,
                        html_body=html,
                        adjuntos=[pdf],
                    ):
                        enviados += 1
                    else:
                        fallidos += 1
            except Exception as exc:
                logger.error("[Informe] empresa %s falló: %s", empresa_id, exc, exc_info=True)
                fallidos += 1

        resumen = {
            "enviados": enviados,
            "sin_contenido": sin_contenido,
            "sin_destinatarios": sin_destinatarios,
            "fallidos": fallidos,
        }
        logger.info("[Informe] %s", resumen)
        return resumen
    finally:
        db.close()
