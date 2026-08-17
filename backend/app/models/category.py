from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class Category(Base):
    """Category model for CPV/UNSPSC classification"""

    __tablename__ = "categories"
    __table_args__ = {
        "comment": "Taxonomía CPV/UNSPSC. Ni licitaciones ni órdenes están clasificadas contra ella todavía"
    }

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)  # CPV or UNSPSC code
    name = Column(String(500), nullable=False)
    description = Column(Text)

    # Classification system
    classification_system = Column(String(20), nullable=False, index=True)  # "CPV" or "UNSPSC"
    level = Column(Integer, default=1)  # Hierarchy level (1-5 typically)

    # Hierarchy
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    parent = relationship("Category", remote_side=[id], backref="children")

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    activo = Column(Boolean, default=True)

    # Relationships
    alert_preferences = relationship("AlertPreference", back_populates="category")

    def __repr__(self):
        return f"<Category(code='{self.code}', name='{self.name}', system='{self.classification_system}')>"
