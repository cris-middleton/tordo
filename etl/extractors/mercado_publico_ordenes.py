"""
Extractor for Mercado Público Órdenes de Compra API
"""
import requests
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from etl.extractors.base import BaseExtractor
from etl.config import config


class MercadoPublicoOrdenesExtractor(BaseExtractor):
    """Extractor for Órdenes de Compra from Mercado Público API"""
    
    def __init__(self, config_dict: Dict[str, Any] = None):
        super().__init__(config_dict)
        from etl.config import config as etl_config
        if config_dict:
            self.base_url = config_dict.get("MERCADO_PUBLICO_URL", etl_config.MERCADO_PUBLICO_URL)
            self.ticket = config_dict.get("MERCADO_PUBLICO_TICKET", etl_config.MERCADO_PUBLICO_TICKET)
            self.max_retries = config_dict.get("MAX_RETRIES", etl_config.MAX_RETRIES)
            self.retry_delay = config_dict.get("RETRY_DELAY", etl_config.RETRY_DELAY)
        else:
            self.base_url = etl_config.MERCADO_PUBLICO_URL
            self.ticket = etl_config.MERCADO_PUBLICO_TICKET
            self.max_retries = etl_config.MAX_RETRIES
            self.retry_delay = etl_config.RETRY_DELAY
        # Correct endpoint: ordenesdecompra.json (all lowercase, no spaces)
        self.api_url = f"{self.base_url}/servicios/v1/publico/ordenesdecompra.json"
    
    def _format_date(self, date_str: str) -> str:
        """Convert YYYY-MM-DD to DDMMYYYY format"""
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            return dt.strftime("%d%m%Y")
        except ValueError:
            # If already in DDMMYYYY format, return as is
            return date_str
    
    def _make_request(self, params: Dict[str, Any], retry_count: int = 0) -> Optional[Dict[str, Any]]:
        """Make HTTP request with retry logic"""
        # Add ticket to query parameters, not headers
        params_with_ticket = params.copy()
        params_with_ticket["ticket"] = self.ticket
        
        headers = {
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(
                self.api_url,
                params=params_with_ticket,
                headers=headers,
                timeout=120  # Increased timeout for large responses
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            if retry_count < self.max_retries:
                self.logger.warning(
                    f"Request failed, retrying ({retry_count + 1}/{self.max_retries}): {str(e)}"
                )
                time.sleep(self.retry_delay)
                return self._make_request(params, retry_count + 1)
            else:
                self.logger.error(f"Request failed after {self.max_retries} retries: {str(e)}")
                return None
    
    def extract(self, fecha_desde: Optional[str] = None, fecha_hasta: Optional[str] = None, **kwargs) -> List[Dict[str, Any]]:
        """
        Extract órdenes de compra from Mercado Público API
        
        Args:
            fecha_desde: Start date in format YYYY-MM-DD (defaults to today)
            fecha_hasta: End date in format YYYY-MM-DD (defaults to today)
        
        Returns:
            List of órdenes de compra records
        """
        # Default to today if not specified
        if not fecha_desde:
            fecha_desde = datetime.now().strftime("%Y-%m-%d")
        if not fecha_hasta:
            fecha_hasta = datetime.now().strftime("%Y-%m-%d")
        
        self.logger.info(f"Extracting órdenes de compra from {fecha_desde} to {fecha_hasta}")
        
        all_records = []
        
        # Convert dates to DDMMYYYY format
        fecha_desde_formatted = self._format_date(fecha_desde)
        fecha_hasta_formatted = self._format_date(fecha_hasta)
        
        # Process each date in the range
        from datetime import timedelta
        current_date = datetime.strptime(fecha_desde, "%Y-%m-%d")
        end_date = datetime.strptime(fecha_hasta, "%Y-%m-%d")
        
        while current_date <= end_date:
            fecha_formatted = current_date.strftime("%d%m%Y")
            self.logger.info(f"Fetching data for date: {fecha_formatted}")
            
            params = {
                "fecha": fecha_formatted
            }
            
            data = self._make_request(params)
            
            if not data:
                current_date += timedelta(days=1)
                continue
            
            # Extract records from response
            # API structure: {"Cantidad": X, "FechaCreacion": "...", "Version": "...", "Listado": [...]}
            records = []
            if isinstance(data, dict):
                # Check if it's an error response
                if data.get("Codigo") == 404:
                    self.logger.warning(f"OrdenCompra API returned 404 for date {fecha_formatted}")
                else:
                    # Extract from Listado key
                    records = data.get("Listado", [])
                    if records:
                        self.logger.info(f"API returned {data.get('Cantidad', len(records))} total records for date {fecha_formatted}")
            elif isinstance(data, list):
                # Direct array response (fallback)
                records = data
                if records:
                    self.logger.info(f"API returned {len(records)} total records for date {fecha_formatted}")
            
            if records:
                # Filter valid records
                valid_records = []
                invalid_count = 0
                for r in records:
                    if self.validate(r):
                        valid_records.append(r)
                    else:
                        invalid_count += 1
                        if invalid_count <= 3:  # Log first 3 invalid records for debugging
                            self.logger.debug(f"Invalid record (missing fields): {list(r.keys())}")
                
                all_records.extend(valid_records)
                self.logger.info(f"Extracted {len(valid_records)} valid records (out of {len(records)}) for date {fecha_formatted}")
                if invalid_count > 0:
                    self.logger.warning(f"Skipped {invalid_count} invalid records for date {fecha_formatted}")
            
            current_date += timedelta(days=1)
            time.sleep(1)  # Rate limiting
        
        self.log_extraction(len(all_records), "Mercado Público Órdenes de Compra")
        return all_records
    
    def validate(self, data: Dict[str, Any]) -> bool:
        """
        Validate extracted data record
        
        Args:
            data: Single data record to validate
            
        Returns:
            True if valid, False otherwise
        """
        # Basic validation - check for required fields
        # The API uses "Codigo" not "CodigoOC"
        codigo = data.get("Codigo") or data.get("CodigoOC")
        nombre = data.get("Nombre") or data.get("nombre")
        return codigo is not None and nombre is not None

