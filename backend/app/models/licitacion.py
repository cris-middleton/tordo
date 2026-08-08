from sqlalchemy import (
    Boolean,
    Column,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    desc,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.convocatoria import TipoConvocatoria


class Licitacion(Base):
    """Model for public tenders (Licitaciones)"""

    __tablename__ = "licitaciones"
    __table_args__ = (
        # ── Búsqueda ────────────────────────────────────────────────────────
        # `busqueda` la calcula Postgres (columna generada), así que no hay forma
        # de que se desincronice del texto: no hay trigger que mantener ni código
        # que recordar actualizar.
        Index("ix_licitaciones_busqueda", "busqueda", postgresql_using="gin"),
        # Trigrama SÓLO sobre `nombre`. Es lo que permite que `ILIKE '%frag%'`
        # use un índice en vez de recorrer la tabla. No se pone sobre
        # `descripcion` a propósito: es texto largo, sería el índice más caro de
        # mantener en cada carga del ETL, y ahí lo que se busca son palabras
        # —que ya cubre el tsvector— no fragmentos.
        Index(
            "ix_licitaciones_nombre_trgm",
            "nombre_norm",
            postgresql_using="gin",
            postgresql_ops={"nombre_norm": "gin_trgm_ops"},
        ),
        # ── Listado ─────────────────────────────────────────────────────────
        # Todos los filtros del listado son PARCIALES sobre `activo`: la consulta
        # siempre lleva `WHERE activo = true`, y un índice normal sobre una
        # columna booleana casi siempre verdadera no sirve de nada. Puestos en el
        # WHERE del índice, en cambio, lo hacen más pequeño y utilizable.
        #
        # El orden por defecto es `fecha_publicacion DESC`, así que va como
        # segunda columna: permite filtrar y ordenar con un solo recorrido.
        Index(
            "ix_licitaciones_activas_fecha",
            desc("fecha_publicacion"),
            postgresql_where=text("activo"),
        ),
        Index(
            "ix_licitaciones_estado_fecha",
            "estado",
            desc("fecha_publicacion"),
            postgresql_where=text("activo"),
        ),
        # `region` no tenía NINGÚN índice y es filtro de primera línea en la UI.
        Index(
            "ix_licitaciones_region_fecha",
            "region",
            desc("fecha_publicacion"),
            postgresql_where=text("activo"),
        ),
        {"comment": "Licitaciones publicadas en Mercado Público (listado diario)"},
    )

    id = Column(Integer, primary_key=True)

    # Identifiers
    codigo_externo = Column(String(100), unique=True, nullable=False)
    codigo_interno = Column(String(100), index=True)

    # Basic information
    nombre = Column(String(500), nullable=False)
    descripcion = Column(Text)

    # Columna GENERADA: Postgres la recalcula solo cuando cambian nombre o
    # descripcion. Se usa la configuración 'spanish', que aporta stemming
    # ("servicios" encuentra "servicio") y descarta palabras vacías.
    #
    # Pasa por `inmutable_unaccent` para que "valvulas" encuentre "Válvulas".
    # En Chile se escribe sin tildes más veces que con ellas, así que sin esto la
    # búsqueda falla en el caso normal, no en el raro.
    #
    # `unaccent(text)` es STABLE, no IMMUTABLE, porque resuelve el diccionario por
    # search_path — y una columna generada exige IMMUTABLE. `inmutable_unaccent`
    # (migración 5a6e2f9d1c04) lo envuelve pasando el diccionario explícito, con
    # lo que el resultado sí es determinista.
    busqueda = Column(
        TSVECTOR,
        Computed(
            "to_tsvector('spanish', inmutable_unaccent("
            "coalesce(nombre, '') || ' ' || coalesce(descripcion, '')))",
            persisted=True,
        ),
        comment="Vector de búsqueda generado desde nombre + descripcion, sin tildes.",
    )

    # El trigrama va sobre esta columna y no sobre un índice funcional a
    # propósito: alembic compara mal los índices por expresión, y con
    # `alembic check` bloqueante eso sería deriva perpetua. Una columna generada
    # más un índice normal se comparan sin problema.
    nombre_norm = Column(
        String(500),
        Computed("inmutable_unaccent(nombre)", persisted=True),
        comment="`nombre` sin tildes. Sostiene la búsqueda por fragmento.",
    )

    # Dates
    fecha_publicacion = Column(DateTime(timezone=True), nullable=False, index=True)
    fecha_cierre = Column(DateTime(timezone=True))
    fecha_inicio = Column(DateTime(timezone=True))
    fecha_final = Column(DateTime(timezone=True))

    # Financial information
    monto_estimado = Column(Numeric(15, 2))
    monto_total = Column(Numeric(15, 2))
    moneda = Column(String(10), default="CLP")

    # Por qué mecanismo convoca el Estado. Hasta F6 todo lo ingerido era una
    # licitación y el modelo lo daba por hecho; Compra Ágil y Convenio Marco son
    # cerca de la mitad del mercado chileno y no se veían.
    #
    # Texto y no enum de Postgres: añadir un mecanismo no debería exigir un
    # `ALTER TYPE`, que no se puede revertir dentro de una transacción.
    tipo_convocatoria = Column(
        String(30),
        nullable=False,
        server_default=TipoConvocatoria.LICITACION.value,
        index=True,
        comment="Mecanismo de compra: licitacion | compra_agil | convenio_marco | trato_directo.",
    )

    # Status and type
    estado = Column(String(50), index=True)
    tipo_licitacion = Column(String(100))
    tipo_moneda = Column(String(10))

    # Organization
    codigo_organismo = Column(String(50), index=True)
    nombre_organismo = Column(String(500))
    rut_organismo = Column(String(20))
    organismo_id = Column(Integer, ForeignKey("buyer_organizations.id"), nullable=True)
    organismo = relationship(
        "BuyerOrganization", back_populates="licitaciones", foreign_keys=[organismo_id]
    )

    # Location
    region = Column(String(100))
    comuna = Column(String(100))

    # Additional data
    informacion_adicional = Column(JSONB)
    items = Column(JSONB)  # List of items/products

    # Metadata
    url_acta = Column(String(500))
    url_licitacion = Column(String(500))

    # ETL metadata
    fecha_extraccion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_actualizacion = Column(DateTime(timezone=True), onupdate=func.now())
    activo = Column(Boolean, default=True)

    # Relationships to detailed info and history
    detalle = relationship(
        "LicitacionDetalle",
        back_populates="licitacion",
        uselist=False,
        cascade="all, delete-orphan",
    )
    historial = relationship(
        "LicitacionHistorial", back_populates="licitacion", cascade="all, delete-orphan"
    )
    postulaciones = relationship(
        "Postulacion", back_populates="licitacion", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Licitacion(codigo_externo='{self.codigo_externo}', nombre='{self.nombre}')>"
