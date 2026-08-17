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

Un segundo fallo, más sutil, se corrige en este archivo: `sent_at` se marcaba
al terminar `despachar()`/`despachar_tanda()` sin mirar si el correo había
salido. Una alerta cuyo correo fallaba los tres reintentos de `_con_reintento`
quedaba «procesada» para siempre — nada la reintentaba, nada avisaba. Las
clases `TestDespachoInmediato`/`TestTanda` prueban que un fallo deja `sent_at`
en NULL, y `TestDespachoPendientesReintento` prueba, contra Postgres real, que
eso es justo lo que hace falta para que se reintente sin volver a mandar lo
que ya salió.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

from app.models.alert import Alert, AlertType, NotificationChannel
from app.models.task_failure import TaskFailure
from app.models.user import User
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
        # `sent_at` significa que el correo salió. Si falló, tiene que quedar
        # en NULL — es lo único que permite reintentar más tarde sin volver a
        # mandar lo que ya salió. Éste es el bug que motivó el fix: antes se
        # marcaba igual, sin mirar el resultado del envío.
        assert alerta.sent_at is None

    def test_el_fallo_de_correo_queda_registrado_para_un_operador(self, monkeypatch, caplog):
        """Perder un correo en silencio es exactamente el fallo que se arregla
        aquí: tiene que quedar algo que un operador encuentre sin leer logs de
        Celery a mano — la misma cola de fondo que ya usa el ETL."""
        monkeypatch.setattr(notificaciones, "send_email", lambda **_: False)
        monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)
        alerta = _Alerta(id=42, alert_type=AlertType.ESTADO_HABIL_CAMBIO)
        db = _Sesion([_Usuario()])

        with caplog.at_level(logging.ERROR, logger="app.services.notificaciones"):
            notificaciones.despachar(alerta, db)

        fallos = [f for f in db.agregados if isinstance(f, TaskFailure)]
        assert len(fallos) == 1
        assert fallos[0].task_args["alert_id"] == 42
        assert any(r.levelno == logging.ERROR for r in caplog.records)

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
        assert all(a.sent_at is not None for a in alertas)

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

    def test_si_el_correo_de_tanda_falla_no_queda_como_enviada(self, monkeypatch):
        """Antes `_marcar_enviada` se llamaba sobre TODA la tanda antes de
        siquiera intentar el correo — este test habría pasado con el bug
        presente, porque `sent_at` ya estaba puesto cuando el envío ni había
        corrido. La corrección mueve la marca a después de conocer el
        resultado."""
        monkeypatch.setattr(notificaciones, "send_email", lambda **_: False)
        monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)
        alertas = [_Alerta(id=i, title=f"Licitación {i}") for i in range(1, 4)]
        db = _Sesion([_Usuario()])

        resumen = notificaciones.despachar_tanda(alertas, db)

        assert resumen["correos"] == 0
        assert all(a.sent_at is None for a in alertas)
        fallos = [f for f in db.agregados if isinstance(f, TaskFailure)]
        assert len(fallos) == 3

    def test_quien_no_pidio_correo_queda_enviada_de_inmediato(self, monkeypatch):
        """Sin correo pendiente no hay nada que esperar: la alerta ya está
        completa con sólo el `in_app`, así que `sent_at` se marca al tiro."""

        def _no_deberia_llamarse(**_):
            raise AssertionError("no debía intentarse un correo para este usuario")

        monkeypatch.setattr(notificaciones, "send_email", _no_deberia_llamarse)
        monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)
        alertas = [_Alerta(id=1)]
        db = _Sesion([_Usuario(notification_email=False)])

        resumen = notificaciones.despachar_tanda(alertas, db)

        assert resumen["correos"] == 0
        assert alertas[0].sent_at is not None


# ── Reintento contra Postgres real ───────────────────────────────────────────


