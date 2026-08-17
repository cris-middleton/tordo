"""Los filtros de una preferencia de alerta, y la metadata que se perdía.

Todo lo de aquí falla con el código anterior. Son fallos silenciosos: ninguno
levantaba una excepción ni dejaba traza; simplemente el usuario recibía las
alertas equivocadas, o las recibía sin lo que hace falta para actuar.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.models.alert import Alert, AlertStatus, AlertType
from app.services.alert_engine import AlertEngine, _sin_tildes


def _licitacion(**kwargs):
    base = {
        "nombre": "",
        "descripcion": "",
        "organismo_id": None,
        "monto_estimado": None,
        "monto_total": None,
        "estado": None,
        "region": None,
        "comuna": None,
    }
    return SimpleNamespace(**{**base, **kwargs})


def _preferencia(**kwargs):
    base = {
        "organismo_ids": None,
        "min_amount": None,
        "max_amount": None,
        "estados": None,
        "regiones": None,
        "comunas": None,
        "keywords": None,
    }
    return SimpleNamespace(**{**base, **kwargs})


@pytest.fixture
def motor():
    return AlertEngine(db=None)


class TestPalabrasClave:
    """En español de Chile la gente escribe sin tildes y el organismo publica
    con ellas. Comparando en crudo, el filtro no encontraba nada."""

    def test_la_palabra_sin_tilde_encuentra_el_texto_con_tilde(self, motor):
        lic = _licitacion(nombre="Servicio de mantención de equipos")
        pref = _preferencia(keywords=["mantencion"])
        assert motor._matches_preference(lic, pref) is True

    def test_y_al_reves_tambien(self, motor):
        lic = _licitacion(nombre="Servicio de mantencion de equipos")
        pref = _preferencia(keywords=["mantención"])
        assert motor._matches_preference(lic, pref) is True

    def test_sigue_sin_coincidir_lo_que_de_verdad_no_está(self, motor):
        lic = _licitacion(nombre="Servicio de aseo")
        pref = _preferencia(keywords=["mantención"])
        assert motor._matches_preference(lic, pref) is False

    def test_busca_tambien_en_la_descripcion(self, motor):
        lic = _licitacion(nombre="Licitación pública", descripcion="Incluye señalética vial")
        pref = _preferencia(keywords=["senaletica"])
        assert motor._matches_preference(lic, pref) is True

    def test_una_palabra_vacia_no_hace_coincidir_todo(self, motor):
        """`"" in texto` es siempre verdadero: una clave vacía convertía la
        preferencia en «mándamelo todo»."""
        lic = _licitacion(nombre="Servicio de aseo")
        pref = _preferencia(keywords=["", "mantención"])
        assert motor._matches_preference(lic, pref) is False


class TestSinTildes:
    def test_quita_los_acentos(self):
        assert _sin_tildes("Licitación Pública") == "licitacion publica"

    def test_la_ñ_se_pliega_igual_que_en_la_busqueda_del_catalogo(self):
        """Discutible como criterio lingüístico, pero `inmutable_unaccent` hace
        lo mismo: dos reglas para el mismo idioma sería peor."""
        assert _sin_tildes("Ñuble") == "nuble"
        assert _sin_tildes("Peñalolén") == "penalolen"


class TestMonto:
    def test_un_monto_de_cero_no_se_salta_el_filtro(self, motor):
        """**El caso que se colaba.** Cero es falsy, así que la comprobación
        booleana saltaba los dos filtros y una licitación con monto 0 pasaba por
        debajo de cualquier mínimo."""
        lic = _licitacion(monto_estimado=None, monto_total=0)
        pref = _preferencia(min_amount=1_000_000)
        assert motor._matches_preference(lic, pref) is False

    def test_sin_monto_conocido_no_se_filtra_por_monto(self, motor):
        """`None` es «no sabemos», y eso no es motivo para descartar."""
        lic = _licitacion(monto_estimado=None, monto_total=None)
        pref = _preferencia(min_amount=1_000_000)
        assert motor._matches_preference(lic, pref) is True

    def test_respeta_el_rango(self, motor):
        pref = _preferencia(min_amount=1_000, max_amount=10_000)
        assert motor._matches_preference(_licitacion(monto_total=5_000), pref) is True
        assert motor._matches_preference(_licitacion(monto_total=500), pref) is False
        assert motor._matches_preference(_licitacion(monto_total=50_000), pref) is False


class TestCategoriaRetirada:
    def test_la_api_ya_no_acepta_un_filtro_que_no_filtra(self):
        """`category_id` se aceptaba, no se comparaba con nada y dejaba pasar
        todo: quien creía haber acotado a una categoría recibía el catálogo
        entero. No es implementable —ni `Licitacion` ni `OrdenCompra` están
        clasificadas contra `categories`—, así que salió del esquema."""
        from app.schemas.alert import AlertPreferenceCreate, AlertPreferenceUpdate

        assert "category_id" not in AlertPreferenceCreate.model_fields
        assert "category_id" not in AlertPreferenceUpdate.model_fields


class TestMetadataDeLaAlerta:
    def test_el_constructor_guarda_la_metadata_en_su_columna(self):
        """**El fallo más silencioso de los cuatro.**

        `metadata` es un atributo reservado en un modelo declarativo de
        SQLAlchemy —el objeto `MetaData` de la clase—, así que
        `Alert(metadata={...})` lo aceptaba, lo sombreaba en la instancia y
        dejaba la columna real en `NULL`. Sin excepción y sin traza.
        """
        alerta = Alert(
            user_id=1,
            alert_type=AlertType.NEW_TENDER,
            entity_type="licitacion",
            entity_id=1,
            title="t",
            alert_metadata={"codigo_externo": "1234-56-LP26"},
            status=AlertStatus.PENDING,
        )
        assert alerta.alert_metadata == {"codigo_externo": "1234-56-LP26"}

    def test_los_dos_metodos_nombran_igual_el_parametro(self):
        """Tener uno `metadata` y otro `alert_metadata` es lo que hizo fácil
        equivocarse. Trinquete para que no vuelvan a divergir."""
        import inspect

        for metodo in (AlertEngine.create_alert, AlertEngine.create_alert_idempotent):
            firma = inspect.signature(metodo).parameters
            assert "alert_metadata" in firma, metodo.__name__
            assert "metadata" not in firma, metodo.__name__

    def test_create_alert_idempotent_guarda_la_metadata_de_verdad(self, sync_task_db):
        """El camino atómico tiene su PROPIO fallo con `metadata`, distinto del
        que resuelve el resto de esta clase.

        `create_alert_idempotent` inserta contra `Alert.__table__` —la `Table`
        cruda, no la clase mapeada— y ahí la columna se llama `metadata`, no
        `alert_metadata`: ese nombre sólo existe como atributo Python de la
        clase declarativa. Pasarle `alert_metadata=` a `Table.values()` no
        vale — a diferencia del fallo que arregla
        `test_el_constructor_guarda_la_metadata_en_su_columna`, éste no se
        queda callado: `CompileError: Unconsumed column names`. Como nada
        ejercía esta ruta contra una base real, nada lo veía.
        """
        from uuid import uuid4

        from app.models.user import User

        session, _ = sync_task_db
        usuario = User(
            email=f"u{uuid4().hex[:8]}@pyme.cl",
            username=f"u{uuid4().hex[:8]}",
            hashed_password="x",
            is_active=True,
        )
        session.add(usuario)
        session.flush()

        id_alerta = AlertEngine(session).create_alert_idempotent(
            user_id=usuario.id,
            alert_type=AlertType.COMPETIDOR_GANO,
            entity_type="orden_compra",
            entity_id=1,
            title="t",
            idempotency_key="prueba-metadata-idempotente",
            alert_metadata={"codigo_oc": "OC-1"},
        )

        alerta = session.query(Alert).filter(Alert.id == id_alerta).one()
        assert alerta.alert_metadata == {"codigo_oc": "OC-1"}
