"""El punto de entrada cron: la puerta horaria, la ventana de Compra Ágil y el latido.

Nada de red ni de base: los pasos y el cliente HTTP se inyectan.
"""

import logging
import sys
from datetime import UTC, datetime

import httpx
import pytest

from etl import cron
from etl import main as etl_main
from etl.cron import ZONA_CHILE
from etl.extractors.compra_agil import CuotaDiariaAgotada


def _utc(texto: str) -> datetime:
    return datetime.fromisoformat(texto).replace(tzinfo=UTC)


def _chile(texto: str) -> datetime:
    return datetime.fromisoformat(texto).replace(tzinfo=ZONA_CHILE)


# ── Puerta horaria ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("instante", "toca"),
    [
        # Invierno, CLT (UTC-4): las 14:00Z son las 10 h de Chile.
        ("2026-07-15T14:00:00", True),
        ("2026-07-15T13:00:00", False),  # 09 h
        # Verano, CLST (UTC-3): las 10 h de Chile son las 13:00Z, no las 14:00Z.
        ("2026-12-15T13:00:00", True),
        ("2026-12-15T14:00:00", False),  # 11 h
        ("2026-12-15T22:00:00", True),  # 19 h
        ("2026-12-15T23:00:00", False),  # 20 h
        # Railway dispara al minuto 0, pero puede llegar tarde: cuenta la hora.
        ("2026-07-15T14:07:31", True),
        # Fin de semana: sólo a las 12 h.
        ("2026-07-18T16:00:00", True),  # sábado 12 h CLT
        ("2026-07-18T14:00:00", False),  # sábado 10 h
        ("2026-12-20T15:00:00", True),  # domingo 12 h CLST
        ("2026-12-20T16:00:00", False),  # domingo 13 h
    ],
)
def test_puerta_horaria(instante, toca):
    assert cron.le_toca(_utc(instante)) is toca


def test_la_puerta_sigue_al_cambio_de_hora_del_mismo_dia_de_la_semana():
    """El 2026-09-06 Chile pasa a UTC-3: el lunes antes y el lunes después."""
    assert cron.le_toca(_utc("2026-08-31T14:00:00"))  # lunes, CLT
    assert not cron.le_toca(_utc("2026-09-07T14:00:00"))  # lunes, ya CLST: 11 h
    assert cron.le_toca(_utc("2026-09-07T13:00:00"))


# ── Ventana de Compra Ágil ───────────────────────────────────────────────────
#
# Regla: desde la corrida PROGRAMADA anterior menos una hora de solape, hasta
# ahora. La primera corrida del día abre 26 h, como la red diaria de antes: si
# una corrida intermedia falló entera, su tramo se recoge al día siguiente.
# Las horas son de Chile y sin zona, que es como las espera la API.


@pytest.mark.parametrize(
    ("ahora", "desde"),
    [
        # Martes 13 h: la anterior fue a las 10 h → desde las 9.
        ("2026-07-14T13:00:00", "2026-07-14T09:00:00"),
        ("2026-07-14T16:02:00", "2026-07-14T12:00:00"),
        ("2026-07-14T19:00:00", "2026-07-14T15:00:00"),
        # Martes 10 h, primera del día: 26 h (cubre las 15 h desde las 19 h).
        ("2026-07-14T10:00:00", "2026-07-13T08:00:00"),
        # Lunes 10 h tras el finde: la anterior fue el domingo a las 12 h (22 h
        # atrás); 26 h llega más lejos, hasta el domingo a las 8.
        ("2026-07-13T10:00:00", "2026-07-12T08:00:00"),
        # Sábado 12 h: la anterior fue el viernes a las 19 h.
        ("2026-07-18T12:00:00", "2026-07-17T10:00:00"),
    ],
)
def test_ventana_compra_agil(ahora, desde):
    inicio, fin = cron.ventana_compra_agil(_chile(ahora))
    assert inicio == datetime.fromisoformat(desde)
    assert fin == datetime.fromisoformat(ahora)
    assert inicio.tzinfo is None and fin.tzinfo is None


