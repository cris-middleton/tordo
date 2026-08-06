"""suscripcion por empresa

Revision ID: 4829d50c138a
Revises: 012
Create Date: 2026-08-06

Mueve la suscripción de `users` a `empresas` (ver docs/decisiones/0002).

Hasta ahora `plan_tier`, `subscription_status`, los identificadores de Stripe y
el trial colgaban del usuario. Con eso, tres personas de la misma PYME
necesitaban tres planes: no es un SaaS B2B con equipos, son tres cuentas
individuales que casualmente comparten datos.

La suscripción pertenece a la empresa. Los usuarios son asientos.

NOTA sobre autogenerate
-----------------------
El esqueleto que generó `make migrate-create` traía ~45 operaciones que NO son
esta migración: eliminaba restricciones únicas de licitaciones.codigo_externo,
ordenes_compra.codigo_oc y empresas.rut_empresa, entre otras. Es la deriva
conocida entre los modelos y las migraciones (revisión §5.0), pendiente de
reconciliar en F4. El cuerpo de abajo está escrito a mano.

Backfill
--------
Cada empresa hereda los valores de su usuario **owner** — el más antiguo si hay
varios, porque la restricción única es (user_id, empresa_id) y una empresa puede
tener más de uno.

Un usuario sin empresa pierde su plan, y es correcto bajo el modelo nuevo: sin
empresa no hay nada que facturar, porque todo el valor del producto (documentos,
postulaciones, estado hábil, matching) es de empresa.

El trial pasa a arrancar al **crear la empresa**, no al registrarse el usuario.
Las empresas existentes conservan los días que le quedaran a su owner.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "4829d50c138a"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CAMPOS = (
    "plan_tier",
    "subscription_status",
    "stripe_customer_id",
    "stripe_subscription_id",
    "trial_ends_at",
    "trial_reminder_day7_sent_at",
    "trial_reminder_day12_sent_at",
)


def upgrade() -> None:
    # ── 1. Columnas nuevas en empresas ───────────────────────────────────────
    op.add_column(
        "empresas",
        sa.Column(
            "plan_tier",
            sa.String(length=20),
            nullable=True,
            server_default="basico",
            comment="Plan contratado: basico | pyme | pro | enterprise",
        ),
    )
    op.add_column(
        "empresas",
        sa.Column(
            "subscription_status",
            sa.String(length=20),
            nullable=True,
            server_default="inactive",
            comment="Estado de la suscripción: inactive | trialing | active | past_due | canceled",
        ),
    )
    op.add_column(
        "empresas",
        sa.Column(
            "stripe_customer_id",
            sa.String(length=255),
            nullable=True,
            comment="ID del customer en Stripe",
        ),
    )
    op.add_column(
        "empresas",
        sa.Column(
            "stripe_subscription_id",
            sa.String(length=255),
            nullable=True,
            comment="ID de la suscripción en Stripe",
        ),
    )
    op.add_column(
        "empresas",
        sa.Column(
            "trial_ends_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Fin del reverse-trial. Se fija al crear la empresa, no al registrarse el usuario",
        ),
    )
    op.add_column(
        "empresas",
        sa.Column(
            "trial_reminder_day7_sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Cuándo se envió el recordatorio de trial del día 7",
        ),
    )
    op.add_column(
        "empresas",
        sa.Column(
            "trial_reminder_day12_sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Cuándo se envió el recordatorio de trial del día 12",
        ),
    )

    # ── 2. Backfill desde el owner más antiguo de cada empresa ───────────────
    # DISTINCT ON toma una fila por empresa según el ORDER BY: así el resultado
    # es determinista cuando una empresa tiene más de un owner.
    op.execute(
        """
        UPDATE empresas e SET
            plan_tier                    = o.plan_tier,
            subscription_status          = o.subscription_status,
            stripe_customer_id           = o.stripe_customer_id,
            stripe_subscription_id       = o.stripe_subscription_id,
            trial_ends_at                = o.trial_ends_at,
            trial_reminder_day7_sent_at  = o.trial_reminder_day7_sent_at,
            trial_reminder_day12_sent_at = o.trial_reminder_day12_sent_at
        FROM (
            SELECT DISTINCT ON (eu.empresa_id)
                   eu.empresa_id,
                   u.plan_tier, u.subscription_status,
                   u.stripe_customer_id, u.stripe_subscription_id,
                   u.trial_ends_at,
                   u.trial_reminder_day7_sent_at, u.trial_reminder_day12_sent_at
            FROM empresas_usuario eu
            JOIN users u ON u.id = eu.user_id
            WHERE eu.rol = 'owner'
            ORDER BY eu.empresa_id, eu.created_at ASC
        ) o
        WHERE o.empresa_id = e.id
        """
    )

    # Empresas sin owner (no debería ocurrir) quedan en los valores por defecto.
    op.execute("UPDATE empresas SET plan_tier = 'basico' WHERE plan_tier IS NULL")
    op.execute(
        "UPDATE empresas SET subscription_status = 'inactive' WHERE subscription_status IS NULL"
    )
    op.alter_column("empresas", "plan_tier", nullable=False)
    op.alter_column("empresas", "subscription_status", nullable=False)

    op.create_index("ix_empresas_stripe_customer_id", "empresas", ["stripe_customer_id"])
    op.create_index("ix_empresas_trial_ends_at", "empresas", ["trial_ends_at"])

    # ── 3. Quitar de users ───────────────────────────────────────────────────
    # Se eliminan en vez de dejarlas por compatibilidad: dos fuentes de verdad
    # para el plan divergirían al primer webhook de Stripe.
    op.drop_index("ix_users_trial_ends_at", table_name="users")
    for campo in CAMPOS:
        op.drop_column("users", campo)


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("plan_tier", sa.String(length=20), server_default="basico", nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "subscription_status", sa.String(length=20), server_default="inactive", nullable=True
        ),
    )
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
    op.add_column(
        "users", sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True)
    )
    op.add_column("users", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users", sa.Column("trial_reminder_day7_sent_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column("trial_reminder_day12_sent_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute(
        """
        UPDATE users u SET
            plan_tier                    = e.plan_tier,
            subscription_status          = e.subscription_status,
            stripe_customer_id           = e.stripe_customer_id,
            stripe_subscription_id       = e.stripe_subscription_id,
            trial_ends_at                = e.trial_ends_at,
            trial_reminder_day7_sent_at  = e.trial_reminder_day7_sent_at,
            trial_reminder_day12_sent_at = e.trial_reminder_day12_sent_at
        FROM (
            SELECT DISTINCT ON (eu.user_id)
                   eu.user_id,
                   emp.plan_tier, emp.subscription_status,
                   emp.stripe_customer_id, emp.stripe_subscription_id,
                   emp.trial_ends_at,
                   emp.trial_reminder_day7_sent_at, emp.trial_reminder_day12_sent_at
            FROM empresas_usuario eu
            JOIN empresas emp ON emp.id = eu.empresa_id
            WHERE eu.rol = 'owner'
            ORDER BY eu.user_id, eu.created_at ASC
        ) e
        WHERE e.user_id = u.id
        """
    )
    op.execute("UPDATE users SET plan_tier = 'basico' WHERE plan_tier IS NULL")
    op.execute(
        "UPDATE users SET subscription_status = 'inactive' WHERE subscription_status IS NULL"
    )
    op.alter_column("users", "plan_tier", nullable=False)
    op.alter_column("users", "subscription_status", nullable=False)
    op.create_index("ix_users_trial_ends_at", "users", ["trial_ends_at"])

    op.drop_index("ix_empresas_trial_ends_at", table_name="empresas")
    op.drop_index("ix_empresas_stripe_customer_id", table_name="empresas")
    for campo in CAMPOS:
        op.drop_column("empresas", campo)
