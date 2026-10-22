"""
Database loader for ETL pipeline - licitaciones y su detalle
Loads transformed data into PostgreSQL database
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List

from sqlalchemy import String, Text, create_engine, func, literal_column, or_, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import sessionmaker

from etl.analytics.personas import enmascarar_payload
from etl.loaders.base import BaseLoader

# Import models using shared module
from etl.shared_imports import (
    Base,
    Licitacion,
    LicitacionDetalle,
    TipoConvocatoria,
)
from etl.utils import (
    calcular_hash,
    extraer_datos_adjudicacion,
    now_santiago,
)
from etl.utils.licitacion_base import campos_base_desde_detalle, objeto_principal


def _sin_claves_repetidas(
    filas: List[Dict[str, Any]], clave: str, logger, entidad: str
) -> List[Dict[str, Any]]:
    """Deja una sola fila por valor de `clave`, quedándose con la última.

    Mercado Público **devuelve el mismo registro varias veces en la misma
    respuesta**: medido contra la API en producción, una consulta diaria de
    licitaciones trajo 1.289 registros con sólo 1.265 códigos distintos — doce
    códigos repetidos tres veces cada uno.

    Y un `INSERT ... ON CONFLICT DO UPDATE` no admite dos filas con la misma
    clave de conflicto en la MISMA sentencia: Postgres corta con
    «ON CONFLICT DO UPDATE command cannot affect row a second time». Como el
    upsert va por tandas de 500, **un solo duplicado tira la tanda entera**, y
    con doce repartidos entre tres tandas no se cargó ni una licitación. Es el
    segundo fallo de esta forma en el mismo cargador: el anterior fueron las
    columnas generadas, y también abortaba la sentencia completa en vez de la
    fila mala.

    Se conserva la última aparición porque es lo que habría quedado si las
    filas se hubieran aplicado de a una: cada repetición actualiza a la
    anterior. Las filas sin `clave` se pasan tal cual — que les falte es otro
    problema, y descartarlas aquí lo escondería.
    """
    vistas: Dict[Any, int] = {}
    salida: List[Dict[str, Any]] = []
    for fila in filas:
        valor = fila.get(clave)
        if not valor:
            salida.append(fila)
            continue
        if valor in vistas:
            salida[vistas[valor]] = fila  # la última gana, en el sitio de la primera
        else:
            vistas[valor] = len(salida)
            salida.append(fila)

    repetidas = len(filas) - len(salida)
    if repetidas:
        logger.info(
            f"{entidad}: {repetidas} fila(s) con {clave} repetido en la misma respuesta"
            f" — se conserva la última de cada una ({len(salida)} a cargar)"
        )
    return salida


def _vacio_a_null(valor, columna):
    """Lo que para el upsert significa «no vino»: `''` en texto, `null` en JSONB.

    SQLAlchemy guarda un `None` de Python en una columna JSONB como el valor
    JSON `null`, no como NULL de SQL: sin esto, `COALESCE` lo tomaba por un dato
    y los ítems que había copiado el detalle se perdían igual.
    """
    if isinstance(columna.type, (String, Text)):
        return func.nullif(valor, "")
    if isinstance(columna.type, JSONB):
        # Literal y no `cast("null", JSONB)`: el cast pasa el texto por el
        # serializador JSON y compara contra el STRING `"null"`.
        return func.nullif(valor, literal_column("'null'::jsonb"))
    return valor


def _hash_del_detalle(datos: Any) -> str:
    """El hash de la licitación, sin el envoltorio de la respuesta.

    La API clásica responde `{"Cantidad", "FechaCreacion", "Version",
    "Listado": [...]}`, y `FechaCreacion` es la hora de la respuesta: cambia en
    cada consulta. Con el hash sobre la respuesta entera, toda re-consulta
    contaba como un cambio.
    """
    return calcular_hash(objeto_principal(datos))


class CargaFallida(RuntimeError):
    """No se pudo escribir NINGUNA tanda: la base caída o una fila que tumba
    todas. Antes se registraba cada tanda y se devolvía 0, y la corrida
    terminaba bien sin haber escrito nada."""


class DatabaseLoaderV2(BaseLoader):
    """Load data into PostgreSQL: `licitaciones` y `licitaciones_detalle`

    Usage:
        # With context manager (recommended)
        with DatabaseLoaderV2() as loader:
            loader.load_licitaciones(data)

        # Manual (legacy)
        loader = DatabaseLoaderV2()
        loader.connect()
        try:
            loader.load_licitaciones(data)
        finally:
            loader.disconnect()
    """

    def __init__(self, config_dict: Dict[str, Any] = None):
        super().__init__(config_dict)
        from etl.config import config as etl_config

        if config_dict:
            self.database_url = config_dict.get("DATABASE_URL", etl_config.DATABASE_URL)
        else:
            self.database_url = etl_config.DATABASE_URL

        if not self.database_url:
            raise ValueError("DATABASE_URL must be provided")

        self.engine = None
        self.session = None
        self._session_owner = False  # Track if we created the session

    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()
        return False  # Don't suppress exceptions

    def connect(self):
        """Establish connection to database"""
        if self.session is not None:
            self.logger.warning("Already connected to database")
            return

        try:
            self.engine = create_engine(
                self.database_url,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20,
                echo=False,  # Set to True for SQL debugging
            )
            SessionFactory = sessionmaker(bind=self.engine)
            self.session = SessionFactory()
            self._session_owner = True

            self._verificar_esquema()

            self.logger.info("Connected to database successfully")
        except Exception as e:
            self.logger.error(f"Failed to connect to database: {str(e)}")
            raise

    def _verificar_esquema(self) -> None:
        """Comprueba que el esquema exista, en vez de crearlo.

        Aquí había un `Base.metadata.create_all()` en cada conexión. Parecía una
        comodidad y era un agujero: el ETL corre cada hora, así que **creaba en
        producción cualquier tabla que faltara, sin migración y sin dejar rastro
        en `alembic_version`**. Un modelo nuevo sin su migración llegaba a la base
        por esta puerta, y el esquema quedaba en un estado que ninguna migración
        sabe reproducir.

        Ahora falla, y con instrucciones. Que el ETL no arranque es mucho más
        barato que un esquema que sólo existe en un servidor.
        """
        esperadas = set(Base.metadata.tables)
        with self.engine.connect() as conn:
            existentes = {
                fila[0]
                for fila in conn.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema = 'public'"
                    )
                )
            }
        faltan = sorted(esperadas - existentes)
        if faltan:
            raise RuntimeError(
                f"Faltan {len(faltan)} tablas en la base: {', '.join(faltan[:5])}"
                + (" …" if len(faltan) > 5 else "")
                + ". Aplica las migraciones con `make migrate` "
                "(antes el ETL las creaba solo, saltándose Alembic)."
            )

    def disconnect(self):
        """Close database connection"""
        try:
            if self.session and self._session_owner:
                self.session.close()
                self.session = None
            if self.engine:
                self.engine.dispose()
                self.engine = None
            self.logger.info("Disconnected from database")
        except Exception as e:
            self.logger.error(f"Error during disconnect: {str(e)}")
        finally:
            self._session_owner = False

    def load_licitaciones(self, data: List[Dict[str, Any]]) -> int:
        """
        Load licitaciones into basic table using bulk upsert (INSERT ... ON CONFLICT DO UPDATE).
        Processes in batches to avoid PostgreSQL lock limits.
        """
        if not self.session:
            self.connect()

        # Antes de batear: la API repite registros dentro de la misma respuesta y
        # el upsert no admite dos filas con la misma clave de conflicto.
        data = _sin_claves_repetidas(data, "codigo_externo", self.logger, "Licitaciones")

        BATCH_SIZE = 500
        table = Licitacion.__table__
        # Columnas a actualizar en el conflicto: se excluyen la PK, la clave de
        # negocio y las marcas de tiempo que pone el servidor.
        #
        # Las columnas GENERADAS (`col.computed`) se excluyen aparte y por
        # programa, no por nombre: Postgres rechaza escribirlas —«column
        # "busqueda" can only be updated to DEFAULT»— y ese rechazo aborta la
        # sentencia ENTERA, así que no fallaba sólo la actualización: **no se
        # cargaba ni una sola licitación**. Lleva así desde que F4 añadió
        # `busqueda` y `nombre_norm`, y ningún test lo tocaba.
        #
        # Filtrar por `col.computed` y no por una lista de nombres es lo que
        # hace que la próxima columna generada no repita el problema.
        # `fecha_publicacion` tampoco: no cambia una vez publicada, y el listado
        # de la API clásica no la trae — el transformer rellena con la hora de
        # ingesta. Sobrescribirla deshacía la fecha real que copia el detalle.
        # `resultado_consultado_en` es sólo de la re-consulta de resultados: un
        # listado no sabe nada de ella.
        skip_on_update = {
            "id",
            "codigo_externo",
            "fecha_extraccion",
            "fecha_publicacion",
            "resultado_consultado_en",
        }
        total_loaded = 0
        total_updated = 0
        total_errors = 0
        tandas = tandas_fallidas = 0

        for batch_start in range(0, len(data), BATCH_SIZE):
            batch = data[batch_start : batch_start + BATCH_SIZE]
            batch_num = batch_start // BATCH_SIZE + 1
            tandas += 1
            try:
                # Identify which codes already exist so we can count new vs updated
                codes = [r.get("codigo_externo") for r in batch]
                existing_codes = {
                    row[0]
                    for row in self.session.execute(
                        text(
                            "SELECT codigo_externo FROM licitaciones WHERE codigo_externo = ANY(:codes)"
                        ),
                        {"codes": codes},
                    )
                }

                stmt = pg_insert(table).values(batch)
                # **Lo que la fila nueva no trae, no borra lo que había.** Los
                # listados traen muy poco (el de licitaciones: código, nombre,
                # estado y cierre); con `excluded` a secas, cada pasada diaria
                # dejaba en NULL lo que había copiado el detalle —monto,
                # comprador, región, mecanismo— y los textos en "". Un vacío que
                # llega no es un dato nuevo.
                update_dict = {
                    col.name: func.coalesce(
                        _vacio_a_null(stmt.excluded[col.name], col), table.c[col.name]
                    )
                    for col in table.columns
                    if col.name not in skip_on_update and col.computed is None
                }
                update_dict["fecha_actualizacion"] = func.now()
                stmt = stmt.on_conflict_do_update(
                    index_elements=["codigo_externo"], set_=update_dict
                )

                self.session.execute(stmt)
                self.session.commit()

                new_count = sum(1 for r in batch if r.get("codigo_externo") not in existing_codes)
                updated_count = len(batch) - new_count
                total_loaded += new_count
                total_updated += updated_count

                self.logger.info(
                    f"Licitaciones batch {batch_num}: {new_count} new, {updated_count} updated"
                    f" ({batch_start + len(batch)}/{len(data)})"
                )
            except Exception as e:
                self.session.rollback()
                self.logger.error(
                    f"Error in licitaciones batch {batch_num}: {str(e)}", exc_info=True
                )
                total_errors += len(batch)
                tandas_fallidas += 1

        self.logger.info(
            f"Licitaciones loaded: {total_loaded} new, {total_updated} updated, {total_errors} errors"
        )
        # Una tanda suelta que falla se tolera (las otras sí entraron); que fallen
        # TODAS es la base caída o un error de esquema, y la corrida tiene que verlo.
        if tandas and tandas_fallidas == tandas:
            raise CargaFallida(
                f"Licitaciones: fallaron las {tandas} tanda(s); no se escribió ninguna fila"
            )

        return total_loaded + total_updated

    def load_licitacion_detalle_inicial(
        self, licitacion_id: int, codigo_externo: str, datos_api: Dict[str, Any]
    ) -> int | None:
        """
        Load initial detailed information for a licitación

        Args:
            licitacion_id: ID of the main licitacion record
            codigo_externo: Business key
            datos_api: Full API response with detailed data

        Returns:
            ID of created detalle record or None if error
        """
        if not self.session:
            self.connect()

        try:
            # Check if detalle already exists
            existing = (
                self.session.query(LicitacionDetalle).filter_by(licitacion_id=licitacion_id).first()
            )

            if existing:
                self.logger.warning(f"Detalle already exists for licitacion_id={licitacion_id}")
                return existing.id

            # Personas naturales tapadas ANTES de guardar nada: los ítems y lo
            # que se derive del payload salen ya limpios.
            datos_api = enmascarar_payload(datos_api)

            # Sólo el hash del payload, no el payload (paso 7 del pivote): basta
            # para saber si la próxima consulta trae algo nuevo.
            hash_contenido = _hash_del_detalle(datos_api)

            # Extract specific fields (handle nested structure under Listado[0])
            def _get_main_object(payload: Dict[str, Any]) -> Dict[str, Any]:
                if isinstance(payload, dict):
                    listado = payload.get("Listado")
                    if isinstance(listado, list) and listado:
                        return listado[0]
                    return payload
                return {}

            main_obj = _get_main_object(datos_api)
            estado_actual = main_obj.get("Estado") or main_obj.get("estado")
            items = main_obj.get("Items") or main_obj.get("items")
            documentos = (
                main_obj.get("Adjuntos") or main_obj.get("Documentos") or main_obj.get("documentos")
            )
            etapas = main_obj.get("Etapas") or main_obj.get("etapas")
            # Productor del resultado: si el detalle inicial ya trae adjudicación
            # (poco común, pero posible si la primera captura llega tarde), no
            # hay que esperar a `actualizar_licitacion_detalle` para saberlo.
            # Ver `etl/utils/adjudicacion.py` — forma sin verificar contra
            # producción.
            adjudicacion = extraer_datos_adjudicacion(main_obj)

            # Create detalle record
            detalle = LicitacionDetalle(
                licitacion_id=licitacion_id,
                codigo_externo=codigo_externo,
                hash_contenido=hash_contenido,
                items=items,
                documentos=documentos,
                etapas=etapas,
                estado_actual=estado_actual,
                numero_actualizaciones=1,
                fecha_adjudicacion=adjudicacion["fecha_adjudicacion"],
                monto_adjudicado=adjudicacion["monto_adjudicado"],
                proveedor_adjudicado=adjudicacion["proveedor_adjudicado"],
            )

            self.session.add(detalle)
            self.session.flush()

            detalle_id = detalle.id

            self._sync_licitacion_base_desde_detalle(licitacion_id, datos_api)

            self.session.commit()
            self.logger.info(f"Created detalle for licitacion {codigo_externo}")

            return detalle_id

        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error creating detalle for licitacion {codigo_externo}: {str(e)}")
            return None

    def actualizar_licitacion_detalle(
        self, licitacion_id: int, codigo_externo: str, datos_nuevos: Dict[str, Any]
    ) -> bool:
        """
        Update detailed information and detect changes

        Args:
            licitacion_id: ID of the main licitacion record
            codigo_externo: Business key
            datos_nuevos: New API response data

        Returns:
            True if updated, False if no changes or error
        """
        if not self.session:
            self.connect()

        try:
            # Get existing detalle
            detalle = (
                self.session.query(LicitacionDetalle).filter_by(licitacion_id=licitacion_id).first()
            )

            if not detalle:
                # If no detalle exists, create initial one
                self.logger.warning(f"No detalle found for {codigo_externo}, creating initial")
                return (
                    self.load_licitacion_detalle_inicial(
                        licitacion_id, codigo_externo, datos_nuevos
                    )
                    is not None
                )

            # `{"Cantidad": 0, "Listado": []}`: la API no la encontró esta vez.
            # No es un detalle nuevo: aplicado, borraba el estado y los ítems.
            if isinstance(datos_nuevos, dict) and datos_nuevos.get("Listado") == []:
                self.logger.warning(f"La API no devolvió {codigo_externo}; se conserva el detalle")
                return False

            # Antes del hash: los ítems que se guardan tienen que salir limpios.
            datos_nuevos = enmascarar_payload(datos_nuevos)

            hash_nuevo = _hash_del_detalle(datos_nuevos)
            if hash_nuevo == detalle.hash_contenido:
                self.logger.debug(f"No changes detected for {codigo_externo}")
                return False

            # Update detalle (handle nested structure)
            def _get_main_object(payload: Dict[str, Any]) -> Dict[str, Any]:
                if isinstance(payload, dict):
                    listado = payload.get("Listado")
                    if isinstance(listado, list) and listado:
                        return listado[0]
                    return payload
                return {}

            main_obj = _get_main_object(datos_nuevos)
            detalle.hash_contenido = hash_nuevo
            detalle.numero_actualizaciones += 1
            detalle.fecha_ultima_actualizacion = now_santiago()

            detalle.estado_actual = main_obj.get("Estado") or main_obj.get("estado")
            detalle.items = main_obj.get("Items") or main_obj.get("items")
            detalle.documentos = (
                main_obj.get("Adjuntos") or main_obj.get("Documentos") or main_obj.get("documentos")
            )
            detalle.etapas = main_obj.get("Etapas") or main_obj.get("etapas")

            # El resultado de la adjudicación se sobreescribe siempre con lo
            # último visto —también hacia `None` si la API deja de mostrarla—,
            # porque ChileCompra puede revocar y volver a adjudicar. Forma del
            # payload sin verificar contra producción: ver
            # `etl/utils/adjudicacion.py`.
            adjudicacion = extraer_datos_adjudicacion(main_obj)
            detalle.fecha_adjudicacion = adjudicacion["fecha_adjudicacion"]
            detalle.monto_adjudicado = adjudicacion["monto_adjudicado"]
            detalle.proveedor_adjudicado = adjudicacion["proveedor_adjudicado"]

            self._sync_licitacion_base_desde_detalle(licitacion_id, datos_nuevos)

            self.session.commit()
            self.logger.info(f"Updated detalle for {codigo_externo}")

            return True

        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error updating detalle for {codigo_externo}: {str(e)}")
            return False

    def _sync_licitacion_base_desde_detalle(self, licitacion_id: int, datos: Dict[str, Any]) -> int:
        """Copia a `licitaciones` lo que sólo trae el detalle. Ver `utils/licitacion_base.py`.

        Dentro de la transacción de quien llama: si falla la carga del detalle,
        tampoco queda a medias la fila base. Devuelve cuántos campos escribió.
        """
        licitacion = self.session.get(Licitacion, licitacion_id)
        if licitacion is None:
            return 0
        campos = campos_base_desde_detalle(datos)
        for campo, valor in campos.items():
            setattr(licitacion, campo, valor)
        return len(campos)

    # ── Active-state queries for detail fetching ──────────────────────────

    # Licitaciones: clean 1:1 CodigoEstado mapping, so estado is always populated.
    # Only "Publicada" can still change.
    LICITACION_ESTADOS_ACTIVOS = ["Publicada"]

    def query_licitaciones_para_detalle(self, limit: int | None = None) -> List[tuple]:
        """
        Query licitaciones that need detail fetching:
        - Active estado ("Publicada") without detalle yet

        Returns:
            List of tuples (id, codigo_externo)
        """
        if not self.session:
            self.connect()

        query = (
            self.session.query(Licitacion.id, Licitacion.codigo_externo)
            .outerjoin(LicitacionDetalle, Licitacion.id == LicitacionDetalle.licitacion_id)
            .filter(LicitacionDetalle.id.is_(None))
            .filter(Licitacion.estado.in_(self.LICITACION_ESTADOS_ACTIVOS))
            # Sólo licitaciones: una Compra Ágil «Publicada» también calzaba, y
            # su código (…-COT26) se pedía a la API CLÁSICA, que no la conoce:
            # fallaba y volvía a la cola en cada pasada, para siempre. Su
            # detalle es otro endpoint (`compras_agiles_sin_detalle`).
            .filter(Licitacion.tipo_convocatoria == TipoConvocatoria.LICITACION.value)
            # Las más nuevas primero: con `limit`, sin orden, podía quedarse
            # siempre con las mismas viejas.
            .order_by(Licitacion.id.desc())
        )

        if limit:
            query = query.limit(limit)

        return query.all()

    def compras_agiles_sin_detalle(self, limite: int) -> List[tuple]:
        """Compras Ágiles publicadas que todavía no tienen descripción, nuevas primero."""
        if not self.session:
            self.connect()
        return (
            self.session.query(Licitacion.id, Licitacion.codigo_externo)
            .filter(Licitacion.tipo_convocatoria == TipoConvocatoria.COMPRA_AGIL.value)
            .filter(Licitacion.estado.in_(self.LICITACION_ESTADOS_ACTIVOS))
            .filter(or_(Licitacion.descripcion.is_(None), Licitacion.descripcion == ""))
            .order_by(Licitacion.id.desc())
            .limit(limite)
            .all()
        )

    #: Estados en que una licitación cerrada ya no va a tener adjudicación.
    #: Se comparan por contenido y en minúsculas: la API los escribe con
    #: variantes («Desierta (o se rechazan las ofertas)»).
    ESTADOS_SIN_ADJUDICACION = ("desierta", "revocada")

    def licitaciones_cerradas_sin_resultado(
        self,
        *,
        dias: int,
        limite: int,
        reintento: timedelta,
        ahora: datetime | None = None,
    ) -> List[tuple]:
        """Licitaciones cerradas en los últimos `dias` de las que no se sabe quién ganó.

        **Por qué hace falta.** `query_licitaciones_para_detalle` sólo mira las
        publicadas: el detalle se pide una vez, con el llamado abierto, y la
        adjudicación —que llega días o semanas después de cerrar— no se vuelve a
        preguntar. La única re-consulta que había (`--only-resultados`) miraba
        las licitaciones SEGUIDAS por alguna empresa, y se fue con las cuentas.
        Ésta es impersonal: cualquier licitación cerrada.

        - Sólo `licitacion`: una Compra Ágil se pide a otra API.
        - Fuera las desiertas y revocadas, que ya no tendrán adjudicación.
        - Una ya consultada no vuelve antes de `reintento`, y las nunca
          consultadas van primero; entre ellas, las que cerraron antes, que son
          las que más probablemente ya se adjudicaron y antes salen de la
          ventana. Sin esa rotación, las que la API devuelve sin novedad se
          pedirían todos los días y el tope no llegaría a las demás.

        Devuelve `(id, codigo_externo)`, como mucho `limite`.
        """
        if not self.session:
            self.connect()
        ahora = ahora or now_santiago()
        estado = func.lower(func.coalesce(LicitacionDetalle.estado_actual, Licitacion.estado, ""))
        return (
            self.session.query(Licitacion.id, Licitacion.codigo_externo)
            .outerjoin(LicitacionDetalle, Licitacion.id == LicitacionDetalle.licitacion_id)
            .filter(Licitacion.tipo_convocatoria == TipoConvocatoria.LICITACION.value)
            .filter(Licitacion.fecha_cierre.isnot(None))
            .filter(Licitacion.fecha_cierre < ahora)
            .filter(Licitacion.fecha_cierre >= ahora - timedelta(days=dias))
            .filter(LicitacionDetalle.fecha_adjudicacion.is_(None))
            .filter(~or_(*(estado.contains(e) for e in self.ESTADOS_SIN_ADJUDICACION)))
            .filter(
                or_(
                    Licitacion.resultado_consultado_en.is_(None),
                    Licitacion.resultado_consultado_en < ahora - reintento,
                )
            )
            .order_by(
                Licitacion.resultado_consultado_en.asc().nulls_first(),
                Licitacion.fecha_cierre.asc(),
            )
            .limit(limite)
            .all()
        )

    def marcar_resultado_consultado(self, licitacion_id: int, cuando: datetime) -> None:
        """Anota que se preguntó por el resultado, haya cambiado algo o no.

        SQL directo y no el ORM: `fecha_actualizacion` lleva `onupdate` y diría
        que la licitación cambió cuando sólo se preguntó por ella.
        """
        self.session.execute(
            text("UPDATE licitaciones SET resultado_consultado_en = :c WHERE id = :id"),
            {"c": cuando, "id": licitacion_id},
        )
        self.session.commit()

    def ultimas_escrituras(self) -> Dict[str, datetime]:
        """Por `tipo_convocatoria`, la última vez que se escribió una fila
        (`fecha_actualizacion`, o `fecha_extraccion` si nunca se actualizó)."""
        if not self.session:
            self.connect()
        cuando = func.max(
            func.coalesce(Licitacion.fecha_actualizacion, Licitacion.fecha_extraccion)
        )
        filas = (
            self.session.query(Licitacion.tipo_convocatoria, cuando)
            .group_by(Licitacion.tipo_convocatoria)
            .all()
        )
        return {tipo: valor for tipo, valor in filas if valor is not None}

    def completar_desde_detalle(self, licitacion_id: int, campos: Dict[str, Any]) -> None:
        """Escribe en una licitación lo que trajo su detalle.

        La descripción llega aquí: las palabras clave que sólo aparecen en ella
        no podían calzar cuando la Compra Ágil entró desde el listado.
        """
        licitacion = self.session.get(Licitacion, licitacion_id)
        if licitacion is None or not campos:
            return
        for campo, valor in campos.items():
            setattr(licitacion, campo, valor)
        self.session.commit()

    def query_licitaciones_para_actualizar(
        self, dias_sin_actualizar: int = 1, limit: int | None = None
    ) -> List[tuple]:
        """
        Query licitaciones with detalle that need updating.
        Only returns records in active states (Publicada).

        Returns:
            List of tuples (id, codigo_externo, detalle_id)
        """
        if not self.session:
            self.connect()

        fecha_limite = now_santiago() - timedelta(days=dias_sin_actualizar)

        query = (
            self.session.query(
                Licitacion.id, Licitacion.codigo_externo, LicitacionDetalle.id.label("detalle_id")
            )
            .join(LicitacionDetalle, Licitacion.id == LicitacionDetalle.licitacion_id)
            .filter(
                or_(
                    LicitacionDetalle.fecha_ultima_actualizacion < fecha_limite,
                    LicitacionDetalle.fecha_ultima_actualizacion.is_(None),
                )
            )
            .filter(
                or_(
                    Licitacion.estado.in_(self.LICITACION_ESTADOS_ACTIVOS),
                    LicitacionDetalle.estado_actual.in_(self.LICITACION_ESTADOS_ACTIVOS),
                )
            )
        )

        if limit:
            query = query.limit(limit)

        return query.all()

    def load(self, data: List[Dict[str, Any]]) -> int:
        """
        Generic load method required by BaseLoader

        This method detects the type of data and routes to the appropriate loader.
        For more control, use load_licitaciones() directly.

        Args:
            data: List of data records to load

        Returns:
            Number of records successfully loaded
        """
        if not data:
            return 0

        # Try to detect data type from first record
        first_record = data[0]

        # Check for licitaciones keys
        if "CodigoExterno" in first_record or "codigo_externo" in first_record:
            self.logger.info(f"Detected licitaciones data, loading {len(data)} records")
            return self.load_licitaciones(data)

        else:
            self.logger.warning(
                f"Could not detect data type from record keys: {first_record.keys()}"
            )
            raise ValueError(
                "Could not determine data type. Expected licitaciones data. "
                "Use load_licitaciones() directly for more control."
            )
