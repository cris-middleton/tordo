"""Hito 0b: empresas, documentos_empresa, estado_habil_log, postulaciones, checklist

Revision ID: 004
Revises: 003
Create Date: 2026-03-22

Adds:
- users: plan_tier, stripe_*, onboarding_* columns
- empresas (supplier entity — UUID PK, RUT unique)
- empresas_usuario (M2M: users ↔ empresas, with rol)
- documentos_empresa (S3-backed company documents)
- estado_habil_log (audit log of estado hábil changes)
- postulaciones (tender tracking per empresa)
- plantillas_checklist (checklist templates by tender type)
- checklist_postulacion (checklist items per postulacion)
- tfidf_perfiles (serialised TF-IDF vectors for matching)
- task_failures (dead-letter queue for Celery tasks)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Extend users ──────────────────────────────────────────────────────
    op.add_column("users", sa.Column("plan_tier", sa.String(20), nullable=False, server_default="basico"))
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("stripe_subscription_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("onboarding_step", sa.SmallInteger(), nullable=False, server_default="0"))

    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_plan_tier "
        "CHECK (plan_tier IN ('basico', 'pyme', 'pro', 'gremio'))"
    )

    # ── 2. empresas ──────────────────────────────────────────────────────────
    op.create_table(
        "empresas",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rut_empresa", sa.String(12), nullable=False),
        sa.Column("nombre_empresa", sa.String(255), nullable=False),
        sa.Column("rubros_cpv", ARRAY(sa.Text()), nullable=True),
        sa.Column("regiones", ARRAY(sa.Text()), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("estado_habil", sa.String(20), nullable=False, server_default="desconocido"),
        sa.Column("estado_habil_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "estado_habil IN ('habil', 'inhabil', 'no_encontrado', 'desconocido')",
            name="ck_empresas_estado_habil",
        ),
        sa.UniqueConstraint("rut_empresa", name="uq_empresas_rut"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_empresas_rut_empresa", "empresas", ["rut_empresa"], unique=True)

    # ── 3. empresas_usuario (M2M join) ───────────────────────────────────────
    op.create_table(
        "empresas_usuario",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rol", sa.String(20), nullable=False, server_default="owner"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("rol IN ('owner', 'admin', 'viewer')", name="ck_empresas_usuario_rol"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "empresa_id", name="uq_empresas_usuario"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_empresas_usuario_user_id", "empresas_usuario", ["user_id"])
    op.create_index("ix_empresas_usuario_empresa_id", "empresas_usuario", ["empresa_id"])

    # ── 4. estado_habil_log ──────────────────────────────────────────────────
    op.create_table(
        "estado_habil_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("empresa_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rut_empresa", sa.String(12), nullable=False),
        sa.Column("estado_anterior", sa.String(20), nullable=True),
        sa.Column("estado_nuevo", sa.String(20), nullable=False),
        sa.Column("fuente", sa.String(50), nullable=True, server_default="csv_datos_abiertos"),
        sa.Column("checked_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_estado_habil_log_empresa_id", "estado_habil_log", ["empresa_id"])
    op.create_index("ix_estado_habil_log_checked_at", "estado_habil_log", ["checked_at"])

    # ── 5. documentos_empresa ────────────────────────────────────────────────
    op.create_table(
        "documentos_empresa",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("empresa_id", UUID(as_uuid=True), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("tipo_documento", sa.String(50), nullable=False),
        sa.Column("s3_key", sa.String(500), nullable=False),
        sa.Column("s3_bucket", sa.String(100), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("tamano_bytes", sa.BigInteger(), nullable=True),
        sa.Column("fecha_emision", sa.Date(), nullable=True),
        sa.Column("fecha_vencimiento", sa.Date(), nullable=True),
        sa.Column("eliminado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("tamano_bytes <= 26214400", name="ck_documentos_tamano"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_documentos_empresa_empresa_id", "documentos_empresa", ["empresa_id"])
    op.create_index("ix_documentos_empresa_fecha_vencimiento", "documentos_empresa", ["fecha_vencimiento"])

    # ── 6. postulaciones ─────────────────────────────────────────────────────
    op.create_table(
        "postulaciones",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("empresa_id", UUID(as_uuid=True), nullable=False),
        sa.Column("licitacion_id", sa.Integer(), nullable=False),
        sa.Column("estado", sa.String(30), nullable=False, server_default="en_seguimiento"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "estado IN ('en_seguimiento', 'en_preparacion', 'enviada', 'adjudicada', 'no_adjudicada', 'descartada')",
            name="ck_postulaciones_estado",
        ),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["licitacion_id"], ["licitaciones.id"]),
        sa.UniqueConstraint("empresa_id", "licitacion_id", name="uq_postulaciones"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_postulaciones_empresa_id", "postulaciones", ["empresa_id"])
    op.create_index("ix_postulaciones_licitacion_id", "postulaciones", ["licitacion_id"])

    # ── 7. plantillas_checklist ──────────────────────────────────────────────
    op.create_table(
        "plantillas_checklist",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tipo_licitacion", sa.String(10), nullable=False),
        sa.Column("nombre_item", sa.String(500), nullable=False),
        sa.Column("es_obligatorio", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("orden", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plantillas_checklist_tipo", "plantillas_checklist", ["tipo_licitacion"])

    # ── 8. checklist_postulacion ─────────────────────────────────────────────
    op.create_table(
        "checklist_postulacion",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("postulacion_id", UUID(as_uuid=True), nullable=False),
        sa.Column("descripcion", sa.String(500), nullable=False),
        sa.Column("es_obligatorio", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("completado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("completado_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("documento_id", UUID(as_uuid=True), nullable=True),
        sa.Column("orden", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["postulacion_id"], ["postulaciones.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["documento_id"], ["documentos_empresa.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_checklist_postulacion_postulacion_id", "checklist_postulacion", ["postulacion_id"])

    # ── 9. tfidf_perfiles ────────────────────────────────────────────────────
    op.create_table(
        "tfidf_perfiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("empresa_id", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("vector_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("rubros_usados", ARRAY(sa.Text()), nullable=True),
        sa.Column("modelo_version", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── 10. task_failures (DLQ) ──────────────────────────────────────────────
    op.create_table(
        "task_failures",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("task_name", sa.String(255), nullable=False),
        sa.Column("task_args", sa.JSON(), nullable=True),
        sa.Column("error_msg", sa.Text(), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_task_failures_unresolved",
        "task_failures",
        ["failed_at"],
        postgresql_where=sa.text("resolved = FALSE"),
    )


def downgrade() -> None:
    op.drop_table("task_failures")
    op.drop_table("tfidf_perfiles")
    op.drop_index("ix_checklist_postulacion_postulacion_id", table_name="checklist_postulacion")
    op.drop_table("checklist_postulacion")
    op.drop_index("ix_plantillas_checklist_tipo", table_name="plantillas_checklist")
    op.drop_table("plantillas_checklist")
    op.drop_index("ix_postulaciones_licitacion_id", table_name="postulaciones")
    op.drop_index("ix_postulaciones_empresa_id", table_name="postulaciones")
    op.drop_table("postulaciones")
    op.drop_index("ix_documentos_empresa_fecha_vencimiento", table_name="documentos_empresa")
    op.drop_index("ix_documentos_empresa_empresa_id", table_name="documentos_empresa")
    op.drop_table("documentos_empresa")
    op.drop_index("ix_estado_habil_log_checked_at", table_name="estado_habil_log")
    op.drop_index("ix_estado_habil_log_empresa_id", table_name="estado_habil_log")
    op.drop_table("estado_habil_log")
    op.drop_index("ix_empresas_usuario_empresa_id", table_name="empresas_usuario")
    op.drop_index("ix_empresas_usuario_user_id", table_name="empresas_usuario")
    op.drop_table("empresas_usuario")
    op.drop_index("ix_empresas_rut_empresa", table_name="empresas")
    op.drop_table("empresas")

    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_plan_tier")
    op.drop_column("users", "onboarding_step")
    op.drop_column("users", "onboarding_completed")
    op.drop_column("users", "stripe_subscription_id")
    op.drop_column("users", "stripe_customer_id")
    op.drop_column("users", "plan_tier")
