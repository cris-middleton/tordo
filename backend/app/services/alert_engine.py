"""
Alert Engine Service
Matches new records to user preferences and sends notifications
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from datetime import datetime
import httpx
import logging

from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra
from app.models.alert import Alert, AlertPreference, AlertStatus, AlertType, NotificationChannel
from app.models.user import User
from app.config import settings

logger = logging.getLogger(__name__)


class AlertEngine:
    """Engine for matching records to user preferences and sending alerts"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def match_licitacion_to_preferences(self, licitacion: Licitacion) -> List[AlertPreference]:
        """Match a licitacion to user preferences"""
        # Get all active preferences
        preferences = self.db.query(AlertPreference).filter(
            AlertPreference.is_active == True
        ).all()
        
        matched_preferences = []
        
        for preference in preferences:
            if self._matches_preference(licitacion, preference):
                matched_preferences.append(preference)
        
        return matched_preferences
    
    def match_orden_compra_to_preferences(self, orden_compra: OrdenCompra) -> List[AlertPreference]:
        """Match an orden_compra to user preferences"""
        # Get all active preferences
        preferences = self.db.query(AlertPreference).filter(
            AlertPreference.is_active == True
        ).all()
        
        matched_preferences = []
        
        for preference in preferences:
            if self._matches_preference(orden_compra, preference):
                matched_preferences.append(preference)
        
        return matched_preferences
    
    def _matches_preference(self, entity: Any, preference: AlertPreference) -> bool:
        """Check if an entity matches a preference"""
        # Category match
        if preference.category_id:
            # Check if entity has items with matching category
            # This is a simplified check - you may need to enhance based on your data structure
            if hasattr(entity, 'items') and entity.items:
                # Check if any item matches the category
                # This would need to be implemented based on your actual data structure
                pass
        
        # Organismo match
        if preference.organismo_ids:
            entity_org_id = getattr(entity, 'organismo_id', None)
            if not entity_org_id or entity_org_id not in preference.organismo_ids:
                return False
        
        # Amount filters
        amount = getattr(entity, 'monto_estimado', None) or getattr(entity, 'monto_total', None)
        if amount:
            if preference.min_amount and float(amount) < preference.min_amount:
                return False
            if preference.max_amount and float(amount) > preference.max_amount:
                return False
        
        # Estado match
        if preference.estados:
            estado = getattr(entity, 'estado', None)
            if not estado or estado not in preference.estados:
                return False
        
        # Region match
        if preference.regiones:
            region = getattr(entity, 'region', None)
            if not region or region not in preference.regiones:
                return False
        
        # Comuna match
        if preference.comunas:
            comuna = getattr(entity, 'comuna', None)
            if not comuna or comuna not in preference.comunas:
                return False
        
        # Keywords match
        if preference.keywords:
            nombre = getattr(entity, 'nombre', '') or ''
            descripcion = getattr(entity, 'descripcion', '') or ''
            text = f"{nombre} {descripcion}".lower()
            
            # Check if any keyword matches
            matches = any(keyword.lower() in text for keyword in preference.keywords)
            if not matches:
                return False
        
        return True
    
    def create_alert(
        self,
        user_id: int,
        alert_type: AlertType,
        entity_type: str,
        entity_id: int,
        title: str,
        message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Alert:
        """Create an alert in the database"""
        alert = Alert(
            user_id=user_id,
            alert_type=alert_type,
            entity_type=entity_type,
            entity_id=entity_id,
            title=title,
            message=message,
            metadata=metadata or {},
            status=AlertStatus.PENDING,
        )
        
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        
        return alert
    
    def send_notifications(self, alert: Alert) -> List[str]:
        """Send notifications for an alert via configured channels"""
        user = self.db.query(User).filter(User.id == alert.user_id).first()
        if not user:
            logger.error(f"User {alert.user_id} not found for alert {alert.id}")
            return []
        
        channels_used = []
        
        # Email notification
        if user.notification_email:
            try:
                self._send_email_notification(alert, user)
                channels_used.append(NotificationChannel.EMAIL.value)
            except Exception as e:
                logger.error(f"Failed to send email notification: {e}")
        
        # In-app notification (already created in database)
        if user.notification_in_app:
            channels_used.append(NotificationChannel.IN_APP.value)
        
        # Webhook notification
        webhook_url = user.webhook_url
        if user.notification_webhook and webhook_url:
            try:
                self._send_webhook_notification(alert, webhook_url)
                channels_used.append(NotificationChannel.WEBHOOK.value)
            except Exception as e:
                logger.error(f"Failed to send webhook notification: {e}")
        
        # Update alert
        alert.notification_channels = channels_used
        alert.status = AlertStatus.SENT
        alert.sent_at = datetime.utcnow()
        self.db.commit()
        
        return channels_used
    
    def _send_email_notification(self, alert: Alert, user: User):
        """Send email notification"""
        from app.core.email import send_alert_email
        
        # Construct alert URL
        alert_url = None
        if settings.frontend_url:
            alert_url = f"{settings.frontend_url}/alerts/{alert.id}"
        
        # Send email
        send_alert_email(
            user_email=user.email,
            alert_title=alert.title,
            alert_message=alert.message or alert.title,
            alert_url=alert_url,
        )
    
    def _send_webhook_notification(self, alert: Alert, webhook_url: str):
        """Send webhook notification"""
        try:
            payload = {
                "alert_id": alert.id,
                "alert_type": alert.alert_type.value,
                "title": alert.title,
                "message": alert.message,
                "entity_type": alert.entity_type,
                "entity_id": alert.entity_id,
                "alert_metadata": alert.alert_metadata,
                "created_at": alert.created_at.isoformat(),
            }
            
            with httpx.Client(timeout=10.0) as client:
                response = client.post(webhook_url, json=payload)
                response.raise_for_status()
                logger.info(f"Webhook notification sent successfully to {webhook_url}")
        except Exception as e:
            logger.error(f"Webhook notification failed: {e}")
            raise
    
    def process_new_licitacion(self, licitacion_id: int):
        """Process a new licitacion and create alerts for matching preferences"""
        licitacion = self.db.query(Licitacion).filter(Licitacion.id == licitacion_id).first()
        if not licitacion:
            logger.error(f"Licitacion {licitacion_id} not found")
            return
        
        preferences = self.match_licitacion_to_preferences(licitacion)
        
        for preference in preferences:
            user = self.db.query(User).filter(User.id == preference.user_id).first()
            if not user or not user.is_active:
                continue
            
            # Create alert
            title = f"Nueva Licitación: {licitacion.nombre}"
            message = f"Se encontró una nueva licitación que coincide con tu preferencia '{preference.name}'"
            
            alert = self.create_alert(
                user_id=preference.user_id,
                alert_type=AlertType.NEW_TENDER,
                entity_type="licitacion",
                entity_id=licitacion.id,
                title=title,
                message=message,
                metadata={
                    "preference_id": preference.id,
                    "preference_name": preference.name,
                    "codigo_externo": licitacion.codigo_externo,
                }
            )
            
            # Send notifications
            self.send_notifications(alert)
    
    def process_new_orden_compra(self, orden_compra_id: int):
        """Process a new orden_compra and create alerts for matching preferences"""
        orden_compra = self.db.query(OrdenCompra).filter(OrdenCompra.id == orden_compra_id).first()
        if not orden_compra:
            logger.error(f"OrdenCompra {orden_compra_id} not found")
            return
        
        preferences = self.match_orden_compra_to_preferences(orden_compra)
        
        for preference in preferences:
            user = self.db.query(User).filter(User.id == preference.user_id).first()
            if not user or not user.is_active:
                continue
            
            # Create alert
            title = f"Nueva Orden de Compra: {orden_compra.nombre}"
            message = f"Se encontró una nueva orden de compra que coincide con tu preferencia '{preference.name}'"
            
            alert = self.create_alert(
                user_id=preference.user_id,
                alert_type=AlertType.NEW_ORDER,
                entity_type="orden_compra",
                entity_id=orden_compra.id,
                title=title,
                message=message,
                metadata={
                    "preference_id": preference.id,
                    "preference_name": preference.name,
                    "codigo_oc": orden_compra.codigo_oc,
                }
            )
            
            # Send notifications
            self.send_notifications(alert)

