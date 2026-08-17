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
from datetime import timedelta

from sqlalchemy import and_, or_, text
from sqlalchemy.orm import Session

from app.core.tiempo import ahora_chile
from app.models.alert import Alert, AlertStatus, AlertType
from app.models.empresa import Empresa
from app.models.licitacion import Licitacion
from app.models.licitacion_detalle import LicitacionDetalle
from app.models.postulacion import Postulacion
from app.services import notificaciones
from app.utils.rut import validar_rut

logger = logging.getLogger(__name__)

#: Estados de seguimiento desde los que una postulación puede resolverse. Una
#: que el usuario ya descartó no se toca: cambiarle el estado por detrás
#: reescribiría una decisión suya.
ESTADOS_ABIERTOS = ("en_seguimiento", "en_preparacion", "enviada")

#: Estados ya resueltos por una corrida anterior de este mismo módulo.
ESTADOS_RESUELTOS = ("adjudicada", "no_adjudicada")

#: ChileCompra permite revocar y volver a adjudicar tras un reclamo o una
#: impugnación. No hay un plazo único documentado para todos los tipos de
#: licitación, así que se usa un margen conservador: dentro de los 30 días
#: siguientes a la fecha de adjudicación conocida, una postulación YA
#: resuelta se vuelve a examinar; pasado ese margen, se da por firme y no se
#: vuelve a tocar. Mismo número en
#: `etl/loaders/database_loader_v2.py::DatabaseLoaderV2.
#: VENTANA_RECONSIDERACION_DIAS`: uno decide si el ETL vuelve a pedir el dato
#: a la API, éste si el consumidor vuelve a examinar lo que ya hay en la base.
VENTANA_RECONSIDERACION_DIAS = 30


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


#: Un RUT tiene 7 u 8 dígitos de cuerpo más un dígito verificador (0-9 o K).
#: Los `(?<!\d)`/`(?!\d)` son a propósito: sin ellos, un teléfono o cualquier
#: corrida de dígitos más larga deja "cortar" un trozo que por casualidad
#: tiene la forma correcta.
_PATRON_RUT = re.compile(r"(?<!\d)(\d{7,8}-?[0-9Kk])(?!\d)")


def _ruts_del_proveedor(proveedor: str | None) -> set[str]:
    """Los RUT con forma válida presentes en el texto del proveedor ganador.

    `proveedor_adjudicado` es texto libre: el ETL lo arma a partir del
    nombre y el RUT de cada línea adjudicada, y una licitación puede tener
    más de un proveedor ganador (una línea puede ir a un oferente distinto de
    otra). Antes se comparaba con `in` sobre el campo COMPLETO despojado de
    todo lo que no fuera dígito o "K" —razón social incluida—: dos RUT
    distintos podían "coincidir" con que uno apareciera dentro del otro, sin
    ni siquiera compartir prefijo, con un año, un número de calle o el RUT de
    otra empresa citado en el texto. Aquí se extraen tokens con forma de RUT
    y se exige además que pasen el dígito verificador (módulo 11, `rut.py`):
    eso descarta un número de 7-8 dígitos que tiene la forma pero no es un
    RUT real, y la comparación final es de **igualdad exacta**, no de
    contención.
    """
    if not proveedor:
        return set()
    # Los puntos de miles son la única puntuación que rompería el patrón
    # (parten el cuerpo en grupos de a 3); el guion antes del verificador ya
    # lo contempla el patrón.
    candidatos = _PATRON_RUT.findall(proveedor.replace(".", ""))
    return {_normalizar_rut(c) for c in candidatos if validar_rut(c)}


def detectar_resultados(db: Session) -> list[Resultado]:
    """Postulaciones con adjudicación conocida: las abiertas, y las ya
    resueltas cuya adjudicación sigue dentro de la ventana de reconsideración
    (ver `VENTANA_RECONSIDERACION_DIAS`) — por si ChileCompra la corrigió.
    """
    limite_ventana = ahora_chile() - timedelta(days=VENTANA_RECONSIDERACION_DIAS)
    filas = (
        db.query(Postulacion, Licitacion, LicitacionDetalle, Empresa)
        .join(Licitacion, Postulacion.licitacion_id == Licitacion.id)
        .join(LicitacionDetalle, LicitacionDetalle.licitacion_id == Licitacion.id)
        .join(Empresa, Postulacion.empresa_id == Empresa.id)
        .filter(LicitacionDetalle.fecha_adjudicacion.isnot(None))
        .filter(
            or_(
                Postulacion.estado.in_(ESTADOS_ABIERTOS),
                and_(
                    Postulacion.estado.in_(ESTADOS_RESUELTOS),
                    LicitacionDetalle.fecha_adjudicacion >= limite_ventana,
                ),
            )
        )
        .all()
    )

    resultados: list[Resultado] = []
    for postulacion, licitacion, detalle, empresa in filas:
        proveedor = (detalle.proveedor_adjudicado or "").strip() or None
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
                gano_la_empresa=bool(rut_empresa) and rut_empresa in _ruts_del_proveedor(proveedor),
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


