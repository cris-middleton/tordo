"""Ensure `etl/` is on sys.path so tests can import `analytics.evaluation.*`."""
import sys
from pathlib import Path

ETL_ROOT = Path(__file__).resolve().parent
if str(ETL_ROOT) not in sys.path:
    sys.path.insert(0, str(ETL_ROOT))
