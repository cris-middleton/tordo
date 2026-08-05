import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class BaseTransformer(ABC):
    """Base class for all data transformers"""

    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform a single data record

        Args:
            data: Raw data record to transform

        Returns:
            Transformed data record
        """
        pass

    def transform_batch(self, data_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Transform a batch of data records

        Args:
            data_list: List of raw data records

        Returns:
            List of transformed data records
        """
        return [self.transform(record) for record in data_list]

    def validate_transformed(self, data: Dict[str, Any]) -> bool:
        """
        Validate transformed data

        Args:
            data: Transformed data record

        Returns:
            True if valid, False otherwise
        """
        return True  # Override in subclasses if needed
