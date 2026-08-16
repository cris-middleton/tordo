"""Detección de cambios de precio.

Los datos de precio ya estaban —`analytics.product_price_bands_l1` tiene la
mediana por producto— y lo que faltaba era el disparador. Faltaba por una razón
concreta: **esa tabla se reemplaza entera** en cada materialización, así que
después de recalcularla no queda nada con qué comparar.

Este servicio cierra ese hueco en tres pasos:

1. Lee las bandas recién materializadas.
2. Las compara con `precio_referencia`, que guarda lo que había antes.
3. Emite una alerta por cada producto **suscrito** cuya variación supera el
   umbral, y deja la referencia al día.

Corre **después** de la reconstrucción de analytics, no en paralelo: comparar
contra una tabla a medio reemplazar daría variaciones inventadas.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.alert import Alert, AlertStatus, AlertType
from app.models.precio import (
    MUESTRA_MINIMA,
    TABLA_BANDAS,
    PrecioReferencia,
    SuscripcionPrecio,
)
from app.services import notificaciones

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CambioDePrecio:
    """Un producto cuyo precio se movió lo suficiente como para avisar."""

    codigo_producto: str
    unidad_medida: str
    p50_anterior: float
    p50_actual: float
    muestra: int

    @property
    def variacion_pct(self) -> float:
        return (self.p50_actual - self.p50_anterior) / self.p50_anterior * 100

    @property
    def subio(self) -> bool:
        return self.p50_actual > self.p50_anterior


def _precios_actuales(db) -> list[tuple[str, str, float, int]]:
    """`(codigo, unidad, p50, n)` de la materialización más reciente.

    Se agrega por producto y unidad porque la tabla trae una fila por organismo:
    lo que se vigila es el precio del producto en el mercado, no el que le hizo
    un comprador concreto.

    La mediana de medianas no es la mediana global, y es deliberado: promediar
    los precios unitarios crudos dejaría que un organismo con muchas órdenes
    dominara el número. El BI muestra este mismo agregado.
    """
    filas = db.execute(
        text(f"""
            SELECT "codigoProductoONU" AS codigo,
                   COALESCE("UnidadMedida", '') AS unidad,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY p50) AS p50,
                   SUM(n)::int AS muestra
            FROM {TABLA_BANDAS}
            WHERE p50 IS NOT NULL AND "codigoProductoONU" IS NOT NULL
            GROUP BY 1, 2
        """)
    ).all()
    return [(f.codigo, f.unidad, float(f.p50), int(f.muestra or 0)) for f in filas]


def _referencias(db) -> dict[tuple[str, str], tuple[float, int]]:
    return {
        (r.codigo_producto, r.unidad_medida): (float(r.p50), r.muestra)
        for r in db.query(PrecioReferencia).all()
    }


def detectar_cambios(db) -> list[CambioDePrecio]:
    """Los productos cuyo precio mediano se movió desde la corrida anterior.

    **No filtra por umbral**: cada suscripción tiene el suyo, y aplicarlo aquí
    impediría que una empresa pidiera avisos más finos que otra.

    Un producto sin referencia previa no genera cambio. Es correcto: la primera
    vez que se ve un precio no ha cambiado de nada, y avisar del catálogo entero
    la primera corrida sería spam garantizado.
    """
    referencias = _referencias(db)
    cambios: list[CambioDePrecio] = []

    for codigo, unidad, p50, muestra in _precios_actuales(db):
        anterior = referencias.get((codigo, unidad))
        if anterior is None:
            continue
        p50_anterior, _ = anterior
        if p50_anterior <= 0:
            # Una referencia en cero haría una variación infinita.
            continue
        if muestra < MUESTRA_MINIMA:
            # Con pocas órdenes la mediana se mueve sola: el "cambio" sería el
            # ruido del muestreo, no el mercado.
            continue
        if p50 == p50_anterior:
            continue
        cambios.append(
            CambioDePrecio(
                codigo_producto=codigo,
                unidad_medida=unidad,
                p50_anterior=p50_anterior,
                p50_actual=p50,
                muestra=muestra,
            )
        )
    return cambios


def actualizar_referencias(db) -> int:
    """Deja `precio_referencia` igual a la materialización actual.

    Se llama **después** de emitir las alertas: al revés, la comparación sería
    contra sí misma y no habría cambio que detectar nunca.
    """
    filas = _precios_actuales(db)
    if not filas:
        return 0

    ahora = datetime.now(UTC)
    valores = [
        {
            "codigo_producto": codigo,
            "unidad_medida": unidad,
            "p50": p50,
            "muestra": muestra,
            "actualizado_en": ahora,
        }
        for codigo, unidad, p50, muestra in filas
    ]

    # Upsert: los productos nuevos se insertan y los conocidos se actualizan en
    # el sitio. Borrar y reinsertar dejaría la tabla vacía durante la corrida,
    # y con ella la posibilidad de detectar cambios si algo falla a mitad.
    tabla = PrecioReferencia.__table__
    for inicio in range(0, len(valores), 1000):
        lote = valores[inicio : inicio + 1000]
        stmt = pg_insert(tabla).values(lote)
        db.execute(
            stmt.on_conflict_do_update(
                index_elements=["codigo_producto", "unidad_medida"],
                set_={
                    "p50": stmt.excluded.p50,
                    "muestra": stmt.excluded.muestra,
                    "actualizado_en": stmt.excluded.actualizado_en,
                },
            )
        )
    return len(valores)


def _mensaje(cambio: CambioDePrecio, nombre_producto: str | None) -> tuple[str, str]:
    producto = nombre_producto or cambio.codigo_producto
    direccion = "subió" if cambio.subio else "bajó"
    pct = abs(cambio.variacion_pct)
    titulo = f"{producto}: el precio {direccion} {pct:.0f}%"
    cuerpo = (
        f"El precio mediano de «{producto}» pasó de "
        f"${cambio.p50_anterior:,.0f} a ${cambio.p50_actual:,.0f} por "
        f"{cambio.unidad_medida or 'unidad'}, sobre {cambio.muestra} órdenes de compra."
    ).replace(",", ".")
    return titulo, cuerpo


def emitir_alertas(db, cambios: list[CambioDePrecio], nuevas: list[Alert] | None = None) -> int:
    """Crea una alerta por cada suscripción que el cambio supera.

    La clave de idempotencia lleva el día: si el job corre dos veces en la misma
    jornada, la segunda no duplica avisos. Al día siguiente sí puede volver a
    avisar, que es lo correcto si el precio se movió otra vez.

    `nuevas` recoge las alertas recién creadas para que quien orquesta pueda
    despacharlas **después del commit** — antes de él no tienen id.
    """
    if nuevas is None:
        nuevas = []
    if not cambios:
        return 0

    por_producto = {(c.codigo_producto, c.unidad_medida): c for c in cambios}
    claves = list(por_producto)

    suscripciones = (
        db.query(SuscripcionPrecio)
        .filter(
            SuscripcionPrecio.codigo_producto.in_({c[0] for c in claves}),
        )
        .all()
    )

    hoy = datetime.now(UTC).strftime("%Y%m%d")
    creadas = 0
    for suscripcion in suscripciones:
        cambio = por_producto.get((suscripcion.codigo_producto, suscripcion.unidad_medida))
        if cambio is None:
            continue
        if abs(cambio.variacion_pct) < suscripcion.umbral_pct:
            continue

        titulo, cuerpo = _mensaje(cambio, suscripcion.nombre_producto)
        clave = f"precio_{suscripcion.id}_{cambio.codigo_producto}_{hoy}"

        # Una alerta por MIEMBRO de la empresa: `alerts.user_id` es de usuario,
        # y la suscripción es de la empresa. Sin esto, sólo lo vería quien la
        # creó — y la suscripción existe justamente para que la vea el equipo.
        for (usuario_id,) in db.execute(
            text("SELECT user_id FROM empresas_usuario WHERE empresa_id = :e"),
            {"e": str(suscripcion.empresa_id)},
        ).all():
            existente = (
                db.query(Alert)
                .filter(Alert.idempotency_key == f"{clave}_{usuario_id}")
                .one_or_none()
            )
            if existente:
                continue
            alerta = Alert(
                user_id=usuario_id,
                alert_type=AlertType.CAMBIO_PRECIO,
                # PENDING y no SENT: la ponía como enviada sin haber enviado
                # nada, lo que dejaba el registro mintiendo y hacía imposible
                # distinguir la que salió de la que se quedó dentro.
                status=AlertStatus.PENDING,
                entity_type="producto",
                entity_id=0,
                title=titulo,
                message=cuerpo,
                idempotency_key=f"{clave}_{usuario_id}",
                notification_channels=["in_app"],
            )
            db.add(alerta)
            nuevas.append(alerta)
            creadas += 1
    return creadas


def revisar_precios(db) -> dict:
    """El ciclo completo: detectar, avisar y dejar la referencia al día."""
    cambios = detectar_cambios(db)
    logger.info("[Precios] %d productos cambiaron de precio", len(cambios))

    nuevas: list[Alert] = []
    alertas = emitir_alertas(db, cambios, nuevas)
    referencias = actualizar_referencias(db)
    db.commit()

    # Va en tanda: que un producto suba un 18 % es importante y no urge esta
    # hora. Un correo por producto vigilado un lunes por la mañana sería el
    # camino más corto a que el usuario filtre el remitente.
    enviado = notificaciones.despachar_pendientes(db, [a.id for a in nuevas])

    logger.info(
        "[Precios] %d alertas creadas, %d referencias al día, %d notificadas",
        alertas,
        referencias,
        enviado.get("en_tanda", 0),
    )
    return {
        "cambios": len(cambios),
        "alertas": alertas,
        "referencias": referencias,
        **enviado,
    }
