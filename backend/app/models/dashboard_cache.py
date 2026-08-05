"""Dashboard home cache — pre-computed TF-IDF matches per empresa."""

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base

# Use JSONB on PostgreSQL (production) and fall back to generic JSON
# on SQLite (used by the test suite).
JsonType = JSON().with_variant(JSONB(), "postgresql")


class DashboardHomeCache(Base):
    """One row per empresa with the daily-refreshed match list."""

    __tablename__ = "dashboard_home_cache"

    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        primary_key=True,
    )
    matches = Column(JsonType, nullable=False, default=list)
    matches_count = Column(Integer(), nullable=False, default=0)
    cached_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    empresa = relationship("Empresa")
