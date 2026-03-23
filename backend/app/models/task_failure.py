import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Text, JSON
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
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
    resolved_at = Column(DateTime(timezone=True), nullable=True)
