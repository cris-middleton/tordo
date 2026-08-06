"""BI pre-postulación: consulta los resultados del pipeline materializados en
PostgreSQL (esquema `analytics`).

Antes era un único `bi_service.py` de 1.476 líneas. Se partió por dominio; la
API pública no cambió y está fijada por el golden master en
`backend/tests/golden/bi_golden.json`.

El cómputo pesado sigue siendo batch en Polars; aquí sólo se consulta con los
filtros empujados a SQL. Ver docs/decisiones/0006-analytics-en-postgres.md.
"""

from app.services.bi._base import _load, _tabla
from app.services.bi.competencia import get_competidores, get_forecast_competidores, get_mi_posicion
from app.services.bi.comprador import get_comprador
from app.services.bi.mercado import get_descuento, get_diversificacion, get_resumen, get_sector
from app.services.bi.oportunidad import get_oportunidades, get_rubros
from app.services.bi.panel import get_licitacion_panel
from app.services.bi.precio import get_precio_producto, get_productos

# Los helpers privados (`_normalize_rut`, `_compute_cagr_...`) NO se re-exportan
# aquí: quien los necesite importa del módulo que los define. Una fachada que
# expone privados deja de marcar dónde está el límite público.
from app.services.bi.temporal import (
    _compute_cagr_rubro_desde_time_series,
    get_estacionalidad,
    get_tendencia,
    get_ventana,
)

__all__ = [
    "get_competidores",
    "get_comprador",
    "get_descuento",
    "get_diversificacion",
    "get_estacionalidad",
    "get_forecast_competidores",
    "get_licitacion_panel",
    "get_mi_posicion",
    "get_oportunidades",
    "get_precio_producto",
    "get_productos",
    "get_resumen",
    "get_rubros",
    "get_sector",
    "get_tendencia",
    "get_ventana",
]
