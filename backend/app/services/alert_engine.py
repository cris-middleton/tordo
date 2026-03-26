"""
Alert Engine Service
Matches new records to user preferences and sends notifications.

Key methods
-----------
create_alert_idempotent — INSERT ... ON CONFLICT DO NOTHING on idempotency_key
match_nueva_licitacion  — TF-IDF score every empresa profile, emit NUEVA_LICITACION_MATCH
"""
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import or_, and_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertPreference, AlertStatus, AlertType, NotificationChannel
from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra
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
    
    def create_alert_idempotent(
        self,
        *,
        user_id: int,
        alert_type: AlertType,
        entity_type: str,
        entity_id: int,
        title: str,
        idempotency_key: str,
        message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        empresa_id=None,
        notification_channels: Optional[List[str]] = None,
    ) -> bool:
        """
        Insert an alert using PostgreSQL INSERT … ON CONFLICT DO NOTHING.

        The idempotency_key column has a UNIQUE index, so concurrent workers
        racing on the same key will result in exactly one row being inserted.

        Returns True if a new row was inserted, False if the key already existed.
        """
        stmt = (
            pg_insert(Alert.__table__)
            .values(
                user_id=user_id,
                alert_type=alert_type.value,
                status=AlertStatus.PENDING.value,
                entity_type=entity_type,
                entity_id=entity_id,
                title=title,
                message=message,
                alert_metadata=metadata or {},
                notification_channels=notification_channels or ["in_app"],
                idempotency_key=idempotency_key,
                empresa_id=empresa_id,
            )
            .on_conflict_do_nothing(index_elements=["idempotency_key"])
        )
        result = self.db.execute(stmt)
        self.db.commit()
        return bool(result.rowcount)

    def match_nueva_licitacion(self, licitacion: Licitacion) -> Dict[str, Any]:
        """
        Run TF-IDF semantic matching for a newly-extracted licitación against
        every empresa that has a saved TFIDFPerfil vector.

        For each empresa whose score is "alto" or "medio", emit a
        NUEVA_LICITACION_MATCH alert for every member of that empresa.
        Alerts are idempotent: re-running for the same licitación+empresa
        produces no duplicates.

        Returns {"created": N, "skipped": N} or a dict with a reason key
        when the feature is disabled / model not loaded.
        """
        if not settings.feature_tfidf:
            return {"skipped_reason": "feature_tfidf_off"}

        from app.services import tfidf_matcher  # lazy — model may not be loaded

        if not tfidf_matcher.is_available():
            logger.info("[Matching] TF-IDF model not loaded — skipping licitacion %s", licitacion.codigo_externo)
            return {"skipped_reason": "model_not_loaded"}

        texto = (licitacion.nombre or "").strip()
        if not texto:
            return {"skipped_reason": "no_nombre"}

        from app.models.empresa import EmpresaUsuario, TFIDFPerfil

        perfiles: List[TFIDFPerfil] = (
            self.db.query(TFIDFPerfil)
            .filter(TFIDFPerfil.vector_bytes.isnot(None))
            .all()
        )

        created = 0
        skipped = 0

        for perfil in perfiles:
            try:
                score, nivel = tfidf_matcher.score_empresa_licitacion(perfil.vector_bytes, texto)
            except Exception as exc:
                logger.warning("[Matching] score failed for empresa %s: %s", perfil.empresa_id, exc)
                continue

            if nivel not in ("alto", "medio"):
                continue

            memberships: List[EmpresaUsuario] = (
                self.db.query(EmpresaUsuario)
                .filter(EmpresaUsuario.empresa_id == perfil.empresa_id)
                .all()
            )

            for m in memberships:
                # key format: nueva_lic_match_<sha8>_<user_id>
                # sha8 of "licitacion_id:empresa_id" keeps key short & deterministic
                raw_key = f"{licitacion.id}:{perfil.empresa_id}"
                key_hash = hashlib.sha256(raw_key.encode()).hexdigest()[:16]
                idempotency_key = f"nueva_lic_match_{key_hash}_{m.user_id}"

                inserted = self.create_alert_idempotent(
                    user_id=m.user_id,
                    alert_type=AlertType.NUEVA_LICITACION_MATCH,
                    entity_type="licitacion",
                    entity_id=licitacion.id,
                    title=f"Licitación relevante: {licitacion.nombre[:100]}",
                    message=(
                        f"Nueva licitación '{licitacion.nombre}' "
                        f"(código {licitacion.codigo_externo}) tiene encaje {nivel} "
                        f"con el perfil de tu empresa. Similitud: {score:.1%}."
                    ),
                    idempotency_key=idempotency_key,
                    metadata={
                        "codigo_externo": licitacion.codigo_externo,
                        "score_encaje": round(score, 4),
                        "nivel": nivel,
                    },
                    empresa_id=perfil.empresa_id,
                    notification_channels=["in_app"],
                )
                if inserted:
                    created += 1
                else:
                    skipped += 1

        logger.info(
            "[Matching] licitacion=%s created=%d skipped=%d",
            licitacion.codigo_externo, created, skipped,
        )
        return {"created": created, "skipped": skipped}

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

        # WhatsApp notification
        if getattr(user, 'notification_whatsapp', False) and user.whatsapp_number:
            try:
                self._send_whatsapp_notification(alert, user)
                channels_used.append(NotificationChannel.WHATSAPP.value)
            except Exception as e:
                logger.error(f"Failed to send WhatsApp notification: {e}")

        # Update alert
        alert.notification_channels = channels_used
        alert.status = AlertStatus.SENT
        alert.sent_at = datetime.now(timezone.utc)
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
    
    def _send_whatsapp_notification(self, alert: Alert, user: User):
        """Send WhatsApp notification via Twilio service"""
        from app.services.twilio_service import send_whatsapp_alert

        message = f"*{alert.title}*\n\n{alert.message or ''}"
        success = send_whatsapp_alert(user.whatsapp_number, message)
        if not success:
            raise RuntimeError(f"WhatsApp delivery failed for user {user.id}")

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

