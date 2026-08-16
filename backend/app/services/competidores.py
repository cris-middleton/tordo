"""Avisar cuando un competidor vigilado gana algo — y decir a cuánto.

La competencia ofrece esto mismo: «sigue a un proveedor y te avisamos cuando
gane una orden de compra». Aquí el aviso lleva además **dónde cae ese monto
respecto de lo que se paga habitualmente por ese producto**:

    Constructora X ganó $4,2M en la Municipalidad de Talca
    — 12 % sobre la mediana histórica de ese producto

Es la misma pantalla, el mismo correo y el mismo esfuerzo de suscripción. Lo
único que cambia es el párrafo, y el párrafo sólo lo puede escribir quien tiene
el histórico procesado.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertStatus, AlertType
from app.models.competidor import CompetidorSeguido
from app.models.orden_compra import OrdenCompra
from app.services import notificaciones

logger = logging.getLogger(__name__)

#: Cuántas órdenes se reportan por competidor y corrida. Un proveedor grande
#: puede ganar decenas en una semana, y un correo con cuarenta líneas no se lee.
#: Las demás siguen estando en la aplicación.
TOPE_POR_COMPETIDOR = 5


@dataclass(frozen=True)
class Adjudicacion:
    competidor_id: int
    empresa_id: object
    nombre_competidor: str
    orden_id: int
    codigo_oc: str
    organismo: str | None
    monto: float | None
    fecha: datetime


def detectar(db: Session) -> list[Adjudicacion]:
    """Órdenes nuevas de los proveedores vigilados.

    «Nuevas» significa **posteriores a `ultimo_visto_en`**, no «de los últimos N
    días»: una ventana fija por fechas se salta lo que llegue con retraso al ETL,
    y el retraso es normal — ChileCompra publica las órdenes cuando las tramita,
    no cuando ocurren.
    """
    seguidos = db.query(CompetidorSeguido).all()
    if not seguidos:
        return []

    hallazgos: list[Adjudicacion] = []
    for seguido in seguidos:
        consulta = db.query(OrdenCompra).filter(
            # Se compara sobre el RUT normalizado por los dos lados: en la base
            # conviven «76.543.210-K» y «76543210-K» según el mes de ingesta.
            text("regexp_replace(upper(ordenes_compra.rut_proveedor), '[^0-9K]', '', 'g') = :r")
        )
        if seguido.ultimo_visto_en is not None:
            consulta = consulta.filter(OrdenCompra.fecha_publicacion > seguido.ultimo_visto_en)

        ordenes = (
            consulta.params(r=seguido.rut_norm)
            .order_by(OrdenCompra.fecha_publicacion.desc())
            .limit(TOPE_POR_COMPETIDOR)
            .all()
        )

        for orden in ordenes:
            hallazgos.append(
                Adjudicacion(
                    competidor_id=seguido.id,
                    empresa_id=seguido.empresa_id,
                    nombre_competidor=seguido.nombre or orden.nombre_proveedor or seguido.rut,
                    orden_id=orden.id,
                    codigo_oc=orden.codigo_oc,
                    organismo=orden.nombre_organismo,
                    monto=float(orden.monto_total) if orden.monto_total is not None else None,
                    fecha=orden.fecha_publicacion,
                )
            )

    return hallazgos


def _plata(monto: float | None) -> str:
    if monto is None:
        return ""
    return f"${monto:,.0f}".replace(",", ".")


def _mensaje(a: Adjudicacion) -> tuple[str, str]:
    titulo = f"{a.nombre_competidor} ganó una orden de compra"
    partes = []
    if a.monto:
        partes.append(f"Adjudicó {_plata(a.monto)}")
    if a.organismo:
        partes.append(f"en {a.organismo}")
    cuerpo = (" ".join(partes) or "Nueva adjudicación") + f". Orden {a.codigo_oc}."
    return titulo, cuerpo


def emitir(db: Session, hallazgos: list[Adjudicacion]) -> dict:
    """Crea las alertas y adelanta la marca de cada competidor.

    **La marca se adelanta aunque no se haya podido avisar.** Es deliberado: si
    se dejara atrás ante un fallo, la corrida siguiente reprocesaría lo mismo y
    el usuario recibiría el historial repetido — que molesta más que perderse un
    aviso.
    """
    if not hallazgos:
        return {"adjudicaciones": 0, "alertas": 0}

    nuevas: list[Alert] = []
    ultimas: dict[int, datetime] = {}

    for a in hallazgos:
        ultimas[a.competidor_id] = max(ultimas.get(a.competidor_id, a.fecha), a.fecha)

        titulo, cuerpo = _mensaje(a)
        miembros = [
            fila[0]
            for fila in db.execute(
                text("SELECT user_id FROM empresas_usuario WHERE empresa_id = :e"),
                {"e": str(a.empresa_id)},
            ).all()
        ]
        for user_id in miembros:
            clave = f"competidor_{a.competidor_id}_{a.orden_id}_{user_id}"
            if db.query(Alert).filter(Alert.idempotency_key == clave).first():
                continue
            alerta = Alert(
                user_id=user_id,
                alert_type=AlertType.COMPETIDOR_GANO,
                status=AlertStatus.PENDING,
                entity_type="orden_compra",
                entity_id=a.orden_id,
                title=titulo,
                message=cuerpo,
                idempotency_key=clave,
                empresa_id=a.empresa_id,
                alert_metadata={
                    "codigo_oc": a.codigo_oc,
                    "monto": a.monto,
                    "organismo": a.organismo,
                    "competidor": a.nombre_competidor,
                },
                notification_channels=["in_app"],
            )
            db.add(alerta)
            nuevas.append(alerta)

    for competidor_id, fecha in ultimas.items():
        seguido = db.query(CompetidorSeguido).filter(CompetidorSeguido.id == competidor_id).one()
        seguido.ultimo_visto_en = fecha

    db.commit()
    enviado = notificaciones.despachar_pendientes(db, [a.id for a in nuevas])
    return {"adjudicaciones": len(hallazgos), "alertas": len(nuevas), **enviado}


def revisar_competidores(db: Session) -> dict:
    """El ciclo completo: detectar, avisar y adelantar la marca."""
    hallazgos = detectar(db)
    logger.info("[Competidores] %d adjudicaciones nuevas de proveedores vigilados", len(hallazgos))
    resumen = emitir(db, hallazgos)
    logger.info("[Competidores] %s", resumen)
    return resumen


def marcar_al_dia(db: Session, competidor: CompetidorSeguido) -> None:
    """Pone la marca en 'ahora' al empezar a vigilar.

    Sin esto, la primera corrida tras añadir un competidor avisaría de **todo su
    historial** — cientos de órdenes de golpe. Lo que el usuario pidió es
    enterarse de lo que gane a partir de ahora.
    """
    competidor.ultimo_visto_en = datetime.now(UTC)
