"""
ETL Pipeline for Licitaciones Públicas Chile - Version 2
Main entry point for ETL processes with detalle and historial support
"""

import logging
import sys
import time
from datetime import timedelta

from etl.config import config
from etl.extractors import MercadoPublicoLicitacionesExtractor, MercadoPublicoOrdenesExtractor
from etl.extractors.compra_agil import CompraAgilExtractor, CuotaDiariaAgotada
from etl.loaders import DatabaseLoaderV2
from etl.transformers import LicitacionTransformer, OrdenCompraTransformer
from etl.transformers.compra_agil_transformer import CompraAgilTransformer, campos_desde_detalle
from etl.utils import now_santiago

# Configure logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(config.LOG_FILE) if config.LOG_FILE else logging.StreamHandler(),
        logging.StreamHandler(sys.stdout),
    ],
)

logger = logging.getLogger(__name__)


def run_etl_licitaciones_v2(fecha_desde: str | None = None, fecha_hasta: str | None = None) -> bool:
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
            "RETRY_DELAY": config.RETRY_DELAY,
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


#: Detalles de Compra Ágil por pasada. Cada uno es una petición contra una API
#: con cuota diaria que nadie ha medido: se limita, y los que faltan entran en
#: la pasada siguiente (nuevas primero).
DETALLES_COMPRA_AGIL_POR_PASADA = 150

#: Y como mucho este tiempo: un detalle tarda hasta ~30 s (medido), así que 150
#: podían pasar de una hora y la tarea horaria muere a los 30 min. Lo que no
#: cabe entra en la pasada siguiente, nuevas primero.
PRESUPUESTO_DETALLES_COMPRA_AGIL_S = 7 * 60


def run_etl_compra_agil(cambio_desde=None, cambio_hasta=None) -> bool:
    """Ingiere Compras Ágiles desde la API v2.

    Compra Ágil **no está en la API clásica**: tiene host propio, el ticket va
    en una cabecera y hay cuota diaria. Ver `etl/extractors/compra_agil.py`.

    Sin ticket configurado no se intenta nada. Es lo correcto: pegarle a la API
    sin credencial gasta reintentos para acabar en 401, y llenaría el log de
    errores en cada pasada horaria de una instalación que simplemente no tiene
    la integración activada.
    """
    logger.info("=" * 60)
    logger.info("ETL de Compra Ágil")
    logger.info("=" * 60)

    ticket = getattr(config, "COMPRA_AGIL_TICKET", "") or config.MERCADO_PUBLICO_TICKET
    if not ticket:
        logger.info("Compra Ágil: sin ticket configurado — se omite")
        return True

    try:
        extractor = CompraAgilExtractor(
            {
                "COMPRA_AGIL_TICKET": ticket,
                "MAX_RETRIES": config.MAX_RETRIES,
                "RETRY_DELAY": config.RETRY_DELAY,
            }
        )
        transformer = CompraAgilTransformer()
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})

        crudos = extractor.extract(cambio_desde=cambio_desde, cambio_hasta=cambio_hasta)
        logger.info("Compra Ágil: %d registros crudos", len(crudos))
        if not crudos:
            loader.connect()
            try:
                _completar_compras_agiles(extractor, loader)
            finally:
                loader.disconnect()
            return True

        filas = []
        for registro in crudos:
            try:
                fila = transformer.transform(registro)
                if fila:
                    filas.append(fila)
            except Exception as exc:
                logger.error("Compra Ágil: registro no transformable: %s", exc)

        logger.info("Compra Ágil: %d filas válidas", len(filas))
        if not filas:
            return True

        loader.connect()
        try:
            cargadas = loader.load_licitaciones(filas)
            logger.info("Compra Ágil: %d filas cargadas", cargadas)
            _completar_compras_agiles(extractor, loader)
        finally:
            loader.disconnect()
        return True

    except CuotaDiariaAgotada as exc:
        # No es un fallo del pipeline: la cuota vuelve mañana. Se registra como
        # aviso para que el watchdog no lo cuente como corrida rota.
        logger.warning("Compra Ágil: %s", exc)
        return True
    except Exception as exc:
        logger.error("ETL de Compra Ágil falló: %s", exc, exc_info=True)
        return False


