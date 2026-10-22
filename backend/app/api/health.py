import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


# HEAD también: es lo que mandan muchos monitores de disponibilidad, y respondía
# 405, que un monitor lee como «caído».
@router.api_route("/", methods=["GET", "HEAD"])
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now(UTC).isoformat(), "service": "backend"}


@router.api_route("/ready", methods=["GET", "HEAD"])
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """Readiness check endpoint for Kubernetes/Docker"""
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ready", "timestamp": datetime.now(UTC).isoformat()}
    except Exception:
        # El texto del error se queda en el log: trae el host interno de la
        # base, su usuario y mensajes del driver, y esta ruta es pública.
        logger.exception("readiness: la base no responde")
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "timestamp": datetime.now(UTC).isoformat()},
        )
