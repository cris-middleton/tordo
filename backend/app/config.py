from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional, List, Union


class Settings(BaseSettings):
    # App settings
    app_name: str = "Tordo"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Database settings
    # Supports local PostgreSQL, AWS RDS, or Google Cloud SQL
    # For AWS RDS: postgresql://<usuario>:<contraseña>@<host>:5432/dbname
    # For Cloud SQL: postgresql://<usuario>:<contraseña>@/<base>?host=/cloudsql/project:region:instance
    database_url: str = "postgresql://postgres:postgres@localhost:5432/licitaciones"
    # Sync URL for Alembic (psycopg2). When unset, database_url is used.
    # Required once FastAPI migrates to asyncpg (postgresql+asyncpg://...).
    database_url_sync: Optional[str] = None
    database_echo: bool = False
    
    # Redis settings
    redis_url: str = "redis://redis:6379/0"
    
    # Security settings
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # CORS settings
    cors_origins: Union[List[str], str] = ["http://localhost:3000", "http://localhost:3001"]
    
    @field_validator('cors_origins', mode='before')
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
                return [origin.strip() for origin in v.split(',') if origin.strip()]
        return v

    @field_validator('database_url', mode='before')
    @classmethod
    def ensure_asyncpg_driver(cls, v: str) -> str:
        """Auto-upgrade postgresql:// → postgresql+asyncpg:// for async SQLAlchemy."""
        if isinstance(v, str):
            if v.startswith('postgresql://'):
                return v.replace('postgresql://', 'postgresql+asyncpg://', 1)
            if v.startswith('postgres://'):
                return v.replace('postgres://', 'postgresql+asyncpg://', 1)
        return v
    
    # ETL settings
    etl_schedule_interval: int = 3600  # seconds
    
    # Email settings (for alert notifications)
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_use_tls: bool = True
    
    # Frontend URL (for alert links in emails)
    frontend_url: Optional[str] = "http://localhost:3000"

    # Storage (documents)
    storage_backend: str = "local"          # "local" | "s3"
    local_storage_path: str = "./documents"
    aws_bucket: Optional[str] = None
    aws_region: str = "us-east-1"
    # S3-compatible endpoint (MinIO in dev, leave blank for real AWS)
    s3_endpoint_url: Optional[str] = None
    # Public-facing endpoint for presigned URLs (may differ from internal Docker URL)
    s3_endpoint_url_public: Optional[str] = None

    # Estado hábil CSV URL (ChileCompra open data)
    estado_habil_csv_url: str = ""

    # ETL workspace (for subprocess calls from Celery)
    etl_workspace: str = "/workspace"

    # Analytics — path where pre-computed parquets live (relative to repo root or absolute)
    analytics_data_path: str = "etl/data/analytics"

    # Stripe billing
    stripe_secret_key: Optional[str] = None
    stripe_publishable_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    stripe_price_pro: Optional[str] = None        # Stripe price ID for Pro plan
    stripe_price_enterprise: Optional[str] = None  # Stripe price ID for Enterprise plan

    # Google OAuth
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"

    # Twilio WhatsApp
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_whatsapp_from: str = "whatsapp:+14155238886"  # Twilio sandbox number

    # Feature flags — disable unreleased features without code changes
    feature_analytics: bool = False       # BI pre-postulación (requires parquet pipeline)
    feature_billing: bool = False         # Stripe billing (requires Stripe keys)
    feature_estado_habil: bool = True     # Estado hábil monitoring
    feature_documentos: bool = True       # Document management
    feature_checklist: bool = True        # Postulation checklists
    feature_tfidf: bool = False           # TF-IDF semantic matching (requires trained model)
    feature_whatsapp: bool = False        # WhatsApp notifications via Twilio
    analytics_enabled: bool = True        # Legacy /dashboard/analytics page visibility

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"  # Ignore extra fields in .env file


settings = Settings()

