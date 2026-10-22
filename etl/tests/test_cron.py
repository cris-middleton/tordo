"""El punto de entrada cron: la puerta horaria, la ventana de Compra Ágil y el latido.

Nada de red ni de base: los pasos y el cliente HTTP se inyectan.
"""

import io
import logging
import sys
import zipfile
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import requests

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
# ahora. La primera corrida del día parte de la corrida anterior a la primera
# de AYER: si cualquier corrida falló entera —la primera de ayer incluida—, su
# tramo se recoge al día siguiente. Las horas son de Chile y sin zona, que es
# como las espera la API.


@pytest.mark.parametrize(
    ("ahora", "desde"),
    [
        # Martes 13 h: la anterior fue a las 10 h → desde las 9.
        ("2026-07-14T13:00:00", "2026-07-14T09:00:00"),
        ("2026-07-14T16:02:00", "2026-07-14T12:00:00"),
        ("2026-07-14T19:00:00", "2026-07-14T15:00:00"),
        # Martes 10 h, primera del día: la primera de ayer fue el lunes a las
        # 10 h, y la anterior a ésa, el domingo a las 12 h → desde las 11.
        ("2026-07-14T10:00:00", "2026-07-12T11:00:00"),
        # Lunes 10 h tras el finde: la primera de ayer fue el domingo a las
        # 12 h, y la anterior, el sábado a las 12 h.
        ("2026-07-13T10:00:00", "2026-07-11T11:00:00"),
        # Sábado 12 h: la primera de ayer fue el viernes a las 10 h, y la
        # anterior, el jueves a las 19 h.
        ("2026-07-18T12:00:00", "2026-07-16T18:00:00"),
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
    """Domingo 6 de sept., primer día CLST: la primera de ayer es la del sábado
    a las 12 h CLT, y la anterior, la del viernes a las 19 h CLT."""
    inicio, _ = cron.ventana_compra_agil(_chile("2026-09-06T12:00:00"))
    assert inicio == datetime(2026, 9, 4, 18, 0)
    # Y el lunes, ya en CLST, encuentra la del domingo aunque el reloj saltara.
    inicio, _ = cron.ventana_compra_agil(_chile("2026-09-07T10:00:00"))
    assert inicio == datetime(2026, 9, 5, 11, 0)


def _horas_programadas_entre(desde: datetime, hasta: datetime) -> list[datetime]:
    hora, horas = desde.astimezone(UTC), []
    while hora < hasta:
        if cron.le_toca(hora):
            horas.append(hora)
        hora += timedelta(hours=1)
    return horas


def _cubre(tramos: list[tuple[datetime, datetime]], desde: datetime, hasta: datetime) -> bool:
    cubierto = desde
    for inicio, fin in sorted(tramos):
        if inicio > cubierto:
            break
        cubierto = max(cubierto, fin)
    return cubierto >= hasta


def test_una_corrida_cualquiera_que_falla_no_deja_hueco():
    """Tres semanas de corridas, con el cambio de hora dentro. Se tira cada una
    por turno: su ventana tiene que quedar cubierta por las demás. Con las 26 h
    fijas de antes, tirar la primera de un día dejaba sin mirar lo que cambió
    entre la última de anteayer y ella."""
    corridas = _horas_programadas_entre(
        datetime(2026, 8, 24, tzinfo=ZONA_CHILE), datetime(2026, 9, 14, tzinfo=ZONA_CHILE)
    )
    ventanas = [cron.ventana_compra_agil(c) for c in corridas]
    # Ni la primera semana (le faltan las anteriores) ni la última (le faltan
    # las siguientes que la recogerían).
    for i in range(len(corridas)):
        if not (datetime(2026, 8, 31) <= ventanas[i][1] < datetime(2026, 9, 7)):
            continue
        otras = ventanas[:i] + ventanas[i + 1 :]
        assert _cubre(otras, *ventanas[i]), f"hueco si falla la de {corridas[i]}"


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


# ── Recuperación tras una caída ──────────────────────────────────────────────
#
# Las ventanas de arriba toleran UNA corrida perdida. Si el cron deja de correr
# más de un día (el 2026-10-21 Railway pausó los servicios tras un incidente de
# seguridad: la última Compra Ágil se escribió el martes 20 a las 19:13), lo que
# cambió entre la última corrida buena y la primera tras la caída no lo mira
# nadie. La última escritura en Postgres dice dónde se quedó el catálogo.


def test_sin_caida_la_ultima_escritura_no_cambia_la_ventana():
    """Con el cron sano, la última escritura es de la corrida anterior: la
    ventana es la de siempre, en todas las horas de una semana."""
    corridas = _horas_programadas_entre(
        datetime(2026, 10, 12, tzinfo=ZONA_CHILE), datetime(2026, 10, 19, tzinfo=ZONA_CHILE)
    )
    for anterior, corrida in zip(corridas, corridas[1:], strict=False):
        escrita = anterior + timedelta(minutes=12)
        assert cron.ventana_compra_agil(corrida, escrita) == cron.ventana_compra_agil(corrida)


def test_tras_una_caida_de_dos_dias_la_ventana_parte_de_la_ultima_escritura():
    """Si vuelve el jueves 23 a las 10 h, la ventana normal parte del martes 21 a
    las 18 h y dejaría sin mirar desde el martes 20 a las 19:13."""
    escrita = _chile("2026-10-20T19:13:27")
    inicio, fin = cron.ventana_compra_agil(_chile("2026-10-23T10:00:00"), escrita)
    assert inicio == datetime(2026, 10, 20, 18, 13, 27)
    assert fin == datetime(2026, 10, 23, 10, 0)
    # La ventana normal sí lo habría dejado fuera.
    assert cron.ventana_compra_agil(_chile("2026-10-23T10:00:00"))[0] == datetime(2026, 10, 21, 18)


def test_la_recuperacion_tiene_tope():
    """Una caída de semanas no se recupera de golpe: la cuota de Compra Ágil es
    diaria y un 429 a medias no deja escrito nada, así que la misma ventana
    fallaría cada día."""
    ahora = _chile("2026-10-23T13:00:00")
    inicio, _ = cron.ventana_compra_agil(ahora, _chile("2026-09-01T10:00:00"))
    assert inicio == (ahora - cron.RECUPERACION_COMPRA_AGIL).replace(tzinfo=None)


def test_ninguna_caida_dentro_del_tope_deja_hueco_en_compra_agil():
    """Se tiran todas las corridas de un bloque seguido —de una a las que caben
    en el tope—: la primera que vuelve cubre desde la última escritura."""
    corridas = _horas_programadas_entre(
        datetime(2026, 8, 24, tzinfo=ZONA_CHILE), datetime(2026, 9, 21, tzinfo=ZONA_CHILE)
    )
    for i in range(1, len(corridas) - 1):
        ultima_buena = corridas[i - 1]
        escrita = ultima_buena + timedelta(minutes=12)
        for j in range(i + 1, len(corridas)):
            vuelve = corridas[j]
            if vuelve - escrita > cron.RECUPERACION_COMPRA_AGIL - cron.SOLAPE:
                break
            inicio, _ = cron.ventana_compra_agil(vuelve, escrita)
            fin_buena = cron.ventana_compra_agil(ultima_buena)[1]
            assert inicio <= fin_buena, f"hueco si caen de {corridas[i]} a {corridas[j - 1]}"


@pytest.mark.parametrize(
    ("ahora", "escrita", "dias"),
    [
        # Sano, primera del día: anteayer y ayer, como siempre.
        ("2026-10-15T10:00:00", "2026-10-14T19:05:00", ("2026-10-13", "2026-10-14")),
        # Sano, una intermedia: ningún barrido.
        ("2026-10-15T13:00:00", "2026-10-15T10:20:00", None),
        # La primera de hoy no escribió nada: la de las 13 h barre en su lugar.
        ("2026-10-15T13:00:00", "2026-10-14T19:05:00", ("2026-10-13", "2026-10-14")),
        # Vuelve el viernes 23 tras caerse el martes 20 por la noche: desde el 20.
        ("2026-10-23T10:00:00", "2026-10-20T19:13:00", ("2026-10-20", "2026-10-22")),
        # Y si vuelve a media tarde, también.
        ("2026-10-23T16:00:00", "2026-10-20T19:13:00", ("2026-10-20", "2026-10-22")),
        # Con tope: una caída de un mes barre los últimos días, no el mes.
        ("2026-10-23T10:00:00", "2026-09-20T19:13:00", ("2026-10-18", "2026-10-22")),
    ],
)
def test_dias_del_barrido(ahora, escrita, dias):
    resultado = cron.dias_del_barrido(_chile(ahora), _chile(escrita))
    esperado = None if dias is None else tuple(datetime.fromisoformat(d).date() for d in dias)
    assert resultado == esperado


def test_sin_ultima_escritura_el_barrido_es_el_de_siempre():
    assert cron.dias_del_barrido(_chile("2026-10-15T13:00:00"), None) is None
    assert cron.dias_del_barrido(_chile("2026-10-15T10:00:00"), None) == (
        datetime(2026, 10, 13).date(),
        datetime(2026, 10, 14).date(),
    )


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

    def materializar(self, fallidas=(), hechas=("time_series",)):
        def _paso():
            self.llamadas.append(("materializar",))
            return cron.Materializacion(hechas=list(hechas), fallidas=list(fallidas))

        return _paso


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


def test_la_primera_del_dia_barre_anteayer_y_ayer_y_reconsulta_resultados():
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
    # Dos días: si la primera de ayer falló, su barrido de anteayer no se hizo.
    assert ("barrido", "2026-07-11", "2026-07-12") in r.llamadas


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


def test_los_pasos_reales_leen_la_ultima_escritura():
    assert cron.PasosFrecuente.reales().ultimas_escrituras is etl_main.ultimas_escrituras


def test_sin_base_la_ultima_escritura_es_vacia_y_no_revienta(monkeypatch, caplog):
    monkeypatch.setattr(etl_main.config, "DATABASE_URL", "postgresql://nadie@127.0.0.1:1/nada")
    with caplog.at_level(logging.WARNING):
        assert etl_main.ultimas_escrituras() == {}
    assert "última escritura" in caplog.text


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


def test_frecuente_recupera_tras_una_caida():
    """La primera corrida tras la caída, aunque sea a media tarde: Compra Ágil
    desde la última escritura y el barrido desde el día de la última licitación.
    Las últimas escrituras se leen ANTES de escribir nada."""
    r = _Registro()
    pasos = _pasos_frecuente(r)

    def ultimas():
        r.llamadas.append(("ultimas",))
        return {
            "compra_agil": _chile("2026-10-20T19:13:27"),
            "licitacion": _chile("2026-10-20T19:10:00"),
        }

    pasos.ultimas_escrituras = ultimas
    assert cron.correr_frecuente(_chile("2026-10-23T16:00:00"), pasos)
    assert r.nombres() == ["ultimas", "compra_agil", "licitaciones", "detalles_nuevos", "barrido"]
    assert r.llamadas[1][1] == datetime(2026, 10, 20, 18, 13, 27)
    assert ("barrido", "2026-10-20", "2026-10-22") in r.llamadas


def test_si_no_se_puede_leer_la_ultima_escritura_la_corrida_sigue_igual():
    r = _Registro()
    pasos = _pasos_frecuente(r)
    pasos.ultimas_escrituras = lambda: {}
    assert cron.correr_frecuente(_chile("2026-07-14T13:00:00"), pasos)
    assert r.nombres() == ["compra_agil", "licitaciones", "detalles_nuevos"]


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
        materializar=r.materializar(),
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
    # La descarga recibe la ventana entera (39 meses): rellena lo que falte.
    ventana = r.llamadas[2][1]
    assert len(ventana) == cron.MESES_EN_R2 == 39
    assert ventana[0] == (2023, 8) and ventana[-1] == (2026, 10)
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
        materializar=r.materializar(),
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
        materializar=r.materializar(),
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


# ── La ventana en R2 ─────────────────────────────────────────────────────────


def test_conservar_ventana_decide_por_mes_y_deja_lo_demas():
    conservar = cron.conservar_ventana([(2026, 9), (2026, 10)])
    assert conservar("consolidated/oc/2026-9.parquet")
    assert conservar("consolidated/lic/2026-10.parquet")
    assert not conservar("consolidated/oc/2026-8.parquet")
    assert not conservar("consolidated/lic/2010-1.parquet")
    # Lo que no es un consolidado mensual se queda: no se borra lo que no se entiende.
    assert conservar("analytics/time_series.parquet")
    assert conservar("consolidated/oc/raro.parquet")


@pytest.mark.parametrize("atraso", [0, 1, 2, 3])
def test_la_ventana_de_analytics_cabe_entera_en_la_de_r2(atraso):
    """`data_loader` ancla sus 36 meses en el último período con DATOS, que va
    detrás del mes en curso. Con hasta 3 meses de atraso, todo lo que lee está
    en R2; si no, analytics leería una ventana con agujeros sin avisar."""
    instante = _chile("2026-10-11T03:00:00")
    en_r2 = set(cron.periodos_recientes(instante, cron.MESES_EN_R2))
    indice = 2026 * 12 + 10 - 1 - atraso
    ultimo_con_datos = (indice // 12, indice % 12 + 1)
    lee = [
        (i // 12, i % 12 + 1) for i in range(indice - cron.VENTANA_ANALYTICS_MESES + 1, indice + 1)
    ]
    assert ultimo_con_datos in en_r2
    assert set(lee) <= en_r2


def test_descargar_baja_solo_los_meses_sin_consolidado(tmp_path, monkeypatch):
    """La primera corrida (R2 vacío) llena la ventana; las demás, sólo lo purgado."""
    monkeypatch.setattr(cron.descarga, "CONSOLIDATED_DIR", tmp_path)
    (tmp_path / "oc").mkdir()
    (tmp_path / "oc" / "2026-8.parquet").write_bytes(b"x")  # bajado de R2
    pedidos = {}

    def descargar_tipo(tipo, periodos):
        pedidos[tipo] = periodos
        return {"ok": len(periodos), "skip_404": 0, "error": 0, "no_publicados": [], "fallidos": []}

    def consolidar_tipo(tipo):
        for anio, mes in pedidos[tipo]:
            (tmp_path / tipo).mkdir(exist_ok=True)
            (tmp_path / tipo / f"{anio}-{mes}.parquet").write_bytes(b"x")
        return tmp_path / tipo

    monkeypatch.setattr(cron.descarga, "descargar_tipo", descargar_tipo)
    monkeypatch.setattr(cron.descarga, "consolidar_tipo", consolidar_tipo)

    assert cron._descargar([(2026, 8), (2026, 9), (2026, 10)], {})
    assert pedidos == {"oc": [(2026, 9), (2026, 10)], "lic": [(2026, 8), (2026, 9), (2026, 10)]}


# ── La descarga masiva, con la red falsa ─────────────────────────────────────
#
# Lo que pasaba: la semanal purga los tres meses recientes y los vuelve a bajar.
# Si la descarga caía (timeout, 5xx, conexión cortada), `descargar_zip` borraba
# el parcial y devolvía False, `descargar_tipo` lo contaba como 404 («aún no
# publicado») y `_descargar` daba la ventana por completa: analytics se publicaba
# sin esos meses y el latido daba verde.


def _zip_con_csv(filas: int = 3) -> bytes:
    contenido = "Codigo;Monto\n" + "".join(f"{i};{i * 10}\n" for i in range(filas))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("datos.csv", contenido.encode("latin-1"))
    return buffer.getvalue()


class _RespuestaMasiva:
    def __init__(self, estado=200, cuerpo=b"", corta=False):
        self.status_code = estado
        self.cuerpo = cuerpo
        self.corta = corta

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}", response=self)

    def iter_content(self, chunk_size):
        yield self.cuerpo[: len(self.cuerpo) // 2]
        if self.corta:
            raise requests.exceptions.ChunkedEncodingError("Connection reset by peer")
        yield self.cuerpo[len(self.cuerpo) // 2 :]


@pytest.fixture
def masiva(tmp_path, monkeypatch):
    """La descarga masiva sobre un directorio temporal y una red de mentira.

    `respuestas[(tipo, (anio, mes))]` es lo que responde ese ZIP: un
    `_RespuestaMasiva` o una excepción de `requests`. Lo que no está, 404.
    """
    monkeypatch.setattr(cron.descarga, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(cron.descarga, "CONSOLIDATED_DIR", tmp_path / "consolidated")
    respuestas: dict = {}

    def get(url, stream=True, timeout=None):
        tipo = "oc" if "/oc-da/" in url else "lic"
        anio, mes = (int(x) for x in url.rsplit("/", 1)[1].removesuffix(".zip").split("-"))
        respuesta = respuestas.get((tipo, (anio, mes)), _RespuestaMasiva(404))
        if isinstance(respuesta, Exception):
            raise respuesta
        return respuesta

    monkeypatch.setattr(cron.descarga.requests, "get", get)
    return respuestas


def _publicados(respuestas, periodos, tipos=("oc", "lic")):
    for tipo in tipos:
        for periodo in periodos:
            respuestas[(tipo, periodo)] = _RespuestaMasiva(cuerpo=_zip_con_csv())


VENTANA_CORTA = [(2026, 8), (2026, 9), (2026, 10)]


def test_una_conexion_cortada_es_un_error_y_no_un_404(masiva, tmp_path):
    masiva[("oc", (2026, 9))] = requests.ConnectionError("Connection reset by peer")
    masiva[("oc", (2026, 10))] = _RespuestaMasiva(cuerpo=_zip_con_csv(), corta=True)
    resultado = cron.descarga.descargar_tipo("oc", [(2026, 9), (2026, 10)])
    assert (resultado["ok"], resultado["skip_404"], resultado["error"]) == (0, 0, 2)
    assert resultado["fallidos"] == [(2026, 9), (2026, 10)]
    # Ni el ZIP truncado ni su parcial se quedan: la próxima vez se baja entero.
    assert list((tmp_path / "raw" / "oc").iterdir()) == []


@pytest.mark.parametrize(
    "falla",
    [
        requests.Timeout("read timed out"),
        requests.ConnectionError("Connection reset by peer"),
        _RespuestaMasiva(503),
        _RespuestaMasiva(cuerpo=_zip_con_csv(), corta=True),
    ],
    ids=["timeout", "conexion", "503", "cortada-a-medias"],
)
def test_la_semanal_falla_si_un_mes_purgado_no_se_puede_rehacer(masiva, falla):
    _publicados(masiva, VENTANA_CORTA)
    masiva[("lic", (2026, 9))] = falla
    con_datos = {"oc": set(VENTANA_CORTA), "lic": set(VENTANA_CORTA)}
    assert not cron._descargar(VENTANA_CORTA, con_datos)


def test_el_mes_en_curso_aun_no_publicado_no_es_un_fallo(masiva, tmp_path):
    """El 404 legítimo: el mes en curso (y el anterior, los primeros días de un
    mes) todavía no tienen ZIP, ni lo tenían la semana pasada."""
    _publicados(masiva, VENTANA_CORTA[:1])
    con_datos = {"oc": {(2026, 8)}, "lic": {(2026, 8)}}
    assert cron._descargar(VENTANA_CORTA, con_datos)
    assert (tmp_path / "consolidated" / "lic" / "2026-8.parquet").exists()


def test_un_404_de_un_mes_que_tenia_datos_es_un_fallo(masiva):
    """Se purgó para rehacerlo y ya no está: analytics saldría sin ese mes."""
    _publicados(masiva, VENTANA_CORTA[:2])
    con_datos = {"oc": set(VENTANA_CORTA), "lic": set(VENTANA_CORTA[:2])}
    assert not cron._descargar(VENTANA_CORTA, con_datos)


def test_un_404_de_un_mes_viejo_de_la_ventana_es_un_fallo(masiva):
    """La primera corrida, con R2 vacío: un mes de hace dos años existe siempre."""
    ventana = [(2024, 1), *VENTANA_CORTA]
    _publicados(masiva, VENTANA_CORTA)
    assert not cron._descargar(ventana, {})


def test_un_zip_ilegible_hace_fallar_la_consolidacion(masiva, tmp_path):
    _publicados(masiva, VENTANA_CORTA)
    masiva[("oc", (2026, 9))] = _RespuestaMasiva(cuerpo=b"esto no es un zip")
    assert not cron._descargar(VENTANA_CORTA, {})
    assert cron.descarga.consolidar_tipo("oc") is None
    assert not (tmp_path / "consolidated" / "oc" / "2026-9.parquet").exists()


def test_purgar_dice_que_meses_tenian_datos(tmp_path, monkeypatch):
    monkeypatch.setattr(cron.descarga, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(cron.descarga, "CONSOLIDATED_DIR", tmp_path / "consolidated")
    (tmp_path / "consolidated" / "oc").mkdir(parents=True)
    (tmp_path / "consolidated" / "oc" / "2026-9.parquet").write_bytes(b"x")
    assert cron._purgar([(2026, 9), (2026, 10)]) == {"oc": {(2026, 9)}, "lic": set()}


def test_la_semanal_pasa_a_la_descarga_lo_que_tenia_datos():
    r = _Registro()
    con_datos = {"oc": {(2026, 9)}, "lic": set()}
    pasos = _pasos_semanal(r)
    pasos.purgar = lambda periodos: con_datos
    pasos.descargar = r.paso("descargar")
    cron.correr_semanal(_chile("2026-10-11T03:00:00"), pasos)
    assert [ll for ll in r.llamadas if ll[0] == "descargar"][0][2] is con_datos


def test_la_semanal_entera_falla_y_no_reconstruye_con_la_descarga_caida(masiva):
    """De punta a punta con la `_descargar` real: la red cae al rehacer un mes
    purgado → ni analytics, ni materializar, ni subir, y el latido en /fail."""
    _publicados(masiva, VENTANA_CORTA)
    masiva[("oc", (2026, 10))] = requests.ConnectionError("Connection reset by peer")
    r = _Registro()
    pasos = _pasos_semanal(r)
    pasos.purgar = lambda periodos: {"oc": set(VENTANA_CORTA), "lic": set(VENTANA_CORTA)}
    # Sólo los meses recientes: los 36 anteriores darían 404 en esta red falsa.
    pasos.descargar = lambda ventana, con_datos: cron._descargar(ventana[-3:], con_datos)
    transporte = _Transporte()
    codigo = cron.ejecutar(
        "semanal",
        ahora=lambda: _chile("2026-10-11T03:00:00"),
        corridas={"semanal": lambda instante: cron.correr_semanal(instante, pasos)},
        latido=cron.Latido(URL, httpx.Client(transport=httpx.MockTransport(transporte))),
    )
    assert codigo == 1
    assert transporte.urls()[-1] == f"{URL}/fail"
    assert "2026, 10" in transporte.peticiones[-1].content.decode()
    assert "materializar" not in r.nombres() and "subir" not in r.nombres()
