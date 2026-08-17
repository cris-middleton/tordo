"""unificar las dos cabezas de dos PR en paralelo

Revision ID: 7fb7c28fb325
Revises: f19cbdcd6aa9, f470d336f9b1
Create Date: 2026-08-16 23:48:59.847152

Por qué existe
--------------
Dos PR salieron del mismo padre, cada uno con su migración, y se mergearon por
separado:

- `f470d336f9b1` — código de un solo uso para cerrar el login con Google
- `f19cbdcd6aa9` — comentarios en las 23 tablas que no los tenían

Ninguno de los dos hizo nada malo: el conflicto no está en el código, sino en que
el árbol de revisiones se bifurcó al juntarlos. Con dos cabezas, `alembic upgrade
head` falla con «Multiple head revisions are present», así que **una base nueva no
se puede construir** — y eso incluye la de un despliegue nuevo y la que levantan
los tests.

Esta revisión no cambia el esquema: sólo vuelve a juntar las dos ramas. Por eso
`upgrade` y `downgrade` están vacíos a propósito, y no es un descuido.

Cómo se detectó, y por qué no lo vio CI
---------------------------------------
CI tiene un job que comprueba exactamente esto («Una sola cabeza de Alembic»).
No saltó porque GitHub Actions dejó de programar trabajos —los siete jobs
fallaban en el mismo segundo, sin logs— justo cuando estos dos PR se mergearon.
Apareció al correr la suite en local: 247 tests con error porque el esquema no
se podía construir.
"""

from typing import Sequence

# revision identifiers, used by Alembic.
revision: str = "7fb7c28fb325"
down_revision: str | None = ("f19cbdcd6aa9", "f470d336f9b1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
