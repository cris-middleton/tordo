"""Compra Ágil contra la API REAL (respuestas capturadas el 2026-09-24).

Lo que enseñó la primera llamada de verdad, y que estos tests fijan:

- Una ventana de 24 h devuelve `total_resultados = 10000` exacto —un tope del
  buscador, no el número real— y con 50 por página responde 504. La
  sincronización diaria de un día entero era INCOMPLETA sin avisar. Se consulta
  en tramos de una hora y con 25 por página.
- El listado no trae descripción ni ítems; el detalle (`/v2/compra-agil/{codigo}`)
  sí, con los productos en `productos_solicitados`.
- Las regiones llegan con espacios de relleno.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from etl.extractors import compra_agil  # noqa: E402
from etl.extractors.base import sin_ticket  # noqa: E402
from etl.extractors.compra_agil import CompraAgilExtractor, tramos  # noqa: E402
from etl.transformers.compra_agil_transformer import (  # noqa: E402
    CompraAgilTransformer,
    campos_desde_detalle,
)

# Un item del LISTADO, tal como llegó de la API real.
ITEM_REAL = {
    "codigo": "3193-380-COT26",
    "nombre": "ALTERNADOR UNIDAD MARÍTIMA",
    "estado": {"id_estado": 2, "codigo": "publicada", "glosa": "Publicada"},
    "convocatoria": {"estado_convocatoria": 1, "descripcion": "Primer llamado"},
    "fechas": {
        "fecha_publicacion": "2026-09-24 23:44",
        "fecha_cierre": "2026-09-26 10:00",
        "fecha_ultimo_cambio": "2026-09-24T23:45:00.140Z",
    },
    "montos": {"moneda": "CLP", "monto_disponible": 376666, "monto_disponible_clp": 376666},
    "institucion": {
        "organismo_comprador": "GOBERNACION MARITIMA DE TALCAHUANO",
        "rut": "61.102.102-K",
        "unidad_compra": "GOBERNACION MARITIMA DE TALCAHUANO",
        "region": 8,
        "nombre_region": "Región del Biobío ",
    },
    "resumen": {"total_ofertas_recibidas": 0},
}

# Su DETALLE, recortado a lo que se usa.
DETALLE_REAL = {
    "codigo": "3193-380-COT26",
    "descripcion": "ADQUISICIÓN DE ALTERNADOR UNIDAD MARÍTIMA DEPENDIENTE DE LA GOBERNACIÓN MARÍTIMA",
    "productos_solicitados": [
        {
            "codigo_producto": 26101615,
            "nombre": "Alternadores",
            "descripcion": "ALTERNADOR SEGÚN ESPECIFICACIONES TÉCNICAS ADJUNTAS.",
            "cantidad": 1,
            "unidad_medida": "EA",
        }
    ],
}


class _Respuesta:
    def __init__(self, cuerpo, status_code=200):
        self._cuerpo = cuerpo
        self.status_code = status_code

    def json(self):
        return self._cuerpo

    def raise_for_status(self):
        return None


def _pagina(items):
    return {
        "success": "OK",
        "payload": {
            "items": items,
            "paginacion": {"total_paginas": 1, "numero_pagina": 1, "total_resultados": len(items)},
        },
    }


# ── Ventanas ─────────────────────────────────────────────────────────────────


def test_una_ventana_ancha_se_parte_en_tramos_de_una_hora():
    desde = datetime(2026, 9, 24, 0, 0)
    hasta = desde + timedelta(hours=26)

    partes = list(tramos(desde, hasta))

    assert len(partes) == 26
    assert partes[0][0] == desde and partes[-1][1] == hasta
    assert all(fin - inicio <= timedelta(hours=1) for inicio, fin in partes)
    # Contiguos: ni huecos ni solapes entre tramos.
    assert all(partes[i][1] == partes[i + 1][0] for i in range(len(partes) - 1))


def test_cada_consulta_pide_25_por_pagina_y_como_mucho_una_hora(monkeypatch):
    pedidas = []

    def falso_get(url, params=None, headers=None, timeout=None):
        pedidas.append(params)
        return _Respuesta(_pagina([ITEM_REAL]))

    monkeypatch.setattr("etl.extractors.compra_agil.requests.get", falso_get)

    registros = CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"}).extract(
        cambio_desde=datetime(2026, 9, 24, 8, 0), cambio_hasta=datetime(2026, 9, 24, 11, 0)
    )

    assert len(pedidas) == 3
    assert all(p["tamano_pagina"] == 25 for p in pedidas)
    for p in pedidas:
        inicio = datetime.strptime(p["cambio_desde"], "%Y-%m-%dT%H:%M:%SZ")
        fin = datetime.strptime(p["cambio_hasta"], "%Y-%m-%dT%H:%M:%SZ")
        assert fin - inicio <= timedelta(hours=1)
    # El mismo registro en tres tramos cuenta una vez.
    assert len(registros) == 1


def test_sin_ventana_se_miran_las_ultimas_dos_horas(monkeypatch):
    pedidas = []
    monkeypatch.setattr(
        "etl.extractors.compra_agil.requests.get",
        lambda url, params=None, headers=None, timeout=None: (
            pedidas.append(params) or _Respuesta(_pagina([]))
        ),
    )
    CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"}).extract()
    assert len(pedidas) == 2
    assert timedelta(hours=2) == compra_agil.VENTANA_POR_DEFECTO


def test_el_detalle_se_pide_a_su_propio_endpoint(monkeypatch):
    urls = []

    def falso_get(url, params=None, headers=None, timeout=None):
        urls.append(url)
        return _Respuesta({"success": "OK", "payload": DETALLE_REAL})

    monkeypatch.setattr("etl.extractors.compra_agil.requests.get", falso_get)

    detalle = CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"}).extract_detalle("3193-380-COT26")

    assert urls == ["https://api2.mercadopublico.cl/v2/compra-agil/3193-380-COT26"]
    assert detalle["descripcion"].startswith("ADQUISICIÓN")


# ── Transformación ───────────────────────────────────────────────────────────


def test_el_listado_real_se_transforma_y_la_region_sale_limpia():
    fila = CompraAgilTransformer().transform(ITEM_REAL)

    assert fila["fecha_publicacion"] == datetime(2026, 9, 24, 23, 44)
    assert fila["region"] == "Región del Biobío"
    assert fila["monto_estimado"] == 376666


def test_el_detalle_da_descripcion_e_items_como_los_de_una_licitacion():
    """Con los nombres de la API clásica: el panel de BI busca `CodigoProducto`."""
    campos = campos_desde_detalle(DETALLE_REAL)

    assert campos["descripcion"].startswith("ADQUISICIÓN DE ALTERNADOR")
    assert campos["items"] == [
        {
            "CodigoProducto": 26101615,
            "NombreProducto": "Alternadores",
            "Descripcion": "ALTERNADOR SEGÚN ESPECIFICACIONES TÉCNICAS ADJUNTAS.",
            "Cantidad": 1,
            "UnidadMedida": "EA",
        }
    ]


def test_un_detalle_vacio_no_escribe_nada():
    assert campos_desde_detalle({}) == {}
    assert campos_desde_detalle(None) == {}


# ── Logs ─────────────────────────────────────────────────────────────────────


def test_el_ticket_no_queda_en_los_logs():
    """Así llegaba a los logs un 429 de la API clásica."""
    error = (
        "429 Client Error: Too Many Requests for url: https://api.mercadopublico.cl/"
        "servicios/v1/publico/licitaciones.json?fecha=22092026&ticket=F8537A18-6766-4DEF"
    )
    limpio = sin_ticket(error)
    assert "F8537A18" not in limpio
    assert "ticket=***" in limpio


def test_un_500_intermitente_se_reintenta(monkeypatch):
    """La API real responde 500/504 de vez en cuando, y al reintentar, bien."""
    respuestas = [_Respuesta({}, status_code=500), _Respuesta(_pagina([ITEM_REAL]))]
    monkeypatch.setattr(
        "etl.extractors.compra_agil.requests.get",
        lambda url, params=None, headers=None, timeout=None: respuestas.pop(0),
    )
    monkeypatch.setattr("etl.extractors.compra_agil.time.sleep", lambda s: None)

    registros = CompraAgilExtractor({"COMPRA_AGIL_TICKET": "T"}).extract(
        cambio_desde=datetime(2026, 9, 24, 8, 0), cambio_hasta=datetime(2026, 9, 24, 9, 0)
    )

    assert [r["codigo"] for r in registros] == ["3193-380-COT26"]
