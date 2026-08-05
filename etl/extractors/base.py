import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


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
