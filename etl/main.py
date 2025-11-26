"""
ETL Pipeline for Licitaciones Públicas Chile - Version 2
Main entry point for ETL processes with detalle and historial support
"""
import logging
import sys
from datetime import datetime
from etl.utils import now_santiago
from typing import Optional
from etl.config import config
from etl.extractors import MercadoPublicoLicitacionesExtractor, MercadoPublicoOrdenesExtractor
from etl.transformers import LicitacionTransformer, OrdenCompraTransformer
from etl.loaders import DatabaseLoaderV2

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


def run_etl_licitaciones_v2(fecha_desde: Optional[str] = None, fecha_hasta: Optional[str] = None) -> bool:
    """
    Run ETL pipeline for Licitaciones (basic data only)
    
    Args:
        fecha_desde: Start date in format YYYY-MM-DD
        fecha_hasta: End date in format YYYY-MM-DD
    
    Returns:
        True if successful
    """
    logger.info("=" * 60)
    logger.info("Starting ETL V2 pipeline for Licitaciones (basic data)")
    logger.info("=" * 60)
    
    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
        transformer = LicitacionTransformer()
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})
        
        # Extract
        logger.info("Step 1: Extracting Licitaciones data...")
        raw_data = extractor.extract(fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
        logger.info(f"Extracted {len(raw_data)} raw records")
        
        if not raw_data:
            logger.warning("No data extracted for Licitaciones")
            return True
        
        # Transform
        logger.info("Step 2: Transforming Licitaciones data...")
        transformed_data = []
        for record in raw_data:
            try:
                transformed = transformer.transform(record)
                if transformer.validate_transformed(transformed):
                    transformed_data.append(transformed)
            except Exception as e:
                logger.error(f"Error transforming record: {str(e)}")
                continue
        
        logger.info(f"Transformed {len(transformed_data)} valid records")
        
        if not transformed_data:
            logger.warning("No valid transformed records")
            return True
        
        # Load
        logger.info("Step 3: Loading Licitaciones data into database...")
        loader.connect()
        try:
            loaded_count = loader.load_licitaciones(transformed_data)
            logger.info(f"Successfully loaded {loaded_count} Licitaciones records")
        finally:
            loader.disconnect()
        
        logger.info("ETL V2 pipeline for Licitaciones completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"ETL V2 pipeline for Licitaciones failed: {str(e)}", exc_info=True)
        return False


def run_etl_ordenes_compra_v2(fecha_desde: Optional[str] = None, fecha_hasta: Optional[str] = None) -> bool:
    """
    Run ETL pipeline for Órdenes de Compra (basic data only)
    
    Args:
        fecha_desde: Start date in format YYYY-MM-DD
        fecha_hasta: End date in format YYYY-MM-DD
    
    Returns:
        True if successful
    """
    logger.info("=" * 60)
    logger.info("Starting ETL V2 pipeline for Órdenes de Compra (basic data)")
    logger.info("=" * 60)
    
    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoOrdenesExtractor(extractor_config)
        transformer = OrdenCompraTransformer()
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})
        
        # Extract
        logger.info("Step 1: Extracting Órdenes de Compra data...")
        raw_data = extractor.extract(fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
        logger.info(f"Extracted {len(raw_data)} raw records")
        
        if not raw_data:
            logger.warning("No data extracted for Órdenes de Compra")
            return True
        
        # Transform
        logger.info("Step 2: Transforming Órdenes de Compra data...")
        transformed_data = []
        for record in raw_data:
            try:
                transformed = transformer.transform(record)
                if transformer.validate_transformed(transformed):
                    transformed_data.append(transformed)
            except Exception as e:
                logger.error(f"Error transforming record: {str(e)}")
                continue
        
        logger.info(f"Transformed {len(transformed_data)} valid records")
        
        if not transformed_data:
            logger.warning("No valid transformed records")
            return True
        
        # Load
        logger.info("Step 3: Loading Órdenes de Compra data into database...")
        loader.connect()
        try:
            loaded_count = loader.load_ordenes_compra(transformed_data)
            logger.info(f"Successfully loaded {loaded_count} Órdenes de Compra records")
        finally:
            loader.disconnect()
        
        logger.info("ETL V2 pipeline for Órdenes de Compra completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"ETL V2 pipeline for Órdenes de Compra failed: {str(e)}", exc_info=True)
        return False


def run_etl_extraer_detalles_nuevos_licitaciones(limit: Optional[int] = None) -> bool:
    """
    Extract initial detailed information for licitaciones without detalle records
    
    Args:
        limit: Maximum number of records to process
    
    Returns:
        True if successful
    """
    logger.info("=" * 60)
    logger.info("Extracting initial detailed info for NEW licitaciones")
    logger.info("=" * 60)
    
    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})
        
        # Query licitaciones without detalle
        loader.connect()
        registros_sin_detalle = loader.query_licitaciones_sin_detalle(limit=limit)
        
        if not registros_sin_detalle:
            logger.info("No licitaciones found without detailed info")
            loader.disconnect()
            return True
        
        logger.info(f"Found {len(registros_sin_detalle)} licitaciones without detailed info")
        
        # Extract and load details for each
        success_count = 0
        error_count = 0
        total_records = len(registros_sin_detalle)
        processed_count = 0
        
        for licitacion_id, codigo_externo in registros_sin_detalle:
            try:
                logger.info(f"Extracting details for licitación: {codigo_externo}")
                
                # Extract detailed info from API
                detalle = extractor.extract_detalle_licitacion(codigo_externo)
                
                if not detalle:
                    logger.warning(f"No detailed data found for {codigo_externo}")
                    error_count += 1
                    continue
                
                # Load into detalle table
                detalle_id = loader.load_licitacion_detalle_inicial(
                    licitacion_id=licitacion_id,
                    codigo_externo=codigo_externo,
                    datos_api=detalle
                )
                
                if detalle_id:
                    success_count += 1
                else:
                    error_count += 1
                
                # Rate limiting
                import time
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Error processing licitación {codigo_externo}: {str(e)}")
                error_count += 1
            
            # Progress tracking
            processed_count += 1
            if processed_count % 50 == 0 or processed_count == total_records:
                logger.info("=" * 60)
                logger.info(f"📊 PROGRESO EXTRACCIÓN LICITACIONES: {processed_count}/{total_records} registros procesados ({processed_count*100//total_records if total_records > 0 else 0}%)")
                logger.info(f"   ✓ Exitosos: {success_count}")
                logger.info(f"   ❌ Errores: {error_count}")
                logger.info("=" * 60)
        
        loader.disconnect()
        
        logger.info("=" * 60)
        logger.info(f"Extraction completed: {success_count} successful, {error_count} errors")
        logger.info("=" * 60)
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to extract detailed info for licitaciones: {str(e)}", exc_info=True)
        return False


