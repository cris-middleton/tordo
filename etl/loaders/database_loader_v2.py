"""
Database loader for ETL pipeline - Version 2 with detalle and historial tables
Loads transformed data into PostgreSQL database
"""
from __future__ import annotations
import sys
import os
from typing import List, Dict, Any, Optional
from sqlalchemy import create_engine, or_
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from etl.loaders.base import BaseLoader
from etl.config import config
from etl.utils import (
    calcular_hash,
    detectar_cambios_licitacion,
    detectar_cambios_orden_compra,
    now_utc
)

# Import models using shared module
from etl.shared_imports import (
    Licitacion,
    LicitacionDetalle,
    LicitacionHistorial,
    OrdenCompra,
    OrdenCompraDetalle,
    OrdenCompraHistorial,
    Base
)


class DatabaseLoaderV2(BaseLoader):
    """Load data into PostgreSQL database using detalle and historial tables
    
    Usage:
        # With context manager (recommended)
        with DatabaseLoaderV2() as loader:
            loader.load_licitaciones(data)
        
        # Manual (legacy)
        loader = DatabaseLoaderV2()
        loader.connect()
        try:
            loader.load_licitaciones(data)
        finally:
            loader.disconnect()
    """
    
    def __init__(self, config_dict: Dict[str, Any] = None):
        super().__init__(config_dict)
        from etl.config import config as etl_config
        if config_dict:
            self.database_url = config_dict.get("DATABASE_URL", etl_config.DATABASE_URL)
        else:
            self.database_url = etl_config.DATABASE_URL
        
        if not self.database_url:
            raise ValueError("DATABASE_URL must be provided")
            
        self.engine = None
        self.session = None
        self._session_owner = False  # Track if we created the session
    
    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()
        return False  # Don't suppress exceptions
    
    def connect(self):
        """Establish connection to database"""
        if self.session is not None:
            self.logger.warning("Already connected to database")
            return
            
        try:
            self.engine = create_engine(
                self.database_url,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20,
                echo=False  # Set to True for SQL debugging
            )
            SessionFactory = sessionmaker(bind=self.engine)
            self.session = SessionFactory()
            self._session_owner = True
            
            # Create tables if they don't exist
            Base.metadata.create_all(bind=self.engine)
            
            self.logger.info("Connected to database successfully")
        except Exception as e:
            self.logger.error(f"Failed to connect to database: {str(e)}")
            raise
    
    def disconnect(self):
        """Close database connection"""
        try:
            if self.session and self._session_owner:
                self.session.close()
                self.session = None
            if self.engine:
                self.engine.dispose()
                self.engine = None
            self.logger.info("Disconnected from database")
        except Exception as e:
            self.logger.error(f"Error during disconnect: {str(e)}")
        finally:
            self._session_owner = False
    
    def load_licitaciones(self, data: List[Dict[str, Any]]) -> int:
        """
        Load licitaciones into basic table (daily snapshot data)
        
        Args:
            data: List of transformed licitacion records
            
        Returns:
            Number of records successfully loaded
        """
        if not self.session:
            self.connect()
        
        loaded_count = 0
        updated_count = 0
        error_count = 0
        new_record_ids = []
        
        for record in data:
            try:
                existing = self.session.query(Licitacion).filter_by(
                    codigo_externo=record.get("codigo_externo")
                ).first()
                
                if existing:
                    # Update existing record
                    for key, value in record.items():
                        if hasattr(existing, key):
                            setattr(existing, key, value)
                    updated_count += 1
                else:
                    # Create new record
                    licitacion = Licitacion(**record)
                    self.session.add(licitacion)
                    self.session.flush()
                    new_record_ids.append(licitacion.id)
                    loaded_count += 1
                
            except IntegrityError as e:
                self.session.rollback()
                self.logger.warning(f"Integrity error loading licitacion {record.get('codigo_externo')}: {str(e)}")
                error_count += 1
            except Exception as e:
                self.session.rollback()
                self.logger.error(f"Error loading licitacion {record.get('codigo_externo')}: {str(e)}")
                error_count += 1
        
        try:
            self.session.commit()
            self.logger.info(
                f"Licitaciones loaded: {loaded_count} new, {updated_count} updated, {error_count} errors"
            )
            
            # Trigger alerts for new records (optional)
            if new_record_ids:
                self._trigger_licitacion_alerts(new_record_ids)
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Failed to commit licitaciones: {str(e)}")
            raise
        
        return loaded_count + updated_count
    
    def load_licitacion_detalle_inicial(self, licitacion_id: int, codigo_externo: str, datos_api: Dict[str, Any]) -> Optional[int]:
        """
        Load initial detailed information for a licitación
        
        Args:
            licitacion_id: ID of the main licitacion record
            codigo_externo: Business key
            datos_api: Full API response with detailed data
            
        Returns:
            ID of created detalle record or None if error
        """
        if not self.session:
            self.connect()
        
        try:
            # Check if detalle already exists
            existing = self.session.query(LicitacionDetalle).filter_by(
                licitacion_id=licitacion_id
            ).first()
            
            if existing:
                self.logger.warning(f"Detalle already exists for licitacion_id={licitacion_id}")
                return existing.id
            
            # Calculate hash
            hash_contenido = calcular_hash(datos_api)
            
            # Extract specific fields (handle nested structure under Listado[0])
            def _get_main_object(payload: Dict[str, Any]) -> Dict[str, Any]:
                if isinstance(payload, dict):
                    listado = payload.get("Listado")
                    if isinstance(listado, list) and listado:
                        return listado[0]
                    return payload
                return {}
            main_obj = _get_main_object(datos_api)
            estado_actual = main_obj.get('Estado') or main_obj.get('estado')
            items = main_obj.get('Items') or main_obj.get('items')
            documentos = main_obj.get('Adjuntos') or main_obj.get('Documentos') or main_obj.get('documentos')
            participantes = main_obj.get('Participantes') or main_obj.get('participantes')
            etapas = main_obj.get('Etapas') or main_obj.get('etapas')
            
            # Create detalle record
            detalle = LicitacionDetalle(
                licitacion_id=licitacion_id,
                codigo_externo=codigo_externo,
                hash_contenido=hash_contenido,
                datos_completos=datos_api,
                items=items,
                documentos=documentos,
                participantes=participantes,
                etapas=etapas,
                estado_actual=estado_actual,
                numero_actualizaciones=1
            )
            
            self.session.add(detalle)
            self.session.flush()
            
            detalle_id = detalle.id
            
            self.session.commit()
            self.logger.info(f"Created detalle for licitacion {codigo_externo}")
            
            return detalle_id
            
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error creating detalle for licitacion {codigo_externo}: {str(e)}")
            return None
    
    def actualizar_licitacion_detalle(self, licitacion_id: int, codigo_externo: str, datos_nuevos: Dict[str, Any]) -> bool:
        """
        Update detailed information and detect changes
        
        Args:
            licitacion_id: ID of the main licitacion record
            codigo_externo: Business key
            datos_nuevos: New API response data
            
        Returns:
            True if updated, False if no changes or error
        """
        if not self.session:
            self.connect()
        
        try:
            # Get existing detalle
            detalle = self.session.query(LicitacionDetalle).filter_by(
                licitacion_id=licitacion_id
            ).first()
            
            if not detalle:
                # If no detalle exists, create initial one
                self.logger.warning(f"No detalle found for {codigo_externo}, creating initial")
                return self.load_licitacion_detalle_inicial(licitacion_id, codigo_externo, datos_nuevos) is not None
            
            # Calculate new hash
            hash_nuevo = calcular_hash(datos_nuevos)
            
            # Check if there are changes
            if hash_nuevo == detalle.hash_contenido:
                self.logger.debug(f"No changes detected for {codigo_externo}")
                return False
            
            self.logger.info(f"Changes detected for {codigo_externo}, analyzing...")
            
            # Detect specific changes
            datos_anteriores = detalle.datos_completos or {}
            cambios = detectar_cambios_licitacion(datos_anteriores, datos_nuevos)
            
            # Register each change in historial
            for cambio in cambios:
                historial = LicitacionHistorial(
                    licitacion_id=licitacion_id,
                    licitacion_detalle_id=detalle.id,
                    codigo_externo=codigo_externo,
                    tipo_cambio=cambio['tipo_cambio'],
                    campo_modificado=cambio['campo'],
                    descripcion=cambio['descripcion'],
                    valor_anterior=cambio['valor_anterior'],
                    valor_nuevo=cambio['valor_nuevo']
                )
                self.session.add(historial)
            
            # Update detalle (handle nested structure)
            def _get_main_object(payload: Dict[str, Any]) -> Dict[str, Any]:
                if isinstance(payload, dict):
                    listado = payload.get("Listado")
                    if isinstance(listado, list) and listado:
                        return listado[0]
                    return payload
                return {}
            main_obj = _get_main_object(datos_nuevos)
            detalle.datos_completos = datos_nuevos
            detalle.hash_contenido = hash_nuevo
            detalle.numero_actualizaciones += 1
            detalle.fecha_ultima_actualizacion = now_utc()
            
            detalle.estado_actual = main_obj.get('Estado') or main_obj.get('estado')
            detalle.items = main_obj.get('Items') or main_obj.get('items')
            detalle.documentos = main_obj.get('Adjuntos') or main_obj.get('Documentos') or main_obj.get('documentos')
            detalle.participantes = main_obj.get('Participantes') or main_obj.get('participantes')
            detalle.etapas = main_obj.get('Etapas') or main_obj.get('etapas')
            
            self.session.commit()
            self.logger.info(f"Updated detalle for {codigo_externo} with {len(cambios)} changes")
            
            return True
            
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error updating detalle for {codigo_externo}: {str(e)}")
            return False
    
    def load_ordenes_compra(self, data: List[Dict[str, Any]]) -> int:
        """
        Load órdenes de compra into basic table (daily snapshot data)
        
        Args:
            data: List of transformed orden de compra records
            
        Returns:
            Number of records successfully loaded
        """
        if not self.session:
            self.connect()
        
        loaded_count = 0
        updated_count = 0
        error_count = 0
        new_record_ids = []
        
        for record in data:
            try:
                existing = self.session.query(OrdenCompra).filter_by(
                    codigo_oc=record.get("codigo_oc")
                ).first()
                
                if existing:
                    # Update existing record
                    for key, value in record.items():
                        if hasattr(existing, key):
                            setattr(existing, key, value)
                    updated_count += 1
                else:
                    # Create new record
                    orden = OrdenCompra(**record)
                    self.session.add(orden)
                    self.session.flush()
                    new_record_ids.append(orden.id)
                    loaded_count += 1
                
            except IntegrityError as e:
                self.session.rollback()
                self.logger.warning(f"Integrity error loading orden {record.get('codigo_oc')}: {str(e)}")
                error_count += 1
            except Exception as e:
                self.session.rollback()
                self.logger.error(f"Error loading orden {record.get('codigo_oc')}: {str(e)}")
                error_count += 1
        
        try:
            self.session.commit()
            self.logger.info(
                f"Órdenes de compra loaded: {loaded_count} new, {updated_count} updated, {error_count} errors"
            )
            
            # Trigger alerts for new records (optional)
            if new_record_ids:
                self._trigger_orden_compra_alerts(new_record_ids)
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Failed to commit órdenes de compra: {str(e)}")
            raise
        
        return loaded_count + updated_count
    
    def load_orden_compra_detalle_inicial(self, orden_compra_id: int, codigo_oc: str, datos_api: Dict[str, Any]) -> Optional[int]:
        """
        Load initial detailed information for an orden de compra
        
        Args:
            orden_compra_id: ID of the main orden_compra record
            codigo_oc: Business key
            datos_api: Full API response with detailed data
            
        Returns:
            ID of created detalle record or None if error
        """
        if not self.session:
            self.connect()
        
        try:
            # Check if detalle already exists
            existing = self.session.query(OrdenCompraDetalle).filter_by(
                orden_compra_id=orden_compra_id
            ).first()
            
            if existing:
                self.logger.warning(f"Detalle already exists for orden_compra_id={orden_compra_id}")
                return existing.id
            
            # Calculate hash
            hash_contenido = calcular_hash(datos_api)
            
            # Extract specific fields (handle nested structure under Listado[0])
            def _get_main_object(payload: Dict[str, Any]) -> Dict[str, Any]:
                if isinstance(payload, dict):
                    listado = payload.get("Listado")
                    if isinstance(listado, list) and listado:
                        return listado[0]
                    return payload
                return {}
            main_obj = _get_main_object(datos_api)
            estado_actual = main_obj.get('Estado') or main_obj.get('estado')
            items = None
            if isinstance(main_obj.get('Items'), dict):
                items = main_obj['Items'].get('Listado')
            else:
                items = main_obj.get('Items') or main_obj.get('items')
            documentos = main_obj.get('Adjuntos') or main_obj.get('Documentos') or main_obj.get('documentos')
            comprador = main_obj.get('Comprador') or main_obj.get('comprador')
            proveedor = main_obj.get('Proveedor') or main_obj.get('proveedor')
            # Optional: estado proveedor y fechas/total a nivel detalle
            estado_proveedor_actual = main_obj.get('EstadoProveedor') or main_obj.get('estadoProveedor')
            fechas_block = main_obj.get('Fechas') or {}
            def _parse_dt(v):
                from datetime import datetime
                if not v:
                    return None
                if isinstance(v, datetime):
                    return v
                for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
                    try:
                        return datetime.strptime(str(v), fmt)
                    except Exception:
                        continue
                return None
            fecha_acept_real = _parse_dt(fechas_block.get("FechaAceptacion"))
            fecha_entrega_real = _parse_dt(fechas_block.get("FechaEntrega"))
            monto_final = main_obj.get("Total")
            
            # Create detalle record
            detalle = OrdenCompraDetalle(
                orden_compra_id=orden_compra_id,
                codigo_oc=codigo_oc,
                hash_contenido=hash_contenido,
                datos_completos=datos_api,
                items=items,
                documentos=documentos,
                comprador_detalle=comprador,
                proveedor_detalle=proveedor,
                estado_actual=estado_actual,
                estado_proveedor_actual=estado_proveedor_actual,
                fecha_aceptacion_real=fecha_acept_real,
                fecha_entrega_real=fecha_entrega_real,
                monto_final=monto_final,
                numero_actualizaciones=1
            )
            
            self.session.add(detalle)
            self.session.flush()
            
            detalle_id = detalle.id
            
            # Also sync selected fields to base table for convenience
            orden_base = self.session.query(OrdenCompra).get(orden_compra_id)
            if orden_base is not None:
                self._sync_orden_compra_base_from_detalle(orden_base, datos_api)
            
            self.session.commit()
            self.logger.info(f"Created detalle for orden {codigo_oc}")
            
            return detalle_id
            
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error creating detalle for orden {codigo_oc}: {str(e)}")
            return None
    
    def _sync_orden_compra_base_from_detalle(self, orden_compra: OrdenCompra, datos: Dict[str, Any]) -> None:
        """
        Update base orden_compra fields using information present in the detalle payload.
        This makes frequently queried fields available without navigating the detalle JSON.
        """
        try:
            # The detailed payload structure is typically: {"Listado": [ { ... main fields ... } ]}
            listado = None
            if isinstance(datos, dict):
                if isinstance(datos.get("Listado"), list) and datos["Listado"]:
                    listado = datos["Listado"][0]
                else:
                    # Sometimes APIs may already provide the main object at root
                    listado = datos
            else:
                return
            
            if not isinstance(listado, dict):
                return
            
            # Status
            orden_compra.estado = listado.get("Estado") or listado.get("estado") or orden_compra.estado
            orden_compra.estado_proveedor = listado.get("EstadoProveedor") or listado.get("estadoProveedor") or orden_compra.estado_proveedor
            
            # Monetary fields
            if listado.get("TipoMoneda"):
                orden_compra.moneda = listado.get("TipoMoneda") or orden_compra.moneda
            # Totals
            total_neto = listado.get("TotalNeto")
            impuestos = listado.get("Impuestos")
            total = listado.get("Total")
            # Assign when present (keep previous if None)
            if total is not None:
                orden_compra.monto_total = total
            if total_neto is not None:
                orden_compra.monto_neto = total_neto
            if impuestos is not None:
                orden_compra.monto_iva = impuestos
            
            # Dates nested under Fechas
            fechas = listado.get("Fechas") or {}
            if isinstance(fechas, dict):
                fecha_aceptacion = fechas.get("FechaAceptacion")
                fecha_entrega = fechas.get("FechaEntrega")
                # Parse ISO-like strings safely
                def _parse_dt(value: Any):
                    from datetime import datetime
                    if not value:
                        return None
                    if isinstance(value, datetime):
                        return value
                    # Common formats from API
                    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
                        try:
                            return datetime.strptime(str(value), fmt)
                        except Exception:
                            continue
                    return None
                dt_acept = _parse_dt(fecha_aceptacion)
                dt_entrega = _parse_dt(fecha_entrega)
                if dt_acept:
                    orden_compra.fecha_aceptacion = dt_acept
                if dt_entrega:
                    orden_compra.fecha_entrega = dt_entrega
            
            # Buyer (Comprador)
            comprador = listado.get("Comprador") or {}
            if isinstance(comprador, dict):
                orden_compra.codigo_organismo = comprador.get("CodigoOrganismo") or orden_compra.codigo_organismo
                orden_compra.nombre_organismo = comprador.get("NombreOrganismo") or orden_compra.nombre_organismo
                # The API uses RutUnidad; keep as rut_organismo in base for convenience
                orden_compra.rut_organismo = comprador.get("RutUnidad") or orden_compra.rut_organismo
                orden_compra.region = comprador.get("RegionUnidad") or orden_compra.region
                orden_compra.comuna = comprador.get("ComunaUnidad") or orden_compra.comuna
            
            # Supplier (Proveedor)
            proveedor = listado.get("Proveedor") or {}
            if isinstance(proveedor, dict):
                orden_compra.codigo_proveedor = proveedor.get("Codigo") or orden_compra.codigo_proveedor
                orden_compra.nombre_proveedor = proveedor.get("Nombre") or orden_compra.nombre_proveedor
                # Use RutSucursal when available
                orden_compra.rut_proveedor = proveedor.get("RutSucursal") or proveedor.get("RutProveedor") or orden_compra.rut_proveedor
            
            # Items: store compact list in base for quick access (optional)
            items = listado.get("Items") or {}
            if isinstance(items, dict) and isinstance(items.get("Listado"), list):
                orden_compra.items = items.get("Listado")
            
            # URLs
            if listado.get("UrlOC"):
                orden_compra.url_oc = listado.get("UrlOC")
            if listado.get("UrlActa"):
                orden_compra.url_acta = listado.get("UrlActa")
        
        except Exception as e:
            # Best-effort sync; don't fail the whole transaction
            self.logger.debug(f"Base sync from detalle failed (non-fatal): {e}")
    
    def actualizar_orden_compra_detalle(self, orden_compra_id: int, codigo_oc: str, datos_nuevos: Dict[str, Any]) -> bool:
        """
        Update detailed information and detect changes
        
        Args:
            orden_compra_id: ID of the main orden_compra record
            codigo_oc: Business key
            datos_nuevos: New API response data
            
        Returns:
            True if updated, False if no changes or error
        """
        if not self.session:
            self.connect()
        
        try:
            # Get existing detalle
            detalle = self.session.query(OrdenCompraDetalle).filter_by(
                orden_compra_id=orden_compra_id
            ).first()
            
            if not detalle:
                # If no detalle exists, create initial one
                self.logger.warning(f"No detalle found for {codigo_oc}, creating initial")
                return self.load_orden_compra_detalle_inicial(orden_compra_id, codigo_oc, datos_nuevos) is not None
            
            # Calculate new hash
            hash_nuevo = calcular_hash(datos_nuevos)
            
            # Check if there are changes
            if hash_nuevo == detalle.hash_contenido:
                self.logger.debug(f"No changes detected for {codigo_oc}")
                return False
            
            self.logger.info(f"Changes detected for {codigo_oc}, analyzing...")
            
            # Detect specific changes
            datos_anteriores = detalle.datos_completos or {}
            cambios = detectar_cambios_orden_compra(datos_anteriores, datos_nuevos)
            
            # Register each change in historial
            for cambio in cambios:
                historial = OrdenCompraHistorial(
                    orden_compra_id=orden_compra_id,
                    orden_compra_detalle_id=detalle.id,
                    codigo_oc=codigo_oc,
                    tipo_cambio=cambio['tipo_cambio'],
                    campo_modificado=cambio['campo'],
                    descripcion=cambio['descripcion'],
                    valor_anterior=cambio['valor_anterior'],
                    valor_nuevo=cambio['valor_nuevo']
                )
                self.session.add(historial)
            
            # Update detalle (handle nested structure)
            def _get_main_object(payload: Dict[str, Any]) -> Dict[str, Any]:
                if isinstance(payload, dict):
                    listado = payload.get("Listado")
                    if isinstance(listado, list) and listado:
                        return listado[0]
                    return payload
                return {}
            main_obj = _get_main_object(datos_nuevos)
            detalle.datos_completos = datos_nuevos
            detalle.hash_contenido = hash_nuevo
            detalle.numero_actualizaciones += 1
            detalle.fecha_ultima_actualizacion = now_utc()
            
            detalle.estado_actual = main_obj.get('Estado') or main_obj.get('estado')
            detalle.estado_proveedor_actual = main_obj.get('EstadoProveedor') or main_obj.get('estadoProveedor')
            if isinstance(main_obj.get('Items'), dict):
                detalle.items = main_obj['Items'].get('Listado')
            else:
                detalle.items = main_obj.get('Items') or main_obj.get('items')
            detalle.documentos = main_obj.get('Adjuntos') or main_obj.get('Documentos') or main_obj.get('documentos')
            detalle.comprador_detalle = main_obj.get('Comprador') or main_obj.get('comprador')
            detalle.proveedor_detalle = main_obj.get('Proveedor') or main_obj.get('proveedor')
            fechas_block = main_obj.get('Fechas') or {}
            def _parse_dt(v):
                from datetime import datetime
                if not v:
                    return None
                if isinstance(v, datetime):
                    return v
                for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
                    try:
                        return datetime.strptime(str(v), fmt)
                    except Exception:
                        continue
                return None
            detalle.fecha_aceptacion_real = _parse_dt(fechas_block.get("FechaAceptacion"))
            detalle.fecha_entrega_real = _parse_dt(fechas_block.get("FechaEntrega"))
            if main_obj.get("Total") is not None:
                detalle.monto_final = main_obj.get("Total")
            
            # Also sync selected fields to base table for convenience
            orden_base = self.session.query(OrdenCompra).get(orden_compra_id)
            if orden_base is not None:
                self._sync_orden_compra_base_from_detalle(orden_base, datos_nuevos)
            
            self.session.commit()
            self.logger.info(f"Updated detalle for {codigo_oc} with {len(cambios)} changes")
            
            return True
            
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error updating detalle for {codigo_oc}: {str(e)}")
            return False
    
    def query_licitaciones_sin_detalle(self, limit: Optional[int] = None) -> List[tuple]:
        """
        Query licitaciones that don't have detalle records yet
        
        Returns:
            List of tuples (id, codigo_externo)
        """
        if not self.session:
            self.connect()
        
        query = self.session.query(Licitacion.id, Licitacion.codigo_externo)\
            .outerjoin(LicitacionDetalle, Licitacion.id == LicitacionDetalle.licitacion_id)\
            .filter(LicitacionDetalle.id.is_(None))
        
        if limit:
            query = query.limit(limit)
        
        return query.all()
    
    def query_ordenes_sin_detalle(self, limit: Optional[int] = None) -> List[tuple]:
        """
        Query órdenes de compra that don't have detalle records yet
        
        Returns:
            List of tuples (id, codigo_oc)
        """
        if not self.session:
            self.connect()
        
        query = self.session.query(OrdenCompra.id, OrdenCompra.codigo_oc)\
            .outerjoin(OrdenCompraDetalle, OrdenCompra.id == OrdenCompraDetalle.orden_compra_id)\
            .filter(OrdenCompraDetalle.id.is_(None))
        
        if limit:
            query = query.limit(limit)
        
        return query.all()
    
    def query_licitaciones_para_actualizar(
        self,
        dias_sin_actualizar: int = 7,
        excluir_estados_finales: List[str] = None,
        limit: Optional[int] = None
    ) -> List[tuple]:
        """
        Query licitaciones that need updating
        
        Returns:
            List of tuples (id, codigo_externo, detalle_id)
        """
        if not self.session:
            self.connect()
        
        if excluir_estados_finales is None:
            excluir_estados_finales = ['Cerrada', 'Desierta', 'Adjudicada', 'Cancelada']
        
        fecha_limite = now_utc() - timedelta(days=dias_sin_actualizar)
        
        query = self.session.query(
            Licitacion.id,
            Licitacion.codigo_externo,
            LicitacionDetalle.id.label('detalle_id')
        )\
            .join(LicitacionDetalle, Licitacion.id == LicitacionDetalle.licitacion_id)\
            .filter(
                or_(
                    LicitacionDetalle.fecha_ultima_actualizacion < fecha_limite,
                    LicitacionDetalle.fecha_ultima_actualizacion.is_(None)
                )
            )
        
        if excluir_estados_finales:
            query = query.filter(
                or_(
                    LicitacionDetalle.estado_actual.notin_(excluir_estados_finales),
                    LicitacionDetalle.estado_actual.is_(None)
                )
            )
        
        if limit:
            query = query.limit(limit)
        
        return query.all()
    
    def query_ordenes_para_actualizar(
        self,
        dias_sin_actualizar: int = 7,
        excluir_estados_finales: List[str] = None,
        limit: Optional[int] = None
    ) -> List[tuple]:
        """
        Query órdenes de compra that need updating
        
        Returns:
            List of tuples (id, codigo_oc, detalle_id)
        """
        if not self.session:
            self.connect()
        
        if excluir_estados_finales is None:
            excluir_estados_finales = ['Cerrada', 'Finalizada', 'Cancelada']
        
        fecha_limite = now_utc() - timedelta(days=dias_sin_actualizar)
        
        query = self.session.query(
            OrdenCompra.id,
            OrdenCompra.codigo_oc,
            OrdenCompraDetalle.id.label('detalle_id')
        )\
            .join(OrdenCompraDetalle, OrdenCompra.id == OrdenCompraDetalle.orden_compra_id)\
            .filter(
                or_(
                    OrdenCompraDetalle.fecha_ultima_actualizacion < fecha_limite,
                    OrdenCompraDetalle.fecha_ultima_actualizacion.is_(None)
                )
            )
        
        if excluir_estados_finales:
            query = query.filter(
                or_(
                    OrdenCompraDetalle.estado_actual.notin_(excluir_estados_finales),
                    OrdenCompraDetalle.estado_actual.is_(None)
                )
            )
        
        if limit:
            query = query.limit(limit)
        
        return query.all()
    
    def _trigger_licitacion_alerts(self, licitacion_ids: List[int]):
        """Trigger alert processing for new licitaciones"""
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../backend'))
            from app.utils.alert_trigger import trigger_licitacion_alert
            
            for licitacion_id in licitacion_ids:
                try:
                    trigger_licitacion_alert(licitacion_id, use_celery=True)
                except Exception as e:
                    self.logger.warning(f"Failed to trigger alert for licitacion {licitacion_id}: {e}")
        except ImportError:
            self.logger.debug("Alert trigger not available, skipping alert processing")
        except Exception as e:
            self.logger.warning(f"Failed to trigger alerts: {e}")
    
    def _trigger_orden_compra_alerts(self, orden_compra_ids: List[int]):
        """Trigger alert processing for new órdenes de compra"""
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../backend'))
            from app.utils.alert_trigger import trigger_orden_compra_alert
            
            for orden_compra_id in orden_compra_ids:
                try:
                    trigger_orden_compra_alert(orden_compra_id, use_celery=True)
                except Exception as e:
                    self.logger.warning(f"Failed to trigger alert for orden_compra {orden_compra_id}: {e}")
        except ImportError:
            self.logger.debug("Alert trigger not available, skipping alert processing")
        except Exception as e:
            self.logger.warning(f"Failed to trigger alerts: {e}")
    
    def load(self, data: List[Dict[str, Any]]) -> int:
        """
        Generic load method required by BaseLoader
        
        This method detects the type of data and routes to the appropriate loader.
        For more control, use load_licitaciones() or load_ordenes_compra() directly.
        
        Args:
            data: List of data records to load
            
        Returns:
            Number of records successfully loaded
        """
        if not data:
            return 0
        
        # Try to detect data type from first record
        first_record = data[0]
        
        # Check for licitaciones keys
        if 'CodigoExterno' in first_record or 'codigo_externo' in first_record:
            self.logger.info(f"Detected licitaciones data, loading {len(data)} records")
            return self.load_licitaciones(data)
        
        # Check for órdenes de compra keys
        elif 'CodigoOC' in first_record or 'codigo_oc' in first_record:
            self.logger.info(f"Detected órdenes de compra data, loading {len(data)} records")
            return self.load_ordenes_compra(data)
        
        else:
            self.logger.warning(f"Could not detect data type from record keys: {first_record.keys()}")
            raise ValueError(
                "Could not determine data type. Expected licitaciones or órdenes de compra data. "
                "Use load_licitaciones() or load_ordenes_compra() directly for more control."
            )

