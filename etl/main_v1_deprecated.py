"""
ETL Pipeline for Licitaciones Públicas Chile
Main entry point for ETL processes
"""
import logging
import sys
from datetime import datetime
from typing import Optional, Dict, Any
from etl.config import config
from etl.extractors import MercadoPublicoLicitacionesExtractor, MercadoPublicoOrdenesExtractor
from etl.transformers import LicitacionTransformer, OrdenCompraTransformer
from etl.loaders import DatabaseLoader

# Configure logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(config.LOG_FILE) if config.LOG_FILE else logging.StreamHandler(),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


def run_etl_licitaciones(fecha_desde: Optional[str] = None, fecha_hasta: Optional[str] = None) -> bool:
    """
    Run ETL pipeline for Licitaciones
    
    Args:
        fecha_desde: Start date in format YYYY-MM-DD (defaults to today)
        fecha_hasta: End date in format YYYY-MM-DD (defaults to today)
    
    Returns:
        True if successful, False otherwise
    """
    logger.info("=" * 60)
    logger.info("Starting ETL pipeline for Licitaciones")
    logger.info("=" * 60)
    
    try:
        # Initialize components
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
        transformer = LicitacionTransformer()
        loader = DatabaseLoader({"DATABASE_URL": config.DATABASE_URL})
        
        # Extract
        logger.info("Step 1: Extracting Licitaciones data...")
        raw_data = extractor.extract(fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
        logger.info(f"Extracted {len(raw_data)} raw records")
        
        if not raw_data:
            logger.warning("No data extracted for Licitaciones")
            return True  # Not an error, just no data
        
        # Transform
        logger.info("Step 2: Transforming Licitaciones data...")
        transformed_data = []
        for record in raw_data:
            try:
                transformed = transformer.transform(record)
                if transformer.validate_transformed(transformed):
                    transformed_data.append(transformed)
                else:
                    logger.warning(f"Invalid transformed record: {record.get('CodigoExterno', 'unknown')}")
            except Exception as e:
                logger.error(f"Error transforming record: {str(e)}")
                continue
        
        logger.info(f"Transformed {len(transformed_data)} valid records")
        
        if not transformed_data:
            logger.warning("No valid transformed records for Licitaciones")
            return True
        
        # Load
        logger.info("Step 3: Loading Licitaciones data into database...")
        loader.connect()
        try:
            loaded_count = loader.load_licitaciones(transformed_data)
            logger.info(f"Successfully loaded {loaded_count} Licitaciones records")
        finally:
            loader.disconnect()
        
        logger.info("ETL pipeline for Licitaciones completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"ETL pipeline for Licitaciones failed: {str(e)}", exc_info=True)
        return False


def run_etl_ordenes_compra(fecha_desde: Optional[str] = None, fecha_hasta: Optional[str] = None) -> bool:
    """
    Run ETL pipeline for Órdenes de Compra
    
    Args:
        fecha_desde: Start date in format YYYY-MM-DD (defaults to today)
        fecha_hasta: End date in format YYYY-MM-DD (defaults to today)
    
    Returns:
        True if successful, False otherwise
    """
    logger.info("=" * 60)
    logger.info("Starting ETL pipeline for Órdenes de Compra")
    logger.info("=" * 60)
    
    try:
        # Initialize components
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoOrdenesExtractor(extractor_config)
        transformer = OrdenCompraTransformer()
        loader = DatabaseLoader({"DATABASE_URL": config.DATABASE_URL})
        
        # Extract
        logger.info("Step 1: Extracting Órdenes de Compra data...")
        raw_data = extractor.extract(fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
        logger.info(f"Extracted {len(raw_data)} raw records")
        
        if not raw_data:
            logger.warning("No data extracted for Órdenes de Compra")
            return True  # Not an error, just no data
        
        # Transform
        logger.info("Step 2: Transforming Órdenes de Compra data...")
        transformed_data = []
        for record in raw_data:
            try:
                transformed = transformer.transform(record)
                if transformer.validate_transformed(transformed):
                    transformed_data.append(transformed)
                else:
                    logger.warning(f"Invalid transformed record: {record.get('CodigoOC', 'unknown')}")
            except Exception as e:
                logger.error(f"Error transforming record: {str(e)}")
                continue
        
        logger.info(f"Transformed {len(transformed_data)} valid records")
        
        if not transformed_data:
            logger.warning("No valid transformed records for Órdenes de Compra")
            return True
        
        # Load
        logger.info("Step 3: Loading Órdenes de Compra data into database...")
        loader.connect()
        try:
            loaded_count = loader.load_ordenes_compra(transformed_data)
            logger.info(f"Successfully loaded {loaded_count} Órdenes de Compra records")
        finally:
            loader.disconnect()
        
        logger.info("ETL pipeline for Órdenes de Compra completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"ETL pipeline for Órdenes de Compra failed: {str(e)}", exc_info=True)
        return False


def run_etl_detalles_licitaciones(limit: Optional[int] = None, skip_existing: bool = True) -> bool:
    """
    Run ETL pipeline to extract and update detailed information for Licitaciones
    
    Args:
        limit: Maximum number of records to process (None for all)
        skip_existing: Skip records that already have detailed info (default: True)
    
    Returns:
        True if successful, False otherwise
    """
    logger.info("=" * 60)
    logger.info("Starting ETL pipeline for Licitaciones detailed information")
    logger.info("=" * 60)
    
    try:
        # Initialize components
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
        loader = DatabaseLoader({"DATABASE_URL": config.DATABASE_URL})
        
        # Extract detailed info from database records
        logger.info("Extracting detailed information for Licitaciones...")
        detailed_records = extractor.extract_detalles_licitaciones_from_db(
            limit=limit,
            skip_existing_details=skip_existing
        )
        
        if not detailed_records:
            logger.info("No licitaciones to process for detailed extraction")
            return True
        
        # Update database with detailed info
        logger.info(f"Updating database with {len(detailed_records)} detailed records...")
        loader.connect()
        try:
            updated_count = loader.update_licitacion_detalles(detailed_records)
            logger.info(f"Successfully updated {updated_count} Licitaciones with detailed info")
        finally:
            loader.disconnect()
        
        logger.info("ETL pipeline for Licitaciones detailed info completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"ETL pipeline for Licitaciones detailed info failed: {str(e)}", exc_info=True)
        return False


def run_etl_detalles_ordenes_compra(limit: Optional[int] = None, skip_existing: bool = True) -> bool:
    """
    Run ETL pipeline to extract and update detailed information for Órdenes de Compra
    
    Args:
        limit: Maximum number of records to process (None for all)
        skip_existing: Skip records that already have detailed info (default: True)
    
    Returns:
        True if successful, False otherwise
    """
    logger.info("=" * 60)
    logger.info("Starting ETL pipeline for Órdenes de Compra detailed information")
    logger.info("=" * 60)
    
    try:
        # Initialize components
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoOrdenesExtractor(extractor_config)
        loader = DatabaseLoader({"DATABASE_URL": config.DATABASE_URL})
        
        # Extract detailed info from database records
        logger.info("Extracting detailed information for Órdenes de Compra...")
        detailed_records = extractor.extract_detalles_ordenes_from_db(
            limit=limit,
            skip_existing_details=skip_existing
        )
        
        if not detailed_records:
            logger.info("No órdenes de compra to process for detailed extraction")
            return True
        
        # Update database with detailed info
        logger.info(f"Updating database with {len(detailed_records)} detailed records...")
        loader.connect()
        try:
            updated_count = loader.update_orden_compra_detalles(detailed_records)
            logger.info(f"Successfully updated {updated_count} Órdenes de Compra with detailed info")
        finally:
            loader.disconnect()
        
        logger.info("ETL pipeline for Órdenes de Compra detailed info completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"ETL pipeline for Órdenes de Compra detailed info failed: {str(e)}", exc_info=True)
        return False


def run_etl_pipeline(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    extract_licitaciones: bool = True,
    extract_ordenes: bool = True,
    extract_detalles: bool = True,
    detalles_limit: Optional[int] = None
):
    """
    Run the complete ETL pipeline for both Licitaciones and Órdenes de Compra
    
    Args:
        fecha_desde: Start date in format YYYY-MM-DD (defaults to today)
        fecha_hasta: End date in format YYYY-MM-DD (defaults to today)
        extract_licitaciones: Whether to extract Licitaciones (default: True)
        extract_ordenes: Whether to extract Órdenes de Compra (default: True)
        extract_detalles: Whether to extract detailed info after daily extraction (default: True)
        detalles_limit: Limit number of records to process for details (None for all)
    """
    logger.info("=" * 60)
    logger.info("Starting complete ETL pipeline")
    logger.info("=" * 60)
    
    # Default to today if not specified
    if not fecha_desde:
        fecha_desde = datetime.now().strftime("%Y-%m-%d")
    if not fecha_hasta:
        fecha_hasta = datetime.now().strftime("%Y-%m-%d")
    
    logger.info(f"Extracting data from {fecha_desde} to {fecha_hasta}")
    
    success = True
    
    # Process Licitaciones
    if extract_licitaciones:
        if not run_etl_licitaciones(fecha_desde, fecha_hasta):
            success = False
    else:
        logger.info("Skipping Licitaciones extraction")
    
    # Process Órdenes de Compra
    if extract_ordenes:
        if not run_etl_ordenes_compra(fecha_desde, fecha_hasta):
            success = False
    else:
        logger.info("Skipping Órdenes de Compra extraction")
    
    # Extract detailed information after daily extraction
    if extract_detalles and success:
        logger.info("=" * 60)
        logger.info("Starting detailed information extraction")
        logger.info("=" * 60)
        
        if extract_licitaciones:
            if not run_etl_detalles_licitaciones(limit=detalles_limit):
                success = False
        
        if extract_ordenes:
            if not run_etl_detalles_ordenes_compra(limit=detalles_limit):
                success = False
    elif not extract_detalles:
        logger.info("Skipping detailed information extraction")
    
    if success:
        logger.info("=" * 60)
        logger.info("ETL pipeline completed successfully")
        logger.info("=" * 60)
    else:
        logger.error("=" * 60)
        logger.error("ETL pipeline completed with errors")
        logger.error("=" * 60)
    
    return success


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="ETL Pipeline for Mercado Público")
    parser.add_argument(
        "--fecha-desde",
        type=str,
        help="Start date in format YYYY-MM-DD (defaults to today)"
    )
    parser.add_argument(
        "--fecha-hasta",
        type=str,
        help="End date in format YYYY-MM-DD (defaults to today)"
    )
    parser.add_argument(
        "--skip-licitaciones",
        action="store_true",
        help="Skip Licitaciones extraction"
    )
    parser.add_argument(
        "--skip-ordenes",
        action="store_true",
        help="Skip Órdenes de Compra extraction"
    )
    parser.add_argument(
        "--skip-detalles",
        action="store_true",
        help="Skip detailed information extraction"
    )
    parser.add_argument(
        "--detalles-limit",
        type=int,
        help="Limit number of records to process for detailed extraction (default: no limit)"
    )
    parser.add_argument(
        "--only-detalles",
        action="store_true",
        help="Only extract detailed information (skip daily extraction)"
    )
    
    args = parser.parse_args()
    
    logger.info("ETL process started")
    
    # Run only detailed extraction if requested
    if args.only_detalles:
        logger.info("Running only detailed information extraction")
        success = True
        
        if not args.skip_licitaciones:
            if not run_etl_detalles_licitaciones(limit=args.detalles_limit):
                success = False
        
        if not args.skip_ordenes:
            if not run_etl_detalles_ordenes_compra(limit=args.detalles_limit):
                success = False
    else:
        # Run the complete ETL pipeline
        success = run_etl_pipeline(
            fecha_desde=args.fecha_desde,
            fecha_hasta=args.fecha_hasta,
            extract_licitaciones=not args.skip_licitaciones,
            extract_ordenes=not args.skip_ordenes,
            extract_detalles=not args.skip_detalles,
            detalles_limit=args.detalles_limit
        )
    
    if success:
        logger.info("ETL process completed successfully")
        sys.exit(0)
    else:
        logger.error("ETL process failed")
        sys.exit(1)


if __name__ == '__main__':
    main()
