from app.db import Base
from app.models.licitacion import Licitacion
from app.models.licitacion_detalle import LicitacionDetalle

__all__ = [
    "Base",
    "Licitacion",
    "LicitacionDetalle",
]
