"""
Migration script to move data from V1 (informacion_adicional) to V2 (detalle tables)
"""
import sys
import os
import logging
from pathlib import Path

# Add project root to path so we can import etl modules
# Script is at: project_root/etl/scripts/migrate_to_v2.py
# We need to add: project_root
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from etl.config import config
from etl.utils import calcular_hash, now_utc
from etl.shared_imports import (
    Licitacion,
    LicitacionDetalle,
    OrdenCompra,
    OrdenCompraDetalle
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def migrate_licitaciones(session, limit=None, dry_run=False):
    """
    Migrate licitaciones with informacion_adicional to detalle table
    
    Args:
        session: Database session
        limit: Maximum number to migrate
        dry_run: If True, don't commit changes
    
    Returns:
        Number of records migrated
    """
    logger.info("=" * 60)
    logger.info("Migrating Licitaciones to V2 structure")
    logger.info("=" * 60)
    
    # Query licitaciones with informacion_adicional but no detalle
    query = session.query(Licitacion)\
        .outerjoin(LicitacionDetalle, Licitacion.id == LicitacionDetalle.licitacion_id)\
        .filter(LicitacionDetalle.id.is_(None))\
        .filter(Licitacion.informacion_adicional.isnot(None))
    
    if limit:
        query = query.limit(limit)
    
    licitaciones = query.all()
    
    if not licitaciones:
        logger.info("No licitaciones found to migrate")
        return 0
    
    logger.info(f"Found {len(licitaciones)} licitaciones to migrate")
    
    migrated_count = 0
    error_count = 0
    
    for licitacion in licitaciones:
        try:
            # Get existing informacion_adicional
            datos_completos = licitacion.informacion_adicional
            
            if not datos_completos:
                continue
            
            # Calculate hash
            hash_contenido = calcular_hash(datos_completos)
            
            # Extract specific fields
            estado_actual = datos_completos.get('Estado') or datos_completos.get('estado') or licitacion.estado
            items = datos_completos.get('Items') or datos_completos.get('items') or licitacion.items
            documentos = datos_completos.get('Adjuntos') or datos_completos.get('documentos')
            participantes = datos_completos.get('Participantes') or datos_completos.get('participantes')
            etapas = datos_completos.get('Etapas') or datos_completos.get('etapas')
            
            # Create detalle record
            detalle = LicitacionDetalle(
                licitacion_id=licitacion.id,
                codigo_externo=licitacion.codigo_externo,
                hash_contenido=hash_contenido,
                datos_completos=datos_completos,
                items=items,
                documentos=documentos,
                participantes=participantes,
                etapas=etapas,
                estado_actual=estado_actual,
                numero_actualizaciones=1,
                fecha_primera_extraccion=licitacion.fecha_extraccion or now_utc(),
                fecha_ultima_actualizacion=licitacion.fecha_actualizacion or now_utc()
            )
            
            session.add(detalle)
            migrated_count += 1
            
            if migrated_count % 100 == 0:
                logger.info(f"Migrated {migrated_count} licitaciones...")
                if not dry_run:
                    session.commit()
            
        except Exception as e:
            logger.error(f"Error migrating licitacion {licitacion.codigo_externo}: {str(e)}")
            error_count += 1
            session.rollback()
    
    # Final commit
    if not dry_run and migrated_count > 0:
        try:
            session.commit()
            logger.info(f"Successfully migrated {migrated_count} licitaciones")
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to commit migrations: {str(e)}")
            return 0
    elif dry_run:
        session.rollback()
        logger.info(f"DRY RUN: Would have migrated {migrated_count} licitaciones")
    
    logger.info(f"Migration summary: {migrated_count} successful, {error_count} errors")
    
    return migrated_count


def migrate_ordenes_compra(session, limit=None, dry_run=False):
    """
    Migrate órdenes de compra with informacion_adicional to detalle table
    
    Args:
        session: Database session
        limit: Maximum number to migrate
        dry_run: If True, don't commit changes
    
    Returns:
        Number of records migrated
    """
    logger.info("=" * 60)
    logger.info("Migrating Órdenes de Compra to V2 structure")
    logger.info("=" * 60)
    
    # Query órdenes with informacion_adicional but no detalle
    query = session.query(OrdenCompra)\
        .outerjoin(OrdenCompraDetalle, OrdenCompra.id == OrdenCompraDetalle.orden_compra_id)\
        .filter(OrdenCompraDetalle.id.is_(None))\
        .filter(OrdenCompra.informacion_adicional.isnot(None))
    
    if limit:
        query = query.limit(limit)
    
    ordenes = query.all()
    
    if not ordenes:
        logger.info("No órdenes de compra found to migrate")
        return 0
    
    logger.info(f"Found {len(ordenes)} órdenes to migrate")
    
    migrated_count = 0
    error_count = 0
    
    for orden in ordenes:
        try:
            # Get existing informacion_adicional
            datos_completos = orden.informacion_adicional
            
            if not datos_completos:
                continue
            
            # Calculate hash
            hash_contenido = calcular_hash(datos_completos)
            
            # Extract specific fields
            estado_actual = datos_completos.get('Estado') or datos_completos.get('estado') or orden.estado
            items = datos_completos.get('Items') or datos_completos.get('items') or orden.items
            documentos = datos_completos.get('Documentos') or datos_completos.get('documentos')
            comprador = datos_completos.get('Comprador') or datos_completos.get('comprador')
            proveedor = datos_completos.get('Proveedor') or datos_completos.get('proveedor')
            
            # Create detalle record
            detalle = OrdenCompraDetalle(
                orden_compra_id=orden.id,
                codigo_oc=orden.codigo_oc,
                hash_contenido=hash_contenido,
                datos_completos=datos_completos,
                items=items,
                documentos=documentos,
                comprador_detalle=comprador,
                proveedor_detalle=proveedor,
                estado_actual=estado_actual,
                numero_actualizaciones=1,
                fecha_primera_extraccion=orden.fecha_extraccion or now_utc(),
                fecha_ultima_actualizacion=orden.fecha_actualizacion or now_utc()
            )
            
            session.add(detalle)
            migrated_count += 1
            
            if migrated_count % 100 == 0:
                logger.info(f"Migrated {migrated_count} órdenes...")
                if not dry_run:
                    session.commit()
            
        except Exception as e:
            logger.error(f"Error migrating orden {orden.codigo_oc}: {str(e)}")
            error_count += 1
            session.rollback()
    
    # Final commit
    if not dry_run and migrated_count > 0:
        try:
            session.commit()
            logger.info(f"Successfully migrated {migrated_count} órdenes de compra")
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to commit migrations: {str(e)}")
            return 0
    elif dry_run:
        session.rollback()
        logger.info(f"DRY RUN: Would have migrated {migrated_count} órdenes")
    
    logger.info(f"Migration summary: {migrated_count} successful, {error_count} errors")
    
    return migrated_count


def verify_migration(session):
    """
    Verify migration was successful
    
    Args:
        session: Database session
    """
    logger.info("=" * 60)
    logger.info("Verifying migration")
    logger.info("=" * 60)
    
    # Count licitaciones
    total_licitaciones = session.query(Licitacion).count()
    with_info_adicional = session.query(Licitacion)\
        .filter(Licitacion.informacion_adicional.isnot(None)).count()
    with_detalle = session.query(LicitacionDetalle).count()
    
    logger.info(f"Licitaciones:")
    logger.info(f"  Total: {total_licitaciones}")
    logger.info(f"  With informacion_adicional: {with_info_adicional}")
    logger.info(f"  With detalle: {with_detalle}")
    
    # Count órdenes
    total_ordenes = session.query(OrdenCompra).count()
    with_info_adicional_o = session.query(OrdenCompra)\
        .filter(OrdenCompra.informacion_adicional.isnot(None)).count()
    with_detalle_o = session.query(OrdenCompraDetalle).count()
    
    logger.info(f"\nÓrdenes de Compra:")
    logger.info(f"  Total: {total_ordenes}")
    logger.info(f"  With informacion_adicional: {with_info_adicional_o}")
    logger.info(f"  With detalle: {with_detalle_o}")
    
    # Check for mismatches
    if with_info_adicional > 0 and with_detalle < with_info_adicional:
        logger.warning(f"⚠️  Some licitaciones with informacion_adicional don't have detalle!")
        logger.warning(f"   Missing: {with_info_adicional - with_detalle}")
    else:
        logger.info("✓ All licitaciones migrated successfully")
    
    if with_info_adicional_o > 0 and with_detalle_o < with_info_adicional_o:
        logger.warning(f"⚠️  Some órdenes with informacion_adicional don't have detalle!")
        logger.warning(f"   Missing: {with_info_adicional_o - with_detalle_o}")
    else:
        logger.info("✓ All órdenes migrated successfully")


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Migrate data from V1 to V2 structure")
    parser.add_argument("--dry-run", action="store_true", help="Don't commit changes")
    parser.add_argument("--limit", type=int, help="Limit number of records to migrate")
    parser.add_argument("--skip-licitaciones", action="store_true")
    parser.add_argument("--skip-ordenes", action="store_true")
    parser.add_argument("--verify-only", action="store_true", help="Only verify migration status")
    
    args = parser.parse_args()
    
    logger.info("=" * 60)
    logger.info("Starting migration to V2 structure")
    logger.info("=" * 60)
    logger.info(f"Database: {config.DATABASE_URL}")
    if args.dry_run:
        logger.info("⚠️  DRY RUN MODE - No changes will be committed")
    logger.info("=" * 60)
    
    try:
        # Connect to database
        engine = create_engine(config.DATABASE_URL, pool_pre_ping=True)
        Session = sessionmaker(bind=engine)
        session = Session()
        
        if args.verify_only:
            verify_migration(session)
        else:
            # Migrate licitaciones
            if not args.skip_licitaciones:
                licitaciones_migrated = migrate_licitaciones(
                    session,
                    limit=args.limit,
                    dry_run=args.dry_run
                )
                logger.info(f"\nMigrated {licitaciones_migrated} licitaciones")
            
            # Migrate órdenes
            if not args.skip_ordenes:
                ordenes_migrated = migrate_ordenes_compra(
                    session,
                    limit=args.limit,
                    dry_run=args.dry_run
                )
                logger.info(f"\nMigrated {ordenes_migrated} órdenes de compra")
            
            # Verify
            logger.info("\n")
            verify_migration(session)
        
        session.close()
        engine.dispose()
        
        logger.info("\n" + "=" * 60)
        logger.info("Migration completed successfully")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"Migration failed: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

