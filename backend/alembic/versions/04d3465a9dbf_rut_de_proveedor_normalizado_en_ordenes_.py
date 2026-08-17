"""rut de proveedor normalizado en ordenes_compra

`competidores.detectar` filtraba con
`regexp_replace(upper(rut_proveedor), '[^0-9K]', '', 'g') = :r` para poder
comparar contra `CompetidorSeguido.rut_norm`. Envolver la columna en una
expresión inutiliza el índice normal que ya tiene `rut_proveedor`
(593d371cb8fe): el filtro pasaba a ser un recorrido secuencial completo de
`ordenes_compra` — la tabla más grande del sistema — una vez por competidor
vigilado, cada mañana a las 07:15.

Columna generada, no índice por expresión
------------------------------------------
Misma técnica que `licitaciones.busqueda` / `nombre_norm` (3bf71893eed4):
Alembic compara mal los índices por expresión, y con `alembic check`
bloqueante eso sería deriva perpetua. Una columna generada más un índice
normal se comparan sin problema.

A diferencia de `unaccent` (que necesitó el envoltorio `inmutable_unaccent`
porque depende del `search_path`), `upper` y `regexp_replace` ya son
IMMUTABLE en Postgres — comprobado contra `pg_proc.provolatile` antes de
escribir esta migración — así que se usan tal cual, sin función intermedia.

Costo de aplicación
--------------------
`ADD COLUMN ... GENERATED ALWAYS AS (...) STORED` reescribe la tabla entera
(no hay forma de calcular una columna generada sin visitar cada fila), y
sobre `ordenes_compra` —la más grande del sistema— esto toma un
`ACCESS EXCLUSIVE lock` mientras dura: lecturas y escrituras quedan bloqueadas,
no sólo degradadas. `CREATE INDEX` (sin `CONCURRENTLY`, igual que el resto de
las migraciones de este repo) añade un segundo paso bloqueante encima. En una
tabla con muchas filas, aplicar esto contra producción real conviene hacerlo
en una ventana de mantenimiento fuera de horario, no como una migración más
del despliegue normal.

Revision ID: 04d3465a9dbf
Revises: 593d371cb8fe
Create Date: 2026-08-16 23:32:07.093685

"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "04d3465a9dbf"
down_revision: str | None = "f470d336f9b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ordenes_compra",
        sa.Column(
            "rut_proveedor_norm",
            sa.String(length=20),
            sa.Computed("regexp_replace(upper(rut_proveedor), '[^0-9K]', '', 'g')", persisted=True),
            nullable=True,
            comment=(
                "`rut_proveedor` sin puntos, guion ni espacios. Sostiene el "
                "seguimiento de competidores."
            ),
        ),
    )
    op.create_index(
        "ix_ordenes_compra_rut_proveedor_norm", "ordenes_compra", ["rut_proveedor_norm"]
    )


def downgrade() -> None:
    op.drop_index("ix_ordenes_compra_rut_proveedor_norm", table_name="ordenes_compra")
    op.drop_column("ordenes_compra", "rut_proveedor_norm")
