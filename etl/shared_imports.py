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

# Now import models (these may trigger config loading).
# El reloj del producto se importa igual: una sola definición de «hora de Chile».
from app.core.tiempo import ZONA_CHILE
from app.db import Base

# El vocabulario de mecanismos de compra se importa, no se copia: el ETL decide
# el tipo al transformar y la API filtra por él, así que dos copias se
# desincronizan en cuanto ChileCompra añada un mecanismo.
from app.models.convocatoria import TipoConvocatoria
from app.models.licitacion import Licitacion
from app.models.licitacion_detalle import LicitacionDetalle

# La regla de la firma de producto se importa, no se copia: el ETL agrupa por
# ella y la búsqueda de productos de la API busca con ella, así que dos copias
# harían que una búsqueda dejara de encontrar firmas sin que nada fallara.
from app.utils.firma import FUERA_DE_TOKEN, MAX_TOKENS, MIN_TOKEN, RUIDO

# La normalización del RUT se importa igual: el ETL escribe la clave de las
# tablas de la Compra Ágil y la API une contra ella.
from app.utils.rut import CEROS_INICIALES, FUERA_DE_RUT, normalizar_rut

__all__ = [
    "CEROS_INICIALES",
    "FUERA_DE_RUT",
    "FUERA_DE_TOKEN",
    "MAX_TOKENS",
    "MIN_TOKEN",
    "RUIDO",
    "ZONA_CHILE",
    "normalizar_rut",
    "TipoConvocatoria",
    "Licitacion",
    "LicitacionDetalle",
    "Base",
]
