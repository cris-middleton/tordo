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

    # Límite por IP sobre /api/v1 y /mcp, en memoria (ver app/core/limite_ip.py).
    limite_por_minuto: int = 60
    # Secreto compartido con el servidor de Next. Es una credencial: SIN valor
    # por defecto. Vacío, la API no exime ni cree a nadie (falla cerrada para la
    # confianza) y avisa al arrancar en producción.
    proxy_secreto: str | None = None
    # Sólo detrás de un borde que REESCRIBE X-Forwarded-For (Railway).
    confiar_x_forwarded_for: bool = False

    # CORS settings
    cors_origins: List[str] | str = ["http://localhost:3000", "http://localhost:3001"]

    # Lista blanca de `Host` del MCP (coma-separada). La protección contra DNS
    # rebinding vuelve a estar encendida desde que el MCP es anónimo: ver
    # `app/mcp/servidor.py::seguridad_de_transporte`. No es una credencial, así
    # que lleva valor por defecto; en producción tiene que incluir el dominio.
    mcp_hosts_permitidos: List[str] | str = ["localhost", "127.0.0.1"]

    @field_validator("mcp_hosts_permitidos", mode="before")
    @classmethod
    def parse_mcp_hosts(cls, v):
        """`MCP_HOSTS_PERMITIDOS=a.cl,b.cl` → `["a.cl", "b.cl"]`."""
        if isinstance(v, str):
            return [host.strip() for host in v.split(",") if host.strip()]
        return v

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

    # Dónde deja el ETL los parquets. La API no los lee (BI desde `analytics.*` en
    # Postgres); sólo lo usa `tests/golden/capturar_golden_bi.py`.
    analytics_data_path: str = "etl/data/analytics"

    # Feature flags — disable unreleased features without code changes
    feature_analytics: bool = False  # BI pre-postulación (requires parquet pipeline)

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"  # Ignore extra fields in .env file


settings = Settings()