def run_etl_extraer_detalles_nuevos_ordenes(limit: Optional[int] = None) -> bool:
    """
    Extract initial detailed information for órdenes without detalle records
    
    Args:
        limit: Maximum number of records to process
    
    Returns:
        True if successful
    """
    logger.info("=" * 60)
    logger.info("Extracting initial detailed info for NEW órdenes de compra")
    logger.info("=" * 60)
    
    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoOrdenesExtractor(extractor_config)
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})
        
        # Query órdenes without detalle
        loader.connect()
        registros_sin_detalle = loader.query_ordenes_sin_detalle(limit=limit)
        
        if not registros_sin_detalle:
            logger.info("No órdenes found without detailed info")
            loader.disconnect()
            return True
        
        logger.info(f"Found {len(registros_sin_detalle)} órdenes without detailed info")
        
        # Extract and load details for each
        success_count = 0
        error_count = 0
        total_records = len(registros_sin_detalle)
        processed_count = 0
        
        for orden_id, codigo_oc in registros_sin_detalle:
            try:
                logger.info(f"Extracting details for orden: {codigo_oc}")
                
                # Extract detailed info from API
                detalle = extractor.extract_detalle_orden_compra(codigo_oc)
                
                if not detalle:
                    logger.warning(f"No detailed data found for {codigo_oc}")
                    error_count += 1
                    continue
                
                # Load into detalle table
                detalle_id = loader.load_orden_compra_detalle_inicial(
                    orden_compra_id=orden_id,
                    codigo_oc=codigo_oc,
                    datos_api=detalle
                )
                
                if detalle_id:
                    success_count += 1
                else:
                    error_count += 1
                
                # Rate limiting
                import time
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Error processing orden {codigo_oc}: {str(e)}")
                error_count += 1
            
            # Progress tracking
            processed_count += 1
            if processed_count % 50 == 0 or processed_count == total_records:
                logger.info("=" * 60)
                logger.info(f"📊 PROGRESO EXTRACCIÓN ÓRDENES: {processed_count}/{total_records} registros procesados ({processed_count*100//total_records if total_records > 0 else 0}%)")
                logger.info(f"   ✓ Exitosos: {success_count}")
                logger.info(f"   ❌ Errores: {error_count}")
                logger.info("=" * 60)
        
        loader.disconnect()
        
        logger.info("=" * 60)
        logger.info(f"Extraction completed: {success_count} successful, {error_count} errors")
        logger.info("=" * 60)
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to extract detailed info for órdenes: {str(e)}", exc_info=True)
        return False


