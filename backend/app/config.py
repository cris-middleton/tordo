from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional, List, Union


class Settings(BaseSettings):
    # App settings
    app_name: str = "SaaS Licitaciones Públicas Chile"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Database settings
    # Supports local PostgreSQL, AWS RDS, or Google Cloud SQL
    # For AWS RDS: postgresql://<usuario>:<contraseña>@<host>:5432/dbname
    # For Cloud SQL: postgresql://<usuario>:<contraseña>@/<base>?host=/cloudsql/project:region:instance
    database_url: str = "postgresql://postgres:postgres@localhost:5432/licitaciones"
    database_echo: bool = False
    
    # Redis settings
    redis_url: str = "redis://redis:6379/0"
    
    # Security settings
    secret_key: str = "your-secret-key-change-in-production"
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
            except:
                # Fall back to comma-separated
                return [origin.strip() for origin in v.split(',') if origin.strip()]
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
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"  # Ignore extra fields in .env file


settings = Settings()

