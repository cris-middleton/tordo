from abc import ABC, abstractmethod
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class BaseLoader(ABC):
    """Base class for all data loaders"""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.logger = logging.getLogger(self.__class__.__name__)
    
    @abstractmethod
    def load(self, data: List[Dict[str, Any]]) -> int:
        """
        Load data into the target system
        
        Args:
            data: List of data records to load
            
        Returns:
            Number of records successfully loaded
        """
        pass
    
    @abstractmethod
    def connect(self):
        """Establish connection to target system"""
        pass
    
    @abstractmethod
    def disconnect(self):
        """Close connection to target system"""
        pass
    
    def load_batch(self, data: List[Dict[str, Any]], batch_size: int = 100) -> int:
        """
        Load data in batches
        
        Args:
            data: List of data records to load
            batch_size: Size of each batch
            
        Returns:
            Total number of records successfully loaded
        """
        total_loaded = 0
        for i in range(0, len(data), batch_size):
            batch = data[i:i + batch_size]
            loaded = self.load(batch)
            total_loaded += loaded
            self.logger.info(f"Loaded batch: {loaded}/{len(batch)} records")
        return total_loaded

