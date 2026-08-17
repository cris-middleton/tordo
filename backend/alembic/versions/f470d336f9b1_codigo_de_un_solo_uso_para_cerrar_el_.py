"""codigo de un solo uso para cerrar el login con Google

Cierra el pendiente que arrastraba el login con Google: la vuelta traía el JWT
de acceso en la URL y nada más, así que esa sesión moría a los 30 minutos.
Ahora por la URL viaja un código que caduca en 60 s y se canjea una vez, de
servidor a servidor, por el par acceso + refresco.

Revision ID: f470d336f9b1
Revises: 593d371cb8fe
Create Date: 2026-08-16 23:27:18.414438

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f470d336f9b1'
down_revision: Union[str, None] = '593d371cb8fe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('oauth_codigos',
    sa.Column('id', sa.UUID(), nullable=False, comment='Identificador del código emitido'),
    sa.Column('codigo_hash', sa.String(length=64), nullable=False, comment='SHA-256 del código. Nunca se guarda en claro'),
    sa.Column('user_id', sa.Integer(), nullable=False, comment='Usuario que acaba de autenticarse contra Google'),
    sa.Column('expira_en', sa.DateTime(timezone=True), nullable=False, comment='Sesenta segundos desde la emisión: sólo tiene que sobrevivir a un redirect'),
    sa.Column('usado_en', sa.DateTime(timezone=True), nullable=True, comment='Cuándo se canjeó. No nulo significa gastado, y un segundo canje se rechaza'),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True, comment='Cuándo se emitió'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('codigo_hash', name=op.f('uq_oauth_codigos_codigo_hash')),
    comment='Códigos de un solo uso que cierran el login con Google: viajan por la URL de vuelta y se canjean de servidor a servidor por el par acceso+refresco'
    )


def downgrade() -> None:
    op.drop_table('oauth_codigos')
