import os

from dotenv import load_dotenv

load_dotenv()


class ETLConfig:
    """Configuration for ETL processes"""

    # Database settings
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/licitaciones"
    )

    # Data source settings
    CHILECOMPRA_API_URL: str | None = os.getenv("CHILECOMPRA_API_URL")
    MERCADO_PUBLICO_URL: str = os.getenv("MERCADO_PUBLICO_URL") or "https://api.mercadopublico.cl"
    # Set MERCADO_PUBLICO_TICKET in your .env file.
    # Get your ticket at: https://api.mercadopublico.cl
    MERCADO_PUBLICO_TICKET: str = os.getenv("MERCADO_PUBLICO_TICKET", "")

    # ETL settings
    BATCH_SIZE: int = int(os.getenv("ETL_BATCH_SIZE", "100"))
    MAX_RETRIES: int = int(os.getenv("ETL_MAX_RETRIES", "3"))
    RETRY_DELAY: int = int(os.getenv("ETL_RETRY_DELAY", "5"))  # seconds

    # Scheduling
    SCHEDULE_INTERVAL: int = int(os.getenv("ETL_SCHEDULE_INTERVAL", "3600"))  # seconds

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str | None = os.getenv("LOG_FILE", "etl.log")

    # Rate limiting
    REQUESTS_PER_SECOND: float = float(os.getenv("ETL_REQUESTS_PER_SECOND", "1.0"))


config = ETLConfig()
