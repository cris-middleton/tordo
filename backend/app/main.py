from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import health, data_inspection, auth, users, tenders, alerts

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

# Include routers
app.include_router(health.router)
app.include_router(data_inspection.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tenders.router)
app.include_router(alerts.router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "SaaS Licitaciones Públicas Chile API",
        "version": settings.app_version,
        "docs": "/docs"
    }
