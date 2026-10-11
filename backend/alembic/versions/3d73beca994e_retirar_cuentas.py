"""retirar cuentas

El pivote a sitio público (docs/PIVOTE_PUBLICO_2026-10.md) retira las cuentas:
usuarios y sesión, empresas y roles, claves de API, cobro, documentos, estado
hábil, postulaciones, alertas, encaje, vigilancia de precios y competidores.
Se van sus 21 tablas, más `categories` —su único uso era una FK desde
`alert_preferences`— y los tipos enum de las alertas, que `drop_table` no borra.

Con ellas desaparecen también las cuentas de prueba (D13).

El `downgrade` recrea el ESQUEMA vacío, no los datos: lo que se borra aquí no
vuelve. Existe porque CI exige `upgrade → downgrade → upgrade` limpio.

Revision ID: 3d73beca994e
Revises: 91d4eefa77c9
Create Date: 2026-10-11 20:23:41.130806

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '3d73beca994e'
down_revision: Union[str, None] = '91d4eefa77c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: De hijos a padres: cada tabla se borra antes que aquéllas a las que apunta.
#: Los índices caen con su tabla.
TABLAS = [
    'suscripcion_precio',
    'precio_referencia',
    'competidor_seguido',
    'checklist_postulacion',
    'plantillas_checklist',
    'postulaciones',
    'estado_habil_log',
    'documentos_empresa',
    'match_empresa_licitacion',
    'tfidf_perfiles',
    'alerts',
    'alert_preferences',
    'password_reset_tokens',
    'email_verification_tokens',
    'oauth_codigos',
    'refresh_tokens',
    'api_keys',
    'empresas_usuario',
    'categories',
    'empresas',
    'users',
]

#: `drop_table` no borra los enum de Postgres (ver la migración 001).
#: `notificationchannel` puede no existir según la ruta por la que se creó la base.
TIPOS = ['alerttype', 'alertstatus', 'notificationchannel']


def upgrade() -> None:
    for tabla in TABLAS:
        op.drop_table(tabla)
    for tipo in TIPOS:
        op.execute(f"DROP TYPE IF EXISTS {tipo}")


def downgrade() -> None:
    # Esquema reflejado de una base en 91d4eefa77c9, recreado de padres a hijos.
    # Los enum `alerttype` y `alertstatus` los crea `create_table('alerts')`.
    op.create_table('users',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('email', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('username', sa.VARCHAR(length=100), autoincrement=False, nullable=False),
    sa.Column('hashed_password', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('full_name', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('is_active', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('is_superuser', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('is_verified', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('notification_email', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('notification_in_app', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('notification_webhook', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('webhook_url', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('last_login', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('onboarding_completed', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False),
    sa.Column('onboarding_step', sa.SMALLINT(), server_default=sa.text("'0'::smallint"), autoincrement=False, nullable=False),
    sa.Column('google_id', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('recibe_informe_semanal', sa.BOOLEAN(), server_default=sa.text('true'), autoincrement=False, nullable=False, comment='Si recibe el informe semanal por correo.'),
    sa.PrimaryKeyConstraint('id', name=op.f('users_pkey')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    sa.UniqueConstraint('google_id', name=op.f('uq_users_google_id'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    sa.UniqueConstraint('username', name=op.f('uq_users_username'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Cuentas de acceso. La suscripción y el plan NO viven aquí: pertenecen a la empresa (ADR 0002)'
    )
    op.create_table('empresas',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('rut_empresa', sa.VARCHAR(length=12), autoincrement=False, nullable=False),
    sa.Column('nombre_empresa', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('rubros_cpv', postgresql.ARRAY(sa.TEXT()), autoincrement=False, nullable=True),
    sa.Column('regiones', postgresql.ARRAY(sa.TEXT()), autoincrement=False, nullable=True),
    sa.Column('activo', sa.BOOLEAN(), server_default=sa.text('true'), autoincrement=False, nullable=False),
    sa.Column('estado_habil', sa.VARCHAR(length=20), server_default=sa.text("'desconocido'::character varying"), autoincrement=False, nullable=False),
    sa.Column('estado_habil_updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('plan_tier', sa.VARCHAR(length=20), server_default=sa.text("'basico'::character varying"), autoincrement=False, nullable=False, comment='Plan contratado: basico | pyme | pro | enterprise'),
    sa.Column('subscription_status', sa.VARCHAR(length=20), server_default=sa.text("'inactive'::character varying"), autoincrement=False, nullable=False, comment='Estado de la suscripción: inactive | trialing | active | past_due | canceled'),
    sa.Column('billing_customer_id', sa.VARCHAR(length=255), autoincrement=False, nullable=True, comment='ID del cliente en la pasarela. El formato depende del proveedor.'),
    sa.Column('billing_subscription_id', sa.VARCHAR(length=255), autoincrement=False, nullable=True, comment='ID de la suscripción en la pasarela.'),
    sa.Column('trial_ends_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Fin del reverse-trial. Se fija al crear la empresa, no al registrarse el usuario'),
    sa.Column('trial_reminder_day7_sent_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Cuándo se envió el recordatorio de trial del día 7'),
    sa.Column('trial_reminder_day12_sent_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Cuándo se envió el recordatorio de trial del día 12'),
    sa.Column('billing_provider', sa.VARCHAR(length=30), autoincrement=False, nullable=True, comment='Pasarela que tiene la suscripción: stripe | mercadopago | khipu. NULL mientras no haya suscripción.'),
    sa.Column('plan_vigente_hasta', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Hasta cuándo conserva el plan una empresa que ya canceló. Es el periodo que pagó y todavía no consume; el job nocturno la degrada cuando pasa. NULL si no hay cancelación pendiente.'),
    sa.CheckConstraint("estado_habil::text = ANY (ARRAY['habil'::character varying, 'inhabil'::character varying, 'inscrito'::character varying, 'no_encontrado'::character varying, 'desconocido'::character varying]::text[])", name=op.f('ck_empresas_estado_habil')),
    sa.PrimaryKeyConstraint('id', name=op.f('empresas_pkey')),
    sa.UniqueConstraint('rut_empresa', name=op.f('uq_empresas_rut_empresa'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Empresa proveedora registrada en TORDO. Dueña de la suscripción, el plan y las cuotas (ADR 0002)'
    )
    op.create_index(op.f('ix_empresas_trial_ends_at'), 'empresas', ['trial_ends_at'], unique=False)
    op.create_index(op.f('ix_empresas_billing_provider'), 'empresas', ['billing_provider'], unique=False)
    op.create_index(op.f('ix_empresas_billing_customer_id'), 'empresas', ['billing_customer_id'], unique=False)
    op.create_table('categories',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('code', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
    sa.Column('name', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
    sa.Column('description', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('classification_system', sa.VARCHAR(length=20), autoincrement=False, nullable=False),
    sa.Column('level', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('parent_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('activo', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['parent_id'], ['categories.id'], name=op.f('categories_parent_id_fkey')),
    sa.PrimaryKeyConstraint('id', name=op.f('categories_pkey')),
    sa.UniqueConstraint('code', name=op.f('uq_categories_code'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Taxonomía CPV/UNSPSC. Ni licitaciones ni órdenes están clasificadas contra ella todavía'
    )
    op.create_index(op.f('ix_categories_classification_system'), 'categories', ['classification_system'], unique=False)
    op.create_table('empresas_usuario',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('rol', sa.VARCHAR(length=20), server_default=sa.text("'owner'::character varying"), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.CheckConstraint("rol::text = ANY (ARRAY['owner'::character varying, 'admin'::character varying, 'viewer'::character varying]::text[])", name=op.f('ck_empresas_usuario_rol')),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('empresas_usuario_empresa_id_fkey'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('empresas_usuario_user_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('empresas_usuario_pkey')),
    sa.UniqueConstraint('user_id', 'empresa_id', name=op.f('uq_empresas_usuario'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Membresía usuario ↔ empresa con su rol. Es la tabla que sostiene el aislamiento multi-tenant'
    )
    op.create_index(op.f('ix_empresas_usuario_user_id'), 'empresas_usuario', ['user_id'], unique=False)
    op.create_index(op.f('ix_empresas_usuario_empresa_id'), 'empresas_usuario', ['empresa_id'], unique=False)
    op.create_table('api_keys',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False, comment='Identificador de la clave.'),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=False, comment='Empresa cuyo plan y cuotas gobiernan lo que haga esta clave.'),
    sa.Column('nombre', sa.VARCHAR(length=100), autoincrement=False, nullable=False, comment="Etiqueta para reconocerla: 'Claude Desktop', 'ERP de bodega'…"),
    sa.Column('prefijo', sa.VARCHAR(length=16), autoincrement=False, nullable=False, comment='Primeros caracteres, en claro. Permite identificarla sin conocer el secreto.'),
    sa.Column('key_hash', sa.VARCHAR(length=64), autoincrement=False, nullable=False, comment='SHA-256 de la clave completa. La clave en claro sólo existe al crearla.'),
    sa.Column('creada_por', sa.INTEGER(), autoincrement=False, nullable=True, comment='Quién la emitió. Informativo: los permisos salen de la empresa.'),
    sa.Column('ultimo_uso_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Última vez que se usó. Sirve para detectar claves olvidadas.'),
    sa.Column('expira_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Caducidad opcional. NULL = no caduca.'),
    sa.Column('revocada_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Cuándo se revocó. NULL = vigente.'),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False, comment='Cuándo se emitió.'),
    sa.ForeignKeyConstraint(['creada_por'], ['users.id'], name=op.f('api_keys_creada_por_fkey'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('api_keys_empresa_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('api_keys_pkey')),
    comment='Claves de API para clientes que no son un navegador (MCP, ERP, scripts).'
    )
    op.create_index(op.f('ix_api_keys_key_hash'), 'api_keys', ['key_hash'], unique=True)
    op.create_index(op.f('ix_api_keys_empresa_id'), 'api_keys', ['empresa_id'], unique=False)
    op.create_table('refresh_tokens',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False, comment='Identificador del token emitido.'),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=False, comment='Usuario al que se le emitió.'),
    sa.Column('token_hash', sa.VARCHAR(length=64), autoincrement=False, nullable=False, comment='SHA-256 del token. Nunca se guarda el token en claro.'),
    sa.Column('familia_id', sa.UUID(), autoincrement=False, nullable=False, comment='Agrupa todos los tokens nacidos del mismo inicio de sesión. Detectar una reutilización revoca la familia entera.'),
    sa.Column('reemplazado_por', sa.UUID(), autoincrement=False, nullable=True, comment='Token que lo sustituyó al rotar. NULL si es el vigente.'),
    sa.Column('expira_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False, comment='Caducidad absoluta. Rotar NO la extiende.'),
    sa.Column('revocado_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Cuándo dejó de valer: por rotación, por cierre de sesión o por reutilización.'),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False, comment='Cuándo se emitió.'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('refresh_tokens_user_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('refresh_tokens_pkey')),
    comment='Tokens de refresco con rotación y detección de reutilización.'
    )
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
    op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=True)
    op.create_index(op.f('ix_refresh_tokens_familia_id'), 'refresh_tokens', ['familia_id'], unique=False)
    op.create_table('oauth_codigos',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False, comment='Identificador del código emitido'),
    sa.Column('codigo_hash', sa.VARCHAR(length=64), autoincrement=False, nullable=False, comment='SHA-256 del código. Nunca se guarda en claro'),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=False, comment='Usuario que acaba de autenticarse contra Google'),
    sa.Column('expira_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False, comment='Sesenta segundos desde la emisión: sólo tiene que sobrevivir a un redirect'),
    sa.Column('usado_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Cuándo se canjeó. No nulo significa gastado, y un segundo canje se rechaza'),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True, comment='Cuándo se emitió'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('oauth_codigos_user_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('oauth_codigos_pkey')),
    sa.UniqueConstraint('codigo_hash', name=op.f('uq_oauth_codigos_codigo_hash'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Códigos de un solo uso que cierran el login con Google: viajan por la URL de vuelta y se canjean de servidor a servidor por el par acceso+refresco'
    )
    op.create_table('email_verification_tokens',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False, comment='Identificador del token emitido.'),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=False, comment='Usuario que tiene que verificar su correo.'),
    sa.Column('token_hash', sa.VARCHAR(length=64), autoincrement=False, nullable=False, comment='SHA-256 del token. El valor en claro sólo existe en el correo.'),
    sa.Column('expira_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False, comment='Cuándo deja de servir. Días, no minutos: llega en la bienvenida.'),
    sa.Column('usado_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Cuándo se canjeó. Sin esta marca, quien tenga el correo puede reverificar cuantas veces quiera mientras no caduque.'),
    sa.Column('creado_en', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False, comment='Cuándo se emitió.'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('email_verification_tokens_user_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('email_verification_tokens_pkey')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_email_verification_tokens_token_hash'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Tokens de un solo uso para verificar el correo de una cuenta.'
    )
    op.create_index(op.f('ix_email_verification_tokens_user_id'), 'email_verification_tokens', ['user_id'], unique=False)
    op.create_table('password_reset_tokens',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False, comment='Identificador del token emitido.'),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=False, comment='Usuario que pidió recuperar su contraseña.'),
    sa.Column('token_hash', sa.VARCHAR(length=64), autoincrement=False, nullable=False, comment='SHA-256 del token. El valor en claro sólo existe en el correo.'),
    sa.Column('expira_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False, comment='Caducidad absoluta. Una hora desde la emisión.'),
    sa.Column('usado_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Cuándo se canjeó. Un token usado no vuelve a valer.'),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False, comment='Cuándo se emitió.'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('password_reset_tokens_user_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('password_reset_tokens_pkey')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_password_reset_tokens_token_hash'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Tokens de un solo uso para restablecer la contraseña por correo.'
    )
    op.create_index(op.f('ix_password_reset_tokens_user_id'), 'password_reset_tokens', ['user_id'], unique=False)
    op.create_table('alert_preferences',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('name', sa.VARCHAR(length=200), autoincrement=False, nullable=False),
    sa.Column('category_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('organismo_ids', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('min_amount', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('max_amount', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('estados', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('regiones', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('comunas', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('keywords', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('notify_email', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('notify_in_app', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('notify_webhook', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('webhook_url', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('is_active', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], name=op.f('alert_preferences_category_id_fkey')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('alert_preferences_user_id_fkey')),
    sa.PrimaryKeyConstraint('id', name=op.f('alert_preferences_pkey')),
    comment='Filtros con los que un usuario acota qué licitaciones le avisan'
    )
    op.create_index(op.f('ix_alert_preferences_user_id'), 'alert_preferences', ['user_id'], unique=False)
    op.create_table('alerts',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('alert_type', postgresql.ENUM('NEW_TENDER', 'TENDER_UPDATE', 'NEW_ORDER', 'ORDER_UPDATE', 'MATCHED_PREFERENCE', 'estado_habil_cambio', 'documento_vencido', 'plazo_48h', 'plazo_24h', 'nueva_licitacion_match', 'ESTADO_HABIL_CAMBIO', 'DOCUMENTO_VENCIDO', 'PLAZO_48H', 'PLAZO_24H', 'NUEVA_LICITACION_MATCH', 'CAMBIO_PRECIO', 'cambio_precio', 'RESULTADO_LICITACION', 'COMPETIDOR_GANO', name='alerttype'), autoincrement=False, nullable=False),
    sa.Column('status', postgresql.ENUM('PENDING', 'SENT', 'READ', 'ARCHIVED', name='alertstatus'), autoincrement=False, nullable=True),
    sa.Column('entity_type', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
    sa.Column('entity_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('title', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
    sa.Column('message', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('notification_channels', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('sent_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('read_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('idempotency_key', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('alerts_empresa_id_fkey'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('alerts_user_id_fkey')),
    sa.PrimaryKeyConstraint('id', name=op.f('alerts_pkey')),
    sa.UniqueConstraint('idempotency_key', name=op.f('uq_alerts_idempotency_key'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Avisos generados para un usuario. `idempotency_key` es única: evita duplicar el mismo aviso entre corridas'
    )
    op.create_index(op.f('ix_alerts_user_id'), 'alerts', ['user_id'], unique=False)
    op.create_index(op.f('ix_alerts_status'), 'alerts', ['status'], unique=False)
    op.create_index(op.f('ix_alerts_entity_id'), 'alerts', ['entity_id'], unique=False)
    op.create_index(op.f('ix_alerts_empresa_id'), 'alerts', ['empresa_id'], unique=False)
    op.create_index(op.f('ix_alerts_created_at'), 'alerts', ['created_at'], unique=False)
    op.create_index(op.f('ix_alerts_alert_type'), 'alerts', ['alert_type'], unique=False)
    op.create_table('tfidf_perfiles',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('vector_bytes', postgresql.BYTEA(), autoincrement=False, nullable=False),
    sa.Column('rubros_usados', postgresql.ARRAY(sa.TEXT()), autoincrement=False, nullable=True),
    sa.Column('modelo_version', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('descripcion', sa.TEXT(), autoincrement=False, nullable=True, comment='A qué se dedica la empresa, en sus palabras. Entrada principal del vector TF-IDF: los rubros solos no distinguen a dos empresas del mismo rubro, así que compartían perfil.'),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('tfidf_perfiles_empresa_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('tfidf_perfiles_pkey')),
    sa.UniqueConstraint('empresa_id', name=op.f('uq_tfidf_perfiles_empresa_id'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Vector TF-IDF serializado del perfil de una empresa, usado para el encaje semántico'
    )
    op.create_table('match_empresa_licitacion',
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=False, comment='Empresa cuyo perfil se comparó.'),
    sa.Column('licitacion_id', sa.INTEGER(), autoincrement=False, nullable=False, comment='Licitación puntuada.'),
    sa.Column('score', sa.SMALLINT(), autoincrement=False, nullable=False, comment='Similitud coseno en 0-100. Se guarda entero: la precisión decimal no se usa.'),
    sa.Column('nivel', sa.VARCHAR(length=20), autoincrement=False, nullable=False, comment='alto | medio | bajo | sin_encaje. Se guarda para no repetir los umbrales en SQL.'),
    sa.Column('calculado_en', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False, comment="Cuándo lo calculó el job. Es lo que la portada muestra como 'actualizado'."),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('match_empresa_licitacion_empresa_id_fkey'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['licitacion_id'], ['licitaciones.id'], name=op.f('match_empresa_licitacion_licitacion_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('empresa_id', 'licitacion_id', name=op.f('match_empresa_licitacion_pkey')),
    comment='Encaje precomputado empresa × licitación (TF-IDF).'
    )
    op.create_index(op.f('ix_match_empresa_score'), 'match_empresa_licitacion', ['empresa_id', 'score'], unique=False)
    op.create_table('documentos_empresa',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('nombre', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('tipo_documento', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
    sa.Column('s3_key', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
    sa.Column('s3_bucket', sa.VARCHAR(length=100), autoincrement=False, nullable=False),
    sa.Column('mime_type', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('tamano_bytes', sa.BIGINT(), autoincrement=False, nullable=True),
    sa.Column('fecha_emision', sa.DATE(), autoincrement=False, nullable=True),
    sa.Column('fecha_vencimiento', sa.DATE(), autoincrement=False, nullable=True),
    sa.Column('eliminado', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.CheckConstraint('tamano_bytes <= 26214400', name=op.f('ck_documentos_tamano')),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('documentos_empresa_empresa_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('documentos_empresa_pkey')),
    comment='Documentos de la empresa guardados en S3, con su vencimiento para el aviso de caducidad'
    )
    op.create_index(op.f('ix_documentos_empresa_fecha_vencimiento'), 'documentos_empresa', ['fecha_vencimiento'], unique=False)
    op.create_index(op.f('ix_documentos_empresa_empresa_id'), 'documentos_empresa', ['empresa_id'], unique=False)
    op.create_table('estado_habil_log',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('rut_empresa', sa.VARCHAR(length=12), autoincrement=False, nullable=False),
    sa.Column('estado_anterior', sa.VARCHAR(length=20), autoincrement=False, nullable=True),
    sa.Column('estado_nuevo', sa.VARCHAR(length=20), autoincrement=False, nullable=False),
    sa.Column('fuente', sa.VARCHAR(length=50), server_default=sa.text("'csv_datos_abiertos'::character varying"), autoincrement=False, nullable=True),
    sa.Column('checked_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('estado_habil_log_empresa_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('estado_habil_log_pkey')),
    comment='Historial de cambios de estado hábil en Mercado Público, una fila por transición detectada'
    )
    op.create_index(op.f('ix_estado_habil_log_empresa_id'), 'estado_habil_log', ['empresa_id'], unique=False)
    op.create_index(op.f('ix_estado_habil_log_checked_at'), 'estado_habil_log', ['checked_at'], unique=False)
    op.create_table('postulaciones',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('licitacion_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('estado', sa.VARCHAR(length=30), server_default=sa.text("'en_seguimiento'::character varying"), autoincrement=False, nullable=False),
    sa.Column('notas', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.CheckConstraint("estado::text = ANY (ARRAY['en_seguimiento'::character varying, 'en_preparacion'::character varying, 'enviada'::character varying, 'adjudicada'::character varying, 'no_adjudicada'::character varying, 'descartada'::character varying]::text[])", name=op.f('ck_postulaciones_estado')),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('postulaciones_empresa_id_fkey'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['licitacion_id'], ['licitaciones.id'], name=op.f('postulaciones_licitacion_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('postulaciones_pkey')),
    sa.UniqueConstraint('empresa_id', 'licitacion_id', name=op.f('uq_postulaciones'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Licitación en seguimiento por una empresa. Los seis estados del CHECK son las columnas del tablero y no son configurables: `adjudicada` es lo que cruza contra el ZIP de resultados'
    )
    op.create_index(op.f('ix_postulaciones_licitacion_id'), 'postulaciones', ['licitacion_id'], unique=False)
    op.create_index(op.f('ix_postulaciones_empresa_id'), 'postulaciones', ['empresa_id'], unique=False)
    op.create_table('plantillas_checklist',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('tipo_licitacion', sa.VARCHAR(length=10), autoincrement=False, nullable=False),
    sa.Column('nombre_item', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
    sa.Column('es_obligatorio', sa.BOOLEAN(), server_default=sa.text('true'), autoincrement=False, nullable=False),
    sa.Column('orden', sa.SMALLINT(), server_default=sa.text("'0'::smallint"), autoincrement=False, nullable=False),
    sa.Column('activo', sa.BOOLEAN(), server_default=sa.text('true'), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('plantillas_checklist_pkey')),
    comment='Items de checklist por tipo de licitación, de los que se copia cada postulación nueva'
    )
    op.create_index(op.f('ix_plantillas_checklist_tipo_licitacion'), 'plantillas_checklist', ['tipo_licitacion'], unique=False)
    op.create_table('checklist_postulacion',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), autoincrement=False, nullable=False),
    sa.Column('postulacion_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('descripcion', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
    sa.Column('es_obligatorio', sa.BOOLEAN(), server_default=sa.text('true'), autoincrement=False, nullable=False),
    sa.Column('completado', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False),
    sa.Column('completado_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('documento_id', sa.UUID(), autoincrement=False, nullable=True),
    sa.Column('orden', sa.SMALLINT(), server_default=sa.text("'0'::smallint"), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['documento_id'], ['documentos_empresa.id'], name=op.f('checklist_postulacion_documento_id_fkey'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['postulacion_id'], ['postulaciones.id'], name=op.f('checklist_postulacion_postulacion_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('checklist_postulacion_pkey')),
    comment='Items de checklist de una postulación concreta, copiados de la plantilla al crearla'
    )
    op.create_index(op.f('ix_checklist_postulacion_postulacion_id'), 'checklist_postulacion', ['postulacion_id'], unique=False)
    op.create_table('competidor_seguido',
    sa.Column('id', sa.BIGINT(), autoincrement=True, nullable=False, comment='Identificador del seguimiento.'),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=False, comment='Empresa que vigila al competidor.'),
    sa.Column('rut', sa.VARCHAR(length=20), autoincrement=False, nullable=False, comment='RUT tal como lo escribió el usuario.'),
    sa.Column('rut_norm', sa.VARCHAR(length=20), autoincrement=False, nullable=False, comment='RUT sin puntos ni guion. Es la clave de comparación con ChileCompra.'),
    sa.Column('nombre', sa.VARCHAR(length=500), autoincrement=False, nullable=True, comment='Nombre legible del competidor, para no unir con proveedores al alertar.'),
    sa.Column('ultimo_visto_en', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True, comment='Fecha de la última orden por la que ya se avisó. Es lo que separa «acaba de ganar» de «ha ganado alguna vez»: sin ella, la primera corrida avisaría del historial completo.'),
    sa.Column('creada_en', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False, comment='Cuándo se empezó a vigilar.'),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('competidor_seguido_empresa_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('competidor_seguido_pkey')),
    sa.UniqueConstraint('empresa_id', 'rut_norm', name=op.f('uq_competidor_seguido_empresa_rut'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Proveedores cuyas adjudicaciones vigila una empresa.'
    )
    op.create_index(op.f('ix_competidor_seguido_rut'), 'competidor_seguido', ['rut_norm'], unique=False)
    op.create_index(op.f('ix_competidor_seguido_empresa_id'), 'competidor_seguido', ['empresa_id'], unique=False)
    op.create_table('precio_referencia',
    sa.Column('id', sa.BIGINT(), autoincrement=True, nullable=False, comment='Identificador de la referencia. Hay una fila por producto y unidad.'),
    sa.Column('codigo_producto', sa.VARCHAR(length=50), autoincrement=False, nullable=False, comment='Código ONU del producto genérico.'),
    sa.Column('unidad_medida', sa.VARCHAR(length=100), autoincrement=False, nullable=False, comment="Unidad en que se mide el precio. Va en la clave: el mismo producto en 'Unidad' y en 'Caja' tiene precios que no se pueden comparar."),
    sa.Column('p50', sa.NUMERIC(precision=15, scale=4), autoincrement=False, nullable=False, comment='Precio unitario mediano de la última corrida.'),
    sa.Column('muestra', sa.INTEGER(), autoincrement=False, nullable=False, comment='Órdenes que sostienen la mediana. Con pocas, el cambio es ruido.'),
    sa.Column('actualizado_en', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False, comment='Cuándo se recalculó esta referencia.'),
    sa.PrimaryKeyConstraint('id', name=op.f('precio_referencia_pkey')),
    sa.UniqueConstraint('codigo_producto', 'unidad_medida', name=op.f('uq_precio_referencia_producto_unidad'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Último precio mediano conocido por producto, para detectar cambios.'
    )
    op.create_table('suscripcion_precio',
    sa.Column('id', sa.BIGINT(), autoincrement=True, nullable=False, comment='Identificador de la vigilancia.'),
    sa.Column('empresa_id', sa.UUID(), autoincrement=False, nullable=False, comment='Empresa que vigila el producto.'),
    sa.Column('codigo_producto', sa.VARCHAR(length=50), autoincrement=False, nullable=False, comment='Código ONU del producto.'),
    sa.Column('unidad_medida', sa.VARCHAR(length=100), autoincrement=False, nullable=False, comment='Unidad de medida vigilada.'),
    sa.Column('nombre_producto', sa.VARCHAR(length=500), autoincrement=False, nullable=True, comment='Nombre legible, copiado al suscribirse para no unir con analytics al alertar.'),
    sa.Column('umbral_pct', sa.DOUBLE_PRECISION(precision=53), server_default=sa.text("'10'::double precision"), autoincrement=False, nullable=False, comment='Variación mínima en % para avisar. Por debajo, el ruido del muestreo domina.'),
    sa.Column('creada_en', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False, comment='Cuándo se empezó a vigilar el producto.'),
    sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], name=op.f('suscripcion_precio_empresa_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('suscripcion_precio_pkey')),
    sa.UniqueConstraint('empresa_id', 'codigo_producto', 'unidad_medida', name=op.f('uq_suscripcion_precio_empresa_producto'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Productos cuyo precio vigila una empresa.'
    )
    op.create_index(op.f('ix_suscripcion_precio_producto'), 'suscripcion_precio', ['codigo_producto', 'unidad_medida'], unique=False)
    op.create_index(op.f('ix_suscripcion_precio_empresa_id'), 'suscripcion_precio', ['empresa_id'], unique=False)
