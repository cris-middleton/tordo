"""
Shared imports module to handle backend imports cleanly
Avoids polluting sys.path in multiple files
"""

import os
import sys
from pathlib import Path

# Add backend to path once
BACKEND_PATH = Path(__file__).parent.parent / "backend"
if str(BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(BACKEND_PATH))

# El ETL importa los modelos del backend, y eso instancia app.config.Settings.
# Settings tiene campos obligatorios que sólo tienen sentido en la API; sin
# valor, un `import` del ETL revienta con ValidationError.
#
# CORS_ORIGINS ya estaba contemplado. SECRET_KEY no, y es obligatorio y sin
# default: el contenedor del ETL no lo recibe en docker-compose, así que hasta
# ahora sólo funcionaba si por casualidad había un .env en la raíz que
# load_dotenv() alcanzara a leer.
#
# Estos valores son inertes: el ETL no firma tokens ni atiende peticiones HTTP.
if "CORS_ORIGINS" not in os.environ:
    os.environ["CORS_ORIGINS"] = '["http://localhost:3000"]'
if "SECRET_KEY" not in os.environ:
    os.environ["SECRET_KEY"] = "etl-no-firma-tokens"

# Now import models (these may trigger config loading)
from app.db import Base
from app.models.licitacion import Licitacion
from app.models.licitacion_detalle import LicitacionDetalle
from app.models.licitacion_historial import LicitacionHistorial
from app.models.orden_compra import OrdenCompra
from app.models.orden_compra_detalle import OrdenCompraDetalle
from app.models.orden_compra_historial import OrdenCompraHistorial

__all__ = [
    "Licitacion",
    "LicitacionDetalle",
    "LicitacionHistorial",
    "OrdenCompra",
    "OrdenCompraDetalle",
    "OrdenCompraHistorial",
    "Base",
]
