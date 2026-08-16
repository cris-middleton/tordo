"""Cerrar el ciclo de las licitaciones que alguien sigue.

Corre a diario. Dos pasos, y el orden importa: primero se le vuelve a preguntar
a Mercado Público por las licitaciones seguidas que ya cerraron, y sólo después
se cruza lo que llegó contra las postulaciones. Al revés, el cruce miraría los
mismos datos de ayer.
"""

import logging
import os
import subprocess
import sys

from app.celery_app import celery_app
from app.db import SyncSessionLocal as SessionLocal
from app.services import competidores, resultados

logger = logging.getLogger(__name__)

ETL_WORKSPACE = os.environ.get("ETL_WORKSPACE", "/workspace")

#: Cuántas licitaciones se resuelven por corrida. La API de Mercado Público
#: tiene cuota, y esto compite con el ETL horario por ella: 200 al día vacía
#: cualquier cola razonable de licitaciones seguidas sin arriesgar el ETL, que
#: es lo que sostiene el resto del producto.
TOPE_POR_CORRIDA = 200


@celery_app.task(name="app.tasks.resultado_tasks.revisar_resultados")
def revisar_resultados() -> dict:
    """07:00 SCL: resolver las licitaciones seguidas que ya cerraron."""
    etl_dir = os.path.join(ETL_WORKSPACE, "etl")

    try:
        proceso = subprocess.run(
            [
                sys.executable,
                "main.py",
                "--only-resultados",
                "--detalles-limit",
                str(TOPE_POR_CORRIDA),
            ],
            cwd=etl_dir,
            capture_output=True,
            text=True,
            timeout=1800,
            env={**os.environ, "PYTHONPATH": ETL_WORKSPACE},
        )
        if proceso.returncode != 0:
            logger.error(
                "[Resultados] el ETL salió %s: %s", proceso.returncode, proceso.stderr[-1500:]
            )
    except subprocess.TimeoutExpired:
        # No se relanza: el cruce de abajo sirve igual con lo que ya haya en la
        # base. Que la API vaya lenta no puede impedir que el usuario se entere
        # de los resultados que ya conocemos.
        logger.error("[Resultados] el ETL superó los 30 minutos")
    except Exception:
        logger.exception("[Resultados] no se pudo ejecutar el ETL")

    db = SessionLocal()
    try:
        return resultados.revisar_resultados(db)
    finally:
        db.close()


@celery_app.task(name="app.tasks.resultado_tasks.revisar_competidores")
def revisar_competidores() -> dict:
    """07:15 SCL: avisar de lo que ganaron los competidores vigilados.

    Separada de `revisar_resultados` a propósito: ésta **no llama a la API de
    Mercado Público**. Trabaja sobre las órdenes de compra que el ETL ya trajo,
    así que no compite por la cuota ni depende de que aquélla haya terminado.
    """
    db = SessionLocal()
    try:
        return competidores.revisar_competidores(db)
    finally:
        db.close()