def _completar_compras_agiles(extractor, loader) -> None:
    """Descripción e ítems desde el detalle, para las publicadas que no los tienen.

    El listado no los trae, y sin ellos el encaje se calculaba sólo sobre el
    nombre y el panel de BI no tenía productos que buscar. Si se agota la cuota,
    se deja para mañana sin marcar la corrida como fallida.
    """
    pendientes = loader.compras_agiles_sin_detalle(DETALLES_COMPRA_AGIL_POR_PASADA)
    completadas = 0
    limite = time.monotonic() + PRESUPUESTO_DETALLES_COMPRA_AGIL_S
    for licitacion_id, codigo in pendientes:
        if time.monotonic() > limite:
            logger.info("Compra Ágil: se acabó el tiempo de esta pasada; el resto, en la siguiente")
            break
        try:
            detalle = extractor.extract_detalle(codigo)
        except CuotaDiariaAgotada as exc:
            logger.warning("Compra Ágil: %s — detalles pendientes para mañana", exc)
            break
        campos = campos_desde_detalle(detalle or {})
        if campos:
            loader.completar_desde_detalle(licitacion_id, campos)
            completadas += 1
    logger.info("Compra Ágil: %d de %d completadas desde su detalle", completadas, len(pendientes))


def run_etl_ordenes_compra_v2(
    fecha_desde: str | None = None, fecha_hasta: str | None = None
) -> bool:
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
            "RETRY_DELAY": config.RETRY_DELAY,
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


def run_etl_extraer_detalles_nuevos_licitaciones(limit: int | None = None) -> bool:
    """
    Extract initial detailed information for ACTIVE licitaciones without detalle records.
    Only fetches detail for licitaciones in active states (Publicada).
    """
    logger.info("=" * 60)
    logger.info("Extracting initial detailed info for ACTIVE licitaciones")
    logger.info("=" * 60)

    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY,
        }

        extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})

        loader.connect()
        # Primero lo que no cuesta API: las que ya tienen detalle y no lo
        # tienen copiado en `licitaciones`. Ver `utils/licitacion_base.py`.
        loader.sincronizar_licitaciones_desde_detalle()
        registros_sin_detalle = loader.query_licitaciones_para_detalle(limit=limit)

        if not registros_sin_detalle:
            logger.info("No active licitaciones found needing detail extraction")
            loader.disconnect()
            return True

        logger.info(f"Found {len(registros_sin_detalle)} active licitaciones needing detail")

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
                    licitacion_id=licitacion_id, codigo_externo=codigo_externo, datos_api=detalle
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
                logger.info(
                    f"📊 PROGRESO EXTRACCIÓN LICITACIONES: {processed_count}/{total_records} registros procesados ({processed_count * 100 // total_records if total_records > 0 else 0}%)"
                )
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


