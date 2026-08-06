import uuid

from sqlalchemy import JSON, Boolean, Column, DateTime, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db import Base


class TaskFailure(Base):
    """Dead-letter queue for failed Celery tasks."""

    __tablename__ = "task_failures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_name = Column(String(255), nullable=False)
    task_args = Column(JSON(), nullable=True)
    error_msg = Column(Text(), nullable=True)
    failed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved = Column(Boolean(), nullable=False, default=False)

    __table_args__ = (
        # Índice PARCIAL: sólo las fallas sin resolver, que es lo único que se
        # consulta. SQLAlchemy no lo deduce de `index=True`, hay que declararlo,
        # y sin declararlo autogenerate propone eliminarlo.
        Index(
            "ix_task_failures_unresolved",
            "failed_at",
            postgresql_where=text("resolved = false"),
        ),
    )
    resolved_at = Column(DateTime(timezone=True), nullable=True)
