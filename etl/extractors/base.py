import logging
import re
from abc import ABC, abstractmethod
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


_TICKET_EN_URL = re.compile(r"(ticket=)[^&\s]+", re.IGNORECASE)


def sin_ticket(texto: object) -> str:
    """El texto con el ticket de la API tapado.

    La API clásica lleva el ticket en la URL, y `requests` mete la URL entera en
    el mensaje de cada error: un 429 dejaba la credencial escrita en los logs.
    """
    return _TICKET_EN_URL.sub(r"\1***", str(texto))


class CredencialRechazada(RuntimeError):
    """La API rechazó el ticket: inválido, vencido o sin permisos.

    No es «no hay datos» y no se reintenta. Antes cada extractor lo tragaba —la
    API clásica responde **HTTP 203** con `{"Codigo": 203, "Mensaje": "Ticket no
    válido."}`, un 2xx que pasaba por «0 registros», y Compra Ágil un 401 que se
    registraba y seguía—, así que con el ticket roto los cron terminaban bien y el
    latido daba verde. Ahora sube hasta `etl.cron.ejecutar`, que la convierte en
    `/fail` y salida distinta de cero.
    """


class ConsultaFallida(RuntimeError):
    """La API no respondió a NINGUNA de las consultas de un listado.

    No es «no hay datos»: es la API caída, o la red. Antes el listado devolvía
    `[]` —un día sin licitaciones, una hora sin Compras Ágiles— y la corrida
    terminaba bien con 0 registros. Un fallo aislado (un día de varios, una
    hora de veintiséis) se registra y se tolera: lo recoge la pasada siguiente.
    A diferencia de `CredencialRechazada`, ésta sí la recogen los `except
    Exception` del ETL: el paso devuelve `False` y la corrida termina en `/fail`.
    """


class BaseExtractor(ABC):
    """Base class for all data extractors"""

    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def extract(self, **kwargs) -> List[Dict[str, Any]]:
        """
        Extract data from the source

        Returns:
            List of dictionaries containing raw data records
        """
        pass

    @abstractmethod
    def validate(self, data: Dict[str, Any]) -> bool:
        """
        Validate extracted data record

        Args:
            data: Single data record to validate

        Returns:
            True if valid, False otherwise
        """
        pass

    def log_extraction(self, count: int, source: str):
        """Log extraction results"""
        self.logger.info(f"Extracted {count} records from {source}")