def run_etl_extraer_detalles_nuevos_ordenes(limit: int | None = None) -> bool:
    """
    Extract initial detailed information for ACTIVE or potentially-active órdenes
    without detalle records. Filters by:
    - Known active estado (Enviada a proveedor, En proceso)
    - Potentially active: recent records with CodigoEstado 4 or 5
    """
    logger.info("=" * 60)
    logger.info("Extracting initial detailed info for ACTIVE órdenes de compra")
    logger.info("=" * 60)

    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY,
        }

        extractor = MercadoPublicoOrdenesExtractor(extractor_config)
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})

        loader.connect()
        # Sin API: el mecanismo de compra de las que ya tienen detalle.
        loader.sincronizar_ordenes_desde_detalle()
        registros_sin_detalle = loader.query_ordenes_para_detalle(limit=limit)

        if not registros_sin_detalle:
            logger.info("No active órdenes found needing detail extraction")
            loader.disconnect()
            return True

        logger.info(
            f"Found {len(registros_sin_detalle)} active/potentially-active órdenes needing detail"
        )

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
                    orden_compra_id=orden_id, codigo_oc=codigo_oc, datos_api=detalle
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
                logger.info(
                    f"📊 PROGRESO EXTRACCIÓN ÓRDENES: {processed_count}/{total_records} registros procesados ({processed_count * 100 // total_records if total_records > 0 else 0}%)"
                )
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
    dias_sin_actualizar: int = 1,
    limit: int | None = None,
    **_kwargs,
) -> bool:
    """
    Update existing detailed information and detect changes for active licitaciones.
    Only updates records in active states (Publicada).
    """
    logger.info("=" * 60)
    logger.info("Updating detailed info for ACTIVE licitaciones")
    logger.info("=" * 60)

    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY,
        }

        extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})

        loader.connect()
        registros_actualizar = loader.query_licitaciones_para_actualizar(
            dias_sin_actualizar=dias_sin_actualizar, limit=limit
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

        for licitacion_id, codigo_externo, _detalle_id in registros_actualizar:
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
                    datos_nuevos=datos_nuevos,
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
                logger.info(
                    f"📊 PROGRESO LICITACIONES: {processed_count}/{total_records} registros procesados ({processed_count * 100 // total_records}%)"
                )
                logger.info(f"   ✓ Con cambios: {updated_count}")
                logger.info(f"   ○ Sin cambios: {no_changes_count}")
                logger.info(f"   ❌ Errores: {error_count}")
                logger.info("=" * 60)

        loader.disconnect()

        logger.info("=" * 60)
        logger.info("Update completed:")
        logger.info(f"  - {updated_count} with changes (updated)")
        logger.info(f"  - {no_changes_count} without changes")
        logger.info(f"  - {error_count} errors")
        logger.info("=" * 60)

        return True

    except Exception as e:
        logger.error(f"Failed to update licitaciones: {str(e)}", exc_info=True)
        return False


def run_etl_resultados_licitaciones(limit: int | None = 200, **_kwargs) -> bool:
    """Vuelve a preguntar por las licitaciones CERRADAS que alguien sigue.

    El ciclo del producto estaba abierto por un extremo: se avisaba de la
    oportunidad, se acompañaba la preparación, y de cómo terminó no se sabía
    nunca. `run_etl_actualizar_detalles_licitaciones` sólo revisita estados
    activos, así que al cerrar el llamado el detalle se congela.

    El dato está en la misma API que ya consumimos —quién ganó, a cuánto y
    cuándo— y el alcance se limita a lo que alguien sigue: revisitar el catálogo
    entero serían cientos de miles de llamadas para responder preguntas que nadie
    hizo.
    """
    logger.info("=" * 60)
    logger.info("Resolviendo licitaciones cerradas que alguien sigue")
    logger.info("=" * 60)

    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY,
        }

        extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})
        loader.connect()

        pendientes = loader.query_licitaciones_seguidas_sin_resultado(limit=limit)
        if not pendientes:
            logger.info("No hay licitaciones seguidas pendientes de resultado")
            loader.disconnect()
            return True

        logger.info(f"{len(pendientes)} licitaciones seguidas sin resultado conocido")

        resueltas = 0
        sin_novedad = 0
        errores = 0

        for licitacion_id, codigo_externo, _detalle_id in pendientes:
            try:
                datos = extractor.extract_detalle_licitacion(codigo_externo)
                if not datos:
                    errores += 1
                    continue

                cambio = loader.actualizar_licitacion_detalle(
                    licitacion_id=licitacion_id,
                    codigo_externo=codigo_externo,
                    datos_nuevos=datos,
                )
                if cambio:
                    resueltas += 1
                    logger.info(f"✓ {codigo_externo} actualizada")
                else:
                    sin_novedad += 1

                time.sleep(0.5)
            except Exception as e:
                logger.error(f"Error resolviendo {codigo_externo}: {e}")
                errores += 1

        loader.disconnect()
        logger.info(
            f"Resultados: {resueltas} con novedad · {sin_novedad} sin cambios · {errores} errores"
        )
        return True

    except Exception as e:
        logger.error(f"Falló la resolución de licitaciones: {e}", exc_info=True)
        return False


