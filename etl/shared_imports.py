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
# Este valor es inerte: el ETL no atiende peticiones HTTP. (`SECRET_KEY` también
# se rellenaba aquí; desapareció con las cuentas en el pivote público.)
if "CORS_ORIGINS" not in os.environ:
    os.environ["CORS_ORIGINS"] = '["http://localhost:3000"]'

# Now import models (these may trigger config loading)
from app.db import Base

# El vocabulario de mecanismos de compra se importa, no se copia: el ETL decide
# el tipo al transformar y la API filtra por él, así que dos copias se
# desincronizan en cuanto ChileCompra añada un mecanismo.
from app.models.convocatoria import TipoConvocatoria, convocatoria_de_orden
from app.models.licitacion import Licitacion
from app.models.licitacion_detalle import LicitacionDetalle
from app.models.licitacion_historial import LicitacionHistorial
from app.models.orden_compra import OrdenCompra
from app.models.orden_compra_detalle import OrdenCompraDetalle
from app.models.orden_compra_historial import OrdenCompraHistorial

__all__ = [
    "TipoConvocatoria",
    "convocatoria_de_orden",
    "Licitacion",
    "LicitacionDetalle",
    "LicitacionHistorial",
    "OrdenCompra",
    "OrdenCompraDetalle",
    "OrdenCompraHistorial",
    "Base",
]
