from pydantic_settings import BaseSettings
from typing import Optional, List


class Settings(BaseSettings):
    # App settings
    app_name: str = "SaaS Licitaciones Públicas Chile"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Database settings
    database_url: str = "postgresql://postgres:postgres@localhost:5432/licitaciones"
    database_echo: bool = False
    
    # Redis settings
    redis_url: str = "redis://redis:6379/0"
    
    # Security settings
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # CORS settings
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:3001"]
    
    # ETL settings
    etl_schedule_interval: int = 3600  # seconds
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