def _mensaje_correccion(resultado: Resultado) -> tuple[str, str]:
    """ChileCompra revocó y volvió a adjudicar dentro de la ventana de
    reconsideración: el título deja claro que esto CAMBIA lo que ya se avisó,
    no lo repite."""
    if resultado.gano_la_empresa:
        titulo = f"Corrección: ahora ganaste — {resultado.nombre[:60]}"
        cuerpo = (
            "ChileCompra corrigió la adjudicación y ahora es a tu empresa"
            + (f", en {_plata(resultado.monto)}" if resultado.monto else "")
            + f". Licitación {resultado.codigo_externo}."
        )
        return titulo, cuerpo

    titulo = f"Corrección en el resultado: {resultado.nombre[:60]}"
    partes = [f"ChileCompra corrigió la adjudicación de {resultado.codigo_externo}."]
    if resultado.proveedor:
        partes.append(f"Ahora está adjudicada a {resultado.proveedor}")
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

    **Tres casos por resultado, no dos.** `detectar_resultados` ahora también
    trae postulaciones YA resueltas (dentro de la ventana de reconsideración),
    así que hay que distinguir:
    1. Primera resolución (`postulacion.estado` sigue abierto): el camino de
       siempre, con la clave de idempotencia de siempre.
    2. Corrección (ya resuelta, y el resultado que se acaba de calcular es
       DISTINTO del que quedó guardado): se avisa de nuevo, con una clave
       DISTINTA — si llevara la misma, el `ON CONFLICT DO NOTHING` que evita
       avisos duplicados se comería también a ésta.
    3. Ya resuelta y sin cambios: no hay nada que hacer, y no se toca ni la
       base ni las alertas — es el caso normal en cuanto pasan unos días.
    """
    if not resultados:
        return {"resueltas": 0, "corregidas": 0, "alertas": 0}

    nuevas: list[Alert] = []
    resueltas = 0
    corregidas = 0

    for r in resultados:
        postulacion = db.query(Postulacion).filter(Postulacion.id == r.postulacion_id).one_or_none()
        if postulacion is None:
            continue

        nuevo_estado = "adjudicada" if r.gano_la_empresa else "no_adjudicada"

        if postulacion.estado in ESTADOS_ABIERTOS:
            titulo, cuerpo = _mensaje(r)
            prefijo_clave = f"resultado_{r.licitacion_id}"
            postulacion.estado = nuevo_estado
            resueltas += 1
        elif postulacion.estado in ESTADOS_RESUELTOS and postulacion.estado != nuevo_estado:
            titulo, cuerpo = _mensaje_correccion(r)
            prefijo_clave = f"resultado_correccion_{r.licitacion_id}_{nuevo_estado}"
            postulacion.estado = nuevo_estado
            corregidas += 1
        else:
            # Ya resuelta, dentro de la ventana, y el resultado no cambió.
            continue

        miembros = [
            fila[0]
            for fila in db.execute(
                text("SELECT user_id FROM empresas_usuario WHERE empresa_id = :e"),
                {"e": str(r.empresa_id)},
            ).all()
        ]

        for user_id in miembros:
            clave = f"{prefijo_clave}_{user_id}"
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

    db.commit()
    enviado = notificaciones.despachar_pendientes(db, [a.id for a in nuevas])
    return {"resueltas": resueltas, "corregidas": corregidas, "alertas": len(nuevas), **enviado}


def revisar_resultados(db: Session) -> dict:
    """El ciclo completo: detectar, avisar y cerrar."""
    resultados = detectar_resultados(db)
    logger.info("[Resultados] %d postulaciones con adjudicación conocida", len(resultados))
    resumen = emitir_y_cerrar(db, resultados)
    logger.info("[Resultados] %s", resumen)
    return {"detectados": len(resultados), **resumen}
