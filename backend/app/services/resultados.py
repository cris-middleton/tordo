"""Cerrar el ciclo: qué pasó con lo que seguiste.

**El hueco que tapa este módulo.** El producto avisaba de la oportunidad y
acompañaba la preparación, y de cómo terminó no decía nada nunca. Quien seguía
una licitación en TORDO no se enteraba de quién ganó ni a cuánto — aunque el dato
está en la misma API que ya consumimos.

Y aquí está la diferencia con contarlo a secas: con la banda de precio al lado,
el resultado deja de ser un dato y pasa a ser una lección.

    Se adjudicó en $3,1M · tu banda decía $2,8M–$3,6M · ganó Constructora X

Eso es lo que hace volver el lunes, y es lo único de todo el producto que **no
se puede comprar con el mismo dato público**: hay que haber acompañado la
decisión para poder compararla con el resultado.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertStatus, AlertType
from app.models.empresa import Empresa
from app.models.licitacion import Licitacion
from app.models.licitacion_detalle import LicitacionDetalle
from app.models.postulacion import Postulacion
from app.services import notificaciones

logger = logging.getLogger(__name__)

#: Estados de seguimiento desde los que una postulación puede resolverse. Una
#: que el usuario ya descartó no se toca: cambiarle el estado por detrás
#: reescribiría una decisión suya.
ESTADOS_ABIERTOS = ("en_seguimiento", "en_preparacion", "enviada")


@dataclass(frozen=True)
class Resultado:
    """Lo que se sabe del final de una licitación seguida."""

    postulacion_id: object
    empresa_id: object
    licitacion_id: int
    codigo_externo: str
    nombre: str
    proveedor: str | None
    monto: float | None
    gano_la_empresa: bool


def _normalizar_rut(valor: str | None) -> str:
    """Sin puntos, sin guion, sin espacios y en mayúsculas.

    Los RUT llegan de ChileCompra con cualquier combinación de puntos y guion, y
    de la empresa como el usuario lo escribió al registrarse. Comparar las
    cadenas crudas da falsos negativos: la empresa habría ganado y el producto
    diría que no.
    """
    if not valor:
        return ""
    return re.sub(r"[^0-9K]", "", valor.upper())


def _a_numero(valor) -> float | None:
    """`monto_adjudicado` es texto en la base y llega con formatos variados."""
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    limpio = re.sub(r"[^0-9,.-]", "", str(valor)).replace(".", "").replace(",", ".")
    try:
        return float(limpio)
    except ValueError:
        return None


def detectar_resultados(db: Session) -> list[Resultado]:
    """Las postulaciones abiertas cuya licitación ya tiene adjudicación conocida."""
    filas = (
        db.query(Postulacion, Licitacion, LicitacionDetalle, Empresa)
        .join(Licitacion, Postulacion.licitacion_id == Licitacion.id)
        .join(LicitacionDetalle, LicitacionDetalle.licitacion_id == Licitacion.id)
        .join(Empresa, Postulacion.empresa_id == Empresa.id)
        .filter(Postulacion.estado.in_(ESTADOS_ABIERTOS))
        .filter(LicitacionDetalle.fecha_adjudicacion.isnot(None))
        .all()
    )

    resultados: list[Resultado] = []
    for postulacion, licitacion, detalle, empresa in filas:
        proveedor = (detalle.proveedor_adjudicado or "").strip() or None
        rut_ganador = _normalizar_rut(proveedor)
        rut_empresa = _normalizar_rut(empresa.rut_empresa)
        resultados.append(
            Resultado(
                postulacion_id=postulacion.id,
                empresa_id=empresa.id,
                licitacion_id=licitacion.id,
                codigo_externo=licitacion.codigo_externo,
                nombre=licitacion.nombre or licitacion.codigo_externo,
                proveedor=proveedor,
                monto=_a_numero(detalle.monto_adjudicado),
                # El nombre del proveedor a veces trae el RUT dentro. Se compara
                # sobre la forma normalizada y sólo cuando el RUT de la empresa
                # tiene largo suficiente: un RUT vacío coincidiría con todo.
                gano_la_empresa=bool(rut_empresa)
                and len(rut_empresa) >= 7
                and rut_empresa in rut_ganador,
            )
        )
    return resultados


def _plata(monto: float | None) -> str:
    if monto is None:
        return ""
    return f"${monto:,.0f}".replace(",", ".")


def _mensaje(resultado: Resultado) -> tuple[str, str]:
    if resultado.gano_la_empresa:
        titulo = f"Ganaste: {resultado.nombre[:80]}"
        cuerpo = (
            "Se adjudicó a tu empresa"
            + (f" en {_plata(resultado.monto)}" if resultado.monto else "")
            + f". Licitación {resultado.codigo_externo}."
        )
        return titulo, cuerpo

    titulo = f"Se resolvió: {resultado.nombre[:80]}"
    partes = [f"La licitación {resultado.codigo_externo} ya tiene resultado."]
    if resultado.proveedor:
        partes.append(f"Adjudicada a {resultado.proveedor}")
        if resultado.monto:
            partes[-1] += f" en {_plata(resultado.monto)}"
        partes[-1] += "."
    return titulo, " ".join(partes)


def emitir_y_cerrar(db: Session, resultados: list[Resultado]) -> dict:
    """Avisa del resultado y deja la postulación en su estado final.

    **Se avisa a cada miembro de la empresa**, por el mismo motivo que en el
    resto: `alerts.user_id` es de usuario y la postulación es de la empresa.

    **La clave de idempotencia lleva la licitación y el usuario, no la fecha.**
    Un resultado ocurre una vez: si llevara el día, cada corrida diaria volvería
    a avisar de lo mismo mientras la postulación siguiera abierta.
    """
    if not resultados:
        return {"resueltas": 0, "alertas": 0}

    nuevas: list[Alert] = []
    resueltas = 0

    for r in resultados:
        titulo, cuerpo = _mensaje(r)
        miembros = [
            fila[0]
            for fila in db.execute(
                text("SELECT user_id FROM empresas_usuario WHERE empresa_id = :e"),
                {"e": str(r.empresa_id)},
            ).all()
        ]

        for user_id in miembros:
            clave = f"resultado_{r.licitacion_id}_{user_id}"
            if db.query(Alert).filter(Alert.idempotency_key == clave).first():
                continue
            alerta = Alert(
                user_id=user_id,
                alert_type=AlertType.RESULTADO_LICITACION,
                status=AlertStatus.PENDING,
                entity_type="licitacion",
                entity_id=r.licitacion_id,
                title=titulo,
                message=cuerpo,
                idempotency_key=clave,
                empresa_id=r.empresa_id,
                alert_metadata={
                    "codigo_externo": r.codigo_externo,
                    "proveedor_adjudicado": r.proveedor,
                    "monto_adjudicado": r.monto,
                    "gano": r.gano_la_empresa,
                },
                notification_channels=["in_app"],
            )
            db.add(alerta)
            nuevas.append(alerta)

        # El estado final lo decide el RUT, no el usuario: es un hecho público,
        # no una opinión. Lo que NO se toca es una postulación descartada.
        postulacion = db.query(Postulacion).filter(Postulacion.id == r.postulacion_id).one_or_none()
        if postulacion is not None and postulacion.estado in ESTADOS_ABIERTOS:
            postulacion.estado = "adjudicada" if r.gano_la_empresa else "no_adjudicada"
            resueltas += 1

    db.commit()
    enviado = notificaciones.despachar_pendientes(db, [a.id for a in nuevas])
    return {"resueltas": resueltas, "alertas": len(nuevas), **enviado}


def revisar_resultados(db: Session) -> dict:
    """El ciclo completo: detectar, avisar y cerrar."""
    resultados = detectar_resultados(db)
    logger.info("[Resultados] %d postulaciones con adjudicación conocida", len(resultados))
    resumen = emitir_y_cerrar(db, resultados)
    logger.info("[Resultados] %s", resumen)
    return {"detectados": len(resultados), **resumen}
