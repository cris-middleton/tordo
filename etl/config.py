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
    MERCADO_PUBLICO_URL: str = os.getenv("MERCADO_PUBLICO_URL") or "https://api.mercadopublico.cl"
    # Set MERCADO_PUBLICO_TICKET in your .env file.
    # Get your ticket at: https://api.mercadopublico.cl
    MERCADO_PUBLICO_TICKET: str = os.getenv("MERCADO_PUBLICO_TICKET", "")

    # Compra Ágil tiene API propia (api2.mercadopublico.cl) con autenticación
    # por cabecera y cuota diaria. El ticket se pide en el mismo sitio, así que
    # normalmente es el mismo; se deja variable propia por si ChileCompra separa
    # las cuotas. Vacío = la integración no se intenta.
    COMPRA_AGIL_TICKET: str = os.getenv("COMPRA_AGIL_TICKET", "")

    # ETL settings
    MAX_RETRIES: int = int(os.getenv("ETL_MAX_RETRIES", "3"))
    RETRY_DELAY: int = int(os.getenv("ETL_RETRY_DELAY", "5"))  # seconds

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str | None = os.getenv("LOG_FILE", "etl.log")


config = ETLConfig()
