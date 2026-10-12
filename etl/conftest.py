"""Ensure `etl/` is on sys.path so tests can import `analytics.evaluation.*`.

Y `backend/`, para los tests que comprueban desde la API lo que hizo el ETL
(`tests/test_retencion.py`: un código purgado da 404). Es la misma ruta que
añade `etl/shared_imports.py`; aquí hace falta antes, al recolectar.
"""

import sys
from pathlib import Path

ETL_ROOT = Path(__file__).resolve().parent
BACKEND_ROOT = ETL_ROOT.parent / "backend"
for ruta in (ETL_ROOT, BACKEND_ROOT):
    if str(ruta) not in sys.path:
        sys.path.insert(0, str(ruta))
