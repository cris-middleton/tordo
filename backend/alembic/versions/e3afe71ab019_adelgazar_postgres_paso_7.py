"""Adelgazar Postgres — paso 7 del pivote público (spec §5.2).

Fuera lo que nada lee:

- `ordenes_compra`, `ordenes_compra_detalle` y `ordenes_compra_historial`: ninguna
  ruta las sirve desde #125, y lo que el producto necesita de las órdenes sale de
  la descarga masiva (parquets en R2). Se llenaban con el barrido diario, y cada
  orden costaba un detalle de la cuota de la API clásica.
- `licitaciones_historial`: la detección de cambios guardaba el payload entero en
  cada cambio (`snapshot_completo`); lo leían las alertas, que se fueron con las
  cuentas.
- `buyer_organizations` y `suppliers`: ningún código las llenaba, así que
  `licitaciones.organismo_id` era siempre nulo (y la API lo servía así).
- Los cuatro catálogos `ref_*`: ni se leían ni se escribían.
- `licitaciones_detalle.datos_completos` y `participantes`: el payload crudo y la
  lista de oferentes. La API dejó de servirlos en #128; el ETL deja de guardarlos
  aquí (el hash basta para saber si un detalle cambió).

Escrita a mano en el orden de las dependencias: autogenerate soltaba
`ordenes_compra` antes que su detalle y `buyer_organizations` antes que la FK
que la apunta, y Postgres no deja.

**El downgrade recrea la estructura vacía, no los datos**: lo borrado no se
puede recuperar desde aquí. La historia de órdenes vive entera en R2.

Revision ID: e3afe71ab019
Revises: 6e47ba0cd7c9
Create Date: 2026-10-11 23:56:13.529010

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e3afe71ab019'
down_revision: Union[str, None] = '6e47ba0cd7c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('ordenes_compra_historial')
    op.drop_table('ordenes_compra_detalle')
    op.drop_table('ordenes_compra')
    op.drop_table('licitaciones_historial')
    op.drop_constraint('fk_licitaciones_organismo', 'licitaciones', type_='foreignkey')
    op.drop_column('licitaciones', 'organismo_id')
    op.drop_table('buyer_organizations')
    op.drop_table('suppliers')
    op.drop_table('ref_tipo_orden_compra')
    op.drop_table('ref_unidad_monetaria')
    op.drop_table('ref_tipo_despacho')
    op.drop_table('ref_forma_pago')
    op.drop_column('licitaciones_detalle', 'datos_completos')
    op.drop_column('licitaciones_detalle', 'participantes')


def downgrade() -> None:
    op.create_table('ref_tipo_orden_compra',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('codigo', sa.VARCHAR(length=10), autoincrement=False, nullable=False),
    sa.Column('abreviacion', sa.VARCHAR(length=10), autoincrement=False, nullable=True),
    sa.Column('descripcion', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('ref_tipo_orden_compra_pkey')),
    sa.UniqueConstraint('codigo', name=op.f('uq_ref_tipo_orden_compra_codigo'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Catálogo de tipos de orden de compra de Mercado Público (§3.1 del diccionario oficial). El tipo 9 es Convenio Marco'
    )
    op.create_table('ref_unidad_monetaria',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('codigo', sa.VARCHAR(length=10), autoincrement=False, nullable=False),
    sa.Column('descripcion', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('ref_unidad_monetaria_pkey')),
    sa.UniqueConstraint('codigo', name=op.f('uq_ref_unidad_monetaria_codigo'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Catálogo de monedas de Mercado Público'
    )
    op.create_table('ref_tipo_despacho',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('codigo', sa.VARCHAR(length=10), autoincrement=False, nullable=False),
    sa.Column('descripcion', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('ref_tipo_despacho_pkey')),
    sa.UniqueConstraint('codigo', name=op.f('uq_ref_tipo_despacho_codigo'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Catálogo de tipos de despacho de Mercado Público'
    )
    op.create_table('ref_forma_pago',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('codigo', sa.VARCHAR(length=10), autoincrement=False, nullable=False),
    sa.Column('descripcion', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('ref_forma_pago_pkey')),
    sa.UniqueConstraint('codigo', name=op.f('uq_ref_forma_pago_codigo'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Catálogo de formas de pago de Mercado Público. El 98,7 % de las órdenes declara la misma, así que no sirve para segmentar'
    )
    op.create_table('buyer_organizations',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('codigo_organismo', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
    sa.Column('nombre', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
    sa.Column('nombre_corto', sa.VARCHAR(length=200), autoincrement=False, nullable=True),
    sa.Column('rut', sa.VARCHAR(length=20), autoincrement=False, nullable=True),
    sa.Column('direccion', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('region', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('comuna', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('telefono', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('email', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('website', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('tipo_organismo', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('sector', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('activo', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('buyer_organizations_pkey')),
    sa.UniqueConstraint('codigo_organismo', name=op.f('uq_buyer_organizations_codigo_organismo'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Organismos compradores del Estado, identificados por su código de Mercado Público'
    )
    op.create_index(op.f('ix_buyer_organizations_rut'), 'buyer_organizations', ['rut'], unique=False)
    op.create_table('suppliers',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('codigo_proveedor', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
    sa.Column('nombre', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
    sa.Column('nombre_corto', sa.VARCHAR(length=200), autoincrement=False, nullable=True),
    sa.Column('rut', sa.VARCHAR(length=20), autoincrement=False, nullable=True),
    sa.Column('direccion', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('region', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('comuna', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('telefono', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('email', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('website', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('tipo_empresa', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('rubro', sa.VARCHAR(length=200), autoincrement=False, nullable=True),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('activo', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('suppliers_pkey')),
    sa.UniqueConstraint('codigo_proveedor', name=op.f('uq_suppliers_codigo_proveedor'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Proveedores de Mercado Público. `codigo_proveedor` es el identificador interno del portal, NO un RUT'
    )
    op.create_index(op.f('ix_suppliers_rut'), 'suppliers', ['rut'], unique=False)
    op.create_table('ordenes_compra',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('codigo_oc', sa.VARCHAR(length=100), autoincrement=False, nullable=False),
    sa.Column('codigo_licitacion', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('nombre', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
    sa.Column('descripcion', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('fecha_publicacion', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
    sa.Column('fecha_aceptacion', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('fecha_entrega', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('fecha_estimada_entrega', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('monto_total', sa.NUMERIC(precision=15, scale=2), autoincrement=False, nullable=False),
    sa.Column('monto_neto', sa.NUMERIC(precision=15, scale=2), autoincrement=False, nullable=True),
    sa.Column('monto_iva', sa.NUMERIC(precision=15, scale=2), autoincrement=False, nullable=True),
    sa.Column('moneda', sa.VARCHAR(length=10), server_default=sa.text("'CLP'::character varying"), autoincrement=False, nullable=True),
    sa.Column('estado', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('estado_proveedor', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('codigo_organismo', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('nombre_organismo', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('rut_organismo', sa.VARCHAR(length=20), autoincrement=False, nullable=True),
    sa.Column('codigo_proveedor', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('nombre_proveedor', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('rut_proveedor', sa.VARCHAR(length=20), autoincrement=False, nullable=True),
    sa.Column('region', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('comuna', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('informacion_adicional', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('items', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('url_oc', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('url_acta', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('fecha_extraccion', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('fecha_actualizacion', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('activo', sa.BOOLEAN(), server_default=sa.text('true'), autoincrement=False, nullable=True),
    sa.Column('organismo_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('proveedor_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('tipo_oc', sa.VARCHAR(length=10), autoincrement=False, nullable=True, comment='Código de tipo de OC de Mercado Público. 9=Convenio Marco, 2=Trato Directo.'),
    sa.Column('tipo_convocatoria', sa.VARCHAR(length=30), autoincrement=False, nullable=True, comment='Mecanismo de compra deducido de `tipo_oc`. NULL cuando el tipo sólo describe cómo se emitió la orden (1=Automática, 8=Sin emisión automática).'),
    sa.Column('rut_proveedor_norm', sa.VARCHAR(length=20), sa.Computed("regexp_replace(upper((rut_proveedor)::text), '[^0-9K]'::text, ''::text, 'g'::text)", persisted=True), autoincrement=False, nullable=True, comment='`rut_proveedor` sin puntos, guion ni espacios. Sostiene el seguimiento de competidores.'),
    sa.ForeignKeyConstraint(['organismo_id'], ['buyer_organizations.id'], name=op.f('fk_ordenes_compra_organismo')),
    sa.ForeignKeyConstraint(['proveedor_id'], ['suppliers.id'], name=op.f('fk_ordenes_compra_proveedor')),
    sa.PrimaryKeyConstraint('id', name=op.f('ordenes_compra_pkey')),
    sa.UniqueConstraint('codigo_oc', name=op.f('uq_ordenes_compra_codigo_oc'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Órdenes de compra de Mercado Público (listado diario)'
    )
    op.create_index(op.f('ix_ordenes_compra_tipo_oc'), 'ordenes_compra', ['tipo_oc'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_tipo_convocatoria'), 'ordenes_compra', ['tipo_convocatoria'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_rut_proveedor_norm'), 'ordenes_compra', ['rut_proveedor_norm'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_rut_proveedor'), 'ordenes_compra', ['rut_proveedor'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_fecha_publicacion'), 'ordenes_compra', ['fecha_publicacion'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_estado'), 'ordenes_compra', ['estado'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_codigo_proveedor'), 'ordenes_compra', ['codigo_proveedor'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_codigo_organismo'), 'ordenes_compra', ['codigo_organismo'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_codigo_licitacion'), 'ordenes_compra', ['codigo_licitacion'], unique=False)
    op.create_table('ordenes_compra_detalle',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('orden_compra_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('codigo_oc', sa.VARCHAR(length=100), autoincrement=False, nullable=False),
    sa.Column('fecha_primera_extraccion', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('fecha_ultima_actualizacion', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('numero_actualizaciones', sa.INTEGER(), server_default=sa.text('1'), autoincrement=False, nullable=True),
    sa.Column('hash_contenido', sa.VARCHAR(length=64), autoincrement=False, nullable=True),
    sa.Column('datos_completos', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('items', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('documentos', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('comprador_detalle', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('proveedor_detalle', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.Column('estado_actual', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('estado_proveedor_actual', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('fecha_aceptacion_real', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('fecha_entrega_real', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('fecha_recepcion_real', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
    sa.Column('monto_final', sa.NUMERIC(precision=15, scale=2), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['orden_compra_id'], ['ordenes_compra.id'], name=op.f('ordenes_compra_detalle_orden_compra_id_fkey')),
    sa.PrimaryKeyConstraint('id', name=op.f('ordenes_compra_detalle_pkey')),
    sa.UniqueConstraint('codigo_oc', name=op.f('uq_ordenes_compra_detalle_codigo_oc'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    sa.UniqueConstraint('orden_compra_id', name=op.f('uq_ordenes_compra_detalle_orden_compra_id'), postgresql_include=[], postgresql_nulls_not_distinct=False),
    comment='Campos extendidos de una orden de compra, que llegan en una segunda llamada y se actualizan'
    )
    op.create_index(op.f('ix_ordenes_compra_detalle_hash_contenido'), 'ordenes_compra_detalle', ['hash_contenido'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_detalle_estado_proveedor_actual'), 'ordenes_compra_detalle', ['estado_proveedor_actual'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_detalle_estado_actual'), 'ordenes_compra_detalle', ['estado_actual'], unique=False)
    op.create_table('ordenes_compra_historial',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('orden_compra_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('orden_compra_detalle_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('codigo_oc', sa.VARCHAR(length=100), autoincrement=False, nullable=False),
    sa.Column('tipo_cambio', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('campo_modificado', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('descripcion', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('valor_anterior', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('valor_nuevo', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('fecha_cambio', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('fecha_deteccion', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('snapshot_completo', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['orden_compra_detalle_id'], ['ordenes_compra_detalle.id'], name=op.f('ordenes_compra_historial_orden_compra_detalle_id_fkey')),
    sa.ForeignKeyConstraint(['orden_compra_id'], ['ordenes_compra.id'], name=op.f('ordenes_compra_historial_orden_compra_id_fkey')),
    sa.PrimaryKeyConstraint('id', name=op.f('ordenes_compra_historial_pkey')),
    comment='Cambios detectados en una orden de compra a lo largo del tiempo'
    )
    op.create_index(op.f('ix_ordenes_compra_historial_tipo_cambio'), 'ordenes_compra_historial', ['tipo_cambio'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_historial_orden_compra_id'), 'ordenes_compra_historial', ['orden_compra_id'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_historial_orden_compra_detalle_id'), 'ordenes_compra_historial', ['orden_compra_detalle_id'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_historial_fecha_cambio'), 'ordenes_compra_historial', ['fecha_cambio'], unique=False)
    op.create_index(op.f('ix_ordenes_compra_historial_codigo_oc'), 'ordenes_compra_historial', ['codigo_oc'], unique=False)
    op.create_table('licitaciones_historial',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('licitacion_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('licitacion_detalle_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('codigo_externo', sa.VARCHAR(length=100), autoincrement=False, nullable=False),
    sa.Column('tipo_cambio', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    sa.Column('campo_modificado', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('descripcion', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('valor_anterior', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('valor_nuevo', sa.TEXT(), autoincrement=False, nullable=True),
    sa.Column('fecha_cambio', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('fecha_deteccion', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=True),
    sa.Column('snapshot_completo', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['licitacion_detalle_id'], ['licitaciones_detalle.id'], name=op.f('licitaciones_historial_licitacion_detalle_id_fkey')),
    sa.ForeignKeyConstraint(['licitacion_id'], ['licitaciones.id'], name=op.f('licitaciones_historial_licitacion_id_fkey')),
    sa.PrimaryKeyConstraint('id', name=op.f('licitaciones_historial_pkey')),
    comment='Cambios detectados en una licitación a lo largo del tiempo, para poder mirar atrás'
    )
    op.create_index(op.f('ix_licitaciones_historial_tipo_cambio'), 'licitaciones_historial', ['tipo_cambio'], unique=False)
    op.create_index(op.f('ix_licitaciones_historial_licitacion_id'), 'licitaciones_historial', ['licitacion_id'], unique=False)
    op.create_index(op.f('ix_licitaciones_historial_licitacion_detalle_id'), 'licitaciones_historial', ['licitacion_detalle_id'], unique=False)
    op.create_index(op.f('ix_licitaciones_historial_fecha_cambio'), 'licitaciones_historial', ['fecha_cambio'], unique=False)
    op.create_index(op.f('ix_licitaciones_historial_codigo_externo'), 'licitaciones_historial', ['codigo_externo'], unique=False)
    op.add_column('licitaciones_detalle', sa.Column('participantes', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True))
    op.add_column('licitaciones_detalle', sa.Column('datos_completos', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True))
    op.add_column('licitaciones', sa.Column('organismo_id', sa.INTEGER(), autoincrement=False, nullable=True))
    op.create_foreign_key(op.f('fk_licitaciones_organismo'), 'licitaciones', 'buyer_organizations', ['organismo_id'], ['id'])
