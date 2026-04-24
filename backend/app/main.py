import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings
from app.api import health, data_inspection, auth, users, tenders, alerts, empresas
from app.api import documentos, postulaciones, estado_habil, bi, dashboard, billing, webhooks

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BIRateLimitMiddleware(BaseHTTPMiddleware):
    """60 requests/minute per IP on /api/bi/* — fail-open when Redis unavailable."""

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/bi/"):
            return await call_next(request)

        ip = (request.client.host if request.client else None) or "unknown"
        minute = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
        key = f"rl:bi:{ip}:{minute}"

        try:
            import redis as _redis
            r = _redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=1)
            count = r.incr(key)
            if count == 1:
                r.expire(key, 60)
            if count > 60:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Demasiadas solicitudes. Intenta de nuevo en un minuto."},
                    headers={"Retry-After": "60"},
                )
        except Exception as exc:
            logger.warning("BIRateLimitMiddleware Redis error: %s", exc)

        return await call_next(request)


app.add_middleware(BIRateLimitMiddleware)

# Include routers
app.include_router(health.router)
app.include_router(data_inspection.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tenders.router)
app.include_router(alerts.router)
app.include_router(empresas.router)
app.include_router(documentos.router)
app.include_router(documentos.file_router)
app.include_router(postulaciones.router)
app.include_router(estado_habil.router)
app.include_router(bi.router)
app.include_router(dashboard.router)
app.include_router(billing.router)
app.include_router(webhooks.router)


@app.on_event("startup")
async def prewarm_bi_artifacts():
    """
    Pre-load heavy BI artifacts in background so the first request doesn't
    blow up the worker with a cold load (71MB TF-IDF npz + 60MB price parquets).
    Runs non-blocking — the app becomes responsive immediately; pre-warm
    continues in background and the first /matching or /precio request just
    waits a bit longer if it hits before pre-warm finishes.
    """
    import asyncio

    if not settings.feature_analytics:
        logger.info("prewarm_bi_artifacts: feature_analytics off, skipping")
        return

    async def _warm():
        try:
            from app.services import bi_service
            # Parquets grandes usados por precio (L1 es 60MB)
            heavy_parquets = [
                "product_price_bands_L1.parquet",
                "product_price_bands_L2.parquet",
                "product_price_bands_L3.parquet",
                "tfidf_provider_index.parquet",
            ]
            for name in heavy_parquets:
                await asyncio.to_thread(bi_service._load, name)
                logger.info("prewarm_bi_artifacts: loaded %s", name)

            # TF-IDF model (joblib + npz) — requires feature_tfidf
            if settings.feature_tfidf:
                from app.services import tfidf_matcher
                await asyncio.to_thread(tfidf_matcher._load_model)
                logger.info("prewarm_bi_artifacts: TF-IDF model loaded")
            else:
                logger.info("prewarm_bi_artifacts: feature_tfidf off, skipping TF-IDF")

            logger.info("prewarm_bi_artifacts: done — BI artifacts cached in memory")
        except Exception as exc:
            logger.error("prewarm_bi_artifacts failed: %s", exc, exc_info=True)

    # Fire-and-forget — no bloquea el startup
    asyncio.create_task(_warm())
    logger.info("prewarm_bi_artifacts: scheduled background warm-up")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "status": "active",
        "message": "Tordo API",
        "version": settings.app_version,
        "docs": "/docs",
        "redoc": "/redoc"
    }
