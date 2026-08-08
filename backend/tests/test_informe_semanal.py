"""El informe semanal.

Lo que se fija aquí son las decisiones que hacen que el correo del lunes valga la
pena abrirlo — y las que evitan que sea el correo que todos filtran:

- **una sección vacía se dice**, no se esconde: el silencio no distingue entre
  «no hay nada» y «no se miró»;
- **si no hay absolutamente nada, no se manda**;
- **el texto de fuera se escapa**: los nombres de licitación son datos de
  ChileCompra, y uno con `&` rompía el correo anterior;
- **el cuerpo de texto plano es texto plano**, no el HTML metido en su hueco;
- **sólo lo reciben quienes no lo han desactivado** — si no, el enlace del pie
  sería mentira.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.empresa import DocumentoEmpresa, Empresa, EmpresaUsuario
from app.models.licitacion import Licitacion
from app.models.match import MatchEmpresaLicitacion
from app.models.user import User
from app.services import informe_render, informe_semanal
from app.tasks.informe_tasks import _destinatarios


@pytest.fixture
def db(esquema_migrado):
    """Sesión síncrona sobre una transacción que se revierte. La tarea es de
    Celery, así que el servicio es síncrono."""
    url = esquema_migrado.replace("postgresql+asyncpg://", "postgresql://", 1)
    engine = create_engine(url, future=True)
    conexion = engine.connect()
    transaccion = conexion.begin()
    Session = sessionmaker(bind=conexion, join_transaction_mode="create_savepoint")
    sesion = Session()
    try:
        yield sesion
    finally:
        sesion.close()
        transaccion.rollback()
        conexion.close()
        engine.dispose()


def _empresa(db, *, estado_habil: str = "habil") -> Empresa:
    empresa = Empresa(
        rut_empresa=f"7{uuid.uuid4().int % 10_000_000}-9",
        nombre_empresa="Constructora & Cía",  # el `&` no es decorativo: ver el test de escapado
        estado_habil=estado_habil,
    )
    db.add(empresa)
    db.flush()
    return empresa


def _usuario(db, empresa, *, rol="owner", informe=True) -> User:
    usuario = User(
        username=f"u{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:8]}@tordo-pruebas.cl",
        hashed_password="x",
        is_active=True,
        recibe_informe_semanal=informe,
    )
    db.add(usuario)
    db.flush()
    db.add(EmpresaUsuario(empresa_id=empresa.id, user_id=usuario.id, rol=rol))
    db.flush()
    return usuario


def _licitacion(db, *, nombre: str, cierra_en_dias: int = 10) -> Licitacion:
    lic = Licitacion(
        codigo_externo=f"L{uuid.uuid4().hex[:10]}",
        nombre=nombre,
        estado="publicada",
        activo=True,
        fecha_publicacion=datetime.now(UTC) - timedelta(days=2),
        fecha_cierre=datetime.now(UTC) + timedelta(days=cierra_en_dias),
        monto_estimado=1_500_000,
    )
    db.add(lic)
    db.flush()
    return lic


def _encaje(db, empresa, licitacion, score: int = 87):
    db.add(
        MatchEmpresaLicitacion(
            empresa_id=empresa.id,
            licitacion_id=licitacion.id,
            score=score,
            nivel="alto",
            calculado_en=datetime.now(UTC),
        )
    )
    db.flush()


# ── Contenido ────────────────────────────────────────────────────────────────


def test_una_empresa_sin_nada_no_tiene_contenido(db):
    """Y por eso no se le manda correo. Un semanal vacío enseña a ignorar el
    semanal."""
    empresa = _empresa(db)

    informe = informe_semanal.construir(db, empresa.id)

    assert informe is not None
    assert not informe.tiene_contenido


def test_las_secciones_vacias_se_pintan_igual(db):
    """Omitirlas dejaría al lector sin saber si es que no hay o no se miró."""
    empresa = _empresa(db)

    informe = informe_semanal.construir(db, empresa.id)
    html = informe_render.render_html(informe)

    for seccion in informe.secciones:
        assert seccion.titulo in html
        assert seccion.vacio in html


def test_el_encaje_sale_del_precomputado(db):
    """No se recalcula con TF-IDF: dos fuentes de verdad para «encaje» es una de
    más, y el informe daría un número distinto al del panel."""
    empresa = _empresa(db)
    lic = _licitacion(db, nombre="Suministro de guantes")
    _encaje(db, empresa, lic, score=87)

    informe = informe_semanal.construir(db, empresa.id)

    encaje = next(s for s in informe.secciones if "encaja" in s.titulo)
    assert len(encaje.filas) == 1
    assert "87%" in encaje.filas[0].titulo


def test_una_licitacion_ya_cerrada_no_aparece(db):
    """El job puntúa lo que estaba abierto a las 06:00, y una licitación puede
    cerrar durante el día. Mostrarla invita a postular a algo que ya no admite
    ofertas."""
    empresa = _empresa(db)
    lic = _licitacion(db, nombre="Ya cerrada", cierra_en_dias=-1)
    _encaje(db, empresa, lic)

    informe = informe_semanal.construir(db, empresa.id)

    encaje = next(s for s in informe.secciones if "encaja" in s.titulo)
    assert encaje.filas == []


def test_un_documento_por_vencer_entra_en_cumplimiento(db):
    empresa = _empresa(db)
    db.add(
        DocumentoEmpresa(
            empresa_id=empresa.id,
            nombre="Certificado de vigencia",
            tipo_documento="certificado",
            s3_key="x",
            s3_bucket="b",
            fecha_vencimiento=date.today() + timedelta(days=5),
        )
    )
    db.flush()

    informe = informe_semanal.construir(db, empresa.id)

    cumplimiento = next(s for s in informe.secciones if s.titulo == "Cumplimiento")
    assert any("Certificado de vigencia" in f.titulo for f in cumplimiento.filas)


def test_no_estar_habil_se_avisa(db):
    """Es lo que deja fuera por forma, y sin avisarlo el resto del informe da
    igual."""
    empresa = _empresa(db, estado_habil="inhabil")

    informe = informe_semanal.construir(db, empresa.id)

    cumplimiento = next(s for s in informe.secciones if s.titulo == "Cumplimiento")
    assert any("hábil" in f.titulo for f in cumplimiento.filas)


# ── Cómo se ve ───────────────────────────────────────────────────────────────


def test_el_texto_de_fuera_va_escapado(db):
    """Los nombres vienen de ChileCompra. El correo anterior los metía en crudo:
    un `&` rompía la maqueta, y de ahí a inyectar etiquetas hay un paso."""
    empresa = _empresa(db)
    lic = _licitacion(db, nombre="Cables <b>y</b> conectores & afines")
    _encaje(db, empresa, lic)

    html = informe_render.render_html(informe_semanal.construir(db, empresa.id))

    assert "<b>y</b>" not in html
    assert "&lt;b&gt;" in html
    assert "Constructora &amp; Cía" in html


def test_el_cuerpo_de_texto_no_lleva_html(db):
    """El radar mandaba el HTML en el hueco del texto plano: a quien lo leyera
    sin HTML le llegaba el marcado en crudo."""
    empresa = _empresa(db)
    _encaje(db, empresa, _licitacion(db, nombre="Servicios de aseo"))

    texto = informe_render.render_texto(informe_semanal.construir(db, empresa.id))

    assert "<div" not in texto and "style=" not in texto
    assert "Servicios de aseo" in texto


def test_el_pdf_es_un_pdf(db):
    empresa = _empresa(db)
    _encaje(db, empresa, _licitacion(db, nombre="Servicios de aseo"))

    pdf = informe_render.render_pdf(informe_semanal.construir(db, empresa.id))

    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 1000


def test_ni_el_asunto_ni_los_enlaces_llevan_la_marca_a_mano(db):
    """La versión anterior tenía «Tordo» y `https://tordo.cl` escritos en el
    código, contra la regla de leerlo de la configuración."""
    from app.config import settings

    empresa = _empresa(db)
    _encaje(db, empresa, _licitacion(db, nombre="Servicios de aseo"))
    informe = informe_semanal.construir(db, empresa.id)

    assert settings.app_name in informe_render.asunto(informe)
    assert (settings.frontend_url or "").rstrip("/") in informe_render.render_texto(informe)


# ── A quién se le manda ──────────────────────────────────────────────────────


def test_solo_a_quien_lo_tiene_activo(db):
    """Sin este filtro, el enlace para desactivarlo del pie sería mentira."""
    empresa = _empresa(db)
    quiere = _usuario(db, empresa, informe=True)
    _usuario(db, empresa, informe=False)

    assert [u.id for u in _destinatarios(db, empresa.id)] == [quiere.id]


def test_un_viewer_no_lo_recibe(db):
    """Incluye cumplimiento y plazos: es un resumen de gestión, y quien sólo
    consulta no puede actuar sobre él."""
    empresa = _empresa(db)
    _usuario(db, empresa, rol="viewer")

    assert _destinatarios(db, empresa.id) == []


def test_un_usuario_desactivado_no_lo_recibe(db):
    empresa = _empresa(db)
    usuario = _usuario(db, empresa)
    usuario.is_active = False
    db.flush()

    assert _destinatarios(db, empresa.id) == []
