"""Cliente y transformador de Compra Ágil.

Se prueba contra la forma **documentada** de la API v2 («Guía de uso API Compra
Ágil v3», ChileCompra, mayo 2026), con las respuestas simuladas. Es lo honesto
que se puede hacer sin un ticket real, y lo que hay que decir: **este código
nunca ha hablado con la API de verdad**. Lo primero que hay que hacer con un
ticket es correr una pasada y comparar.

Lo que sí queda fijado son las tres cosas que separan esta API de la clásica y
que un refactor puede deshacer sin que nada falle:

- el ticket va en una **cabecera**, no en la URL;
- la respuesta viene **envuelta** en `{success, payload}`;
- un **429** es un límite de tasa: se espera y se reintenta, con tope por corrida.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from etl.extractors.base import ConsultaFallida  # noqa: E402
from etl.extractors.compra_agil import (  # noqa: E402
    ESPERA_MAXIMA_POR_CORRIDA_S,
    ESPERAS_TRAS_429,
    CompraAgilExtractor,
    LimiteDeTasa,
)
from etl.shared_imports import ZONA_CHILE  # noqa: E402
from etl.transformers.compra_agil_transformer import CompraAgilTransformer  # noqa: E402

# Un item tal como lo documenta §6.1 de la guía oficial.
ITEM = {
    "codigo": "1057539-228-COT26",
    "nombre": "Materiales eléctricos para mantención",
    "estado": {"id_estado": 3, "codigo": "publicada", "glosa": "Publicada"},
    "convocatoria": {"estado_convocatoria": 1, "descripcion": "Primer llamado"},
    "documentos": [],
    "fechas": {
        "fecha_publicacion": "2026-08-01T14:30:00Z",
        "fecha_cierre": "2026-08-06T18:00:00Z",
        "fecha_ultimo_cambio": "2026-08-02T09:15:00Z",
        "fecha_cancelacion": None,
    },
    "montos": {"moneda": "CLP", "monto_disponible": 4_500_000, "monto_disponible_clp": 4_500_000},
    "institucion": {
        "organismo_comprador": "Municipalidad de Prueba",
        "rut": "69.070.100-7",
        "unidad_compra": "Dirección de Operaciones",
        "region": 13,
        "nombre_region": "Metropolitana de Santiago",
    },
    "resumen": {"total_ofertas_recibidas": 4},
    "motivos": {"motivo_cancelacion": None, "motivo_desierta": None, "motivo_seleccion": None},
    "links": {"detalle": "/v2/compra-agil/1057539-228-COT26"},
}


class _Respuesta:
    def __init__(self, cuerpo, status_code=200):
        self._cuerpo = cuerpo
        self.status_code = status_code

    def json(self):
        return self._cuerpo

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests

            raise requests.exceptions.HTTPError(f"HTTP {self.status_code}")


def _envuelto(items, total_paginas=1, numero_pagina=1):
    return {
        "success": "OK",
        "trace": None,
        "payload": {
            "items": items,
            "paginacion": {
                "total_paginas": total_paginas,
                "numero_pagina": numero_pagina,
                "tamano_pagina": 50,
                "total_resultados": len(items),
            },
        },
        "errors": None,
    }


# ── El cliente ───────────────────────────────────────────────────────────────


def test_el_ticket_viaja_en_la_cabecera(monkeypatch):
    """La API clásica lo lleva en la URL; ésta, en una cabecera.

    Es la diferencia que más veces se escribe mal, y el síntoma es un 401 —no un
    203 como en la clásica—, así que el fallo no se parece al conocido.
    """
    capturado = {}

    def falso_get(url, params=None, headers=None, timeout=None):
        capturado["url"] = url
        capturado["headers"] = headers or {}
        capturado["params"] = params or {}
        return _Respuesta(_envuelto([ITEM]))

    monkeypatch.setattr("etl.extractors.compra_agil.requests.get", falso_get)

    extractor = CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T-123"})
    extractor.extract(cambio_desde="2026-08-01T00:00:00Z", cambio_hasta="2026-08-02T00:00:00Z")

    assert capturado["headers"].get("ticket") == "T-123"
    assert "ticket" not in capturado["params"], "el ticket NO va en la query"
    assert capturado["url"].startswith("https://api2.mercadopublico.cl/v2/compra-agil")


def test_recorre_todas_las_paginas(monkeypatch):
    paginas = {
        1: _envuelto([dict(ITEM, codigo="A-1")], total_paginas=3, numero_pagina=1),
        2: _envuelto([dict(ITEM, codigo="A-2")], total_paginas=3, numero_pagina=2),
        3: _envuelto([dict(ITEM, codigo="A-3")], total_paginas=3, numero_pagina=3),
    }

    def falso_get(url, params=None, headers=None, timeout=None):
        return _Respuesta(paginas[params["numero_pagina"]])

    monkeypatch.setattr("etl.extractors.compra_agil.requests.get", falso_get)

    registros = CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"}).extract()
    assert [r["codigo"] for r in registros] == ["A-1", "A-2", "A-3"]


#: El cuerpo del 429 tal como lo devolvió la API en producción el 2026-10-23.
CUERPO_429 = (
    '{"errors":[{"codigo":"429","detalle":null,"mensaje":"Se ha superado el límite de '
    'tasa de solicitudes. Intente nuevamente más tarde."}],"payload":null,'
    '"success":"NOK","trace":null}'
)


@pytest.fixture
def esperas(monkeypatch) -> list[float]:
    """Las esperas pedidas a `time.sleep`, sin dormir."""
    pedidas: list[float] = []
    monkeypatch.setattr("etl.extractors.compra_agil.time.sleep", pedidas.append)
    return pedidas


def _respuestas(monkeypatch, *respuestas) -> dict:
    llamadas = {"n": 0}
    cola = iter(respuestas)

    def falso_get(url, params=None, headers=None, timeout=None):
        llamadas["n"] += 1
        return next(cola)

    monkeypatch.setattr("etl.extractors.compra_agil.requests.get", falso_get)
    return llamadas


def _r429(headers=None):
    return _RespuestaConCabeceras(
        {"success": "NOK"}, status_code=429, headers=headers, text=CUERPO_429
    )


def test_un_429_se_espera_y_se_reintenta(monkeypatch, esperas):
    """Es un límite de TASA: el 2026-10-23 la API cortó a las 4 peticiones a las
    16 UTC y dejó pasar 605 a las 19. Tomarlo por la cuota del día perdía la corrida."""
    detalle = {"success": "OK", "payload": {"codigo": "A-1"}}
    llamadas = _respuestas(monkeypatch, _r429(), _RespuestaConCabeceras(detalle))
    extractor = CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"})
    assert extractor.extract_detalle("A-1") == {"codigo": "A-1"}
    assert llamadas["n"] == 2
    assert esperas == [ESPERAS_TRAS_429[0]]
    assert extractor.esperado_429 == ESPERAS_TRAS_429[0]


def test_retry_after_se_respeta_si_pide_mas(monkeypatch, esperas):
    detalle = {"success": "OK", "payload": {"codigo": "A-1"}}
    _respuestas(
        monkeypatch,
        _r429({"Retry-After": "90"}),
        _r429({"retry-after": "1"}),
        _RespuestaConCabeceras(detalle),
    )
    assert CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"}).extract_detalle("A-1")
    assert esperas == [90, ESPERAS_TRAS_429[1]]


def test_tras_las_esperas_corta_con_limite_de_tasa(monkeypatch, esperas):
    """Se distingue de un fallo de red con nombre propio: el cron lo cuenta como
    fallo del listado y el ETL a mano, como aviso."""
    llamadas = _respuestas(monkeypatch, *[_r429() for _ in range(len(ESPERAS_TRAS_429) + 1)])
    with pytest.raises(LimiteDeTasa) as error:
        CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"}).extract()
    assert llamadas["n"] == len(ESPERAS_TRAS_429) + 1
    assert esperas == list(ESPERAS_TRAS_429)
    mensaje = str(error.value)
    assert f"tras {len(ESPERAS_TRAS_429)} reintento(s)" in mensaje
    assert f"esperó {sum(ESPERAS_TRAS_429)} s" in mensaje
    assert "límite de tasa de solicitudes" in mensaje


def test_la_espera_de_una_corrida_tiene_tope(monkeypatch, esperas):
    """Gastado el tope, el 429 siguiente corta sin esperar: la tarea no se alarga
    sin techo y la corrida siguiente lo reintenta."""
    llamadas = _respuestas(monkeypatch, _r429())
    extractor = CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"})
    extractor.esperado_429 = ESPERA_MAXIMA_POR_CORRIDA_S - ESPERAS_TRAS_429[0] + 1
    with pytest.raises(LimiteDeTasa):
        extractor.extract()
    assert llamadas["n"] == 1
    assert esperas == []


def test_un_retry_after_mas_largo_que_el_tope_no_se_espera(monkeypatch, esperas):
    _respuestas(monkeypatch, _r429({"Retry-After": str(ESPERA_MAXIMA_POR_CORRIDA_S + 1)}))
    with pytest.raises(LimiteDeTasa):
        CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"}).extract()
    assert esperas == []


def test_una_respuesta_no_ok_no_se_toma_por_buena(monkeypatch):
    """La v2 puede responder HTTP 200 con `success: "NOK"`.

    Tratarla como datos metería `None` en la base; tratarla como vacía daba la
    corrida por buena con la API rota. Si así responde a todo, es un fallo.
    """
    monkeypatch.setattr(
        "etl.extractors.compra_agil.requests.get",
        lambda *a, **k: _Respuesta(
            {"success": "NOK", "payload": None, "errors": [{"codigo": "500"}]}
        ),
    )
    with pytest.raises(ConsultaFallida):
        CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"}).extract()


# ── El transformador ─────────────────────────────────────────────────────────


def test_mapea_a_la_forma_de_licitaciones():
    fila = CompraAgilTransformer().transform(ITEM)

    assert fila["codigo_externo"] == "1057539-228-COT26"
    assert fila["tipo_convocatoria"] == "compra_agil"
    assert fila["nombre"].startswith("Materiales")
    assert fila["estado"] == "Publicada"
    # El monto normalizado a CLP: es lo que permite comparar con el resto del
    # catálogo y ordenar por monto.
    assert fila["monto_estimado"] == 4_500_000
    assert fila["nombre_organismo"] == "Municipalidad de Prueba"
    assert fila["region"] == "Metropolitana de Santiago"
    assert fila["fecha_publicacion"].year == 2026


def test_el_monto_va_en_pesos_y_la_moneda_lo_dice():
    """`monto_estimado` es `monto_disponible_clp`, ya en pesos. La moneda salía
    de `montos.moneda`, la ORIGINAL: una Compra Ágil en UF quedaba con la cifra
    en pesos rotulada «UF» («3.900.000 UF» en la ficha). La original y su monto
    quedan en `informacion_adicional`."""
    en_uf = {
        **ITEM,
        "montos": {"moneda": "CLF", "monto_disponible": 100, "monto_disponible_clp": 3_900_000},
    }
    fila = CompraAgilTransformer().transform(en_uf)
    assert (fila["monto_estimado"], fila["moneda"]) == (3_900_000, "CLP")
    assert fila["informacion_adicional"]["moneda_original"] == "CLF"
    assert fila["informacion_adicional"]["monto_disponible_original"] == 100


def test_el_llamado_se_conserva_aunque_no_tenga_columna():
    """Una Compra Ágil desierta en el primer llamado se vuelve a abrir.

    Sin `estado_convocatoria`, los dos llamados del mismo código serían
    indistinguibles y el segundo pisaría al primero sin dejar rastro.
    """
    fila = CompraAgilTransformer().transform(ITEM)
    assert fila["informacion_adicional"]["estado_convocatoria"] == 1
    assert fila["informacion_adicional"]["total_ofertas_recibidas"] == 4


def test_sin_codigo_se_descarta():
    """Es la clave de negocio: sin ella la fila no se puede upsertar."""
    assert CompraAgilTransformer().transform(dict(ITEM, codigo=None)) is None


def test_sin_fecha_de_publicacion_se_descarta():
    """La columna es NOT NULL, y adivinarla falsearía el orden del listado."""
    roto = dict(ITEM, fechas={**ITEM["fechas"], "fecha_publicacion": None})
    assert CompraAgilTransformer().transform(roto) is None


def test_la_descripcion_del_listado_no_borra_la_del_detalle():
    """El listado no la trae: va `None`, no `""`. En el upsert un `""` pisaba la
    descripción que había traído el detalle en la pasada anterior."""
    fila = CompraAgilTransformer().transform(ITEM)
    assert fila["descripcion"] is None
    assert fila["items"] is None


# ── Las fechas de la API son hora de Chile, aunque digan `Z` ─────────────────
#
# Spec del pivote §6.1, medido. Leídas como UTC, cada cierre quedaba 3–4 h antes:
# una Compra Ágil salía cerrada horas antes de cerrar.


def _cierre(texto):
    item = dict(ITEM, fechas={**ITEM["fechas"], "fecha_cierre": texto})
    return CompraAgilTransformer().transform(item)["fecha_cierre"]


def test_la_z_es_hora_de_chile_en_invierno():
    """Julio: Chile en UTC-4. Las 10:00 «Z» son las 14:00 UTC, no las 10:00."""
    cierre = _cierre("2026-07-15T10:00:00Z")
    assert cierre == datetime(2026, 7, 15, 10, 0, tzinfo=ZONA_CHILE)
    assert cierre.astimezone(UTC) == datetime(2026, 7, 15, 14, 0, tzinfo=UTC)


def test_la_z_es_hora_de_chile_en_verano():
    """Enero: Chile en UTC-3. El desfase lo pone la zona, no una constante."""
    cierre = _cierre("2026-01-15T10:00:00Z")
    assert cierre.astimezone(UTC) == datetime(2026, 1, 15, 13, 0, tzinfo=UTC)


def test_sin_zona_tambien_es_hora_de_chile():
    """Julio, -04: las 10:00 sin zona son las 14:00 UTC."""
    assert _cierre("2026-07-15 10:00") == datetime(2026, 7, 15, 14, 0, tzinfo=UTC)


def test_un_desfase_explicito_se_respeta():
    cierre = _cierre("2026-07-15T10:00:00+00:00")
    assert cierre.astimezone(UTC) == datetime(2026, 7, 15, 10, 0, tzinfo=UTC)


class _RespuestaConCabeceras(_Respuesta):
    def __init__(self, cuerpo, status_code=200, headers=None, text=""):
        super().__init__(cuerpo, status_code)
        self.headers = headers or {}
        self.text = text


def test_el_429_dice_cuantas_pidio_la_corrida_y_lo_que_dijo_la_api(monkeypatch):
    """No se conoce el límite. El 2026-10-21 la corrida de las 16 h recibió 429 en
    su primera petición y el log no decía nada más. (Un `Retry-After` de una hora
    pasa del tope de la corrida: corta sin esperar.)"""
    respuestas = iter(
        [
            _RespuestaConCabeceras(
                _envuelto([dict(ITEM, codigo="A-1")], total_paginas=2),
                headers={"X-RateLimit-Remaining": "1", "Content-Type": "application/json"},
            ),
            _RespuestaConCabeceras(
                {"success": "NOK"},
                status_code=429,
                headers={"X-RateLimit-Remaining": "0", "Retry-After": "3600"},
                text='{"message": "Limite diario de 10000 alcanzado"}',
            ),
        ]
    )
    monkeypatch.setattr("etl.extractors.compra_agil.requests.get", lambda *a, **k: next(respuestas))
    extractor = CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"})
    with pytest.raises(LimiteDeTasa) as error:
        extractor.extract()
    mensaje = str(error.value)
    assert "llevaba 2 petición(es)" in mensaje
    assert "'X-RateLimit-Remaining': '0'" in mensaje
    assert "Retry-After" in mensaje
    assert "Limite diario de 10000" in mensaje
    assert "Content-Type" not in mensaje
    assert extractor.peticiones == 2
