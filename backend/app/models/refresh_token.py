"""Tokens de refresco, con rotación y detección de reutilización.

Hasta ahora el JWT duraba 30 minutos y no había forma de renovarlo: **todo
usuario quedaba desconectado a la media hora**, en mitad de lo que estuviera
haciendo. Para una herramienta que se usa durante una jornada de trabajo eso no
es una molestia menor.

Tres decisiones que este modelo hace explícitas
----------------------------------------------

1. **Se guarda un hash, no el token.** Igual que una contraseña. Si la base se
   filtra, lo que hay dentro no sirve para entrar. Es la razón de que la columna
   se llame `token_hash` y no `token`.

2. **Rotación**: cada uso emite un token nuevo y revoca el anterior, dejando
   `reemplazado_por` apuntando al sucesor. Así queda la cadena completa.

3. **Detección de reutilización.** Si alguien presenta un token ya revocado, hay
   dos posibilidades y ninguna es buena: o se filtró, o hay una carrera. La
   respuesta es revocar **toda la familia** — el token robado y todos sus
   descendientes— y obligar a entrar de nuevo. Sin esto la rotación es teatro:
   el atacante que roba un token lo usa una vez y sigue con uno válido.

`familia_id` es lo que hace posible el punto 3 sin recorrer la cadena
`reemplazado_por` hacia atrás: todos los tokens nacidos de un mismo inicio de
sesión lo comparten.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db import Base


class RefreshToken(Base):
    """Un token de refresco emitido a un usuario."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        # La búsqueda por hash ocurre en CADA refresco: es la consulta caliente.
        Index("ix_refresh_tokens_token_hash", "token_hash", unique=True),
        # Revocar una familia entera es una sola sentencia gracias a este índice.
        Index("ix_refresh_tokens_familia_id", "familia_id"),
        Index("ix_refresh_tokens_user_id", "user_id"),
        {"comment": "Tokens de refresco con rotación y detección de reutilización."},
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
        comment="Usuario al que se le emitió.",
    )
    token_hash = Column(
        String(64),
        nullable=False,
        comment="SHA-256 del token. Nunca se guarda el token en claro.",
    )
    familia_id = Column(
        UUID(as_uuid=True),
        nullable=False,
        default=uuid.uuid4,
        comment=(
            "Agrupa todos los tokens nacidos del mismo inicio de sesión. "
            "Detectar una reutilización revoca la familia entera."
        ),
    )
    reemplazado_por = Column(
        UUID(as_uuid=True),
        nullable=True,
        comment="Token que lo sustituyó al rotar. NULL si es el vigente.",
    )
    expira_en = Column(
        DateTime(timezone=True),
        nullable=False,
        comment="Caducidad absoluta. Rotar NO la extiende.",
    )
    revocado_en = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Cuándo dejó de valer: por rotación, por cierre de sesión o por reutilización.",
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Cuándo se emitió.",
    )
