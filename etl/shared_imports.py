"""
Shared imports module to handle backend imports cleanly
Avoids polluting sys.path in multiple files
"""
import sys
import os
from pathlib import Path

# Add backend to path once
BACKEND_PATH = Path(__file__).parent.parent / "backend"
if str(BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(BACKEND_PATH))

# Prevent backend config validation from failing ETL
# Set a dummy CORS_ORIGINS if not set
if 'CORS_ORIGINS' not in os.environ:
    os.environ['CORS_ORIGINS'] = '["http://localhost:3000"]'

# Now import models (these may trigger config loading)
from app.models.licitacion import Licitacion
from app.models.licitacion_detalle import LicitacionDetalle
from app.models.licitacion_historial import LicitacionHistorial
from app.models.orden_compra import OrdenCompra
from app.models.orden_compra_detalle import OrdenCompraDetalle
from app.models.orden_compra_historial import OrdenCompraHistorial
from app.db import Base

__all__ = [
    "Licitacion",
    "LicitacionDetalle",
    "LicitacionHistorial",
    "OrdenCompra",
    "OrdenCompraDetalle",
    "OrdenCompraHistorial",
    "Base",
]

