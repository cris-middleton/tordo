"""
Script de prueba para la extracción de información detallada
Este script permite probar la funcionalidad de extracción de detalles sin ejecutar el pipeline completo
"""
import sys
import os
import logging

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from etl.config import config
from etl.extractors import MercadoPublicoLicitacionesExtractor, MercadoPublicoOrdenesExtractor
from etl.loaders import DatabaseLoader

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_single_orden_detalle():
    """Test extracting details for a single orden de compra"""
    logger.info("=" * 60)
    logger.info("Testing single orden de compra detail extraction")
    logger.info("=" * 60)
    
    extractor_config = {
        "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
        "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
        "MAX_RETRIES": config.MAX_RETRIES,
        "RETRY_DELAY": config.RETRY_DELAY
    }
    
    extractor = MercadoPublicoOrdenesExtractor(extractor_config)
    
    # Test with a sample codigo (replace with actual codigo from your database)
    # You'll need to get a real codigo from your database first
    codigo_test = "2024-12345-LE20"  # REPLACE THIS
    
    logger.info(f"Extracting details for orden: {codigo_test}")
    detalle = extractor.extract_detalle_orden_compra(codigo_test)
    
    if detalle:
        logger.info("Successfully extracted details!")
        logger.info(f"Keys in response: {list(detalle.keys())}")
        # Print first few fields
        for key, value in list(detalle.items())[:5]:
            logger.info(f"  {key}: {value}")
    else:
        logger.warning("No details found or error occurred")


def test_single_licitacion_detalle():
    """Test extracting details for a single licitación"""
    logger.info("=" * 60)
    logger.info("Testing single licitación detail extraction")
    logger.info("=" * 60)
    
    extractor_config = {
        "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
        "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
        "MAX_RETRIES": config.MAX_RETRIES,
        "RETRY_DELAY": config.RETRY_DELAY
    }
    
    extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
    
    # Test with a sample codigo (replace with actual codigo from your database)
    codigo_test = "1234-56-LE20"  # REPLACE THIS
    
    logger.info(f"Extracting details for licitación: {codigo_test}")
    detalle = extractor.extract_detalle_licitacion(codigo_test)
    
    if detalle:
        logger.info("Successfully extracted details!")
        logger.info(f"Keys in response: {list(detalle.keys())}")
        # Print first few fields
        for key, value in list(detalle.items())[:5]:
            logger.info(f"  {key}: {value}")
    else:
        logger.warning("No details found or error occurred")


def test_batch_ordenes_detalles(limit=5):
    """Test extracting details for multiple órdenes de compra from database"""
    logger.info("=" * 60)
    logger.info(f"Testing batch extraction for {limit} órdenes de compra")
    logger.info("=" * 60)
    
    extractor_config = {
        "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
        "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
        "MAX_RETRIES": config.MAX_RETRIES,
        "RETRY_DELAY": config.RETRY_DELAY
    }
    
    extractor = MercadoPublicoOrdenesExtractor(extractor_config)
    loader = DatabaseLoader({"DATABASE_URL": config.DATABASE_URL})
    
    try:
        # Extract details
        detailed_records = extractor.extract_detalles_ordenes_from_db(
            limit=limit,
            skip_existing_details=True
        )
        
        if detailed_records:
            logger.info(f"Extracted {len(detailed_records)} detailed records")
            
            # Update database
            loader.connect()
            try:
                updated_count = loader.update_orden_compra_detalles(detailed_records)
                logger.info(f"Updated {updated_count} records in database")
            finally:
                loader.disconnect()
        else:
            logger.info("No records to process (all may already have details)")
            
    except Exception as e:
        logger.error(f"Error during batch extraction: {str(e)}", exc_info=True)


def test_batch_licitaciones_detalles(limit=5):
    """Test extracting details for multiple licitaciones from database"""
    logger.info("=" * 60)
    logger.info(f"Testing batch extraction for {limit} licitaciones")
    logger.info("=" * 60)
    
    extractor_config = {
        "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
        "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
        "MAX_RETRIES": config.MAX_RETRIES,
        "RETRY_DELAY": config.RETRY_DELAY
    }
    
    extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
    loader = DatabaseLoader({"DATABASE_URL": config.DATABASE_URL})
    
    try:
        # Extract details
        detailed_records = extractor.extract_detalles_licitaciones_from_db(
            limit=limit,
            skip_existing_details=True
        )
        
        if detailed_records:
            logger.info(f"Extracted {len(detailed_records)} detailed records")
            
            # Update database
            loader.connect()
            try:
                updated_count = loader.update_licitacion_detalles(detailed_records)
                logger.info(f"Updated {updated_count} records in database")
            finally:
                loader.disconnect()
        else:
            logger.info("No records to process (all may already have details)")
            
    except Exception as e:
        logger.error(f"Error during batch extraction: {str(e)}", exc_info=True)


def main():
    """Main function to run tests"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Test detailed extraction functionality")
    parser.add_argument(
        "--test",
        type=str,
        choices=["single-orden", "single-licitacion", "batch-ordenes", "batch-licitaciones", "all"],
        default="all",
        help="Which test to run"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Limit for batch tests"
    )
    
    args = parser.parse_args()
    
    logger.info("Starting detailed extraction tests")
    logger.info(f"Database URL: {config.DATABASE_URL}")
    logger.info(f"API URL: {config.MERCADO_PUBLICO_URL}")
    
    try:
        if args.test == "single-orden":
            test_single_orden_detalle()
        elif args.test == "single-licitacion":
            test_single_licitacion_detalle()
        elif args.test == "batch-ordenes":
            test_batch_ordenes_detalles(args.limit)
        elif args.test == "batch-licitaciones":
            test_batch_licitaciones_detalles(args.limit)
        elif args.test == "all":
            logger.info("\n" + "=" * 60)
            logger.info("Running all tests")
            logger.info("=" * 60 + "\n")
            
            # Skip single tests if you don't have test codes
            # test_single_orden_detalle()
            # test_single_licitacion_detalle()
            
            # Run batch tests with small limit
            test_batch_ordenes_detalles(args.limit)
            logger.info("\n")
            test_batch_licitaciones_detalles(args.limit)
            
        logger.info("\n" + "=" * 60)
        logger.info("Tests completed")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"Test failed: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