def run_etl_actualizar_detalles_ordenes(
    dias_sin_actualizar: int = 1,
    limit: int | None = None,
    **_kwargs,
) -> bool:
    """
    Update existing detailed information and detect changes for active órdenes de compra.
    Only updates records in active states (Enviada a proveedor, En proceso).
    """
    logger.info("=" * 60)
    logger.info("Updating detailed info for ACTIVE órdenes de compra")
    logger.info("=" * 60)

    try:
        extractor_config = {
            "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
            "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
            "MAX_RETRIES": config.MAX_RETRIES,
            "RETRY_DELAY": config.RETRY_DELAY,
        }

        extractor = MercadoPublicoOrdenesExtractor(extractor_config)
        loader = DatabaseLoaderV2({"DATABASE_URL": config.DATABASE_URL})

        loader.connect()
        registros_actualizar = loader.query_ordenes_para_actualizar(
            dias_sin_actualizar=dias_sin_actualizar, limit=limit
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

        for orden_id, codigo_oc, _detalle_id in registros_actualizar:
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
                    orden_compra_id=orden_id, codigo_oc=codigo_oc, datos_nuevos=datos_nuevos
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
                logger.info(
                    f"📊 PROGRESO ÓRDENES DE COMPRA: {processed_count}/{total_records} registros procesados ({processed_count * 100 // total_records}%)"
                )
                logger.info(f"   ✓ Con cambios: {updated_count}")
                logger.info(f"   ○ Sin cambios: {no_changes_count}")
                logger.info(f"   ❌ Errores: {error_count}")
                logger.info("=" * 60)

        loader.disconnect()

        logger.info("=" * 60)
        logger.info("Update completed:")
        logger.info(f"  - {updated_count} with changes (updated)")
        logger.info(f"  - {no_changes_count} without changes")
        logger.info(f"  - {error_count} errors")
        logger.info("=" * 60)

        return True

    except Exception as e:
        logger.error(f"Failed to update órdenes: {str(e)}", exc_info=True)
        return False


def run_etl_pipeline_v2(
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    extract_licitaciones: bool = True,
    extract_ordenes: bool = True,
    extract_compra_agil: bool = True,
    extract_detalles_nuevos: bool = True,
    actualizar_detalles: bool = False,
    detalles_limit: int | None = None,
    dias_sin_actualizar: int = 7,
):
    """
    Run the complete ETL V2 pipeline

    Args:
        fecha_desde: Start date for daily extraction
        fecha_hasta: End date for daily extraction
        extract_licitaciones: Extract licitaciones basic data
        extract_ordenes: Extract órdenes basic data
        extract_compra_agil: Ingerir Compras Ágiles (API v2, ticket propio)
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
    if extract_licitaciones and not run_etl_licitaciones_v2(fecha_desde, fecha_hasta):
        success = False

    if extract_ordenes and not run_etl_ordenes_compra_v2(fecha_desde, fecha_hasta):
        success = False

    # Compra Ágil va aparte: otra API, otro host, otra autenticación y cuota
    # diaria propia. Sin ticket configurado se omite sin ruido.
    # 26 h y no las 2 h de la pasada horaria: la diaria es la red que recoge lo
    # que se haya caído de las horarias (la API corta en 504 de vez en cuando).
    ventana_diaria = now_santiago().replace(tzinfo=None) - timedelta(hours=26)
    if extract_compra_agil and not run_etl_compra_agil(cambio_desde=ventana_diaria):
        success = False

    # Step 2: Extract details for ACTIVE records without detalle
    if extract_detalles_nuevos and success:
        logger.info("\n" + "=" * 60)
        logger.info("Step 2: Extracting details for ACTIVE records")
        logger.info("=" * 60)

        if extract_licitaciones:
            if not run_etl_extraer_detalles_nuevos_licitaciones(limit=detalles_limit):
                success = False

        if extract_ordenes:
            if not run_etl_extraer_detalles_nuevos_ordenes(limit=detalles_limit):
                success = False

    # Step 3: Update EXISTING details for active records
    if actualizar_detalles and success:
        logger.info("\n" + "=" * 60)
        logger.info("Step 3: Updating EXISTING active details")
        logger.info("=" * 60)

        if extract_licitaciones:
            if not run_etl_actualizar_detalles_licitaciones(limit=detalles_limit):
                success = False

        if extract_ordenes:
            if not run_etl_actualizar_detalles_ordenes(limit=detalles_limit):
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
    parser.add_argument(
        "--skip-detalles-nuevos",
        action="store_true",
        help="Skip extracting details for new records",
    )
    parser.add_argument(
        "--actualizar-detalles",
        action="store_true",
        help="Update existing details and detect changes",
    )
    parser.add_argument("--detalles-limit", type=int, help="Limit for detail extraction")
    parser.add_argument(
        "--dias-sin-actualizar", type=int, default=7, help="Days threshold for updates (default: 7)"
    )
    parser.add_argument(
        "--solo-activos",
        action="store_true",
        help="Only update active records (not in final states)",
    )

    # Standalone modes
    parser.add_argument(
        "--only-extraer-nuevos", action="store_true", help="Only extract details for new records"
    )
    parser.add_argument(
        "--horario",
        action="store_true",
        help="Pasada horaria: licitaciones publicadas hoy, Compra Ágil de las últimas 2 h y detalles nuevos",
    )
    parser.add_argument(
        "--only-actualizar", action="store_true", help="Only update existing details"
    )
    parser.add_argument(
        "--only-resultados",
        action="store_true",
        help="Sólo resolver licitaciones cerradas que alguien sigue",
    )

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
    elif args.only_resultados:
        logger.info("Mode: --only-resultados (Resolver licitaciones seguidas ya cerradas)")
    elif args.horario:
        logger.info("Mode: --horario (listado de hoy + Compra Ágil + detalles nuevos)")
    elif args.only_extraer_nuevos:
        logger.info("Mode: --only-extraer-nuevos (Extract details for new records)")
    else:
        logger.info("Mode: Full pipeline")
    logger.info("=" * 80)
    logger.info("")

    # Pasada horaria. **Antes no traía licitaciones nuevas**: la tarea «horaria»
    # corría `--only-extraer-nuevos`, que sólo pide el detalle de lo que ya está
    # en la base, y lo nuevo entraba en la diaria de las 02:00 — que pide el día
    # ANTERIOR. Una licitación publicada a las 09:00 aparecía al día siguiente,
    # con plazos de 48 h y la promesa de «revisamos cada hora».
    if args.horario:
        success = True
        hoy = now_santiago().date().isoformat()
        if not args.skip_licitaciones:
            if not run_etl_licitaciones_v2(hoy, hoy):
                success = False
            if not run_etl_compra_agil():
                success = False
            if not run_etl_extraer_detalles_nuevos_licitaciones(limit=args.detalles_limit):
                success = False

    # Standalone mode: only extract new details
    elif args.only_extraer_nuevos:
        success = True
        if not args.skip_licitaciones:
            if not run_etl_extraer_detalles_nuevos_licitaciones(limit=args.detalles_limit):
                success = False
        if not args.skip_ordenes:
            if not run_etl_extraer_detalles_nuevos_ordenes(limit=args.detalles_limit):
                success = False

    # Standalone mode: resolver licitaciones seguidas que ya cerraron
    elif args.only_resultados:
        success = run_etl_resultados_licitaciones(limit=args.detalles_limit or 200)

    # Standalone mode: only update existing
    elif args.only_actualizar:
        import time

        start_time = time.time()
        success = True

        logger.info("🚀 Starting update process...")
        logger.info("")

        if not args.skip_licitaciones:
            if not run_etl_actualizar_detalles_licitaciones(limit=args.detalles_limit):
                success = False
            logger.info("")

        if not args.skip_ordenes:
            if not run_etl_actualizar_detalles_ordenes(limit=args.detalles_limit):
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
            dias_sin_actualizar=args.dias_sin_actualizar,
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


if __name__ == "__main__":
    main()