def run_etl_actualizar_detalles_licitaciones(
    dias_sin_actualizar: int = 7,
    solo_activos: bool = True,
    limit: Optional[int] = None
) -> bool:
    """
    Update existing detailed information and detect changes for licitaciones
    
    Args:
        dias_sin_actualizar: Days since last update to trigger refresh
        solo_activos: Only update records not in final states
        limit: Maximum number of records to process
    
    Returns:
        True if successful
    """
    logger.info("=" * 60)
    logger.info("Updating detailed info for EXISTING licitaciones")
    logger.info("=" * 60)
    
    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})
        
        # Query licitaciones that need updating
        loader.connect()
        
        excluir_estados = ['Cerrada', 'Desierta', 'Adjudicada', 'Cancelada'] if solo_activos else None
        registros_actualizar = loader.query_licitaciones_para_actualizar(
            dias_sin_actualizar=dias_sin_actualizar,
            excluir_estados_finales=excluir_estados,
            limit=limit
        )
        
        if not registros_actualizar:
            logger.info("No licitaciones found that need updating")
            loader.disconnect()
            return True
        
        logger.info(f"Found {len(registros_actualizar)} licitaciones to update")
        
        # Update each record
        updated_count = 0
        no_changes_count = 0
        error_count = 0
        total_records = len(registros_actualizar)
        processed_count = 0
        
        for licitacion_id, codigo_externo, detalle_id in registros_actualizar:
            try:
                logger.info(f"Updating licitación: {codigo_externo}")
                
                # Extract new data from API
                datos_nuevos = extractor.extract_detalle_licitacion(codigo_externo)
                
                if not datos_nuevos:
                    logger.warning(f"No data retrieved for {codigo_externo}")
                    error_count += 1
                    continue
                
                # Update and detect changes
                has_changes = loader.actualizar_licitacion_detalle(
                    licitacion_id=licitacion_id,
                    codigo_externo=codigo_externo,
                    datos_nuevos=datos_nuevos
                )
                
                if has_changes:
                    updated_count += 1
                    logger.info(f"✓ Changes detected and recorded for {codigo_externo}")
                else:
                    no_changes_count += 1
                    logger.debug(f"No changes for {codigo_externo}")
                
                # Rate limiting
                import time
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Error updating licitación {codigo_externo}: {str(e)}")
                error_count += 1
            
            # Progress tracking
            processed_count += 1
            if processed_count % 50 == 0 or processed_count == total_records:
                logger.info("=" * 60)
                logger.info(f"📊 PROGRESO LICITACIONES: {processed_count}/{total_records} registros procesados ({processed_count*100//total_records}%)")
                logger.info(f"   ✓ Con cambios: {updated_count}")
                logger.info(f"   ○ Sin cambios: {no_changes_count}")
                logger.info(f"   ❌ Errores: {error_count}")
                logger.info("=" * 60)
        
        loader.disconnect()
        
        logger.info("=" * 60)
        logger.info(f"Update completed:")
        logger.info(f"  - {updated_count} with changes (updated)")
        logger.info(f"  - {no_changes_count} without changes")
        logger.info(f"  - {error_count} errors")
        logger.info("=" * 60)
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to update licitaciones: {str(e)}", exc_info=True)
        return False


