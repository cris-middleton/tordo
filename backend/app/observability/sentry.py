"""Inicialización de Sentry.

Sin `SENTRY_DSN` no hace nada — así el desarrollo local y los tests no mandan
eventos a ningún lado y no hace falta condicionar nada en el código.
"""

from __future__ import annotations

import logging

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.scrubber import DEFAULT_DENYLIST, EventScrubber

from app.core.limite_ip import CABECERA_SECRETO, CABECERA_VISITANTE

logger = logging.getLogger(__name__)

#: Cabeceras que Sentry no conoce y que no pueden salir del sistema.
#: `send_default_pii=False` sólo filtra su propia lista (`cookie`,
#: `x-forwarded-for`…): el secreto del proxy y la IP del visitante viajaban en
#: cada error y en cada traza muestreada. Con el secreto, cualquiera que leyera
#: el proyecto de Sentry podía eximirse del límite por IP.
CABECERAS_PRIVADAS = [CABECERA_SECRETO.lower(), CABECERA_VISITANTE.lower()]

# Rutas que no aportan nada como transacciones y sólo inflan la cuota.
_IGNORED_TRANSACTIONS = {"/health/", "/health/ready", "/metrics"}


def _traces_sampler(sampling_context: dict) -> float:
    asgi_scope = sampling_context.get("asgi_scope") or {}
    if asgi_scope.get("path") in _IGNORED_TRANSACTIONS:
        return 0.0
    return float(sampling_context.get("parent_sampled") or 0.1)


def setup_sentry(
    *,
    dsn: str | None,
    environment: str,
    release: str | None = None,
) -> None:
    if not dsn:
        logger.info("Sentry no configurado (SENTRY_DSN vacío) — se omite")
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            SqlalchemyIntegration(),
        ],
        traces_sampler=_traces_sampler,
        # No enviar cuerpos de petición ni cabeceras: pasan RUTs, documentos y
        # tokens. Los datos de los usuarios no salen del sistema.
        send_default_pii=False,
        event_scrubber=EventScrubber(denylist=DEFAULT_DENYLIST + CABECERAS_PRIVADAS),
        max_request_body_size="never",
    )
    logger.info("Sentry inicializado (environment=%s)", environment)
