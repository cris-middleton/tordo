from fastapi import APIRouter
from datetime import datetime

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "backend"
    }


@router.get("/ready")
async def readiness_check():
    """Readiness check endpoint for Kubernetes/Docker"""
    # TODO: Add database connectivity check
    return {
        "status": "ready",
        "timestamp": datetime.utcnow().isoformat()
    }

