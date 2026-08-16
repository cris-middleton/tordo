"""Tokens de un solo uso para verificar el correo de una cuenta.

Mismo mecanismo que `password_reset.py` —256 bits aleatorios, guardados como
SHA-256, un solo uso— con una diferencia que viene de para qué sirve: **este vive
días, no minutos**. El de recuperación acota deliberadamente la ventana porque
quien lo pide está en riesgo; éste llega en el correo de bienvenida y hay que
contar con que alguien se registre un viernes y lo abra el lunes.

Tabla propia y no una columna `proposito` en `password_reset_tokens`: son dos
ciclos de vida distintos, con vencimientos distintos y motivos de revocación
distintos, y mezclarlos convierte cada consulta en un filtro que alguien
olvidará algún día.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db import Base


class TokenVerificacionCorreo(Base):
    """Un token de verificación emitido a un usuario."""

    __tablename__ = "email_verification_tokens"
    __table_args__ = (
        Index("ix_email_verification_tokens_user_id", "user_id"),
        {"comment": "Tokens de un solo uso para verificar el correo de una cuenta."},
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador del token emitido.",
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="Usuario que tiene que verificar su correo.",
    )
    token_hash = Column(
        String(64),
        nullable=False,
        unique=True,
        comment="SHA-256 del token. El valor en claro sólo existe en el correo.",
    )
    expira_en = Column(
        DateTime(timezone=True),
        nullable=False,
        comment="Cuándo deja de servir. Días, no minutos: llega en la bienvenida.",
    )
    usado_en = Column(
        DateTime(timezone=True),
        comment=(
            "Cuándo se canjeó. Sin esta marca, quien tenga el correo puede "
            "reverificar cuantas veces quiera mientras no caduque."
        ),
    )
    creado_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Cuándo se emitió.",
    )