def run_etl_actualizar_detalles_ordenes(
    dias_sin_actualizar: int = 7,
    solo_activos: bool = True,
    limit: Optional[int] = None
) -> bool:
    """
    Update existing detailed information and detect changes for órdenes de compra
    
    Args:
        dias_sin_actualizar: Days since last update to trigger refresh
        solo_activos: Only update records not in final states
        limit: Maximum number of records to process
    
    Returns:
        True if successful
    """
    logger.info("=" * 60)
    logger.info("Updating detailed info for EXISTING órdenes de compra")
    logger.info("=" * 60)
    
    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY
        }
        
        extractor = MercadoPublicoOrdenesExtractor(extractor_config)
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})
        
        # Query órdenes that need updating
        loader.connect()
        
        excluir_estados = ['Cerrada', 'Finalizada', 'Cancelada'] if solo_activos else None
        registros_actualizar = loader.query_ordenes_para_actualizar(
            dias_sin_actualizar=dias_sin_actualizar,
            excluir_estados_finales=excluir_estados,
            limit=limit
        )
        
        if not registros_actualizar:
            logger.info("No órdenes found that need updating")
            loader.disconnect()
            return True
        
        logger.info(f"Found {len(registros_actualizar)} órdenes to update")
        
        # Update each record
        updated_count = 0
        no_changes_count = 0
        error_count = 0
        total_records = len(registros_actualizar)
        processed_count = 0
        
        for orden_id, codigo_oc, detalle_id in registros_actualizar:
            try:
                logger.info(f"Updating orden: {codigo_oc}")
                
                # Extract new data from API
                datos_nuevos = extractor.extract_detalle_orden_compra(codigo_oc)
                
                if not datos_nuevos:
                    logger.warning(f"No data retrieved for {codigo_oc}")
                    error_count += 1
                    continue
                
                # Update and detect changes
                has_changes = loader.actualizar_orden_compra_detalle(
                    orden_compra_id=orden_id,
                    codigo_oc=codigo_oc,
                    datos_nuevos=datos_nuevos
                )
                
                if has_changes:
                    updated_count += 1
                    logger.info(f"✓ Changes detected and recorded for {codigo_oc}")
                else:
                    no_changes_count += 1
                    logger.debug(f"No changes for {codigo_oc}")
                
                # Rate limiting
                import time
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Error updating orden {codigo_oc}: {str(e)}")
                error_count += 1
            
            # Progress tracking
            processed_count += 1
            if processed_count % 50 == 0 or processed_count == total_records:
                logger.info("=" * 60)
                logger.info(f"📊 PROGRESO ÓRDENES DE COMPRA: {processed_count}/{total_records} registros procesados ({processed_count*100//total_records}%)")
                logger.info(f"   ✓ Con cambios: {updated_count}")
                logger.info(f"   ○ Sin cambios: {no_changes_count}")
                logger.info(f"   ❌ Errores: {error_count}")
                logger.info("=" * 60)
        
        loader.disconnect()
        
        logger.info("=" * 60)
        logger.info(f"Update completed:")
        logger.info(f"  - {updated_count} with changes (updated)")
        logger.info(f"  - {no_changes_count} without changes")
        logger.info(f"  - {error_count} errors")
        logger.info("=" * 60)
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to update órdenes: {str(e)}", exc_info=True)
        return False