def test_ventana_forzada_fuera_de_hora_parte_de_la_anterior():
    """`--forzar` a las 11:40 del martes: la anterior es la de las 10 h."""
    inicio, _ = cron.ventana_compra_agil(_chile("2026-07-14T11:40:00"))
    assert inicio == datetime(2026, 7, 14, 9, 0)


def test_ventana_cruza_el_cambio_de_hora():
    """Domingo 6 de sept., primer día CLST: 26 h en tiempo real, no de reloj."""
    inicio, _ = cron.ventana_compra_agil(_chile("2026-09-06T12:00:00"))
    # A medianoche el reloj saltó de 00:00 a 01:00: 26 h reales antes de las
    # 12:00 CLST son las 09:00 CLT del sábado, no las 10:00.
    assert inicio == datetime(2026, 9, 5, 9, 0)


@pytest.mark.parametrize(
    ("ahora", "primera"),
    [
        ("2026-07-14T10:00:00", True),
        ("2026-07-14T13:00:00", False),
        ("2026-07-18T12:00:00", True),
        ("2026-07-14T11:40:00", False),  # forzada fuera de hora
    ],
)
def test_primera_del_dia(ahora, primera):
    assert cron.es_primera_del_dia(_chile(ahora)) is primera


# ── Orquestación de `frecuente` ──────────────────────────────────────────────


class _Registro:
    """Pasos falsos que anotan con qué se les llamó."""

    def __init__(self, fallan=()):
        self.llamadas: list[tuple] = []
        self.fallan = set(fallan)

    def paso(self, nombre):
        def _paso(*args):
            self.llamadas.append((nombre, *args))
            return nombre not in self.fallan

        return _paso

    def nombres(self):
        return [llamada[0] for llamada in self.llamadas]


def _pasos_frecuente(registro):
    return cron.PasosFrecuente(
        compra_agil=registro.paso("compra_agil"),
        licitaciones=registro.paso("licitaciones"),
        detalles_nuevos=registro.paso("detalles_nuevos"),
        barrido=registro.paso("barrido"),
        resultados=registro.paso("resultados"),
    )


def test_frecuente_corre_compra_agil_primero():
    """El listado de Compra Ágil va antes que nada: nada puede dejarlo sin cuota."""
    r = _Registro()
    ok = cron.correr_frecuente(_chile("2026-07-14T13:00:00"), _pasos_frecuente(r))
    assert ok
    assert r.nombres() == ["compra_agil", "licitaciones", "detalles_nuevos"]
    assert r.llamadas[1] == ("licitaciones", "2026-07-14")


def test_la_primera_del_dia_barre_el_dia_anterior_y_reconsulta_resultados():
    r = _Registro()
    cron.correr_frecuente(_chile("2026-07-13T10:00:00"), _pasos_frecuente(r))
    # Compra Ágil sigue siendo lo primero; los resultados, lo último.
    assert r.nombres() == [
        "compra_agil",
        "licitaciones",
        "detalles_nuevos",
        "barrido",
        "resultados",
    ]
    assert ("barrido", "2026-07-12") in r.llamadas


@pytest.mark.parametrize("hora", ["13:00", "16:00", "19:00"])
def test_resultados_solo_en_la_primera_del_dia(hora):
    """El tope es diario: correrlo en cada pasada lo multiplicaría por cuatro."""
    r = _Registro()
    cron.correr_frecuente(_chile(f"2026-07-13T{hora}:00"), _pasos_frecuente(r))
    assert "resultados" not in r.nombres()


def test_resultados_en_la_primera_del_fin_de_semana():
    r = _Registro()
    cron.correr_frecuente(_chile("2026-07-12T12:00:00"), _pasos_frecuente(r))  # domingo
    assert r.nombres()[-1] == "resultados"


