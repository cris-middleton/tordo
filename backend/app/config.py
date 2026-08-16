from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App settings
    app_name: str = "Tordo"
    app_version: str = "1.0.0"
    debug: bool = False
    environment: str = "development"  # development | staging | production

    # Observabilidad
    sentry_dsn: str | None = None  # vacío = Sentry desactivado
    log_level: str = "INFO"
    log_json: bool = True  # False = texto plano legible en local

    # Database settings
    # Supports local PostgreSQL, AWS RDS, or Google Cloud SQL
    # For AWS RDS: postgresql://<usuario>:<contraseña>@<host>:5432/dbname
    # For Cloud SQL: postgresql://<usuario>:<contraseña>@/<base>?host=/cloudsql/project:region:instance
    database_url: str = "postgresql://postgres:postgres@localhost:5432/licitaciones"
    # Sync URL for Alembic (psycopg2). When unset, database_url is used.
    # Required once FastAPI migrates to asyncpg (postgresql+asyncpg://...).
    database_url_sync: str | None = None
    database_echo: bool = False

    # Redis settings
    redis_url: str = "redis://redis:6379/0"

    # Security settings
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    # El acceso dura poco a propósito: es un JWT y no se puede revocar. Lo que
    # sostiene la sesión es el token de refresco, que sí vive en la base y sí se
    # puede revocar.
    refresh_token_expire_days: int = 30
    password_reset_expire_minutes: int = 60

    # CORS settings
    cors_origins: List[str] | str = ["http://localhost:3000", "http://localhost:3001"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS_ORIGINS from env (can be comma-separated string or JSON list)"""
        if isinstance(v, str):
            # Try to parse as JSON first
            import json

            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                # Fall back to comma-separated
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("database_url", mode="before")
    @classmethod
    def ensure_asyncpg_driver(cls, v: str) -> str:
        """Auto-upgrade postgresql:// → postgresql+asyncpg:// for async SQLAlchemy."""
        if isinstance(v, str):
            if v.startswith("postgresql://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    # ETL settings
    etl_schedule_interval: int = 3600  # seconds

    # Email settings (for alert notifications)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_use_tls: bool = True

    # Frontend URL (for alert links in emails)
    frontend_url: str | None = "http://localhost:3000"

    # Storage (documents)
    storage_backend: str = "local"  # "local" | "s3"
    local_storage_path: str = "./documents"
    aws_bucket: str | None = None
    aws_region: str = "us-east-1"
    # S3-compatible endpoint (MinIO in dev, leave blank for real AWS)
    s3_endpoint_url: str | None = None
    # Public-facing endpoint for presigned URLs (may differ from internal Docker URL)
    s3_endpoint_url_public: str | None = None

    # Estado hábil CSV URL (ChileCompra open data)
    estado_habil_csv_url: str = ""

    # ETL workspace (for subprocess calls from Celery)
    etl_workspace: str = "/workspace"

    # Analytics — path where pre-computed parquets live (relative to repo root or absolute)
    analytics_data_path: str = "etl/data/analytics"

    # Pasarela de pago: "mercadopago" | "stripe". Ver app/domain/billing.py y
    # app/infra/billing/. El ICP paga con medios locales, por eso la principal es
    # MercadoPago (ADR 0008); Stripe se conserva y es el que mantiene honesto al
    # puerto — un puerto con una sola implementación no demuestra nada.
    billing_provider: str = "mercadopago"

    # Stripe billing
    stripe_secret_key: str | None = None
    stripe_publishable_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_pro: str | None = None  # Stripe price ID for Pro monthly
    stripe_price_pro_annual: str | None = None  # Stripe price ID for Pro annual
    stripe_price_enterprise: str | None = None  # Stripe price ID for Enterprise plan

    # MercadoPago (ADR 0008). Los planes se crean una vez en MercadoPago
    # (`POST /preapproval_plan`) y aquí se guardan sus ids, igual que los price
    # ids de Stripe. El token de acceso es el de producción o el de prueba según
    # el entorno; MercadoPago distingue por el propio token.
    mercadopago_access_token: str | None = None
    mercadopago_webhook_secret: str | None = None
    mercadopago_plan_pro: str | None = None  # preapproval_plan_id — Pro mensual
    mercadopago_plan_pro_annual: str | None = None  # preapproval_plan_id — Pro anual
    mercadopago_plan_enterprise: str | None = None  # preapproval_plan_id — Enterprise

    # Google OAuth
    google_client_id: str | None = None
    google_client_secret: str | None = None
    # Tiene que coincidir EXACTAMENTE con lo registrado en Google Cloud Console:
    # Google compara la cadena completa y rechaza el intercambio si difiere en un
    # carácter. Cambió al versionar la API (ADR 0009) — si el login con Google
    # deja de funcionar tras un despliegue, esto es lo primero que hay que mirar.
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"

    # Twilio WhatsApp
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_whatsapp_from: str = "whatsapp:+14155238886"  # Twilio sandbox number

    # Feature flags — disable unreleased features without code changes
    feature_analytics: bool = False  # BI pre-postulación (requires parquet pipeline)
    feature_billing: bool = False  # Cobro (requiere credenciales de la pasarela)
    feature_estado_habil: bool = True  # Estado hábil monitoring
    feature_documentos: bool = True  # Document management
    feature_checklist: bool = True  # Postulation checklists
    feature_tfidf: bool = False  # TF-IDF semantic matching (requires trained model)
    feature_whatsapp: bool = False  # WhatsApp notifications via Twilio
    analytics_enabled: bool = True  # Legacy /dashboard/analytics page visibility

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"  # Ignore extra fields in .env file


settings = Settings()
