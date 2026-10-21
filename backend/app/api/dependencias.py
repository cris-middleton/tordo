"""Comprobaciones que comparten varios routers.

Vive aparte para que un router no tenga que importar de otro: `publico.py`
necesita la misma guarda que `bi.py`, y sacarla de ahí obligaba a importar un
nombre privado de un módulo hermano.
"""

from fastapi import HTTPException

from app.config import settings


def requiere_analytics() -> None:
    """503 si el módulo de analytics está apagado (lo normal en desarrollo)."""
    if not settings.feature_analytics:
        raise HTTPException(
            status_code=503,
            # En español como el resto de errores, y accionable para quien
            # despliega (docs/DESPLIEGUE.md tiene el paso completo).
            detail=(
                "Los análisis están apagados en este servidor: falta "
                "FEATURE_ANALYTICS=true y una corrida semanal materializada."
            ),
        )
