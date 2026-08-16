"""Tokens de un solo uso para restablecer la contraseña.

Es el mismo patrón que `refresh_token.py` —se guarda el hash, nunca el valor—
pero con dos diferencias que vienen de para qué sirve cada uno:

1. **Vida corta.** Un refresco dura días porque sostiene una sesión de trabajo.
   Esto llega por correo y se usa en minutos; una hora es holgado y acota la
   ventana en la que un correo reenviado o un buzón compartido sirve para entrar.

2. **Un solo uso, marcado explícitamente.** `usado_en` no es una optimización:
   sin él, quien tenga el correo puede volver a entrar cuantas veces quiera
   mientras el token no caduque, aunque la contraseña ya se haya cambiado.

La unicidad se declara con `unique=True` en la columna y no con un `Index(...,
unique=True)` como en `refresh_tokens`: la convención de `app/db/__init__.py` la
nombra `uq_password_reset_tokens_token_hash` y una restricción UNIQUE ya trae su
propio índice (CLAUDE.md). El modelo antiguo se deja como está para no mover una
migración ya aplicada.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db import Base


class PasswordResetToken(Base):
    """Un token de recuperación emitido a un usuario."""

    __tablename__ = "password_reset_tokens"
    __table_args__ = (
        Index("ix_password_reset_tokens_user_id", "user_id"),
        {"comment": "Tokens de un solo uso para restablecer la contraseña por correo."},
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
        comment="Usuario que pidió recuperar su contraseña.",
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
        comment="Caducidad absoluta. Una hora desde la emisión.",
    )
    usado_en = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Cuándo se canjeó. Un token usado no vuelve a valer.",
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Cuándo se emitió.",
    )
