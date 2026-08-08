"""Acceso a empresas desde código SÍNCRONO.

Existe porque los webhooks y las tareas de Celery corren sobre `SyncSessionLocal`
y no pueden usar el repositorio async. Mismo criterio que `analytics_sync.py`:
dos implementaciones, una por tipo de sesión, en vez de un puente que convierta
una en otra.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.models.empresa import Empresa

logger = logging.getLogger(__name__)


def buscar_por_customer_id(db, customer_id: str) -> Empresa | None:
    return db.query(Empresa).filter(Empresa.billing_customer_id == customer_id).first()


def buscar_por_id_textual(db, empresa_id: str) -> Empresa | None:
    """Por un id que llega como texto desde el proveedor de pagos.

    Si no es un UUID válido se registra y se devuelve `None`: un metadata
    corrupto no debería tumbar el webhook, porque el proveedor lo reintentaría
    en bucle.
    """
    try:
        uuid = UUID(empresa_id)
    except ValueError:
        logger.error("empresa_id inválido en el evento: %s", empresa_id)
        return None
    return db.query(Empresa).filter(Empresa.id == uuid).first()
