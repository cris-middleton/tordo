"""Alertas de cambio de precio.

Los datos de precio ya estaban. Lo que faltaba era el disparador, y faltaba por
una razón concreta: `analytics.product_price_bands_l1` **se reemplaza entera**
en cada materialización, así que después de recalcularla no queda con qué
comparar. `precio_referencia` es lo que convierte «aquí está el precio» en «el
precio subió un 18 %».

Lo que estos tests fijan son las decisiones que hacen que la alerta signifique
algo — y que un refactor puede deshacer sin que nada falle:

- la primera corrida **no** avisa de nada;
- un producto con pocas órdenes **no** genera aviso, porque su mediana se mueve
  sola;
- cada empresa aplica **su** umbral;
- correr dos veces el mismo día **no** duplica avisos.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import precio as precio_modelo
from app.models.alert import Alert, AlertType
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.precio import PrecioReferencia, SuscripcionPrecio
from app.models.user import User
from app.services import vigilancia_precios

TABLA = precio_modelo.TABLA_BANDAS


@pytest.fixture
def db(esquema_migrado):
    """Sesión síncrona sobre una transacción que se revierte al terminar.

    El servicio es síncrono (lo llama Celery), y necesita la tabla de analytics,
    que no la crean las migraciones: la materializa el ETL. Aquí se crea a mano
    con las columnas que el servicio consulta.
    """
    url = esquema_migrado.replace("postgresql+asyncpg://", "postgresql://", 1)
    engine = create_engine(url, future=True)
    conexion = engine.connect()
    transaccion = conexion.begin()
    Session = sessionmaker(bind=conexion, join_transaction_mode="create_savepoint")
    sesion = Session()

    sesion.execute(text("CREATE SCHEMA IF NOT EXISTS analytics"))
    sesion.execute(
        text(f"""
            CREATE TABLE IF NOT EXISTS {TABLA} (
                "codigoProductoONU" text,
                "UnidadMedida" text,
                p50 double precision,
                n bigint
            )
        """)
    )
    sesion.execute(text(f"DELETE FROM {TABLA}"))
    try:
        yield sesion
    finally:
        sesion.close()
        transaccion.rollback()
        conexion.close()
        engine.dispose()


def _banda(db, codigo: str, unidad: str, p50: float, n: int = 50):
    # Las columnas se nombran a propósito: la tabla real tiene 19 y un INSERT
    # posicional escribiría el precio en `CodigoOrganismoPublico` sin error, con
    # `p50` en NULL — el filtro lo descartaría y el test comprobaría el vacío.
    db.execute(
        text(
            f'INSERT INTO {TABLA} ("codigoProductoONU", "UnidadMedida", p50, n) '
            "VALUES (:c, :u, :p, :n)"
        ),
        {"c": codigo, "u": unidad, "p": p50, "n": n},
    )


def _referencia(db, codigo: str, unidad: str, p50: float, muestra: int = 50):
    db.add(
        PrecioReferencia(
            codigo_producto=codigo,
            unidad_medida=unidad,
            p50=p50,
            muestra=muestra,
            actualizado_en=datetime.now(UTC),
        )
    )
    db.flush()


def _empresa_con_usuario(db) -> tuple[Empresa, User]:
    usuario = User(
        username=f"u{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:8]}@tordo-pruebas.cl",
        hashed_password="x",
        is_active=True,
    )
    db.add(usuario)
    db.flush()
    empresa = Empresa(
        rut_empresa=f"7{uuid.uuid4().int % 10_000_000}-9",
        nombre_empresa="Vigilante SpA",
        estado_habil="habil",
    )
    db.add(empresa)
    db.flush()
    db.add(EmpresaUsuario(empresa_id=empresa.id, user_id=usuario.id, rol="owner"))
    db.flush()
    return empresa, usuario


def _suscribir(db, empresa, codigo, unidad, umbral=10.0):
    db.add(
        SuscripcionPrecio(
            empresa_id=empresa.id,
            codigo_producto=codigo,
            unidad_medida=unidad,
            nombre_producto="Jeringas",
            umbral_pct=umbral,
        )
    )
    db.flush()


# ── Detección ────────────────────────────────────────────────────────────────


def test_la_primera_corrida_no_avisa_de_nada(db):
    """Un precio que se ve por primera vez no ha cambiado de nada.

    Sin esta regla, la primera materialización alertaría del catálogo entero —
    23 000 productos— y el usuario silenciaría la función para siempre.
    """
    _banda(db, "41122004", "Unidad", 1000)

    assert vigilancia_precios.detectar_cambios(db) == []


def test_detecta_la_subida_contra_la_referencia(db):
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Unidad", 1200)

    cambios = vigilancia_precios.detectar_cambios(db)

    assert len(cambios) == 1
    assert cambios[0].variacion_pct == pytest.approx(20.0)
    assert cambios[0].subio is True


def test_detecta_la_bajada(db):
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Unidad", 800)

    cambio = vigilancia_precios.detectar_cambios(db)[0]
    assert cambio.variacion_pct == pytest.approx(-20.0)
    assert cambio.subio is False


def test_con_pocas_ordenes_no_hay_cambio(db):
    """La mediana de un producto con cuatro órdenes se mueve sola.

    Avisar de eso convierte el ruido del muestreo en una alarma, y unas cuantas
    alarmas falsas bastan para que nadie vuelva a mirar las de verdad.
    """
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Unidad", 5000, n=4)

    assert vigilancia_precios.detectar_cambios(db) == []


def test_la_unidad_forma_parte_de_la_identidad(db):
    """El mismo producto en 'Unidad' y en 'Caja' tiene precios incomparables.

    Sin la unidad en la clave, pasar de vender por unidad a vender por caja
    parecería una subida del 2000 %.
    """
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Caja", 20000)

    # La caja no tiene referencia previa: no es un cambio, es un producto nuevo.
    assert vigilancia_precios.detectar_cambios(db) == []


# ── Alertas ──────────────────────────────────────────────────────────────────


def test_avisa_a_quien_lo_vigila(db):
    empresa, usuario = _empresa_con_usuario(db)
    _suscribir(db, empresa, "41122004", "Unidad")
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Unidad", 1200)

    creadas = vigilancia_precios.emitir_alertas(db, vigilancia_precios.detectar_cambios(db))
    db.flush()

    assert creadas == 1
    alerta = db.query(Alert).filter(Alert.user_id == usuario.id).one()
    assert alerta.alert_type == AlertType.CAMBIO_PRECIO
    assert "20%" in alerta.title
    assert "subió" in alerta.title


def test_no_avisa_a_quien_no_lo_vigila(db):
    """23 000 productos cambian de precio en cada corrida.

    Avisar de todos a todos es lo mismo que no avisar de nada.
    """
    _empresa_con_usuario(db)
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Unidad", 1200)

    assert vigilancia_precios.emitir_alertas(db, vigilancia_precios.detectar_cambios(db)) == 0


def test_cada_empresa_aplica_su_umbral(db):
    """Por eso el umbral no se aplica al detectar, sino al avisar."""
    empresa, _usuario = _empresa_con_usuario(db)
    _suscribir(db, empresa, "41122004", "Unidad", umbral=30.0)
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Unidad", 1200)  # +20 %, por debajo de su umbral

    cambios = vigilancia_precios.detectar_cambios(db)
    assert len(cambios) == 1, "el cambio existe…"
    assert vigilancia_precios.emitir_alertas(db, cambios) == 0, "…pero no le interesa"


def test_avisa_a_todo_el_equipo(db):
    """La suscripción es de la EMPRESA, y `alerts.user_id` es de usuario.

    Sin recorrer los miembros, sólo vería la alerta quien creó la vigilancia — y
    la vigilancia existe justamente para que la vea el equipo.
    """
    empresa, primero = _empresa_con_usuario(db)
    segundo = User(
        username=f"u{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:8]}@tordo-pruebas.cl",
        hashed_password="x",
        is_active=True,
    )
    db.add(segundo)
    db.flush()
    db.add(EmpresaUsuario(empresa_id=empresa.id, user_id=segundo.id, rol="viewer"))
    _suscribir(db, empresa, "41122004", "Unidad")
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Unidad", 1200)
    db.flush()

    creadas = vigilancia_precios.emitir_alertas(db, vigilancia_precios.detectar_cambios(db))
    db.flush()

    assert creadas == 2
    assert {a.user_id for a in db.query(Alert).all()} == {primero.id, segundo.id}


def test_correr_dos_veces_el_mismo_dia_no_duplica(db):
    """El job puede reintentarse. Un aviso repetido gasta la confianza."""
    empresa, _usuario = _empresa_con_usuario(db)
    _suscribir(db, empresa, "41122004", "Unidad")
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Unidad", 1200)

    cambios = vigilancia_precios.detectar_cambios(db)
    assert vigilancia_precios.emitir_alertas(db, cambios) == 1
    db.flush()
    assert vigilancia_precios.emitir_alertas(db, cambios) == 0


# ── Referencia ───────────────────────────────────────────────────────────────


def test_actualizar_la_referencia_deja_de_detectar_el_mismo_cambio(db):
    """Es el paso que cierra el ciclo, y va DESPUÉS de avisar.

    Al revés, la comparación sería contra sí misma y no habría cambio que
    detectar nunca.
    """
    _referencia(db, "41122004", "Unidad", 1000)
    _banda(db, "41122004", "Unidad", 1200)

    assert len(vigilancia_precios.detectar_cambios(db)) == 1
    vigilancia_precios.actualizar_referencias(db)
    db.flush()
    assert vigilancia_precios.detectar_cambios(db) == []


def test_la_referencia_recoge_productos_nuevos(db):
    _banda(db, "NUEVO-1", "Unidad", 500)

    assert vigilancia_precios.actualizar_referencias(db) == 1
    db.flush()

    fila = db.query(PrecioReferencia).filter_by(codigo_producto="NUEVO-1").one()
    assert float(fila.p50) == 500
