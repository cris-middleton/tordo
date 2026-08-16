"""indice en ordenes_compra.rut_proveedor para traducir RUT a CodigoProveedor

`analytics.competitors_by_market` identifica al proveedor por `CodigoProveedor`,
el identificador interno de Mercado Público — nunca por RUT. La única forma de
llegar del RUT de una empresa a ese código es `ordenes_compra`, que guarda
ambos. Esa consulta corre al abrir la pantalla de BI y sin índice recorre
secuencialmente la tabla más grande del sistema.

Revision ID: 593d371cb8fe
Revises: e4b7d2f91a56
Create Date: 2026-08-16 10:50:38.251511

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '593d371cb8fe'
down_revision: Union[str, None] = 'e4b7d2f91a56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(op.f('ix_ordenes_compra_rut_proveedor'), 'ordenes_compra', ['rut_proveedor'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_ordenes_compra_rut_proveedor'), table_name='ordenes_compra')