def run_etl_pipeline_v2(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    extract_licitaciones: bool = True,
    extract_ordenes: bool = True,
    extract_detalles_nuevos: bool = True,
    actualizar_detalles: bool = False,
    detalles_limit: Optional[int] = None,
    dias_sin_actualizar: int = 7
):
    """
    Run the complete ETL V2 pipeline
    
    Args:
        fecha_desde: Start date for daily extraction
        fecha_hasta: End date for daily extraction
        extract_licitaciones: Extract licitaciones basic data
        extract_ordenes: Extract órdenes basic data
        extract_detalles_nuevos: Extract details for new records
        actualizar_detalles: Update existing details and detect changes
        detalles_limit: Limit for detail extraction
        dias_sin_actualizar: Days threshold for updates
    """
    logger.info("=" * 60)
    logger.info("Starting complete ETL V2 pipeline")
    logger.info("=" * 60)
    
    if not fecha_desde:
        fecha_desde = now_santiago().strftime("%Y-%m-%d")
    if not fecha_hasta:
        fecha_hasta = now_santiago().strftime("%Y-%m-%d")
    
    logger.info(f"Date range: {fecha_desde} to {fecha_hasta}")
    
    success = True
    
    # Step 1: Extract basic data (daily)
    if extract_licitaciones:
        if not run_etl_licitaciones_v2(fecha_desde, fecha_hasta):
            success = False
    
    if extract_ordenes:
        if not run_etl_ordenes_compra_v2(fecha_desde, fecha_hasta):
            success = False
    
    # Step 2: Extract details for NEW records
    if extract_detalles_nuevos and success:
        logger.info("\n" + "=" * 60)
        logger.info("Step 2: Extracting details for NEW records")
        logger.info("=" * 60)
        
        if extract_licitaciones:
            if not run_etl_extraer_detalles_nuevos_licitaciones(limit=detalles_limit):
                success = False
        
        if extract_ordenes:
            if not run_etl_extraer_detalles_nuevos_ordenes(limit=detalles_limit):
                success = False
    
    # Step 3: Update EXISTING details
    if actualizar_detalles and success:
        logger.info("\n" + "=" * 60)
        logger.info("Step 3: Updating EXISTING details")
        logger.info("=" * 60)
        
        if extract_licitaciones:
            if not run_etl_actualizar_detalles_licitaciones(
                dias_sin_actualizar=dias_sin_actualizar,
                solo_activos=True,
                limit=detalles_limit
            ):
                success = False
        
        if extract_ordenes:
            if not run_etl_actualizar_detalles_ordenes(
                dias_sin_actualizar=dias_sin_actualizar,
                solo_activos=True,
                limit=detalles_limit
            ):
                success = False
    
    if success:
        logger.info("\n" + "=" * 60)
        logger.info("ETL V2 pipeline completed SUCCESSFULLY")
        logger.info("=" * 60)
    else:
        logger.error("\n" + "=" * 60)
        logger.error("ETL V2 pipeline completed with ERRORS")
        logger.error("=" * 60)
    
    return success


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="ETL Pipeline V2 for Mercado Público")
    parser.add_argument("--fecha-desde", type=str, help="Start date YYYY-MM-DD")
    parser.add_argument("--fecha-hasta", type=str, help="End date YYYY-MM-DD")
    parser.add_argument("--skip-licitaciones", action="store_true")
    parser.add_argument("--skip-ordenes", action="store_true")
    parser.add_argument("--skip-detalles-nuevos", action="store_true", help="Skip extracting details for new records")
    parser.add_argument("--actualizar-detalles", action="store_true", help="Update existing details and detect changes")
    parser.add_argument("--detalles-limit", type=int, help="Limit for detail extraction")
    parser.add_argument("--dias-sin-actualizar", type=int, default=7, help="Days threshold for updates (default: 7)")
    parser.add_argument("--solo-activos", action="store_true", help="Only update active records (not in final states)")
    
    # Standalone modes
    parser.add_argument("--only-extraer-nuevos", action="store_true", help="Only extract details for new records")
    parser.add_argument("--only-actualizar", action="store_true", help="Only update existing details")
    
    args = parser.parse_args()
    
    logger.info("=" * 80)
    logger.info("ETL V2 PROCESS STARTED")
    logger.info("=" * 80)
    logger.info(f"Timestamp: {now_santiago().isoformat()}")
    if args.only_actualizar:
        logger.info("Mode: --only-actualizar (Update existing details)")
        if args.skip_licitaciones:
            logger.info("⚠️  Skipping licitaciones")
        if args.skip_ordenes:
            logger.info("⚠️  Skipping órdenes de compra")
        logger.info(f"Days threshold: {args.dias_sin_actualizar} (0 = all records)")
    elif args.only_extraer_nuevos:
        logger.info("Mode: --only-extraer-nuevos (Extract details for new records)")
    else:
        logger.info("Mode: Full pipeline")
    logger.info("=" * 80)
    logger.info("")
    
    # Standalone mode: only extract new details
    if args.only_extraer_nuevos:
        success = True
        if not args.skip_licitaciones:
            if not run_etl_extraer_detalles_nuevos_licitaciones(limit=args.detalles_limit):
                success = False
        if not args.skip_ordenes:
            if not run_etl_extraer_detalles_nuevos_ordenes(limit=args.detalles_limit):
                success = False
    
    # Standalone mode: only update existing
    elif args.only_actualizar:
        import time
        start_time = time.time()
        success = True
        
        logger.info("🚀 Starting update process...")
        logger.info("")
        
        if not args.skip_licitaciones:
            if not run_etl_actualizar_detalles_licitaciones(
                dias_sin_actualizar=args.dias_sin_actualizar,
                solo_activos=args.solo_activos,
                limit=args.detalles_limit
            ):
                success = False
            logger.info("")
        
        if not args.skip_ordenes:
            if not run_etl_actualizar_detalles_ordenes(
                dias_sin_actualizar=args.dias_sin_actualizar,
                solo_activos=args.solo_activos,
                limit=args.detalles_limit
            ):
                success = False
        
        # Final summary
        elapsed_time = time.time() - start_time
        hours = int(elapsed_time // 3600)
        minutes = int((elapsed_time % 3600) // 60)
        seconds = int(elapsed_time % 60)
        
        logger.info("")
        logger.info("=" * 80)
        logger.info("🏁 ETL V2 PROCESS COMPLETED")
        logger.info("=" * 80)
        logger.info(f"Total execution time: {hours}h {minutes}m {seconds}s")
        logger.info(f"Timestamp: {now_santiago().isoformat()}")
        logger.info("=" * 80)
    
    # Full pipeline
    else:
        success = run_etl_pipeline_v2(
            fecha_desde=args.fecha_desde,
            fecha_hasta=args.fecha_hasta,
            extract_licitaciones=not args.skip_licitaciones,
            extract_ordenes=not args.skip_ordenes,
            extract_detalles_nuevos=not args.skip_detalles_nuevos,
            actualizar_detalles=args.actualizar_detalles,
            detalles_limit=args.detalles_limit,
            dias_sin_actualizar=args.dias_sin_actualizar
        )
    
    if not args.only_actualizar:  # Only show this summary if not already shown above
        if success:
            logger.info("=" * 80)
            logger.info("✅ ETL V2 process completed successfully")
            logger.info("=" * 80)
        else:
            logger.error("=" * 80)
            logger.error("❌ ETL V2 process failed")
            logger.error("=" * 80)
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()

