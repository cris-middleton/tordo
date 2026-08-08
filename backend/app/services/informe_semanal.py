"""El informe semanal: qué pasó esta semana en la cuenta de una empresa.

Sustituye al «radar semanal», que mandaba tres movimientos de mercado y poco
más. La diferencia no es de volumen sino de propósito: el radar contaba lo que
pasaba **en el mercado**, y lo que hace falta un lunes por la mañana es lo que
pasa **en tu cuenta** — qué encaja, qué cierra, qué se movió de precio y qué te
va a dejar fuera por forma.

Tres decisiones que el código no explica solo:

- **El encaje se lee de `match_empresa_licitacion`, no se recalcula.** El radar
  cargaba el modelo TF-IDF y puntuaba 200 licitaciones por empresa en cada
  corrida. Además de costar, podía dar un número distinto al que muestra el
  panel — dos fuentes de verdad para «encaje» es una de más.
- **Una sección vacía se dice, no se esconde.** «Ningún documento vence en los
  próximos 30 días» es información; omitir la sección deja al lector sin saber
  si es que no hay o es que no se miró.
- **Se manda aunque haya poco, pero no si no hay nada.** Un correo semanal que
  no dice nada enseña a ignorar el correo semanal.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertType
from app.models.empresa import DocumentoEmpresa, Empresa, EmpresaUsuario
from app.models.licitacion import Licitacion
from app.models.match import MatchEmpresaLicitacion
from app.models.postulacion import Postulacion
from app.services import radar_service

logger = logging.getLogger(__name__)

#: Cuántas filas caben en una sección antes de que el informe deje de leerse.
MAX_FILAS = 5

#: Un documento que vence dentro de este plazo ya es accionable: renovar un
#: certificado en Chile toma días, no horas.
DIAS_AVISO_VENCIMIENTO = 30

#: Ventana de «esta semana». El informe sale los lunes.
DIAS_SEMANA = 7


@dataclass(frozen=True)
class Fila:
    titulo: str
    detalle: str
    url: str | None = None


@dataclass(frozen=True)
class Seccion:
    titulo: str
    filas: list[Fila] = field(default_factory=list)
    #: Qué decir cuando no hay filas. Nunca se omite la sección: el silencio no
    #: distingue entre «no hay nada» y «no se miró».
    vacio: str = "Sin novedades."


@dataclass(frozen=True)
class Informe:
    empresa_id: UUID
    empresa_nombre: str
    semana: date
    secciones: list[Seccion]

    @property
    def tiene_contenido(self) -> bool:
        return any(s.filas for s in self.secciones)

    @property
    def total_filas(self) -> int:
        return sum(len(s.filas) for s in self.secciones)


def _lunes(hoy: date | None = None) -> date:
    hoy = hoy or datetime.now(UTC).date()
    return hoy - timedelta(days=hoy.weekday())


def _monto(valor) -> str:
    if valor is None:
        return "monto no publicado"
    return f"${float(valor):,.0f}".replace(",", ".")


# ── Secciones ────────────────────────────────────────────────────────────────


def _encaje(db: Session, empresa_id: UUID) -> Seccion:
    """Las licitaciones abiertas que mejor encajan, según el job nocturno.

    Se filtran las cerradas: el job puntúa lo que estaba abierto a las 06:00, y
    una licitación puede cerrar durante el día. Mostrarla sería invitar a
    postular a algo que ya no admite ofertas.
    """
    ahora = datetime.now(UTC)
    filas = (
        db.query(Licitacion, MatchEmpresaLicitacion)
        .join(MatchEmpresaLicitacion, MatchEmpresaLicitacion.licitacion_id == Licitacion.id)
        .filter(
            MatchEmpresaLicitacion.empresa_id == empresa_id,
            Licitacion.activo.is_(True),
            Licitacion.fecha_cierre.is_not(None),
            Licitacion.fecha_cierre > ahora,
        )
        .order_by(MatchEmpresaLicitacion.score.desc())
        .limit(MAX_FILAS)
        .all()
    )
    return Seccion(
        titulo="Lo que mejor encaja contigo",
        filas=[
            Fila(
                titulo=f"{lic.nombre[:120]} — encaje {m.score}%",
                detalle=(f"{_monto(lic.monto_estimado)} · cierra el {lic.fecha_cierre:%d-%m-%Y}"),
                url=f"/dashboard/tenders/{lic.codigo_externo}" if lic.codigo_externo else None,
            )
            for lic, m in filas
        ],
        vacio=(
            "Todavía no hay encaje calculado. Se recalcula cada noche a partir "
            "de tu perfil y de las licitaciones abiertas."
        ),
    )


def _cierres(db: Session, empresa_id: UUID) -> Seccion:
    """Lo que la empresa sigue y cierra dentro de la semana.

    Es la sección que evita la llamada del viernes: «se nos pasó el plazo».
    """
    ahora = datetime.now(UTC)
    limite = ahora + timedelta(days=DIAS_SEMANA)
    filas = (
        db.query(Licitacion)
        .join(Postulacion, Postulacion.licitacion_id == Licitacion.id)
        .filter(
            Postulacion.empresa_id == empresa_id,
            Licitacion.fecha_cierre.is_not(None),
            Licitacion.fecha_cierre > ahora,
            Licitacion.fecha_cierre <= limite,
        )
        .order_by(Licitacion.fecha_cierre.asc())
        .limit(MAX_FILAS)
        .all()
    )
    return Seccion(
        titulo="Cierra esta semana",
        filas=[
            Fila(
                titulo=lic.nombre[:120],
                detalle=f"cierra el {lic.fecha_cierre:%d-%m-%Y a las %H:%M}",
                url=f"/dashboard/tenders/{lic.codigo_externo}" if lic.codigo_externo else None,
            )
            for lic in filas
        ],
        vacio="Ninguna de las licitaciones que sigues cierra en los próximos 7 días.",
    )


def _precios(db: Session, empresa_id: UUID) -> Seccion:
    """Los cambios de precio de la semana en los productos vigilados.

    Se leen de las alertas ya emitidas y no se recalculan: el job de precios
    corre antes y es quien decide qué supera el umbral de cada empresa. Volver a
    calcularlo aquí podría contradecir lo que el usuario ya vio en la campana.

    Se agrupan por título porque hay una alerta **por miembro** de la empresa, y
    el informe es de la empresa.
    """
    desde = datetime.now(UTC) - timedelta(days=DIAS_SEMANA)
    # Por el ORM y no con SQL a mano: `alert_type` es un enum de Postgres cuyo
    # nombre y valor difieren (ver migración 011), y escribir la comparación
    # cruda es exactamente donde se elige el equivocado.
    alertas = (
        db.query(Alert)
        .join(EmpresaUsuario, EmpresaUsuario.user_id == Alert.user_id)
        .filter(
            EmpresaUsuario.empresa_id == empresa_id,
            Alert.alert_type == AlertType.CAMBIO_PRECIO,
            Alert.created_at >= desde,
        )
        .order_by(Alert.created_at.desc())
        .all()
    )

    vistas: dict[str, Alert] = {}
    for alerta in alertas:
        vistas.setdefault(alerta.title, alerta)

    return Seccion(
        titulo="Precios que se movieron",
        filas=[
            Fila(titulo=a.title, detalle=a.message, url="/dashboard/bi")
            for a in list(vistas.values())[:MAX_FILAS]
        ],
        vacio=(
            "Sin cambios en los productos que vigilas. Puedes añadir más desde "
            "Inteligencia de mercado → Consulta de precios."
        ),
    )


def _cumplimiento(db: Session, empresa_id: UUID, empresa: Empresa) -> Seccion:
    """Lo que deja fuera por forma: estado hábil y documentos por vencer."""
    filas: list[Fila] = []

    if (empresa.estado_habil or "").lower() != "habil":
        filas.append(
            Fila(
                titulo="La empresa no figura como hábil",
                detalle=(
                    f"Estado registrado: {empresa.estado_habil or 'desconocido'}. "
                    "Sin estado hábil, la oferta se rechaza por forma."
                ),
                url="/dashboard/empresa",
            )
        )

    limite = date.today() + timedelta(days=DIAS_AVISO_VENCIMIENTO)
    documentos = (
        db.query(DocumentoEmpresa)
        .filter(
            DocumentoEmpresa.empresa_id == empresa_id,
            DocumentoEmpresa.eliminado.is_(False),
            DocumentoEmpresa.fecha_vencimiento.is_not(None),
            DocumentoEmpresa.fecha_vencimiento <= limite,
        )
        .order_by(DocumentoEmpresa.fecha_vencimiento.asc())
        .limit(MAX_FILAS)
        .all()
    )
    for doc in documentos:
        vencido = doc.fecha_vencimiento < date.today()
        filas.append(
            Fila(
                titulo=f"{doc.nombre[:120]} {'venció' if vencido else 'vence pronto'}",
                detalle=f"{'Venció' if vencido else 'Vence'} el {doc.fecha_vencimiento:%d-%m-%Y}",
                url="/dashboard/documentos",
            )
        )

    return Seccion(
        titulo="Cumplimiento",
        filas=filas[:MAX_FILAS],
        vacio=(
            f"Estado hábil al día y ningún documento vence en los próximos "
            f"{DIAS_AVISO_VENCIMIENTO} días."
        ),
    )


def _mercado(db: Session, empresa_id: UUID) -> Seccion:
    """Movimientos del mercado, del radar que ya existía.

    Se descarta su movimiento `nueva_licitacion`: lo cubre —mejor y más barato—
    la sección de encaje, que lee el precomputado en vez de recargar el modelo.
    """
    try:
        radar = radar_service.compute_radar_for_empresa(db, empresa_id)
    except Exception as exc:
        logger.warning("[Informe] radar falló para %s: %s", empresa_id, exc)
        radar = {}

    movimientos = [
        m for m in (radar.get("movimientos") or []) if m.get("tipo") != "nueva_licitacion"
    ]
    return Seccion(
        titulo="Tu mercado",
        filas=[
            Fila(titulo=m["titulo"], detalle=m["detalle"], url=m.get("accion_url"))
            for m in movimientos[:MAX_FILAS]
        ],
        vacio="Sin movimientos destacables en tus rubros esta semana.",
    )


def construir(db: Session, empresa_id: UUID) -> Informe | None:
    """El informe de una empresa. `None` si la empresa no existe."""
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if empresa is None:
        return None

    return Informe(
        empresa_id=empresa_id,
        empresa_nombre=empresa.nombre_empresa,
        semana=_lunes(),
        secciones=[
            _encaje(db, empresa_id),
            _cierres(db, empresa_id),
            _precios(db, empresa_id),
            _cumplimiento(db, empresa_id, empresa),
            _mercado(db, empresa_id),
        ],
    )
