"""Código de un solo uso para cerrar el inicio de sesión con Google.

**El problema que resuelve.** La vuelta de Google es una redirección del
navegador, así que lo único que el backend puede entregarle al frontend es algo
puesto en la URL. Hasta ahora ponía el JWT de acceso: funcionaba, pero **sin
token de refresco**, así que una sesión iniciada con Google moría a los 30
minutos en mitad de la jornada — justo el problema que `refresh_tokens` existe
para evitar, sin arreglar para quien entra por Google.

**Por qué no mandar el refresco por la URL.** Sería peor que el acceso: el
refresco dura treinta días. Una URL queda en el historial del navegador, en los
logs de cualquier proxy y en la cabecera `Referer` de la primera petición que
salga de esa página. Un token de 30 minutos ahí ya es incómodo; uno de 30 días
es una llave a la cuenta.

**La solución.** Lo que viaja por la URL es un código que no sirve para nada por
sí mismo: dura sesenta segundos, se canjea **una sola vez** y el canje ocurre de
servidor a servidor, no desde el navegador. Aunque quede en el historial, para
cuando alguien lo lea ya está caducado y usado.

Tabla propia y no una columna más en `refresh_tokens`, por el mismo motivo por
el que la verificación de correo tiene la suya: son ciclos de vida distintos
—sesenta segundos contra treinta días— y mezclarlos convierte cada consulta en
un filtro que alguien va a olvidar.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db import Base


class OAuthCodigo(Base):
    """Un código de un solo uso emitido tras autenticar contra Google."""

    __tablename__ = "oauth_codigos"
    # Sin `Index` propio sobre `codigo_hash`: la restricción UNIQUE ya trae el
    # suyo, y declarar los dos deja un índice duplicado que nadie usa. Es la
    # regla de CLAUDE.md sobre `unique=True, index=True`.
    __table_args__ = (
        {
            "comment": (
                "Códigos de un solo uso que cierran el login con Google: viajan por la URL "
                "de vuelta y se canjean de servidor a servidor por el par acceso+refresco"
            )
        },
    )

    # `UUID` como sus dos tablas hermanas (`refresh_tokens` y
    # `email_verification_tokens`): son artefactos de autenticación y la
    # convención del repo reserva `integer` para nada.
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador del código emitido",
    )
    #: SHA-256 y no el código en claro, igual que en `refresh_tokens`: si la
    #: base se filtra, lo que hay dentro no sirve para entrar.
    codigo_hash = Column(
        String(64),
        unique=True,
        nullable=False,
        comment="SHA-256 del código. Nunca se guarda en claro",
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="Usuario que acaba de autenticarse contra Google",
    )
    expira_en = Column(
        DateTime(timezone=True),
        nullable=False,
        comment="Sesenta segundos desde la emisión: sólo tiene que sobrevivir a un redirect",
    )
    usado_en = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Cuándo se canjeó. No nulo significa gastado, y un segundo canje se rechaza",
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        comment="Cuándo se emitió",
    )

    def __repr__(self) -> str:
        return f"<OAuthCodigo(user_id={self.user_id}, usado={self.usado_en is not None})>"
