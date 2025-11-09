"""
Database loader for ETL pipeline
Loads transformed data into PostgreSQL database
"""
from typing import List, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from etl.loaders.base import BaseLoader
from etl.config import config

# Import models from backend
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../backend'))
from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra
from app.db import Base


class DatabaseLoader(BaseLoader):
    """Load data into PostgreSQL database"""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        from etl.config import config as etl_config
        if config:
            self.database_url = config.get("DATABASE_URL", etl_config.DATABASE_URL)
        else:
            self.database_url = etl_config.DATABASE_URL
        self.engine = None
        self.session = None
    
    def connect(self):
        """Establish connection to database"""
        try:
            self.engine = create_engine(
                self.database_url,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20
            )
            Session = sessionmaker(bind=self.engine)
            self.session = Session()
            
            # Create tables if they don't exist
            Base.metadata.create_all(bind=self.engine)
            
            self.logger.info("Connected to database successfully")
        except Exception as e:
            self.logger.error(f"Failed to connect to database: {str(e)}")
            raise
    
    def disconnect(self):
        """Close database connection"""
        if self.session:
            self.session.close()
        if self.engine:
            self.engine.dispose()
        self.logger.info("Disconnected from database")
    
    def load_licitaciones(self, data: List[Dict[str, Any]]) -> int:
        """
        Load licitaciones into database
        
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
        new_record_ids = []  # Track IDs of newly created records for alert triggering
        
        for record in data:
            try:
                # Check if record already exists
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
                    # Flush to get the ID
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
            
            # Trigger alerts for new records (optional, requires Celery/Redis)
            if new_record_ids:
                self._trigger_licitacion_alerts(new_record_ids)
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Failed to commit licitaciones: {str(e)}")
            raise
        
        return loaded_count + updated_count
    
    def _trigger_licitacion_alerts(self, licitacion_ids: List[int]):
        """Trigger alert processing for new licitaciones"""
        try:
            # Try to import and use the alert trigger utility
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../backend'))
            from app.utils.alert_trigger import trigger_licitacion_alert
            
            for licitacion_id in licitacion_ids:
                try:
                    trigger_licitacion_alert(licitacion_id, use_celery=True)
                except Exception as e:
                    self.logger.warning(f"Failed to trigger alert for licitacion {licitacion_id}: {e}")
        except ImportError:
            # Alert system not available, skip
            self.logger.debug("Alert trigger not available, skipping alert processing")
        except Exception as e:
            self.logger.warning(f"Failed to trigger alerts: {e}")
    
    def load_ordenes_compra(self, data: List[Dict[str, Any]]) -> int:
        """
        Load órdenes de compra into database
        
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
        new_record_ids = []  # Track IDs of newly created records for alert triggering
        
        for record in data:
            try:
                # Check if record already exists
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
                    # Flush to get the ID
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
            
            # Trigger alerts for new records (optional, requires Celery/Redis)
            if new_record_ids:
                self._trigger_orden_compra_alerts(new_record_ids)
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Failed to commit órdenes de compra: {str(e)}")
            raise
        
        return loaded_count + updated_count
    
    def _trigger_orden_compra_alerts(self, orden_compra_ids: List[int]):
        """Trigger alert processing for new órdenes de compra"""
        try:
            # Try to import and use the alert trigger utility
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../backend'))
            from app.utils.alert_trigger import trigger_orden_compra_alert
            
            for orden_compra_id in orden_compra_ids:
                try:
                    trigger_orden_compra_alert(orden_compra_id, use_celery=True)
                except Exception as e:
                    self.logger.warning(f"Failed to trigger alert for orden_compra {orden_compra_id}: {e}")
        except ImportError:
            # Alert system not available, skip
            self.logger.debug("Alert trigger not available, skipping alert processing")
        except Exception as e:
            self.logger.warning(f"Failed to trigger alerts: {e}")
    
    def load(self, data: List[Dict[str, Any]], data_type: str = "licitacion") -> int:
        """
        Load data into database
        
        Args:
            data: List of data records to load
            data_type: Type of data ("licitacion" or "orden_compra")
            
        Returns:
            Number of records successfully loaded
        """
        if data_type == "licitacion":
            return self.load_licitaciones(data)
        elif data_type == "orden_compra":
            return self.load_ordenes_compra(data)
        else:
            raise ValueError(f"Unknown data type: {data_type}")

