"""
Extractor for Mercado Público Licitaciones API
"""

import time
from datetime import datetime, timedelta
from typing import Any, Dict, List

import requests

from etl.extractors.base import BaseExtractor
from etl.utils import now_santiago


class MercadoPublicoLicitacionesExtractor(BaseExtractor):
    """Extractor for Licitaciones from Mercado Público API"""

    def __init__(self, config_dict: Dict[str, Any] = None):
        super().__init__(config_dict)
        from etl.config import config as etl_config

        if config_dict:
            self.base_url = config_dict.get("MERCADO_PUBLICO_URL", etl_config.MERCADO_PUBLICO_URL)
            self.ticket = config_dict.get(
                "MERCADO_PUBLICO_TICKET", etl_config.MERCADO_PUBLICO_TICKET
            )
            self.max_retries = config_dict.get("MAX_RETRIES", etl_config.MAX_RETRIES)
            self.retry_delay = config_dict.get("RETRY_DELAY", etl_config.RETRY_DELAY)
        else:
            self.base_url = etl_config.MERCADO_PUBLICO_URL
            self.ticket = etl_config.MERCADO_PUBLICO_TICKET
            self.max_retries = etl_config.MAX_RETRIES
            self.retry_delay = etl_config.RETRY_DELAY
        self.api_url = f"{self.base_url}/servicios/v1/publico/licitaciones.json"

    def _format_date(self, date_str: str) -> str:
        """Convert YYYY-MM-DD to DDMMYYYY format"""
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            return dt.strftime("%d%m%Y")
        except ValueError:
            # If already in DDMMYYYY format, return as is
            return date_str

    def _make_request(self, params: Dict[str, Any], retry_count: int = 0) -> Dict[str, Any] | None:
        """Make HTTP request with retry logic"""
        # Add ticket to query parameters, not headers
        params_with_ticket = params.copy()
        params_with_ticket["ticket"] = self.ticket

        headers = {"Content-Type": "application/json"}

        try:
            response = requests.get(
                self.api_url, params=params_with_ticket, headers=headers, timeout=30
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

    def extract(
        self, fecha_desde: str | None = None, fecha_hasta: str | None = None, **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Extract licitaciones from Mercado Público API

        Args:
            fecha_desde: Start date in format YYYY-MM-DD (defaults to today)
            fecha_hasta: End date in format YYYY-MM-DD (defaults to today)

        Returns:
            List of licitaciones records
        """
        # Default to today if not specified
        if not fecha_desde:
            fecha_desde = now_santiago().strftime("%Y-%m-%d")
        if not fecha_hasta:
            fecha_hasta = now_santiago().strftime("%Y-%m-%d")

        self.logger.info(f"Extracting licitaciones from {fecha_desde} to {fecha_hasta}")

        all_records = []

        # Process each date in the range
        current_date = datetime.strptime(fecha_desde, "%Y-%m-%d")
        end_date = datetime.strptime(fecha_hasta, "%Y-%m-%d")

        while current_date <= end_date:
            fecha_formatted = current_date.strftime("%d%m%Y")
            self.logger.info(f"Fetching data for date: {fecha_formatted}")

            params = {"fecha": fecha_formatted}

            data = self._make_request(params)

            if not data:
                current_date += timedelta(days=1)
                continue

            # Extract records from response
            # API structure: {"Cantidad": X, "Listado": [...], ...}
            records = []
            if isinstance(data, dict):
                # The API returns: {"Cantidad": X, "FechaCreacion": "...", "Version": "...", "Listado": [...]}
                records = data.get("Listado", [])
                if records:
                    self.logger.info(
                        f"API returned {data.get('Cantidad', len(records))} total records for date {fecha_formatted}"
                    )
            elif isinstance(data, list):
                records = data

            if records:
                # Filter valid records
                valid_records = [r for r in records if self.validate(r)]
                all_records.extend(valid_records)
                self.logger.info(
                    f"Extracted {len(valid_records)} records for date {fecha_formatted}"
                )

            current_date += timedelta(days=1)
            time.sleep(1)  # Rate limiting

        self.log_extraction(len(all_records), "Mercado Público Licitaciones")
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
        required_fields = ["CodigoExterno", "Nombre"]
        return all(field in data for field in required_fields)

    def extract_detalle_licitacion(self, codigo_externo: str) -> Dict[str, Any] | None:
        """
        Extract detailed information for a specific licitación

        Args:
            codigo_externo: Código externo de la licitación

        Returns:
            Detailed licitación data or None if not found
        """
        self.logger.info(f"Extracting detailed info for licitación: {codigo_externo}")

        params = {"codigo": codigo_externo}

        data = self._make_request(params)

        if not data:
            self.logger.warning(f"No detailed data found for licitación: {codigo_externo}")
            return None

        # API returns detailed structure for single record
        # Check if it's an error response
        if isinstance(data, dict):
            if data.get("Codigo") == 404 or data.get("error"):
                self.logger.warning(f"Licitaciones API returned error for codigo: {codigo_externo}")
                return None

        self.logger.info(f"Successfully extracted detailed info for licitación: {codigo_externo}")
        return data

    def extract_detalles_licitaciones_from_db(
        self, limit: int | None = None, skip_existing_details: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Extract detailed information for licitaciones from database

        Args:
            limit: Maximum number of records to process (None for all)
            skip_existing_details: Skip records that already have detailed info

        Returns:
            List of detailed licitaciones records with their database IDs
        """
        import os
        import sys

        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        # Import models from backend
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../backend"))
        from app.models.licitacion import Licitacion
        from etl.config import config as etl_config

        self.logger.info("Connecting to database to fetch licitaciones códigos...")

        try:
            # Connect to database
            engine = create_engine(etl_config.DATABASE_URL, pool_pre_ping=True)
            Session = sessionmaker(bind=engine)
            session = Session()

            # Query licitaciones
            query = session.query(
                Licitacion.id, Licitacion.codigo_externo, Licitacion.informacion_adicional
            )

            # Filter records without detailed info if requested
            if skip_existing_details:
                # Check if informacion_adicional is null or empty
                from sqlalchemy import or_

                query = query.filter(
                    or_(
                        Licitacion.informacion_adicional.is_(None),
                        Licitacion.informacion_adicional == {},
                    )
                )

            # Apply limit if specified
            if limit:
                query = query.limit(limit)

            records = query.all()

            self.logger.info(f"Found {len(records)} licitaciones to process")

            # Extract detailed info for each record
            detailed_records = []
            success_count = 0
            error_count = 0

            for db_id, codigo_externo, _ in records:
                try:
                    detalle = self.extract_detalle_licitacion(codigo_externo)
                    if detalle:
                        # Add database ID to the record for easier updating
                        detalle["_db_id"] = db_id
                        detailed_records.append(detalle)
                        success_count += 1
                    else:
                        error_count += 1

                    # Rate limiting
                    time.sleep(0.5)

                except Exception as e:
                    self.logger.error(
                        f"Error extracting details for licitación {codigo_externo}: {str(e)}"
                    )
                    error_count += 1

            session.close()
            engine.dispose()

            self.logger.info(
                f"Extracted detailed info: {success_count} successful, {error_count} errors"
            )

            return detailed_records

        except Exception as e:
            self.logger.error(f"Failed to extract detalles from database: {str(e)}")
            raise