def test_los_pasos_reales_reconsultan_con_ventana_y_tope(monkeypatch):
    """Lo que se cablea en producción: la ventana y el tope diario declarados."""
    recibido = {}

    def falso(**kwargs):
        recibido.update(kwargs)
        return True

    monkeypatch.setattr(cron.etl, "run_etl_resultados_licitaciones", falso)
    assert cron.PasosFrecuente.reales().resultados() is True
    assert recibido == {
        "dias": cron.DIAS_RESULTADOS,
        "limite": cron.TOPE_RESULTADOS_DIARIO,
        "reintento": cron.REINTENTO_RESULTADOS,
    }
    # Contra la cuota de la API clásica (10.000 al día): margen de sobra.
    assert cron.TOPE_RESULTADOS_DIARIO <= 1000


def test_un_paso_fallido_no_corta_los_demas_pero_falla_la_corrida():
    r = _Registro(fallan={"compra_agil"})
    ok = cron.correr_frecuente(_chile("2026-07-14T13:00:00"), _pasos_frecuente(r))
    assert not ok
    assert r.nombres() == ["compra_agil", "licitaciones", "detalles_nuevos"]


# ── Latido ───────────────────────────────────────────────────────────────────


class _Transporte:
    def __init__(self, falla=False):
        self.peticiones: list[httpx.Request] = []
        self.falla = falla

    def __call__(self, request):
        self.peticiones.append(request)
        if self.falla:
            raise httpx.ConnectError("sin red", request=request)
        return httpx.Response(200)

    def urls(self):
        return [str(p.url) for p in self.peticiones]


URL = "https://hc-ping.com/abc"


def _ejecutar(comando, *, ahora, ok=True, excepcion=None, transporte=None, url=URL, forzar=False):
    transporte = transporte or _Transporte()
    llamadas = []

    def corrida(instante):
        llamadas.append(instante)
        if excepcion:
            raise excepcion
        return ok

    codigo = cron.ejecutar(
        comando,
        forzar=forzar,
        ahora=lambda: ahora,
        corridas={comando: corrida},
        latido=cron.Latido(url, httpx.Client(transport=httpx.MockTransport(transporte))),
    )
    return codigo, transporte, llamadas


def test_latido_de_una_corrida_buena():
    codigo, t, _ = _ejecutar("frecuente", ahora=_utc("2026-07-14T14:00:00"))
    assert codigo == 0
    assert t.urls() == [f"{URL}/start", URL]


def test_latido_de_una_corrida_que_falla_por_resultado():
    codigo, t, _ = _ejecutar("frecuente", ahora=_utc("2026-07-14T14:00:00"), ok=False)
    assert codigo != 0
    assert t.urls() == [f"{URL}/start", f"{URL}/fail"]


def test_latido_de_una_corrida_que_revienta_lleva_la_cola_del_error():
    error = RuntimeError("x" * 5000 + "EL FINAL")
    codigo, t, _ = _ejecutar("semanal", ahora=_utc("2026-07-14T14:00:00"), excepcion=error)
    assert codigo != 0
    assert t.urls() == [f"{URL}/start", f"{URL}/fail"]
    cuerpo = t.peticiones[-1].content.decode()
    assert cuerpo.endswith("EL FINAL") or "EL FINAL" in cuerpo[-200:]
    assert len(cuerpo) <= cron.MAX_CUERPO_FAIL


def test_un_ping_que_falla_no_cambia_el_codigo_de_salida():
    ahora = _utc("2026-07-14T14:00:00")
    codigo, t, llamadas = _ejecutar("frecuente", ahora=ahora, transporte=_Transporte(falla=True))
    assert codigo == 0
    assert llamadas  # la corrida se hizo igual
    assert len(t.peticiones) == 2

    codigo, _, _ = _ejecutar("frecuente", ahora=ahora, ok=False, transporte=_Transporte(falla=True))
    assert codigo == 1


