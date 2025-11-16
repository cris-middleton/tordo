"""add reference tables for OC metadata

Revision ID: 003
Revises: 002
Create Date: 2025-11-16
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    # ref_tipo_orden_compra
    op.create_table(
        'ref_tipo_orden_compra',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('codigo', sa.String(length=10), nullable=False, unique=True, index=True),
        sa.Column('abreviacion', sa.String(length=10), nullable=True),
        sa.Column('descripcion', sa.String(length=255), nullable=False),
    )
    # ref_unidad_monetaria
    op.create_table(
        'ref_unidad_monetaria',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('codigo', sa.String(length=10), nullable=False, unique=True, index=True),
        sa.Column('descripcion', sa.String(length=255), nullable=False),
    )
    # ref_tipo_despacho
    op.create_table(
        'ref_tipo_despacho',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('codigo', sa.String(length=10), nullable=False, unique=True, index=True),
        sa.Column('descripcion', sa.String(length=255), nullable=False),
    )
    # ref_forma_pago
    op.create_table(
        'ref_forma_pago',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('codigo', sa.String(length=10), nullable=False, unique=True, index=True),
        sa.Column('descripcion', sa.String(length=255), nullable=False),
    )

    # Seed initial data based on provided mappings
    conn = op.get_bind()
    # Tipo de Orden de Compra
    conn.execute(sa.text("""
        INSERT INTO ref_tipo_orden_compra (codigo, abreviacion, descripcion) VALUES
        ('8', 'SE', 'Sin emisión automática.'),
        ('9', 'CM', 'Convenio Marco.')
        ON CONFLICT (codigo) DO NOTHING
    """))
    # Unidad Monetaria
    conn.execute(sa.text("""
        INSERT INTO ref_unidad_monetaria (codigo, descripcion) VALUES
        ('CLP', 'Peso Chileno'),
        ('CLF', 'Unidad de Fomento'),
        ('USD', 'Dólar Americano'),
        ('UTM', 'Unidad Tributaria Mensual'),
        ('EUR', 'Euro')
        ON CONFLICT (codigo) DO NOTHING
    """))
    # Tipo de despacho
    conn.execute(sa.text("""
        INSERT INTO ref_tipo_despacho (codigo, descripcion) VALUES
        ('7', 'Despachar a Dirección de envío.'),
        ('9', 'Despachar según programa adjuntado.'),
        ('12', 'Otra Forma de Despacho, Ver Instruc.'),
        ('14', 'Retiramos de su bodega.'),
        ('20', 'Despacho por courier o encomienda aérea.'),
        ('21', 'Despacho por courier o encomienda terrestre.'),
        ('22', 'A convenir.')
        ON CONFLICT (codigo) DO NOTHING
    """))
    # Forma de pago
    conn.execute(sa.text("""
        INSERT INTO ref_forma_pago (codigo, descripcion) VALUES
        ('1', '15 días contra la recepción de la factura.'),
        ('2', '30 días contra la recepción de la factura.'),
        ('39', 'Otra forma de pago.'),
        ('46', '50 días contra la recepción de la factura.'),
        ('47', '60 días contra la recepción de la factura.')
        ON CONFLICT (codigo) DO NOTHING
    """))


def downgrade():
    op.drop_table('ref_forma_pago')
    op.drop_table('ref_tipo_despacho')
    op.drop_table('ref_unidad_monetaria')
    op.drop_table('ref_tipo_orden_compra')


