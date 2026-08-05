"""Observabilidad: logging estructurado y Sentry.

Ambos se configuran una sola vez, desde `app.main`, antes de servir tráfico.
Todo es opt-in por configuración: sin `SENTRY_DSN` no se inicializa Sentry, y
con `LOG_JSON=false` el logging queda en texto plano legible para desarrollo.
"""

from app.observability.logging import request_id_ctx, setup_logging
from app.observability.sentry import setup_sentry

__all__ = ["request_id_ctx", "setup_logging", "setup_sentry"]
