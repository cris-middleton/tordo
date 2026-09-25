"""estado habil inscrito

`BuscarProveedor` —la única fuente pública— confirma si un RUT figura en el
Registro de Proveedores, pero NO si está hábil: eso sólo lo ve el proveedor en
su ficha. `inscrito` es el estado que sí se puede afirmar.

Revision ID: 91d4eefa77c9
Revises: 04d3465a9dbf
Create Date: 2026-09-24 23:52:42.413145

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '91d4eefa77c9'
down_revision: Union[str, None] = '04d3465a9dbf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ANTES = "estado_habil IN ('habil', 'inhabil', 'no_encontrado', 'desconocido')"
DESPUES = "estado_habil IN ('habil', 'inhabil', 'inscrito', 'no_encontrado', 'desconocido')"


def upgrade() -> None:
    op.drop_constraint("ck_empresas_estado_habil", "empresas", type_="check")
    op.create_check_constraint("ck_empresas_estado_habil", "empresas", DESPUES)


def downgrade() -> None:
    # Sin esto la restricción vieja no se puede recrear sobre filas `inscrito`.
    op.execute("UPDATE empresas SET estado_habil = 'desconocido' WHERE estado_habil = 'inscrito'")
    op.drop_constraint("ck_empresas_estado_habil", "empresas", type_="check")
    op.create_check_constraint("ck_empresas_estado_habil", "empresas", ANTES)
