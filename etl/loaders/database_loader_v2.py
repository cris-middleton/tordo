"""
Database loader for ETL pipeline - Version 2 with detalle and historial tables
Loads transformed data into PostgreSQL database
"""

from __future__ import annotations

import os
import sys
from datetime import timedelta
from typing import Any, Dict, List

from sqlalchemy import create_engine, func, or_, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import sessionmaker

from etl.loaders.base import BaseLoader

# Import models using shared module
from etl.shared_imports import (
    Base,
    Licitacion,
    LicitacionDetalle,
    LicitacionHistorial,
    OrdenCompra,
    OrdenCompraDetalle,
    OrdenCompraHistorial,
)
from etl.utils import (
    calcular_hash,
    detectar_cambios_licitacion,
    detectar_cambios_orden_compra,
    extraer_datos_adjudicacion,
    now_santiago,
)


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


class DatabaseLoaderV2(BaseLoader):
    """Load data into PostgreSQL database using detalle and historial tables

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
        skip_on_update = {"id", "codigo_externo", "fecha_extraccion"}
        total_loaded = 0
        total_updated = 0
        total_errors = 0
        all_new_ids = []

        for batch_start in range(0, len(data), BATCH_SIZE):
            batch = data[batch_start : batch_start + BATCH_SIZE]
            batch_num = batch_start // BATCH_SIZE + 1
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
                update_dict = {
                    col.name: stmt.excluded[col.name]
                    for col in table.columns
                    if col.name not in skip_on_update and col.computed is None
                }
                update_dict["fecha_actualizacion"] = func.now()
                stmt = stmt.on_conflict_do_update(
                    index_elements=["codigo_externo"], set_=update_dict
                ).returning(table.c.id)

                result = self.session.execute(stmt)
                returned_ids = [row[0] for row in result]
                self.session.commit()

                new_count = sum(1 for r in batch if r.get("codigo_externo") not in existing_codes)
                updated_count = len(batch) - new_count
                total_loaded += new_count
                total_updated += updated_count
                # Collect IDs of new records for alert triggering
                all_new_ids.extend(returned_ids[:new_count])

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

        self.logger.info(
            f"Licitaciones loaded: {total_loaded} new, {total_updated} updated, {total_errors} errors"
        )
        if all_new_ids:
            self._trigger_licitacion_alerts(all_new_ids)

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

            # Calculate hash
            hash_contenido = calcular_hash(datos_api)

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
            participantes = main_obj.get("Participantes") or main_obj.get("participantes")
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
                datos_completos=datos_api,
                items=items,
                documentos=documentos,
                participantes=participantes,
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

            # Calculate new hash
            hash_nuevo = calcular_hash(datos_nuevos)

            # Check if there are changes
            if hash_nuevo == detalle.hash_contenido:
                self.logger.debug(f"No changes detected for {codigo_externo}")
                return False

            self.logger.info(f"Changes detected for {codigo_externo}, analyzing...")

            # Detect specific changes
            datos_anteriores = detalle.datos_completos or {}
            cambios = detectar_cambios_licitacion(datos_anteriores, datos_nuevos)

            # Register each change in historial
            for cambio in cambios:
                historial = LicitacionHistorial(
                    licitacion_id=licitacion_id,
                    licitacion_detalle_id=detalle.id,
                    codigo_externo=codigo_externo,
                    tipo_cambio=cambio["tipo_cambio"],
                    campo_modificado=cambio["campo"],
                    descripcion=cambio["descripcion"],
                    valor_anterior=cambio["valor_anterior"],
                    valor_nuevo=cambio["valor_nuevo"],
                )
                self.session.add(historial)

            # Update detalle (handle nested structure)
            def _get_main_object(payload: Dict[str, Any]) -> Dict[str, Any]:
                if isinstance(payload, dict):
                    listado = payload.get("Listado")
                    if isinstance(listado, list) and listado:
                        return listado[0]
                    return payload
                return {}

            main_obj = _get_main_object(datos_nuevos)
            detalle.datos_completos = datos_nuevos
            detalle.hash_contenido = hash_nuevo
            detalle.numero_actualizaciones += 1
            detalle.fecha_ultima_actualizacion = now_santiago()

            detalle.estado_actual = main_obj.get("Estado") or main_obj.get("estado")
            detalle.items = main_obj.get("Items") or main_obj.get("items")
            detalle.documentos = (
                main_obj.get("Adjuntos") or main_obj.get("Documentos") or main_obj.get("documentos")
            )
            detalle.participantes = main_obj.get("Participantes") or main_obj.get("participantes")
            detalle.etapas = main_obj.get("Etapas") or main_obj.get("etapas")

            # Productor del resultado (Crítico #1): nada más en el pipeline
            # escribía estas tres columnas, así que `detectar_resultados()`
            # (backend) nunca encontraba nada y `query_licitaciones_seguidas_
            # sin_resultado` volvía a pedir esta misma licitación cada día,
            # para siempre. Se sobreescribe siempre con lo último visto —
            # también hacia `None` si la API deja de mostrar adjudicación—,
            # porque ChileCompra puede revocar y volver a adjudicar (ver
            # ventana de reconsideración en `query_licitaciones_seguidas_
            # sin_resultado`). Forma del payload sin verificar contra
            # producción: ver `etl/utils/adjudicacion.py`.
            adjudicacion = extraer_datos_adjudicacion(main_obj)
            detalle.fecha_adjudicacion = adjudicacion["fecha_adjudicacion"]
            detalle.monto_adjudicado = adjudicacion["monto_adjudicado"]
            detalle.proveedor_adjudicado = adjudicacion["proveedor_adjudicado"]

            self.session.commit()
            self.logger.info(f"Updated detalle for {codigo_externo} with {len(cambios)} changes")

            return True

        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error updating detalle for {codigo_externo}: {str(e)}")
            return False

    def load_ordenes_compra(self, data: List[Dict[str, Any]]) -> int:
        """
        Load órdenes de compra into basic table using bulk upsert (INSERT ... ON CONFLICT DO UPDATE).
        Processes in batches to avoid PostgreSQL lock limits.
        """
        if not self.session:
            self.connect()

        data = _sin_claves_repetidas(data, "codigo_oc", self.logger, "Órdenes de compra")

        BATCH_SIZE = 500
        table = OrdenCompra.__table__
        # Columns to update on conflict (exclude PK, unique key, and server-set timestamps)
        skip_on_update = {"id", "codigo_oc", "fecha_extraccion"}
        total_loaded = 0
        total_updated = 0
        total_errors = 0
        all_new_ids = []

        for batch_start in range(0, len(data), BATCH_SIZE):
            batch = data[batch_start : batch_start + BATCH_SIZE]
            batch_num = batch_start // BATCH_SIZE + 1
            try:
                # Identify which codes already exist so we can count new vs updated
                codes = [r.get("codigo_oc") for r in batch]
                existing_codes = {
                    row[0]
                    for row in self.session.execute(
                        text("SELECT codigo_oc FROM ordenes_compra WHERE codigo_oc = ANY(:codes)"),
                        {"codes": codes},
                    )
                }

                stmt = pg_insert(table).values(batch)
                update_dict = {
                    col.name: stmt.excluded[col.name]
                    for col in table.columns
                    if col.name not in skip_on_update and col.computed is None
                }
                update_dict["fecha_actualizacion"] = func.now()
                stmt = stmt.on_conflict_do_update(
                    index_elements=["codigo_oc"], set_=update_dict
                ).returning(table.c.id)

                result = self.session.execute(stmt)
                returned_ids = [row[0] for row in result]
                self.session.commit()

                new_count = sum(1 for r in batch if r.get("codigo_oc") not in existing_codes)
                updated_count = len(batch) - new_count
                total_loaded += new_count
                total_updated += updated_count
                # Collect IDs of new records for alert triggering
                all_new_ids.extend(returned_ids[:new_count])

                self.logger.info(
                    f"Órdenes batch {batch_num}: {new_count} new, {updated_count} updated"
                    f" ({batch_start + len(batch)}/{len(data)})"
                )
            except Exception as e:
                self.session.rollback()
                self.logger.error(f"Error in órdenes batch {batch_num}: {str(e)}", exc_info=True)
                total_errors += len(batch)

        self.logger.info(
            f"Órdenes de compra loaded: {total_loaded} new, {total_updated} updated, {total_errors} errors"
        )
        if all_new_ids:
            self._trigger_orden_compra_alerts(all_new_ids)

        return total_loaded + total_updated

    def load_orden_compra_detalle_inicial(
        self, orden_compra_id: int, codigo_oc: str, datos_api: Dict[str, Any]
    ) -> int | None:
        """
        Load initial detailed information for an orden de compra

        Args:
            orden_compra_id: ID of the main orden_compra record
            codigo_oc: Business key
            datos_api: Full API response with detailed data

        Returns:
            ID of created detalle record or None if error
        """
        if not self.session:
            self.connect()

        try:
            # Check if detalle already exists
            existing = (
                self.session.query(OrdenCompraDetalle)
                .filter_by(orden_compra_id=orden_compra_id)
                .first()
            )

            if existing:
                self.logger.warning(f"Detalle already exists for orden_compra_id={orden_compra_id}")
                return existing.id

            # Calculate hash
            hash_contenido = calcular_hash(datos_api)

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
            items = None
            if isinstance(main_obj.get("Items"), dict):
                items = main_obj["Items"].get("Listado")
            else:
                items = main_obj.get("Items") or main_obj.get("items")
            documentos = (
                main_obj.get("Adjuntos") or main_obj.get("Documentos") or main_obj.get("documentos")
            )
            comprador = main_obj.get("Comprador") or main_obj.get("comprador")
            proveedor = main_obj.get("Proveedor") or main_obj.get("proveedor")
            # Optional: estado proveedor y fechas/total a nivel detalle
            estado_proveedor_actual = main_obj.get("EstadoProveedor") or main_obj.get(
                "estadoProveedor"
            )
            fechas_block = main_obj.get("Fechas") or {}

            def _parse_dt(v):
                from datetime import datetime

                if not v:
                    return None
                if isinstance(v, datetime):
                    return v
                for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
                    try:
                        return datetime.strptime(str(v), fmt)
                    except Exception:
                        continue
                return None

            fecha_acept_real = _parse_dt(fechas_block.get("FechaAceptacion"))
            fecha_entrega_real = _parse_dt(fechas_block.get("FechaEntrega"))
            fecha_recepcion_real = _parse_dt(fechas_block.get("FechaRecepcion"))
            monto_final = main_obj.get("Total")

            # Create detalle record
            detalle = OrdenCompraDetalle(
                orden_compra_id=orden_compra_id,
                codigo_oc=codigo_oc,
                hash_contenido=hash_contenido,
                datos_completos=datos_api,  # Guarda TODA la respuesta de la API completa
                items=items,
                documentos=documentos,
                comprador_detalle=comprador,
                proveedor_detalle=proveedor,
                estado_actual=estado_actual,
                estado_proveedor_actual=estado_proveedor_actual,
                fecha_aceptacion_real=fecha_acept_real,
                fecha_entrega_real=fecha_entrega_real,
                fecha_recepcion_real=fecha_recepcion_real,
                monto_final=monto_final,
                numero_actualizaciones=1,
            )

            self.session.add(detalle)
            self.session.flush()

            detalle_id = detalle.id

            # Also sync selected fields to base table for convenience
            orden_base = self.session.query(OrdenCompra).get(orden_compra_id)
            if orden_base is not None:
                self._sync_orden_compra_base_from_detalle(orden_base, datos_api)

            self.session.commit()
            self.logger.info(f"Created detalle for orden {codigo_oc}")

            return detalle_id

        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error creating detalle for orden {codigo_oc}: {str(e)}")
            return None

    def _sync_orden_compra_base_from_detalle(
        self, orden_compra: OrdenCompra, datos: Dict[str, Any]
    ) -> None:
        """
        Update base orden_compra fields using information present in the detalle payload.
        This makes frequently queried fields available without navigating the detalle JSON.
        """
        try:
            # The detailed payload structure is typically: {"Listado": [ { ... main fields ... } ]}
            listado = None
            if isinstance(datos, dict):
                if isinstance(datos.get("Listado"), list) and datos["Listado"]:
                    listado = datos["Listado"][0]
                else:
                    # Sometimes APIs may already provide the main object at root
                    listado = datos
            else:
                return

            if not isinstance(listado, dict):
                return

            # Status
            orden_compra.estado = (
                listado.get("Estado") or listado.get("estado") or orden_compra.estado
            )
            orden_compra.estado_proveedor = (
                listado.get("EstadoProveedor")
                or listado.get("estadoProveedor")
                or orden_compra.estado_proveedor
            )

            # Monetary fields
            if listado.get("TipoMoneda"):
                orden_compra.moneda = listado.get("TipoMoneda") or orden_compra.moneda
            # Totals
            total_neto = listado.get("TotalNeto")
            impuestos = listado.get("Impuestos")
            total = listado.get("Total")
            # Assign when present (keep previous if None)
            if total is not None:
                orden_compra.monto_total = total
            if total_neto is not None:
                orden_compra.monto_neto = total_neto
            if impuestos is not None:
                orden_compra.monto_iva = impuestos

            # Dates nested under Fechas
            fechas = listado.get("Fechas") or {}
            if isinstance(fechas, dict):
                fecha_aceptacion = fechas.get("FechaAceptacion")
                fecha_entrega = fechas.get("FechaEntrega")

                # Parse ISO-like strings safely
                def _parse_dt(value: Any):
                    from datetime import datetime

                    if not value:
                        return None
                    if isinstance(value, datetime):
                        return value
                    # Common formats from API
                    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
                        try:
                            return datetime.strptime(str(value), fmt)
                        except Exception:
                            continue
                    return None

                dt_acept = _parse_dt(fecha_aceptacion)
                dt_entrega = _parse_dt(fecha_entrega)
                if dt_acept:
                    orden_compra.fecha_aceptacion = dt_acept
                if dt_entrega:
                    orden_compra.fecha_entrega = dt_entrega

            # Buyer (Comprador)
            comprador = listado.get("Comprador") or {}
            if isinstance(comprador, dict):
                orden_compra.codigo_organismo = (
                    comprador.get("CodigoOrganismo") or orden_compra.codigo_organismo
                )
                orden_compra.nombre_organismo = (
                    comprador.get("NombreOrganismo") or orden_compra.nombre_organismo
                )
                # The API uses RutUnidad; keep as rut_organismo in base for convenience
                orden_compra.rut_organismo = (
                    comprador.get("RutUnidad") or orden_compra.rut_organismo
                )
                orden_compra.region = comprador.get("RegionUnidad") or orden_compra.region
                orden_compra.comuna = comprador.get("ComunaUnidad") or orden_compra.comuna

            # Supplier (Proveedor)
            proveedor = listado.get("Proveedor") or {}
            if isinstance(proveedor, dict):
                orden_compra.codigo_proveedor = (
                    proveedor.get("Codigo") or orden_compra.codigo_proveedor
                )
                orden_compra.nombre_proveedor = (
                    proveedor.get("Nombre") or orden_compra.nombre_proveedor
                )
                # Use RutSucursal when available
                orden_compra.rut_proveedor = (
                    proveedor.get("RutSucursal")
                    or proveedor.get("RutProveedor")
                    or orden_compra.rut_proveedor
                )

            # Items: store compact list in base for quick access (optional)
            items = listado.get("Items") or {}
            if isinstance(items, dict) and isinstance(items.get("Listado"), list):
                orden_compra.items = items.get("Listado")

            # URLs
            if listado.get("UrlOC"):
                orden_compra.url_oc = listado.get("UrlOC")
            if listado.get("UrlActa"):
                orden_compra.url_acta = listado.get("UrlActa")

        except Exception as e:
            # Best-effort sync; don't fail the whole transaction
            self.logger.debug(f"Base sync from detalle failed (non-fatal): {e}")

    def actualizar_orden_compra_detalle(
        self, orden_compra_id: int, codigo_oc: str, datos_nuevos: Dict[str, Any]
    ) -> bool:
        """
        Update detailed information and detect changes

        Args:
            orden_compra_id: ID of the main orden_compra record
            codigo_oc: Business key
            datos_nuevos: New API response data

        Returns:
            True if updated, False if no changes or error
        """
        if not self.session:
            self.connect()

        try:
            # Get existing detalle
            detalle = (
                self.session.query(OrdenCompraDetalle)
                .filter_by(orden_compra_id=orden_compra_id)
                .first()
            )

            if not detalle:
                # If no detalle exists, create initial one
                self.logger.warning(f"No detalle found for {codigo_oc}, creating initial")
                return (
                    self.load_orden_compra_detalle_inicial(orden_compra_id, codigo_oc, datos_nuevos)
                    is not None
                )

            # Verificar si el registro existente tiene datos incompletos ANTES de calcular hash
            datos_anteriores = detalle.datos_completos or {}
            datos_incompletos = False

            # Detectar si datos_anteriores tienen estructura mínima (solo Codigo/CodigoEstado)
            if isinstance(datos_anteriores, dict):
                keys_anteriores = set(datos_anteriores.keys())
                # Si solo tiene Codigo y CodigoEstado, es estructura incompleta
                if (
                    keys_anteriores in [{"Codigo", "CodigoEstado"}, {"Codigo"}, {"CodigoEstado"}]
                    or len(keys_anteriores) <= 2
                ):
                    datos_incompletos = True
                    self.logger.info(
                        f"Detectados datos incompletos para {codigo_oc}, actualizando con datos completos de la API"
                    )

            # Calculate new hash
            hash_nuevo = calcular_hash(datos_nuevos)

            # Check if there are changes
            # IMPORTANT: Si el registro existente tiene datos incompletos, el hash será diferente
            # y se actualizará correctamente con todos los datos completos de la API
            if hash_nuevo == detalle.hash_contenido:
                self.logger.debug(f"No changes detected for {codigo_oc}")
                return False

            # Si llegamos aquí, hay cambios (o datos incompletos que necesitan completarse)
            if not datos_incompletos:
                self.logger.info(f"Changes detected for {codigo_oc}, analyzing...")

            # Detect specific changes (solo si no son datos incompletos, para evitar ruido en historial)
            if not datos_incompletos:
                cambios = detectar_cambios_orden_compra(datos_anteriores, datos_nuevos)
            else:
                # Para datos incompletos, registrar un cambio general en historial
                cambios = [
                    {
                        "tipo_cambio": "datos_completados",
                        "campo": "datos_completos",
                        "descripcion": "Datos incompletos actualizados con información completa de la API",
                        "valor_anterior": f"Estructura incompleta con {len(datos_anteriores)} campos",
                        "valor_nuevo": "Datos completos de la API",
                    }
                ]

            # Register each change in historial
            for cambio in cambios:
                historial = OrdenCompraHistorial(
                    orden_compra_id=orden_compra_id,
                    orden_compra_detalle_id=detalle.id,
                    codigo_oc=codigo_oc,
                    tipo_cambio=cambio["tipo_cambio"],
                    campo_modificado=cambio["campo"],
                    descripcion=cambio["descripcion"],
                    valor_anterior=cambio["valor_anterior"],
                    valor_nuevo=cambio["valor_nuevo"],
                )
                self.session.add(historial)

            # Update detalle (handle nested structure)
            def _get_main_object(payload: Dict[str, Any]) -> Dict[str, Any]:
                if isinstance(payload, dict):
                    listado = payload.get("Listado")
                    if isinstance(listado, list) and listado:
                        return listado[0]
                    return payload
                return {}

            main_obj = _get_main_object(datos_nuevos)
            detalle.datos_completos = datos_nuevos
            detalle.hash_contenido = hash_nuevo
            detalle.numero_actualizaciones += 1
            detalle.fecha_ultima_actualizacion = now_santiago()

            detalle.estado_actual = main_obj.get("Estado") or main_obj.get("estado")
            detalle.estado_proveedor_actual = main_obj.get("EstadoProveedor") or main_obj.get(
                "estadoProveedor"
            )
            if isinstance(main_obj.get("Items"), dict):
                detalle.items = main_obj["Items"].get("Listado")
            else:
                detalle.items = main_obj.get("Items") or main_obj.get("items")
            detalle.documentos = (
                main_obj.get("Adjuntos") or main_obj.get("Documentos") or main_obj.get("documentos")
            )
            detalle.comprador_detalle = main_obj.get("Comprador") or main_obj.get("comprador")
            detalle.proveedor_detalle = main_obj.get("Proveedor") or main_obj.get("proveedor")
            fechas_block = main_obj.get("Fechas") or {}

            def _parse_dt(v):
                from datetime import datetime

                if not v:
                    return None
                if isinstance(v, datetime):
                    return v
                for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
                    try:
                        return datetime.strptime(str(v), fmt)
                    except Exception:
                        continue
                return None

            detalle.fecha_aceptacion_real = _parse_dt(fechas_block.get("FechaAceptacion"))
            detalle.fecha_entrega_real = _parse_dt(fechas_block.get("FechaEntrega"))
            detalle.fecha_recepcion_real = _parse_dt(fechas_block.get("FechaRecepcion"))
            if main_obj.get("Total") is not None:
                detalle.monto_final = main_obj.get("Total")

            # Also sync selected fields to base table for convenience
            orden_base = self.session.query(OrdenCompra).get(orden_compra_id)
            if orden_base is not None:
                self._sync_orden_compra_base_from_detalle(orden_base, datos_nuevos)

            self.session.commit()
            self.logger.info(f"Updated detalle for {codigo_oc} with {len(cambios)} changes")

            return True

        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error updating detalle for {codigo_oc}: {str(e)}")
            return False

    # ── Active-state queries for detail fetching ──────────────────────────

    # Licitaciones: clean 1:1 CodigoEstado mapping, so estado is always populated.
    # Only "Publicada" can still change.
    LICITACION_ESTADOS_ACTIVOS = ["Publicada"]

    # Órdenes de compra: text estado only comes from the detail API.
    # These are the non-terminal states worth tracking.
    OC_ESTADOS_ACTIVOS = ["Enviada a proveedor", "En proceso"]
    # CodigoEstado values that *might* contain active OCs (for first-time detail fetch)
    OC_CODIGO_ESTADO_POTENCIALMENTE_ACTIVOS = ["4", "5"]

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
        )

        if limit:
            query = query.limit(limit)

        return query.all()

    def query_ordenes_para_detalle(self, limit: int | None = None) -> List[tuple]:
        """
        Query órdenes de compra that need detail fetching:
        1. Known active: text estado IN ('Enviada a proveedor', 'En proceso') without detalle
        2. Potentially active: estado IS NULL, CodigoEstado IN (4, 5), extracted recently
           (these need one detail fetch to determine their real text estado)

        Returns:
            List of tuples (id, codigo_oc)
        """
        if not self.session:
            self.connect()

        cutoff = now_santiago() - timedelta(days=3)

        # Known active by text estado
        known_active = (
            self.session.query(OrdenCompra.id, OrdenCompra.codigo_oc)
            .outerjoin(OrdenCompraDetalle, OrdenCompra.id == OrdenCompraDetalle.orden_compra_id)
            .filter(OrdenCompraDetalle.id.is_(None))
            .filter(OrdenCompra.estado.in_(self.OC_ESTADOS_ACTIVOS))
        )

        # Potentially active: new records with null estado and CodigoEstado 4 or 5
        # informacion_adicional is JSON (not JSONB), so use ->> operator via text()
        potentially_active = (
            self.session.query(OrdenCompra.id, OrdenCompra.codigo_oc)
            .outerjoin(OrdenCompraDetalle, OrdenCompra.id == OrdenCompraDetalle.orden_compra_id)
            .filter(OrdenCompraDetalle.id.is_(None))
            .filter(OrdenCompra.estado.is_(None))
            .filter(OrdenCompra.fecha_extraccion >= cutoff)
            .filter(
                text("informacion_adicional->>'CodigoEstado' IN :codes").bindparams(
                    codes=tuple(self.OC_CODIGO_ESTADO_POTENCIALMENTE_ACTIVOS)
                )
            )
        )

        query = known_active.union(potentially_active)

        if limit:
            query = query.limit(limit)

        return query.all()

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

    #: Tras adjudicar, ChileCompra sigue permitiendo revocar y volver a
    #: adjudicar (reclamos, impugnaciones). No hay un plazo único documentado
    #: para todos los tipos de licitación, así que se usa un margen
    #: conservador: 30 días corridos desde la fecha de adjudicación conocida.
    #: Pasado ese margen, la licitación deja de re-consultarse — igual que
    #: antes de este cambio, sólo que más tarde — porque si no la re-consulta
    #: vuelve a ser ilimitada, que es exactamente el defecto que esto corrige.
    #: Mismo número en `backend/app/services/resultados.py::VENTANA_
    #: RECONSIDERACION_DIAS`: uno decide si se vuelve a pedir el dato a la
    #: API, el otro si se vuelve a examinar con lo que ya hay en la base.
    VENTANA_RECONSIDERACION_DIAS = 30

    def query_licitaciones_seguidas_sin_resultado(self, limit: int | None = None) -> List[tuple]:
        """Licitaciones que alguien SIGUE, que ya cerraron y de las que todavía no
        sabemos cómo terminaron — o cuya adjudicación es reciente y podría corregirse.

        **Por qué hace falta una consulta aparte.** `query_licitaciones_para_actualizar`
        filtra por estados activos, así que en cuanto una licitación cierra deja de
        revisitarse: el detalle se captura una vez, con el llamado abierto, y nunca
        se vuelve a mirar. Resultado: quien siguió una licitación en TORDO no se
        entera nunca de quién ganó ni a cuánto — el dato existe en la API y no lo
        pedimos.

        El alcance es deliberadamente estrecho —sólo lo que alguien sigue— porque
        revisitar el catálogo entero serían cientos de miles de llamadas a una API
        con cuota para responder una pregunta que nadie hizo.

        **Por qué no basta con `fecha_adjudicacion IS NULL`.** Eso deja a una
        licitación adjudicada ayer fuera de la consulta para siempre, aunque
        ChileCompra la revoque y readjudique la semana próxima — la corrección
        nunca llegaría a `licitaciones_detalle`. Por eso una adjudicación
        DENTRO de `VENTANA_RECONSIDERACION_DIAS` también se vuelve a pedir;
        pasado ese margen, sale de la consulta y no vuelve a entrar aunque se
        revoque más tarde — un caso raro, y es la contrapartida deliberada de
        mantener esto acotado.

        Returns:
            List of tuples (id, codigo_externo, detalle_id)
        """
        if not self.session:
            self.connect()

        limite_ventana = now_santiago() - timedelta(days=self.VENTANA_RECONSIDERACION_DIAS)

        query = (
            self.session.query(
                Licitacion.id, Licitacion.codigo_externo, LicitacionDetalle.id.label("detalle_id")
            )
            .join(LicitacionDetalle, Licitacion.id == LicitacionDetalle.licitacion_id)
            # Subconsulta en SQL literal: el ETL no importa el modelo
            # `Postulacion` —vive en el backend— y traerlo por `shared_imports`
            # sólo para un `IN` acoplaría el pipeline a una tabla de producto.
            .filter(text("licitaciones.id IN (SELECT licitacion_id FROM postulaciones)"))
            .filter(Licitacion.fecha_cierre.isnot(None))
            .filter(Licitacion.fecha_cierre < now_santiago())
            .filter(
                or_(
                    LicitacionDetalle.fecha_adjudicacion.is_(None),
                    LicitacionDetalle.fecha_adjudicacion >= limite_ventana,
                )
            )
            # Las más recientes primero: si hay tope, interesa lo que el usuario
            # todavía tiene fresco, no una licitación de hace ocho meses.
            .order_by(Licitacion.fecha_cierre.desc())
        )

        if limit:
            query = query.limit(limit)

        return query.all()

    def query_ordenes_para_actualizar(
        self, dias_sin_actualizar: int = 1, limit: int | None = None
    ) -> List[tuple]:
        """
        Query órdenes de compra with detalle that need updating.
        Only returns records in active states (Enviada a proveedor, En proceso).

        Returns:
            List of tuples (id, codigo_oc, detalle_id)
        """
        if not self.session:
            self.connect()

        OC_ESTADOS_FINALES = ["Aceptada", "Recepción Conforme", "Cancelada", "No aceptada"]
        fecha_limite = now_santiago() - timedelta(days=dias_sin_actualizar)

        query = (
            self.session.query(
                OrdenCompra.id, OrdenCompra.codigo_oc, OrdenCompraDetalle.id.label("detalle_id")
            )
            .join(OrdenCompraDetalle, OrdenCompra.id == OrdenCompraDetalle.orden_compra_id)
            .filter(
                or_(
                    OrdenCompraDetalle.fecha_ultima_actualizacion < fecha_limite,
                    OrdenCompraDetalle.fecha_ultima_actualizacion.is_(None),
                )
            )
            .filter(OrdenCompraDetalle.estado_actual.notin_(OC_ESTADOS_FINALES))
        )

        if limit:
            query = query.limit(limit)

        return query.all()

    def _trigger_licitacion_alerts(self, licitacion_ids: List[int]):
        """Trigger alert processing for new licitaciones"""
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../backend"))
            from app.utils.alert_trigger import trigger_licitacion_alert

            for licitacion_id in licitacion_ids:
                try:
                    trigger_licitacion_alert(licitacion_id, use_celery=True)
                except Exception as e:
                    self.logger.warning(
                        f"Failed to trigger alert for licitacion {licitacion_id}: {e}"
                    )
        except ImportError:
            self.logger.debug("Alert trigger not available, skipping alert processing")
        except Exception as e:
            self.logger.warning(f"Failed to trigger alerts: {e}")

    def _trigger_orden_compra_alerts(self, orden_compra_ids: List[int]):
        """Trigger alert processing for new órdenes de compra"""
        try:
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../backend"))
            from app.utils.alert_trigger import trigger_orden_compra_alert

            for orden_compra_id in orden_compra_ids:
                try:
                    trigger_orden_compra_alert(orden_compra_id, use_celery=True)
                except Exception as e:
                    self.logger.warning(
                        f"Failed to trigger alert for orden_compra {orden_compra_id}: {e}"
                    )
        except ImportError:
            self.logger.debug("Alert trigger not available, skipping alert processing")
        except Exception as e:
            self.logger.warning(f"Failed to trigger alerts: {e}")

    def load(self, data: List[Dict[str, Any]]) -> int:
        """
        Generic load method required by BaseLoader

        This method detects the type of data and routes to the appropriate loader.
        For more control, use load_licitaciones() or load_ordenes_compra() directly.

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

        # Check for órdenes de compra keys
        elif "CodigoOC" in first_record or "codigo_oc" in first_record:
            self.logger.info(f"Detected órdenes de compra data, loading {len(data)} records")
            return self.load_ordenes_compra(data)

        else:
            self.logger.warning(
                f"Could not detect data type from record keys: {first_record.keys()}"
            )
            raise ValueError(
                "Could not determine data type. Expected licitaciones or órdenes de compra data. "
                "Use load_licitaciones() or load_ordenes_compra() directly for more control."
            )