def test_la_puerta_horaria_no_corre_ni_hace_ping():
    codigo, t, llamadas = _ejecutar("frecuente", ahora=_utc("2026-07-14T15:00:00"))
    assert codigo == 0
    assert llamadas == []
    assert t.peticiones == []


def test_forzar_se_salta_la_puerta():
    codigo, t, llamadas = _ejecutar("frecuente", ahora=_utc("2026-07-14T15:00:00"), forzar=True)
    assert codigo == 0
    assert len(llamadas) == 1
    assert t.urls() == [f"{URL}/start", URL]


def test_semanal_no_tiene_puerta():
    """La programa Railway una vez por semana: no hay hora que comprobar."""
    _, _, llamadas = _ejecutar("semanal", ahora=_utc("2026-07-14T15:00:00"))
    assert len(llamadas) == 1


def test_sin_url_de_latido_avisa_y_sigue(caplog):
    latido = cron.Latido("", httpx.Client(transport=httpx.MockTransport(_Transporte())))
    with caplog.at_level("WARNING"):
        latido.inicio()
        latido.exito()
        latido.fallo("algo")
    assert "LATIDO" in caplog.text


def test_latido_desde_el_entorno(monkeypatch):
    monkeypatch.setenv("LATIDO_URL_FRECUENTE", "https://hc-ping.com/f/")
    monkeypatch.delenv("LATIDO_URL_SEMANAL", raising=False)
    assert cron.url_latido("frecuente") == "https://hc-ping.com/f"
    assert cron.url_latido("semanal") == ""


# ── Semanal ──────────────────────────────────────────────────────────────────


def test_periodos_recientes_cruzan_el_año():
    assert cron.periodos_recientes(_chile("2026-02-10T03:00:00"), 3) == [
        (2025, 12),
        (2026, 1),
        (2026, 2),
    ]


def test_semanal_en_orden_y_falla_si_falla_un_modulo():
    r = _Registro()
    pasos = cron.PasosSemanal(
        bajar=r.paso("bajar"),
        purgar=r.paso("purgar"),
        descargar=r.paso("descargar"),
        analytics=lambda: (r.llamadas.append(("analytics",)), ["scorer"])[1],
        materializar=r.paso("materializar"),
        subir=r.paso("subir"),
        retener=r.paso("retener"),
    )
    ok = cron.correr_semanal(_chile("2026-10-11T03:00:00"), pasos)
    assert r.nombres() == [
        "bajar",
        "purgar",
        "descargar",
        "analytics",
        "materializar",
        "subir",
        "retener",
    ]
    assert r.llamadas[1] == ("purgar", [(2026, 8), (2026, 9), (2026, 10)])
    # Un módulo de analytics roto no impide materializar ni subir lo que sí
    # salió, pero la corrida no es buena: es para eso el /fail.
    assert not ok


def test_semanal_no_materializa_si_la_descarga_falla():
    """Con la descarga rota, analytics reconstruiría sobre ZIPs purgados."""
    r = _Registro(fallan={"descargar"})
    pasos = cron.PasosSemanal(
        bajar=r.paso("bajar"),
        purgar=r.paso("purgar"),
        descargar=r.paso("descargar"),
        analytics=lambda: [],
        materializar=r.paso("materializar"),
        subir=r.paso("subir"),
        retener=r.paso("retener"),
    )
    assert not cron.correr_semanal(_chile("2026-10-11T03:00:00"), pasos)
    # Tampoco se sube ni se purga: el bucket conserva la versión anterior entera.
    assert r.nombres() == ["bajar", "purgar", "descargar"]


def _pasos_semanal(r, fallidos=()):
    return cron.PasosSemanal(
        bajar=r.paso("bajar"),
        purgar=r.paso("purgar"),
        descargar=r.paso("descargar"),
        analytics=lambda: list(fallidos),
        materializar=r.paso("materializar"),
        subir=r.paso("subir"),
        retener=r.paso("retener"),
    )


