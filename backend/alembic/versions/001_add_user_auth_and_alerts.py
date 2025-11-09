"""Add user authentication, organizations, categories, and alert system

Revision ID: 001
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_superuser', sa.Boolean(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=True),
        sa.Column('notification_email', sa.Boolean(), nullable=True),
        sa.Column('notification_in_app', sa.Boolean(), nullable=True),
        sa.Column('notification_webhook', sa.Boolean(), nullable=True),
        sa.Column('webhook_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # Create buyer_organizations table
    op.create_table(
        'buyer_organizations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('codigo_organismo', sa.String(length=50), nullable=False),
        sa.Column('nombre', sa.String(length=500), nullable=False),
        sa.Column('nombre_corto', sa.String(length=200), nullable=True),
        sa.Column('rut', sa.String(length=20), nullable=True),
        sa.Column('direccion', sa.Text(), nullable=True),
        sa.Column('region', sa.String(length=100), nullable=True),
        sa.Column('comuna', sa.String(length=100), nullable=True),
        sa.Column('telefono', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('website', sa.String(length=500), nullable=True),
        sa.Column('tipo_organismo', sa.String(length=100), nullable=True),
        sa.Column('sector', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('codigo_organismo')
    )
    op.create_index(op.f('ix_buyer_organizations_codigo_organismo'), 'buyer_organizations', ['codigo_organismo'], unique=True)

    # Create suppliers table
    op.create_table(
        'suppliers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('codigo_proveedor', sa.String(length=50), nullable=False),
        sa.Column('nombre', sa.String(length=500), nullable=False),
        sa.Column('nombre_corto', sa.String(length=200), nullable=True),
        sa.Column('rut', sa.String(length=20), nullable=True),
        sa.Column('direccion', sa.Text(), nullable=True),
        sa.Column('region', sa.String(length=100), nullable=True),
        sa.Column('comuna', sa.String(length=100), nullable=True),
        sa.Column('telefono', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('website', sa.String(length=500), nullable=True),
        sa.Column('tipo_empresa', sa.String(length=100), nullable=True),
        sa.Column('rubro', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('codigo_proveedor')
    )
    op.create_index(op.f('ix_suppliers_codigo_proveedor'), 'suppliers', ['codigo_proveedor'], unique=True)

    # Create categories table
    op.create_table(
        'categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('classification_system', sa.String(length=20), nullable=False),
        sa.Column('level', sa.Integer(), nullable=True),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
        sa.ForeignKeyConstraint(['parent_id'], ['categories.id'], )
    )
    op.create_index(op.f('ix_categories_code'), 'categories', ['code'], unique=True)
    op.create_index(op.f('ix_categories_classification_system'), 'categories', ['classification_system'], unique=False)

    # Create alert_preferences table
    op.create_table(
        'alert_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('organismo_ids', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('min_amount', sa.Integer(), nullable=True),
        sa.Column('max_amount', sa.Integer(), nullable=True),
        sa.Column('estados', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('regiones', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('comunas', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('keywords', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('notify_email', sa.Boolean(), nullable=True),
        sa.Column('notify_in_app', sa.Boolean(), nullable=True),
        sa.Column('notify_webhook', sa.Boolean(), nullable=True),
        sa.Column('webhook_url', sa.String(length=500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], )
    )
    op.create_index(op.f('ix_alert_preferences_user_id'), 'alert_preferences', ['user_id'], unique=False)

    # Create alerts table
    op.create_table(
        'alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('alert_type', sa.Enum('NEW_TENDER', 'TENDER_UPDATE', 'NEW_ORDER', 'ORDER_UPDATE', 'MATCHED_PREFERENCE', name='alerttype'), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'SENT', 'READ', 'ARCHIVED', name='alertstatus'), nullable=True),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('notification_channels', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], )
    )
    op.create_index(op.f('ix_alerts_user_id'), 'alerts', ['user_id'], unique=False)
    op.create_index(op.f('ix_alerts_alert_type'), 'alerts', ['alert_type'], unique=False)
    op.create_index(op.f('ix_alerts_status'), 'alerts', ['status'], unique=False)
    op.create_index(op.f('ix_alerts_entity_id'), 'alerts', ['entity_id'], unique=False)
    op.create_index(op.f('ix_alerts_created_at'), 'alerts', ['created_at'], unique=False)

    # Add foreign keys to existing tables
    op.add_column('licitaciones', sa.Column('organismo_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_licitaciones_organismo', 'licitaciones', 'buyer_organizations', ['organismo_id'], ['id'])

    op.add_column('ordenes_compra', sa.Column('organismo_id', sa.Integer(), nullable=True))
    op.add_column('ordenes_compra', sa.Column('proveedor_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_ordenes_compra_organismo', 'ordenes_compra', 'buyer_organizations', ['organismo_id'], ['id'])
    op.create_foreign_key('fk_ordenes_compra_proveedor', 'ordenes_compra', 'suppliers', ['proveedor_id'], ['id'])


def downgrade() -> None:
    # Remove foreign keys from existing tables
    op.drop_constraint('fk_ordenes_compra_proveedor', 'ordenes_compra', type_='foreignkey')
    op.drop_constraint('fk_ordenes_compra_organismo', 'ordenes_compra', type_='foreignkey')
    op.drop_column('ordenes_compra', 'proveedor_id')
    op.drop_column('ordenes_compra', 'organismo_id')
    op.drop_constraint('fk_licitaciones_organismo', 'licitaciones', type_='foreignkey')
    op.drop_column('licitaciones', 'organismo_id')

    # Drop alerts table
    op.drop_index(op.f('ix_alerts_created_at'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_entity_id'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_status'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_alert_type'), table_name='alerts')
    op.drop_index(op.f('ix_alerts_user_id'), table_name='alerts')
    op.drop_table('alerts')

    # Drop alert_preferences table
    op.drop_index(op.f('ix_alert_preferences_user_id'), table_name='alert_preferences')
    op.drop_table('alert_preferences')

    # Drop categories table
    op.drop_index(op.f('ix_categories_classification_system'), table_name='categories')
    op.drop_index(op.f('ix_categories_code'), table_name='categories')
    op.drop_table('categories')

    # Drop suppliers table
    op.drop_index(op.f('ix_suppliers_codigo_proveedor'), table_name='suppliers')
    op.drop_table('suppliers')

    # Drop buyer_organizations table
    op.drop_index(op.f('ix_buyer_organizations_codigo_organismo'), table_name='buyer_organizations')
    op.drop_table('buyer_organizations')

    # Drop users table
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')

