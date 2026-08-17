"""
Alert Engine Service
Matches new records to user preferences and sends notifications.

Key methods
-----------
create_alert_idempotent — INSERT ... ON CONFLICT DO NOTHING on idempotency_key
match_nueva_licitacion  — TF-IDF score every empresa profile, emit NUEVA_LICITACION_MATCH
"""

import logging
import unicodedata
from typing import Any, Dict, List

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.models.alert import Alert, AlertPreference, AlertStatus, AlertType
from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra
from app.models.user import User

# Import por nombre y no `from app.services import notificaciones`: este módulo
# lo importa `app/services/__init__.py`, así que cuando se ejecuta esta línea el
# paquete `app.services` está a medio inicializar y todavía no tiene el atributo.
# Importar el submódulo directamente sí funciona — y `notificaciones` no importa
# de vuelta a `alert_engine`, así que no hay ciclo.
from app.services.notificaciones import despachar as despachar_alerta

# Import por nombres y no `from app.services import notificaciones`: este módulo
# lo importa `app/services/__init__.py`, así que cuando se ejecuta esta línea el
# paquete `app.services` está a medio inicializar y todavía no tiene el atributo.
# Importar el submódulo directamente sí funciona — y `notificaciones` no importa
# de vuelta a `alert_engine`, así que no hay ciclo.

logger = logging.getLogger(__name__)


def _sin_tildes(texto: str) -> str:
    """Minúsculas y sin diacríticos, para comparar como compara una persona.

    `NFD` separa la letra de su tilde y el filtro descarta los combinantes, así
    que «Licitación» y «licitacion» quedan iguales.

    **La ñ también se pliega a n** («Ñuble» → «nuble», «Peñalolén» →
    «penalolen»). Como criterio lingüístico es discutible —la ñ es una letra
    aparte, no una n con adorno— pero es exactamente lo que hace
    `inmutable_unaccent` en la búsqueda del catálogo, y dos reglas distintas
    para el mismo idioma dentro del mismo producto es peor: el usuario que
    encuentra «Ñuble» buscando «nuble» en el catálogo esperaría que su alerta
    hiciera lo mismo.
    """
    descompuesto = unicodedata.normalize("NFD", texto.lower())
    sin_marcas = "".join(c for c in descompuesto if unicodedata.category(c) != "Mn")
    return unicodedata.normalize("NFC", sin_marcas)


