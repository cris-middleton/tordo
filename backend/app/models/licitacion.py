from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Computed,
    DateTime,
    Index,
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

    id = Column(
        BigInteger,
        primary_key=True,
        comment="Identificador interno de la fila (secuencia). La clave de negocio es codigo_externo.",
    )

    # Identifiers
    codigo_externo = Column(
        String(100),
        unique=True,
        nullable=False,
        comment="Código de Mercado Público (p. ej. 1057401-1-LP24). Clave de negocio.",
    )
    codigo_interno = Column(
        String(100), index=True, comment="`CodigoInterno` del payload de la API, si viene."
    )

    # Basic information
    nombre = Column(String(500), nullable=False, comment="Nombre como lo publica el comprador.")
    descripcion = Column(
        Text, comment="Descripción libre del comprador (`Descripcion` o `Detalle` del payload)."
    )

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

    # Las mismas palabras SIN raíz (configuración `simple`). El stemmer español
    # reduce «mesa» y «meses» a `mes`, así que `busqueda` sola hacía que «mesa»
    # encontrara toda licitación de «12 meses». `coincide_termino` exige además
    # que cada palabra del término empiece alguna palabra de aquí. Sin índice a
    # propósito: sólo filtra lo que ya encontró el GIN de `busqueda`, y comparar
    # un tsvector guardado es barato (lo caro era una regex sobre `descripcion`).
    busqueda_palabras = Column(
        TSVECTOR,
        Computed(
            "to_tsvector('simple', inmutable_unaccent("
            "coalesce(nombre, '') || ' ' || coalesce(descripcion, '')))",
            persisted=True,
        ),
        comment="Palabras de nombre + descripcion sin tildes y sin raíz (simple).",
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
    fecha_publicacion = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
        comment="Publicación (hora de Chile). Si el payload no la trae, el momento de la ingesta.",
    )
    fecha_cierre = Column(
        DateTime(timezone=True), comment="Cierre de la recepción de ofertas (hora de Chile)."
    )
    fecha_inicio = Column(DateTime(timezone=True), comment="`FechaInicio` del payload, si viene.")
    fecha_final = Column(DateTime(timezone=True), comment="`FechaFinal` del payload, si viene.")

    # Financial information
    monto_estimado = Column(
        Numeric(15, 2),
        comment="Monto estimado en `moneda` (`MontoEstimado`; si falta, `MontoTotal`). NULL si no se publicó.",
    )
    monto_total = Column(Numeric(15, 2), comment="`MontoTotal` del payload de la API, si viene.")
    moneda = Column(
        String(10), default="CLP", comment="Moneda de los montos (`Moneda`; CLP si no viene)."
    )

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
    estado = Column(
        String(50),
        index=True,
        comment="Estado según el listado de Mercado Público (Publicada, Cerrada, Adjudicada…).",
    )
    tipo_licitacion = Column(
        String(100), comment="Tipo de licitación de Mercado Público (L1, LE, LP…)."
    )
    tipo_moneda = Column(String(10), comment="`TipoMoneda` del payload (CLP si no viene).")

    # Organization
    codigo_organismo = Column(
        String(50),
        index=True,
        comment="Código del organismo comprador. NULL en Compra Ágil, que sólo trae el RUT.",
    )
    nombre_organismo = Column(String(500), comment="Nombre del organismo comprador.")
    rut_organismo = Column(String(20), comment="RUT del organismo o de la unidad compradora.")

    # Location
    region = Column(String(100), comment="Región del comprador, como la escribe Mercado Público.")
    comuna = Column(String(100), comment="Comuna del comprador, si el payload la trae.")

    # Additional data
    informacion_adicional = Column(
        JSONB,
        comment="Resto del payload sin columna propia, ya sin datos de personas naturales.",
    )
    items = Column(JSONB, comment="Ítems pedidos, del listado o copiados del detalle.")

    # Metadata
    url_acta = Column(String(500), comment="`UrlActa` del payload, si viene.")
    url_licitacion = Column(
        String(500), comment="Enlace a la ficha en Mercado Público, si el payload lo trae."
    )

    # ETL metadata
    fecha_extraccion = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        comment="Primera vez que el ETL guardó la fila.",
    )
    fecha_actualizacion = Column(
        DateTime(timezone=True),
        onupdate=func.now(),
        comment="Última vez que el ETL cambió la fila. NULL si nunca.",
    )
    activo = Column(
        Boolean,
        default=True,
        comment="FALSE si Mercado Público la retiró. Toda consulta filtra por activo.",
    )
    # Lo escribe SÓLO la re-consulta de resultados del cron (`etl/cron.py`):
    # sin ella, las cerradas que la API devuelve sin cambios se pedirían todos
    # los días y el tope diario nunca llegaría a las demás.
    resultado_consultado_en = Column(
        DateTime(timezone=True),
        nullable=True,
        comment=(
            "Última vez que el cron re-consultó la licitación ya cerrada buscando su "
            "adjudicación. NULL = nunca. Rota la cola de la re-consulta."
        ),
    )

    # El detalle, que llega en una segunda llamada a la API
    detalle = relationship(
        "LicitacionDetalle",
        back_populates="licitacion",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Licitacion(codigo_externo='{self.codigo_externo}', nombre='{self.nombre}')>"
