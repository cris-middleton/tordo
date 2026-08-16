"""El despacho de alertas.

El fallo que motiva este módulo no era un bug visible: era que las alertas se
creaban y **nunca salían**. `create_alert_idempotent` las insertaba con
`notification_channels=["in_app"]` y nadie llamaba al envío, así que el encaje
semántico, los plazos, los documentos, el estado hábil y el precio se quedaban
dentro de la aplicación. Un fallo así no lo encuentra un test que compruebe que
"la alerta se creó" — sólo lo encuentra uno que compruebe que **salió**.

De ahí el trinquete de `test_toda_alerta_declara_su_politica`: un tipo nuevo sin
política declarada hace fallar la suite, igual que hace `test_celery_beat.py`
con el calendario.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.models.alert import AlertType, NotificationChannel
from app.services import correo_render, notificaciones
from app.services.notificaciones import Urgencia


class _Alerta(SimpleNamespace):
    """Doble de `Alert` con lo que el despacho lee."""

    def __init__(self, **kv):
        base = {
            "id": 1,
            "user_id": 7,
            "alert_type": AlertType.NUEVA_LICITACION_MATCH,
            "entity_type": "licitacion",
            "entity_id": 100,
            "title": "Servicio de mantención de equipos médicos",
            "message": "Encaje alto con el perfil de tu empresa.",
            "alert_metadata": {"codigo_externo": "1234-56-LP26", "score_encaje": 0.78},
            "notification_channels": ["in_app"],
            "sent_at": None,
            "created_at": None,
        }
        super().__init__(**{**base, **kv})


class _Usuario(SimpleNamespace):
    def __init__(self, **kv):
        base = {
            "id": 7,
            "email": "dueno@pyme.cl",
            "full_name": "Ana Rojas",
            "is_active": True,
            "notification_email": True,
            "notification_webhook": False,
            "webhook_url": None,
        }
        super().__init__(**{**base, **kv})


class _Sesion:
    """Sesión mínima: resuelve `query(User)` y registra los commits."""

    def __init__(self, usuarios=None):
        self._usuarios = {u.id: u for u in (usuarios or [])}
        self.commits = 0
        self.agregados = []

    def query(self, modelo):
        return _Consulta(self._usuarios)

    def add(self, obj):
        self.agregados.append(obj)

    def commit(self):
        self.commits += 1


class _Consulta:
    def __init__(self, usuarios):
        self._usuarios = usuarios
        self._ids = None
        self._id = None

    def filter(self, *criterios):
        return self

    def all(self):
        return list(self._usuarios.values())

    def first(self):
        return next(iter(self._usuarios.values()), None)


@pytest.fixture
def correos(monkeypatch):
    """Captura los envíos en vez de mandarlos."""
    enviados: list[dict] = []

    def _falso(*, to, subject, body, html_body=None, **_):
        enviados.append({"to": to, "asunto": subject, "texto": body, "html": html_body})
        return True

    monkeypatch.setattr(notificaciones, "send_email", _falso)
    monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)
    return enviados


# ── El trinquete ─────────────────────────────────────────────────────────────


def test_toda_alerta_declara_su_politica():
    """Un tipo nuevo sin política sería «sólo dentro de la aplicación» por
    defecto — que es exactamente el fallo que este módulo viene a arreglar y que
    nadie vio durante meses."""
    sin_declarar = sorted(t.value for t in AlertType if t not in notificaciones.POLITICA)
    assert not sin_declarar, (
        f"tipos de alerta sin política de canal: {sin_declarar}. "
        f"Decide en `notificaciones.POLITICA` si van INMEDIATA, TANDA o SIN_CORREO."
    )


def test_lo_que_caduca_sale_al_momento():
    """Un recordatorio de plazo que espera a la tanda de la noche llega tarde."""
    for tipo in (
        AlertType.PLAZO_24H,
        AlertType.PLAZO_48H,
        AlertType.ESTADO_HABIL_CAMBIO,
        AlertType.DOCUMENTO_VENCIDO,
    ):
        assert notificaciones.urgencia_de(tipo) == Urgencia.INMEDIATA


def test_el_encaje_semantico_sale_por_correo():
    """Es el producto entero de la competencia. Si esto vuelve a ser
    `SIN_CORREO`, TORDO deja de competir en la puerta de entrada."""
    assert notificaciones.urgencia_de(AlertType.NUEVA_LICITACION_MATCH) == Urgencia.TANDA


# ── Canales ──────────────────────────────────────────────────────────────────


class TestCanales:
    def test_la_campana_siempre_esta(self):
        """`in_app` no es un canal opcional: es el registro de la alerta."""
        usuario = _Usuario(notification_email=False)
        canales = notificaciones.canales_para(AlertType.PLAZO_24H, usuario)
        assert canales == [NotificationChannel.IN_APP.value]

    def test_quien_apaga_el_correo_no_recibe_correo(self):
        usuario = _Usuario(notification_email=False)
        canales = notificaciones.canales_para(AlertType.PLAZO_24H, usuario)
        assert NotificationChannel.EMAIL.value not in canales

    def test_un_tipo_sin_correo_no_manda_correo_aunque_el_usuario_lo_quiera(self):
        """La política del tipo manda sobre la preferencia: nadie quiere un
        correo por cada cambio de estado de una orden de compra."""
        canales = notificaciones.canales_para(AlertType.ORDER_UPDATE, _Usuario())
        assert NotificationChannel.EMAIL.value not in canales

    def test_el_webhook_necesita_url(self):
        sin_url = _Usuario(notification_webhook=True, webhook_url=None)
        con_url = _Usuario(notification_webhook=True, webhook_url="https://erp.cl/hook")
        assert NotificationChannel.WEBHOOK.value not in notificaciones.canales_para(
            AlertType.PLAZO_24H, sin_url
        )
        assert NotificationChannel.WEBHOOK.value in notificaciones.canales_para(
            AlertType.PLAZO_24H, con_url
        )

    def test_whatsapp_ya_no_existe(self):
        """Retirado: su verificación con Meta tarda 4–8 semanas, cobra por
        conversación y la competencia demuestra que el correo basta."""
        assert not hasattr(NotificationChannel, "WHATSAPP")


# ── Envío ────────────────────────────────────────────────────────────────────


class TestDespachoInmediato:
    def test_manda_el_correo_y_deja_constancia(self, correos):
        usuario = _Usuario()
        alerta = _Alerta(alert_type=AlertType.PLAZO_24H, title="Cierra mañana")
        db = _Sesion([usuario])

        canales = notificaciones.despachar(alerta, db)

        assert len(correos) == 1
        assert correos[0]["to"] == "dueno@pyme.cl"
        assert NotificationChannel.EMAIL.value in canales
        assert alerta.sent_at is not None

    def test_un_usuario_inactivo_no_recibe_nada(self, correos):
        db = _Sesion([_Usuario(is_active=False)])
        assert notificaciones.despachar(_Alerta(), db) == []
        assert correos == []

    def test_si_el_envio_falla_la_alerta_no_queda_como_enviada_por_correo(self, monkeypatch):
        monkeypatch.setattr(notificaciones, "send_email", lambda **_: False)
        monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)
        alerta = _Alerta(alert_type=AlertType.PLAZO_24H)
        db = _Sesion([_Usuario()])

        canales = notificaciones.despachar(alerta, db)

        assert canales == [NotificationChannel.IN_APP.value]

    def test_reintenta_antes_de_rendirse(self, monkeypatch):
        intentos = {"n": 0}

        def _falla_dos_veces(**_):
            intentos["n"] += 1
            if intentos["n"] < 3:
                raise TimeoutError("smtp lento")
            return True

        monkeypatch.setattr(notificaciones, "send_email", _falla_dos_veces)
        monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)

        canales = notificaciones.despachar(
            _Alerta(alert_type=AlertType.PLAZO_24H), _Sesion([_Usuario()])
        )

        assert intentos["n"] == 3
        assert NotificationChannel.EMAIL.value in canales


class TestTanda:
    def test_varias_novedades_van_en_un_solo_correo(self, correos):
        """Es lo que separa un producto de una fuente de spam: quince avisos en
        quince correos terminan en una regla de filtro, y a partir de ahí el
        usuario deja de enterarse de todo, incluido lo urgente."""
        alertas = [_Alerta(id=i, title=f"Licitación {i}") for i in range(1, 6)]
        db = _Sesion([_Usuario()])

        resumen = notificaciones.despachar_tanda(alertas, db)

        assert len(correos) == 1
        assert resumen == {"usuarios": 1, "correos": 1, "alertas": 5}

    def test_cada_usuario_recibe_lo_suyo(self, correos):
        db = _Sesion([_Usuario(id=7), _Usuario(id=8, email="socio@pyme.cl")])
        alertas = [_Alerta(id=1, user_id=7), _Alerta(id=2, user_id=8)]

        notificaciones.despachar_tanda(alertas, db)

        assert len(correos) == 2

    def test_lo_urgente_no_se_cuela_en_la_tanda(self, correos):
        """Si entrara aquí, un plazo a 24 horas esperaría a la siguiente corrida."""
        alertas = [_Alerta(id=1, alert_type=AlertType.PLAZO_24H)]
        resumen = notificaciones.despachar_tanda(alertas, _Sesion([_Usuario()]))
        assert resumen["alertas"] == 0
        assert correos == []

    def test_sin_alertas_no_manda_nada(self, correos):
        assert notificaciones.despachar_tanda([], _Sesion([_Usuario()]))["correos"] == 0
        assert correos == []


# ── Lo que ve el usuario ─────────────────────────────────────────────────────


class TestCorreo:
    def test_el_correo_esta_en_espanol(self):
        """Decía «New Alert» y «Hello» sobre un verde Material, en un producto
        que sólo habla español."""
        asunto, texto, html_ = correo_render.alerta_individual(
            _Alerta(alert_type=AlertType.PLAZO_24H, title="Aseo municipal")
        )
        assert "Cierra mañana" in asunto
        for prohibido in ("New Alert", "Hello", "View Alert", "#4CAF50"):
            assert prohibido not in html_
            assert prohibido not in texto

    def test_el_texto_plano_no_lleva_html(self):
        """El cuerpo de texto se mandaba con el marcado dentro, así que quien lo
        leyera sin HTML recibía las etiquetas en crudo."""
        _, texto, _ = correo_render.alerta_individual(_Alerta())
        assert "<" not in texto

    def test_el_texto_de_chilecompra_se_escapa(self):
        """Los nombres son datos de terceros: un `&` rompía la maqueta, y de ahí
        a inyectar etiquetas hay muy poco."""
        alerta = _Alerta(title='Aseo & Mantención <script>alert("x")</script>')
        _, _, html_ = correo_render.alerta_individual(alerta)
        assert "<script>" not in html_
        assert "&amp;" in html_

    def test_el_bi_va_dentro_del_aviso(self):
        """Es la diferencia entera con la competencia: donde ellos dicen «esta
        licitación calza», aquí va además cuánto paga ese comprador."""
        contexto = {
            "precios": [{"p25": 2_400_000, "p75": 3_900_000, "predictibilidad": "alta"}],
            "comprador": {"mediana_dias_pago": 32},
            "competidores": {"disponible": True, "top5": [{}, {}, {}]},
        }
        _, texto, html_ = correo_render.alerta_individual(_Alerta(), contexto)

        assert "$2.400.000" in texto and "$3.900.000" in texto
        assert "32 días" in texto
        assert "3 proveedores habituales" in texto
        assert "$2.400.000" in html_

    def test_la_dispersion_alta_se_dice_como_hallazgo(self):
        """Un rango enorme no es un hueco que disimular: significa que el precio
        probablemente no sea lo que decide la adjudicación, y eso es información
        que nadie más está dando."""
        contexto = {
            "precios": [{"p25": 1_200_000, "p75": 9_800_000, "predictibilidad": "baja"}],
        }
        lineas = correo_render.lineas_de_bi(contexto)
        assert any("no parece ser lo que decide" in x for x in lineas)

    def test_una_linea_sin_dato_se_omite(self):
        """Un «sin datos» dentro de un correo enseña a no leerlo."""
        assert correo_render.lineas_de_bi(None) == []
        assert correo_render.lineas_de_bi({"precios": [], "comprador": {}}) == []

    def test_la_tanda_no_pone_quince_tarjetas(self):
        """Un correo de quince novedades no se lee: se archiva."""
        alertas = [_Alerta(id=i, title=f"Licitación número {i}") for i in range(1, 13)]
        _, texto, html_ = correo_render.tanda(alertas, _Usuario())

        assert texto.count("- Licitación número") == correo_render.MAX_EN_TANDA
        assert "Ver las otras 7" in html_

    def test_el_asunto_dice_cuantas_son(self):
        alertas = [_Alerta(id=i) for i in range(1, 4)]
        asunto, _, _ = correo_render.tanda(alertas, _Usuario())
        assert "3 oportunidades" in asunto

    def test_los_montos_van_en_formato_chileno(self):
        """Punto de miles y sin decimales: en pesos no existe moneda menor, y en
        una columna de cifras los decimales estorban para comparar."""
        assert correo_render._plata(2_400_000) == "$2.400.000"
        assert correo_render._plata(None) == ""