def test_semanal_retiene_con_el_instante_de_la_corrida():
    r = _Registro()
    instante = _chile("2026-10-11T03:00:00")
    assert cron.correr_semanal(instante, _pasos_semanal(r))
    assert r.llamadas[-1] == ("retener", instante)


def test_sin_compra_agil_mensual_no_se_purga_el_catalogo():
    """`publicadas` se acumula leyendo la Compra Ágil de Postgres: purgar lo que
    no se contó lo perdería para siempre."""
    r = _Registro()
    assert not cron.correr_semanal(
        _chile("2026-10-11T03:00:00"), _pasos_semanal(r, ["compra_agil_mensual"])
    )
    assert "retener" not in r.nombres()
    assert r.nombres()[-1] == "subir"


def test_otro_modulo_roto_no_impide_la_retencion():
    r = _Registro()
    assert not cron.correr_semanal(_chile("2026-10-11T03:00:00"), _pasos_semanal(r, ["scorer"]))
    assert r.nombres()[-1] == "retener"


def test_si_la_subida_falla_no_se_purga():
    """El parquet acumulado tiene que estar en R2 antes de borrar lo que cuenta."""

    def subir():
        raise RuntimeError("R2 caído")

    r = _Registro()
    pasos = _pasos_semanal(r)
    pasos.subir = subir
    with pytest.raises(RuntimeError):
        cron.correr_semanal(_chile("2026-10-11T03:00:00"), pasos)
    assert "retener" not in r.nombres()


def test_una_retencion_que_falla_hace_fallar_la_corrida():
    def retener(_instante):
        raise RuntimeError("base caída")

    r = _Registro()
    pasos = _pasos_semanal(r)
    pasos.retener = retener
    assert not cron.correr_semanal(_chile("2026-10-11T03:00:00"), pasos)


