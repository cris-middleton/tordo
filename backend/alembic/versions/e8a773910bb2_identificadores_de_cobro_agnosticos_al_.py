"""identificadores de cobro agnósticos al proveedor

Revision ID: e8a773910bb2
Revises: 4829d50c138a
Create Date: 2026-08-06

Los identificadores de cobro llevaban el nombre de un proveedor concreto:
`stripe_customer_id` y `stripe_subscription_id`. Con más de una pasarela eso no
se sostiene — una empresa tiene que registrar **cuál** tiene su suscripción.

    stripe_customer_id      → billing_customer_id
    stripe_subscription_id  → billing_subscription_id
                            + billing_provider

Ver docs/decisiones/0008-mercadopago-como-pasarela.md. Esta migración **no
depende de qué pasarela se elija**, por eso va antes que el adaptador.

Se hace ahora porque es barato: renombrar columnas con clientes pagando obliga a
una ventana de escritura dual. Hoy no hay ninguno.

OJO con autogenerate
--------------------
El esqueleto que generó `make migrate-create` traía otra vez las ~45 operaciones
de deriva entre modelos y migraciones (revisión §5.0): eliminaba restricciones
únicas de licitaciones.codigo_externo, ordenes_compra.codigo_oc y
empresas.rut_empresa. Es la segunda vez. El cuerpo está escrito a mano.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "e8a773910bb2"
down_revision: Union[str, None] = "4829d50c138a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Renombrar, no recrear ────────────────────────────────────────────────
    # `alter_column ... new_column_name` conserva los datos. Un drop+add los
    # perdería, que es justo lo que hace autogenerate cuando detecta un renombre.
    op.alter_column("empresas", "stripe_customer_id", new_column_name="billing_customer_id")
    op.alter_column("empresas", "stripe_subscription_id", new_column_name="billing_subscription_id")

    op.execute(
        "COMMENT ON COLUMN empresas.billing_customer_id IS "
        "'ID del cliente en la pasarela de cobro. El formato depende del proveedor.'"
    )
    op.execute(
        "COMMENT ON COLUMN empresas.billing_subscription_id IS "
        "'ID de la suscripción en la pasarela de cobro.'"
    )

    op.add_column(
        "empresas",
        sa.Column(
            "billing_provider",
            sa.String(length=30),
            nullable=True,
            comment=(
                "Pasarela que tiene la suscripción de esta empresa: stripe | mercadopago | "
                "khipu. NULL mientras no haya suscripción."
            ),
        ),
    )

    # Las empresas que YA tienen cliente de cobro lo tienen en Stripe: es la
    # única pasarela que ha existido.
    op.execute(
        "UPDATE empresas SET billing_provider = 'stripe' WHERE billing_customer_id IS NOT NULL"
    )

    # El índice sigue al nombre de la columna.
    op.execute("ALTER INDEX ix_empresas_stripe_customer_id RENAME TO ix_empresas_billing_customer_id")
    op.create_index("ix_empresas_billing_provider", "empresas", ["billing_provider"])


def downgrade() -> None:
    op.drop_index("ix_empresas_billing_provider", table_name="empresas")
    op.execute("ALTER INDEX ix_empresas_billing_customer_id RENAME TO ix_empresas_stripe_customer_id")
    op.drop_column("empresas", "billing_provider")
    op.alter_column("empresas", "billing_subscription_id", new_column_name="stripe_subscription_id")
    op.alter_column("empresas", "billing_customer_id", new_column_name="stripe_customer_id")