class AlertEngine:
    """Engine for matching records to user preferences and sending alerts"""

    def __init__(self, db: Session):
        self.db = db

    def match_licitacion_to_preferences(self, licitacion: Licitacion) -> List[AlertPreference]:
        """Match a licitacion to user preferences"""
        # Get all active preferences
        preferences = self.db.query(AlertPreference).filter(AlertPreference.is_active == True).all()

        matched_preferences = []

        for preference in preferences:
            if self._matches_preference(licitacion, preference):
                matched_preferences.append(preference)

        return matched_preferences

    def match_orden_compra_to_preferences(self, orden_compra: OrdenCompra) -> List[AlertPreference]:
        """Match an orden_compra to user preferences"""
        # Get all active preferences
        preferences = self.db.query(AlertPreference).filter(AlertPreference.is_active == True).all()

        matched_preferences = []

        for preference in preferences:
            if self._matches_preference(orden_compra, preference):
                matched_preferences.append(preference)

        return matched_preferences

    def _matches_preference(self, entity: Any, preference: AlertPreference) -> bool:
        """Check if an entity matches a preference"""
        # **No hay filtro por categoría, y no es un olvido.** Aquí había un
        # bloque que terminaba en `pass` con un «this would need to be
        # implemented»: aceptaba `category_id`, no comparaba nada y dejaba pasar
        # todo. Quien creía haber acotado sus alertas a una categoría las
        # recibía todas. No es implementable tal cual — ni `Licitacion` ni
        # `OrdenCompra` están clasificadas contra `categories` —, así que el
        # campo salió del esquema de la API en vez de seguir prometiéndose.

        # Organismo match
        if preference.organismo_ids:
            entity_org_id = getattr(entity, "organismo_id", None)
            if not entity_org_id or entity_org_id not in preference.organismo_ids:
                return False

        # Amount filters.
        #
        # `is not None` y no un booleano: un monto de 0 es falsy, así que se
        # saltaba los dos filtros y una licitación sin monto declarado colaba
        # por debajo de cualquier `min_amount`. El `or` de arriba tiene el mismo
        # problema, y ahí sí conviene: un `monto_estimado` de 0 debe caer al
        # `monto_total`.
        amount = getattr(entity, "monto_estimado", None) or getattr(entity, "monto_total", None)
        if amount is not None:
            if preference.min_amount and float(amount) < preference.min_amount:
                return False
            if preference.max_amount and float(amount) > preference.max_amount:
                return False

        # Estado match
        if preference.estados:
            estado = getattr(entity, "estado", None)
            if not estado or estado not in preference.estados:
                return False

        # Region match
        if preference.regiones:
            region = getattr(entity, "region", None)
            if not region or region not in preference.regiones:
                return False

        # Comuna match
        if preference.comunas:
            comuna = getattr(entity, "comuna", None)
            if not comuna or comuna not in preference.comunas:
                return False

        # Keywords match.
        #
        # **Se comparan sin tildes, en los dos sentidos.** Es la misma decisión
        # que la búsqueda del catálogo, y por el mismo motivo: en español de
        # Chile la gente escribe «licitacion» y el organismo publica
        # «Licitación». Comparando en crudo, una palabra clave con tilde no
        # encontraba el texto sin ella ni al revés, y el usuario concluía que no
        # había nada de lo suyo.
        if preference.keywords:
            nombre = getattr(entity, "nombre", "") or ""
            descripcion = getattr(entity, "descripcion", "") or ""
            texto = _sin_tildes(f"{nombre} {descripcion}")

            if not any(_sin_tildes(k) in texto for k in preference.keywords if k):
                return False

        return True

    def create_alert(
        self,
        user_id: int,
        alert_type: AlertType,
        entity_type: str,
        entity_id: int,
        title: str,
        message: str | None = None,
        alert_metadata: Dict[str, Any] | None = None,
    ) -> Alert:
        """Crea una alerta en la base.

        **El parámetro se llama `alert_metadata`, y el cambio no es cosmético.**
        Antes era `metadata` y se pasaba tal cual al constructor del modelo. En
        un modelo declarativo de SQLAlchemy `metadata` es un atributo reservado
        —el objeto `MetaData` de la clase—, así que el constructor lo aceptaba
        sin quejarse, lo sombreaba en la instancia y **dejaba la columna real en
        `NULL`**. Sin excepción, sin aviso.

        Se perdía en las dos alertas del camino por preferencias
        (`NEW_TENDER` y `NEW_ORDER`), y `NEW_TENDER` sale por correo en tanda:
        `correo_render` lee `alert_metadata` para armar el mensaje, así que los
        avisos salían sin el código de la licitación —lo único que permite
        llegar a ella— y sin el nombre de la preferencia que los disparó.

        El camino moderno (`create_alert_idempotent`) no repite ESTE fallo —el
        de quedar en `NULL` sin aviso—: escribe contra `Alert.__table__`, la
        `Table` cruda, así que nunca pasa por el constructor del modelo ni por
        su atributo sombreado. Pero tiene el suyo propio: ahí la columna se
        llama `metadata`, no `alert_metadata` —eso es sólo el nombre del
        atributo Python—, y pasarle la clave equivocada a `Table.values()` no
        queda en silencio como el bug original: revienta con `CompileError`.
        Ver el comentario en esa función.
        """
        alert = Alert(
            user_id=user_id,
            alert_type=alert_type,
            entity_type=entity_type,
            entity_id=entity_id,
            title=title,
            message=message,
            alert_metadata=alert_metadata or {},
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
        message: str | None = None,
        alert_metadata: Dict[str, Any] | None = None,
        empresa_id=None,
        notification_channels: List[str] | None = None,
    ) -> int | None:
        """
        Insert an alert using PostgreSQL INSERT … ON CONFLICT DO NOTHING.

        The idempotency_key column has a UNIQUE index, so concurrent workers
        racing on the same key will result in exactly one row being inserted.

        **Devuelve el id de la fila insertada, o None si la clave ya existía.**
        Antes devolvía un booleano, y con un booleano no se puede notificar: hace
        falta saber *cuál* alerta salió nueva. Sin el `RETURNING`, la única forma
        de despachar sería releer por clave de idempotencia — y ahí ya no se
        distingue la que acaba de entrar de la que estaba desde ayer, que es
        exactamente cómo se manda dos veces el mismo correo.

        `notification_channels` queda como valor provisional: los canales reales
        los escribe el despacho, que es quien sabe cuáles funcionaron.

        **`.values()` recibe `metadata=`, no `alert_metadata=`.** Esto va contra
        `Alert.__table__` — la `Table` cruda, no la clase mapeada— y ahí la
        columna se llama `metadata`: es `alert_metadata` sólo como atributo
        Python de la clase declarativa (ver el comentario en `models/alert.py`).
        Pasarle `alert_metadata=` aquí no revive el bug silencioso original
        (`NULL` sin aviso): revienta con `CompileError: Unconsumed column
        names`, porque `Table.values()` empareja por el nombre de columna de la
        `Table`, no por el atributo del ORM.
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
                metadata=alert_metadata or {},
                notification_channels=notification_channels or ["in_app"],
                idempotency_key=idempotency_key,
                empresa_id=empresa_id,
            )
            .on_conflict_do_nothing(index_elements=["idempotency_key"])
            .returning(Alert.__table__.c.id)
        )
        insertado = self.db.execute(stmt).scalar_one_or_none()
        self.db.commit()
        return insertado

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
            logger.info(
                "[Matching] TF-IDF model not loaded — skipping licitacion %s",
                licitacion.codigo_externo,
            )
            return {"skipped_reason": "model_not_loaded"}

        texto = (licitacion.nombre or "").strip()
        if not texto:
            return {"skipped_reason": "no_nombre"}

        from app.models.empresa import EmpresaUsuario, TFIDFPerfil

        perfiles: List[TFIDFPerfil] = (
            self.db.query(TFIDFPerfil).filter(TFIDFPerfil.vector_bytes.isnot(None)).all()
        )

        created = 0
        skipped = 0
        nuevas: List[int] = []

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
                idempotency_key = f"nueva_lic_match_{licitacion.id}_{perfil.empresa_id}_{m.user_id}"

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
                    alert_metadata={
                        "codigo_externo": licitacion.codigo_externo,
                        "score_encaje": round(score, 4),
                        "nivel": nivel,
                    },
                    empresa_id=perfil.empresa_id,
                    notification_channels=["in_app"],
                )
                if inserted is not None:
                    created += 1
                    nuevas.append(inserted)
                else:
                    skipped += 1

        logger.info(
            "[Matching] licitacion=%s created=%d skipped=%d",
            licitacion.codigo_externo,
            created,
            skipped,
        )
        # **No se despacha aquí, y es deliberado.** Esta función corre una vez por
        # licitación nueva; despachar dentro daría un correo por licitación, que
        # es justo lo que la tanda existe para evitar. Quien orquesta la corrida
        # —`etl_tasks._run_matching_for_new_licitaciones`— junta los ids de todas
        # y llama una sola vez a `notificaciones.despachar_pendientes`.
        return {"created": created, "skipped": skipped, "ids": nuevas}

    def send_notifications(self, alert: Alert) -> List[str]:
        """Despacha una alerta por los canales que le tocan.

        El despacho vive en `services/notificaciones.py`, no aquí. Estaba dentro
        del motor y sólo lo llamaba el camino viejo por preferencias, así que
        todo lo construido después —encaje semántico, plazos, documentos, estado
        hábil, precio— se quedaba dentro de la aplicación sin que nada avisara.
        """
        canales = despachar_alerta(alert, self.db)
        alert.status = AlertStatus.SENT
        self.db.commit()
        return canales

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
                alert_metadata={
                    "preference_id": preference.id,
                    "preference_name": preference.name,
                    "codigo_externo": licitacion.codigo_externo,
                },
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
                alert_metadata={
                    "preference_id": preference.id,
                    "preference_name": preference.name,
                    "codigo_oc": orden_compra.codigo_oc,
                },
            )

            # Send notifications
            self.send_notifications(alert)