def test_purgar_borra_tambien_los_consolidados(tmp_path, monkeypatch):
    """Sólo los ZIPs no bastaba: `consolidar_tipo` se salta un mes ya consolidado."""
    monkeypatch.setattr(cron.descarga, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(cron.descarga, "CONSOLIDATED_DIR", tmp_path / "consolidated")
    for ruta in (
        "raw/oc/2026-9.zip",
        "consolidated/oc/2026-9.parquet",
        "consolidated/lic/2026-9.parquet",
        "consolidated/oc/2026-6.parquet",  # fuera de la ventana: se queda
    ):
        (tmp_path / ruta).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / ruta).write_bytes(b"x")
    cron._purgar([(2026, 9)])
    quedan = sorted(p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*.*"))
    assert quedan == ["consolidated/oc/2026-6.parquet"]


def test_semanal_sin_almacen_configurado_falla_con_el_motivo(monkeypatch):
    monkeypatch.delenv("ETL_ALMACEN", raising=False)
    transporte = _Transporte()
    codigo = cron.ejecutar(
        "semanal",
        ahora=lambda: _utc("2026-10-11T06:00:00"),
        latido=cron.Latido(URL, httpx.Client(transport=httpx.MockTransport(transporte))),
    )
    assert codigo == 1
    assert transporte.urls() == [f"{URL}/start", f"{URL}/fail"]
    assert "ETL_ALMACEN" in transporte.peticiones[-1].content.decode()


# ── Cuota de Compra Ágil ─────────────────────────────────────────────────────
#
# En el modelo de cron nadie mira el worker: una cuota agotada deja el ranking
# «de hoy» quieto, y si el latido dijera que todo va bien sería justo el fallo
# silencioso que existe para evitar.


class _ExtractorSinCuota:
    def __init__(self, *_args, listado_agota=True):
        self.listado_agota = listado_agota

    def extract(self, **_kwargs):
        if self.listado_agota:
            raise CuotaDiariaAgotada("429")
        return []

    def extract_detalle(self, _codigo):
        raise CuotaDiariaAgotada("429")


class _LoaderFalso:
    def __init__(self, *_args):
        self.conectado = False
        self.desconectado = False

    def connect(self):
        self.conectado = True

    def disconnect(self):
        self.desconectado = True

    def compras_agiles_sin_detalle(self, _limite):
        return [(1, "1234-5-COT26")]


@pytest.fixture
def _etl_sin_cuota(monkeypatch):
    def preparar(*, listado_agota):
        loaders = []

        def loader(*args):
            loaders.append(_LoaderFalso(*args))
            return loaders[-1]

        monkeypatch.setattr(etl_main.config, "COMPRA_AGIL_TICKET", "t", raising=False)
        monkeypatch.setattr(
            etl_main,
            "CompraAgilExtractor",
            lambda *a: _ExtractorSinCuota(*a, listado_agota=listado_agota),
        )
        monkeypatch.setattr(etl_main, "DatabaseLoaderV2", loader)
        return loaders

    return preparar


@pytest.mark.parametrize("listado_agota", [True, False], ids=["listado", "detalles"])
def test_sin_cuota_el_etl_de_siempre_lo_da_por_bueno(_etl_sin_cuota, listado_agota):
    """`--horario` (a mano, por CLI) no cambia: allí la cuota agotada es sólo un aviso."""
    _etl_sin_cuota(listado_agota=listado_agota)
    assert etl_main.run_etl_compra_agil() is True


@pytest.mark.parametrize("listado_agota", [True, False], ids=["listado", "detalles"])
def test_sin_cuota_el_cron_falla_y_lo_dice(_etl_sin_cuota, listado_agota, caplog):
    loaders = _etl_sin_cuota(listado_agota=listado_agota)
    with caplog.at_level("ERROR"):
        assert cron._compra_agil(datetime(2026, 7, 14, 9), datetime(2026, 7, 14, 13)) is False
    assert "cuota diaria de Compra Ágil agotada; se restablece mañana" in caplog.text
    # La conexión se cierra también cuando la cuota corta a mitad de camino.
    assert all(loader.desconectado for loader in loaders if loader.conectado)


def test_sin_cuota_el_latido_manda_fail_con_el_motivo(_etl_sin_cuota):
    _etl_sin_cuota(listado_agota=True)
    r = _Registro()
    pasos = cron.PasosFrecuente(
        compra_agil=cron._compra_agil,
        licitaciones=r.paso("licitaciones"),
        detalles_nuevos=r.paso("detalles_nuevos"),
        barrido=r.paso("barrido"),
        resultados=r.paso("resultados"),
    )
    transporte = _Transporte()
    codigo = cron.ejecutar(
        "frecuente",
        ahora=lambda: _utc("2026-07-14T17:00:00"),
        corridas={"frecuente": lambda instante: cron.correr_frecuente(instante, pasos)},
        latido=cron.Latido(URL, httpx.Client(transport=httpx.MockTransport(transporte))),
    )
    assert codigo == 1
    assert transporte.urls()[-1] == f"{URL}/fail"
    assert "cuota diaria de Compra Ágil agotada" in transporte.peticiones[-1].content.decode()
    # Sin cuota de Compra Ágil, la API clásica tiene la suya: se sigue.
    assert r.nombres() == ["licitaciones", "detalles_nuevos"]


# ── Log ──────────────────────────────────────────────────────────────────────


def test_configurar_log_sale_a_stdout_si_nadie_lo_configuro(monkeypatch):
    raiz = logging.getLogger()
    monkeypatch.setattr(raiz, "handlers", [])
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    nivel = raiz.level
    try:
        cron.configurar_log()
        assert len(raiz.handlers) == 1
        assert raiz.handlers[0].stream is sys.stdout
        assert raiz.level == logging.WARNING
    finally:
        raiz.setLevel(nivel)


def test_configurar_log_no_pisa_una_configuracion_existente(monkeypatch):
    raiz = logging.getLogger()
    existente = logging.NullHandler()
    monkeypatch.setattr(raiz, "handlers", [existente])
    cron.configurar_log()
    assert raiz.handlers == [existente]
