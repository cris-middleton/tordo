"""add_detalle_and_historial_tables

Revision ID: 002
Revises: 001
Create Date: 2024-11-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create licitaciones_detalle table
    op.create_table(
        'licitaciones_detalle',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('licitacion_id', sa.Integer(), nullable=False),
        sa.Column('codigo_externo', sa.String(length=100), nullable=False),
        sa.Column('fecha_primera_extraccion', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('fecha_ultima_actualizacion', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('numero_actualizaciones', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('hash_contenido', sa.String(length=64), nullable=True),
        sa.Column('datos_completos', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('items', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('documentos', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('participantes', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('etapas', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('adjuntos', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('estado_actual', sa.String(length=50), nullable=True),
        sa.Column('fecha_cierre_real', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fecha_adjudicacion', sa.DateTime(timezone=True), nullable=True),
        sa.Column('monto_adjudicado', sa.String(length=50), nullable=True),
        sa.Column('proveedor_adjudicado', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['licitacion_id'], ['licitaciones.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('codigo_externo'),
        sa.UniqueConstraint('licitacion_id')
    )
    op.create_index(op.f('ix_licitaciones_detalle_codigo_externo'), 'licitaciones_detalle', ['codigo_externo'], unique=False)
    op.create_index(op.f('ix_licitaciones_detalle_estado_actual'), 'licitaciones_detalle', ['estado_actual'], unique=False)
    op.create_index(op.f('ix_licitaciones_detalle_hash_contenido'), 'licitaciones_detalle', ['hash_contenido'], unique=False)

    # Create licitaciones_historial table
    op.create_table(
        'licitaciones_historial',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('licitacion_id', sa.Integer(), nullable=False),
        sa.Column('licitacion_detalle_id', sa.Integer(), nullable=True),
        sa.Column('codigo_externo', sa.String(length=100), nullable=False),
        sa.Column('tipo_cambio', sa.String(length=50), nullable=True),
        sa.Column('campo_modificado', sa.String(length=100), nullable=True),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('valor_anterior', sa.Text(), nullable=True),
        sa.Column('valor_nuevo', sa.Text(), nullable=True),
        sa.Column('fecha_cambio', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('fecha_deteccion', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('snapshot_completo', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['licitacion_detalle_id'], ['licitaciones_detalle.id'], ),
        sa.ForeignKeyConstraint(['licitacion_id'], ['licitaciones.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_licitaciones_historial_codigo_externo'), 'licitaciones_historial', ['codigo_externo'], unique=False)
    op.create_index(op.f('ix_licitaciones_historial_fecha_cambio'), 'licitaciones_historial', ['fecha_cambio'], unique=False)
    op.create_index(op.f('ix_licitaciones_historial_licitacion_detalle_id'), 'licitaciones_historial', ['licitacion_detalle_id'], unique=False)
    op.create_index(op.f('ix_licitaciones_historial_licitacion_id'), 'licitaciones_historial', ['licitacion_id'], unique=False)
    op.create_index(op.f('ix_licitaciones_historial_tipo_cambio'), 'licitaciones_historial', ['tipo_cambio'], unique=False)

    # Create ordenes_compra_detalle table
    op.create_table(
        'ordenes_compra_detalle',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('orden_compra_id', sa.Integer(), nullable=False),
        sa.Column('codigo_oc', sa.String(length=100), nullable=False),
        sa.Column('fecha_primera_extraccion', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('fecha_ultima_actualizacion', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('numero_actualizaciones', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('hash_contenido', sa.String(length=64), nullable=True),
        sa.Column('datos_completos', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('items', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('documentos', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('comprador_detalle', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('proveedor_detalle', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('estado_actual', sa.String(length=50), nullable=True),
        sa.Column('estado_proveedor_actual', sa.String(length=50), nullable=True),
        sa.Column('fecha_aceptacion_real', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fecha_entrega_real', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fecha_recepcion_real', sa.DateTime(timezone=True), nullable=True),
        sa.Column('monto_final', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.ForeignKeyConstraint(['orden_compra_id'], ['ordenes_compra.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('codigo_oc'),
        sa.UniqueConstraint('orden_compra_id')
    )
    op.create_index(op.f('ix_ordenes_compra_detalle_codigo_oc'), 'ordenes_compra_detalle', ['codigo_oc'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_detalle_estado_actual'), 'ordenes_compra_detalle', ['estado_actual'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_detalle_estado_proveedor_actual'), 'ordenes_compra_detalle', ['estado_proveedor_actual'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_detalle_hash_contenido'), 'ordenes_compra_detalle', ['hash_contenido'], unique=False)

    # Create ordenes_compra_historial table
    op.create_table(
        'ordenes_compra_historial',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('orden_compra_id', sa.Integer(), nullable=False),
        sa.Column('orden_compra_detalle_id', sa.Integer(), nullable=True),
        sa.Column('codigo_oc', sa.String(length=100), nullable=False),
        sa.Column('tipo_cambio', sa.String(length=50), nullable=True),
        sa.Column('campo_modificado', sa.String(length=100), nullable=True),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('valor_anterior', sa.Text(), nullable=True),
        sa.Column('valor_nuevo', sa.Text(), nullable=True),
        sa.Column('fecha_cambio', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('fecha_deteccion', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('snapshot_completo', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['orden_compra_detalle_id'], ['ordenes_compra_detalle.id'], ),
        sa.ForeignKeyConstraint(['orden_compra_id'], ['ordenes_compra.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ordenes_compra_historial_codigo_oc'), 'ordenes_compra_historial', ['codigo_oc'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_historial_fecha_cambio'), 'ordenes_compra_historial', ['fecha_cambio'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_historial_orden_compra_detalle_id'), 'ordenes_compra_historial', ['orden_compra_detalle_id'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_historial_orden_compra_id'), 'ordenes_compra_historial', ['orden_compra_id'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_historial_tipo_cambio'), 'ordenes_compra_historial', ['tipo_cambio'], unique=False)


def downgrade() -> None:
    # Drop ordenes_compra_historial
    op.drop_index(op.f('ix_ordenes_compra_historial_tipo_cambio'), table_name='ordenes_compra_historial')
    op.drop_index(op.f('ix_ordenes_compra_historial_orden_compra_id'), table_name='ordenes_compra_historial')
    op.drop_index(op.f('ix_ordenes_compra_historial_orden_compra_detalle_id'), table_name='ordenes_compra_historial')
    op.drop_index(op.f('ix_ordenes_compra_historial_fecha_cambio'), table_name='ordenes_compra_historial')
    op.drop_index(op.f('ix_ordenes_compra_historial_codigo_oc'), table_name='ordenes_compra_historial')
    op.drop_table('ordenes_compra_historial')
    
    # Drop ordenes_compra_detalle
    op.drop_index(op.f('ix_ordenes_compra_detalle_hash_contenido'), table_name='ordenes_compra_detalle')
    op.drop_index(op.f('ix_ordenes_compra_detalle_estado_proveedor_actual'), table_name='ordenes_compra_detalle')
    op.drop_index(op.f('ix_ordenes_compra_detalle_estado_actual'), table_name='ordenes_compra_detalle')
    op.drop_index(op.f('ix_ordenes_compra_detalle_codigo_oc'), table_name='ordenes_compra_detalle')
    op.drop_table('ordenes_compra_detalle')
    
    # Drop licitaciones_historial
    op.drop_index(op.f('ix_licitaciones_historial_tipo_cambio'), table_name='licitaciones_historial')
    op.drop_index(op.f('ix_licitaciones_historial_licitacion_id'), table_name='licitaciones_historial')
    op.drop_index(op.f('ix_licitaciones_historial_licitacion_detalle_id'), table_name='licitaciones_historial')
    op.drop_index(op.f('ix_licitaciones_historial_fecha_cambio'), table_name='licitaciones_historial')
    op.drop_index(op.f('ix_licitaciones_historial_codigo_externo'), table_name='licitaciones_historial')
    op.drop_table('licitaciones_historial')
    
    # Drop licitaciones_detalle
    op.drop_index(op.f('ix_licitaciones_detalle_hash_contenido'), table_name='licitaciones_detalle')
    op.drop_index(op.f('ix_licitaciones_detalle_estado_actual'), table_name='licitaciones_detalle')
    op.drop_index(op.f('ix_licitaciones_detalle_codigo_externo'), table_name='licitaciones_detalle')
    op.drop_table('licitaciones_detalle')

