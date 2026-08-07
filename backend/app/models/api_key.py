"""Claves de API para clientes que no son un navegador.

Hasta ahora la única forma de autenticarse era un JWT de 30 minutos obtenido con
usuario y contraseña. Sirve para el frontend y para nada más: un servidor MCP, un
ERP o un script no pueden re-autenticarse cada media hora.

Esto **es prerequisito del MCP** (F6.1), aunque el plan lo listaba después
(F6.4). Sin una credencial larga y revocable, el servidor MCP no tiene forma
razonable de identificarse.

Tres decisiones que el modelo hace explícitas
---------------------------------------------

1. **La clave es de la EMPRESA, no del usuario.** Es coherente con que la
   suscripción y las cuotas sean de la empresa (ADR 0002): lo que consume la
   clave se descuenta del plan de esa empresa. `creada_por` queda para saber
   quién la emitió, no para decidir permisos.

2. **La clave pinta una sola empresa.** Una petición autenticada con clave que
   nombre otra empresa recibe 403, aunque quien la creó pertenezca a las dos.
   Una credencial de integración con alcance ambiguo es una credencial que
   alguien va a usar mal.

3. **Se guarda el hash, no la clave.** Igual que las contraseñas y que los tokens
   de refresco. El `prefijo` sí se guarda en claro: es lo que permite decir "la
   clave tordo_a1b2c3d4… dejó de usarse" sin conocer el secreto.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db import Base


class ApiKey(Base):
    """Una clave de API emitida a una empresa."""

    __tablename__ = "api_keys"
    __table_args__ = (
        # La búsqueda por hash ocurre en CADA petición autenticada con clave.
        Index("ix_api_keys_key_hash", "key_hash", unique=True),
        Index("ix_api_keys_empresa_id", "empresa_id"),
        {"comment": "Claves de API para clientes que no son un navegador (MCP, ERP, scripts)."},
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador de la clave.",
    )
    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        comment="Empresa cuyo plan y cuotas gobiernan lo que haga esta clave.",
    )
    nombre = Column(
        String(100),
        nullable=False,
        comment="Etiqueta para reconocerla: 'Claude Desktop', 'ERP de bodega'…",
    )
    prefijo = Column(
        String(16),
        nullable=False,
        comment="Primeros caracteres, en claro. Permite identificarla sin conocer el secreto.",
    )
    key_hash = Column(
        String(64),
        nullable=False,
        comment="SHA-256 de la clave completa. La clave en claro sólo existe al crearla.",
    )
    creada_por = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Quién la emitió. Informativo: los permisos salen de la empresa.",
    )
    ultimo_uso_en = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Última vez que se usó. Sirve para detectar claves olvidadas.",
    )
    expira_en = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Caducidad opcional. NULL = no caduca.",
    )
    revocada_en = Column(
        DateTime(timezone=True),
        nullable=True,
        comment="Cuándo se revocó. NULL = vigente.",
    )
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Cuándo se emitió.",
    )