class TestDespachoPendientesReintento:
    """`despachar_pendientes` re-lee por `Alert.sent_at.is_(None)` antes de
    despachar — ya lo hacía para no procesar dos veces la misma tanda de IDs
    recién insertados. Estos tests comprueban que la misma señal ahora sirve
    también para el reintento: nada nuevo que aprender, ni para el código ni
    para quien lo reintente a mano."""

    @staticmethod
    def _sembrar(session, *, alert_type=AlertType.ESTADO_HABIL_CAMBIO):
        usuario = User(
            username=f"user-{id(session)}-{alert_type.value}",
            email="dueno@pyme.cl",
            hashed_password="x",
            full_name="Ana Rojas",
            is_active=True,
        )
        session.add(usuario)
        session.flush()
        alerta = Alert(
            user_id=usuario.id,
            alert_type=alert_type,
            entity_type="licitacion",
            entity_id=1,
            title="Cambio de estado hábil",
            message="Tu empresa pasó a inhábil.",
            notification_channels=["in_app"],
        )
        session.add(alerta)
        session.flush()
        return usuario, alerta

    def test_un_fallo_no_se_pierde_queda_en_null_y_registrado(self, sync_task_db, monkeypatch):
        session, _ = sync_task_db
        monkeypatch.setattr(notificaciones, "send_email", lambda **_: False)
        monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)
        _, alerta = self._sembrar(session)

        notificaciones.despachar_pendientes(session, [alerta.id])

        session.refresh(alerta)
        assert alerta.sent_at is None
        fallos = [
            f for f in session.query(TaskFailure).all() if f.task_args.get("alert_id") == alerta.id
        ]
        assert len(fallos) == 1

    def test_una_alerta_fallida_se_reintenta_en_la_siguiente_pasada(
        self, sync_task_db, monkeypatch
    ):
        session, _ = sync_task_db
        monkeypatch.setattr(notificaciones, "send_email", lambda **_: False)
        monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)
        _, alerta = self._sembrar(session)
        notificaciones.despachar_pendientes(session, [alerta.id])
        session.refresh(alerta)
        assert alerta.sent_at is None

        monkeypatch.setattr(notificaciones, "send_email", lambda **_: True)
        notificaciones.despachar_pendientes(session, [alerta.id])

        session.refresh(alerta)
        assert alerta.sent_at is not None

    def test_una_alerta_ya_enviada_no_se_reenvia(self, sync_task_db, monkeypatch):
        """La propiedad de idempotencia: reintentar no puede volver a mandar lo
        que ya salió. Si esto fallara, un reintento —automático o a mano—
        mandaría un correo duplicado por cada alerta ya entregada."""
        session, _ = sync_task_db
        monkeypatch.setattr(notificaciones, "send_email", lambda **_: True)
        monkeypatch.setattr(notificaciones, "contexto_bi", lambda *a, **k: None)
        _, alerta = self._sembrar(session)
        notificaciones.despachar_pendientes(session, [alerta.id])
        session.refresh(alerta)
        assert alerta.sent_at is not None
        primer_envio = alerta.sent_at

        def _no_deberia_llamarse(**_):
            raise AssertionError("se reenvió una alerta que ya había salido")

        monkeypatch.setattr(notificaciones, "send_email", _no_deberia_llamarse)
        notificaciones.despachar_pendientes(session, [alerta.id])

        session.refresh(alerta)
        assert alerta.sent_at == primer_envio


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
        licitación calza», aquí va además la banda de precio y el historial del
        comprador.

        Este test exigía la línea «paga a 32 días», que salía de
        `mediana_dias_pago`. Ese campo mide los días hasta que el PROVEEDOR
        acepta la orden, no un pago —ChileCompra no publica fecha de pago en
        ninguna parte—, así que el correo prometía un plazo que nadie había
        medido. Lo reemplaza la tasa de adjudicación, que sí sale del dato.
        """
        contexto = {
            "precios": [{"p25": 2_400_000, "p75": 3_900_000, "predictibilidad": "alta"}],
            "comprador": {"tasa_adjudicacion": 0.62},
            "competidores": {"disponible": True, "top5": [{}, {}, {}]},
        }
        _, texto, html_ = correo_render.alerta_individual(_Alerta(), contexto)

        assert "$2.400.000" in texto and "$3.900.000" in texto
        assert "38%" in texto
        assert "3 proveedores habituales" in texto
        assert "$2.400.000" in html_

    def test_el_correo_no_promete_plazos_de_pago(self):
        """Guarda explícita: el dato de días no vuelve a colarse como un pago."""
        contexto = {"comprador": {"mediana_dias_aceptacion": 32, "tasa_adjudicacion": 0.9}}
        lineas = correo_render.lineas_de_bi(contexto)
        assert not any("paga" in x.lower() or "pago" in x.lower() for x in lineas)

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
