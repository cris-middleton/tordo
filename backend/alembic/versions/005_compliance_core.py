"""Compliance core: alert extensions, idempotency, plantillas seed

Revision ID: 005
Revises: 004
Create Date: 2026-03-22

Changes:
- alerts: add idempotency_key (UNIQUE), empresa_id FK
- alerttype enum: add 5 new values
- plantillas_checklist: seed L1, LE, LP templates
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None

# Checklist items per tender type (nombre_item, es_obligatorio, orden)
PLANTILLAS = {
    "L1": [  # Licitación menor a 100 UTM
        ("Formulario de postulación firmado", True, 1),
        ("Identificación del oferente (RUT + razón social)", True, 2),
        ("Declaración jurada de habilidad (estado hábil vigente)", True, 3),
        ("Oferta económica detallada", True, 4),
        ("Especificaciones técnicas del producto/servicio", True, 5),
        ("Plazo de entrega confirmado", True, 6),
        ("Condiciones de garantía (si aplica)", False, 7),
    ],
    "LE": [  # Licitación entre 100 y 1000 UTM
        ("Formulario de postulación firmado", True, 1),
        ("Identificación del oferente (RUT + razón social)", True, 2),
        ("Declaración jurada de habilidad (estado hábil vigente)", True, 3),
        ("Certificado de inscripción ChileProveedores vigente", True, 4),
        ("Oferta económica detallada con impuestos", True, 5),
        ("Especificaciones técnicas completas", True, 6),
        ("Experiencia acreditable (si aplica)", False, 7),
        ("Plazo de entrega con hitos", True, 8),
        ("Garantía de seriedad de oferta (si exigida)", False, 9),
        ("Certificados SII sin deuda (si exigidos)", False, 10),
    ],
    "LP": [  # Licitación mayor a 1000 UTM
        ("Formulario de postulación firmado y notariado", True, 1),
        ("Identificación del oferente (RUT + razón social)", True, 2),
        ("Declaración jurada de habilidad notariada", True, 3),
        ("Certificado de inscripción ChileProveedores vigente", True, 4),
        ("Oferta económica detallada con impuestos y desglose", True, 5),
        ("Especificaciones técnicas con certificaciones", True, 6),
        ("Experiencia comprobable últimos 3 años", True, 7),
        ("Plan de trabajo y metodología", True, 8),
        ("Equipo profesional con CVs", False, 9),
        ("Garantía de seriedad de oferta", True, 10),
        ("Certificados SII sin deuda", True, 11),
        ("Garantía de fiel cumplimiento (si adjudicado)", False, 12),
    ],
}


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Extend alerttype PostgreSQL enum (must be outside transaction in PG<12)
    # PostgreSQL 15 allows this inside a transaction
    for value in [
        "estado_habil_cambio",
        "documento_vencido",
        "plazo_48h",
        "plazo_24h",
        "nueva_licitacion_match",
    ]:
        conn.execute(sa.text(f"ALTER TYPE alerttype ADD VALUE IF NOT EXISTS '{value}'"))

    # ── 2. Extend alerts table
    op.add_column("alerts", sa.Column("idempotency_key", sa.String(255), nullable=True))
    op.add_column(
        "alerts",
        sa.Column("empresa_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_unique_constraint("uq_alerts_idempotency_key", "alerts", ["idempotency_key"])
    op.create_foreign_key(
        "fk_alerts_empresa_id", "alerts", "empresas", ["empresa_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_alerts_empresa_id", "alerts", ["empresa_id"])

    # ── 3. Seed plantillas_checklist
    for tipo, items in PLANTILLAS.items():
        for nombre_item, es_obligatorio, orden in items:
            conn.execute(
                sa.text(
                    "INSERT INTO plantillas_checklist "
                    "(id, tipo_licitacion, nombre_item, es_obligatorio, orden, activo) "
                    "VALUES (gen_random_uuid(), :tipo, :nombre, :oblig, :orden, TRUE) "
                    "ON CONFLICT DO NOTHING"
                ),
                {"tipo": tipo, "nombre": nombre_item, "oblig": es_obligatorio, "orden": orden},
            )


def downgrade() -> None:
    op.drop_index("ix_alerts_empresa_id", table_name="alerts")
    op.drop_constraint("fk_alerts_empresa_id", "alerts", type_="foreignkey")
    op.drop_constraint("uq_alerts_idempotency_key", "alerts", type_="unique")
    op.drop_column("alerts", "empresa_id")
    op.drop_column("alerts", "idempotency_key")
    # NOTE: PostgreSQL does not support DROP VALUE on enums; enum extension is irreversible.
    op.execute("DELETE FROM plantillas_checklist")
