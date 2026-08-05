"""Logging estructurado.

En producción emite una línea JSON por evento, con `request_id` incluido
automáticamente en todos los registros de una misma petición. Eso es lo que
permite pasar del `request_id` que ve el usuario en un error 500 al traceback
completo del servidor.

En desarrollo (`LOG_JSON=false`) el formato es texto plano legible.
"""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar

from pythonjsonlogger import jsonlogger

# El middleware lo setea por petición; las tareas de Celery pueden setearlo por job.
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)


class RequestIDFilter(logging.Filter):
    """Inyecta el request_id del contexto en cada registro."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get() or "-"
        return True


class JsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        # Asignación directa, no setdefault: al declarar `level`/`logger` en el
        # formato, jsonlogger ya los deja puestos en None y setdefault no los pisa.
        log_record["level"] = record.levelname
        log_record["logger"] = record.name
        log_record["request_id"] = getattr(record, "request_id", "-")
        log_record.pop("levelname", None)


def setup_logging(*, level: str = "INFO", json_output: bool = True) -> None:
    """Configura el logging raíz. Idempotente: reemplaza los handlers existentes."""
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIDFilter())

    if json_output:
        handler.setFormatter(JsonFormatter("%(asctime)s %(level)s %(logger)s %(message)s"))
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(request_id)s] %(levelname)-8s %(name)s: %(message)s")
        )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # uvicorn trae sus propios handlers; se los quitamos para que propaguen al raíz
    # y así todo salga con el mismo formato y el mismo request_id.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers = []
        logger.propagate = True
