# API routes
from app.api import (
    alerts,
    auth,
    bi,
    billing,
    dashboard,
    data_inspection,
    documentos,
    empresas,
    estado_habil,
    health,
    postulaciones,
    tenders,
    users,
    webhooks,
)
from app.api.versionado import PREFIJO_API, VERSION_API

__all__ = ["PREFIJO_API", "VERSION_API"]
