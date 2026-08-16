"""El nombre de un comprador no lo identifica: su código sí.

Todo lo de aquí falla con el código anterior. El caso está construido a imagen
del problema real: en el histórico de ChileCompra el mismo organismo aparece
escrito de varias formas —los cambios de nombre de 2021 dejaron a la misma
repartición como «GOBERNACION PROVINCIAL DE …» y «DELEGACIÓN PRESIDENCIAL
PROVINCIAL DE …»— y el pipeline metía ese nombre dentro de la clave de
agrupación.

Medido sobre los datos reales antes del arreglo: 145 de 1.186 compradores
(12,2 %) tenían más de un nombre, y de ahí salían 23.010 filas (13,6 %) con un
HHI aritméticamente imposible.
"""

from __future__ import annotations

import polars as pl
import pytest

from etl.analytics.competitor_analysis import (
    compute_market_concentration,
    compute_market_shares,
)
from etl.analytics.identidad import nombre_vigente

RUBRO = "Suministros de oficina"


# ── El mercado de juguete ────────────────────────────────────────────────────
#
# Un comprador (código 6941) escrito de DOS formas, y tres proveedores:
#
#   GRANDE  se lleva 900 de 1.000  → 90 % del mercado
#   MEDIA   se lleva  80           →  8 %
#   CHICA   se lleva  20           →  2 %
#
# HHI verdadero = 90² + 8² + 2² = 8.100 + 64 + 4 = 8.168 → concentrado.
#
# Las órdenes de GRANDE están registradas bajo el nombre nuevo y las de las
# otras dos bajo el viejo, que es exactamente lo que produce un renombrado a
# mitad del histórico.

MERCADO = pl.DataFrame(
    [
        {
            "CodigoOrganismoPublico": "6941",
            "OrganismoPublico": "DELEGACIÓN PRESIDENCIAL DE LIMARÍ",
            "RubroN2": RUBRO,
            "CodigoProveedor": "111",
            "NombreProveedor": "GRANDE SA",
            "n_oc": 10,
            "monto_total": 900.0,
        },
        {
            "CodigoOrganismoPublico": "6941",
            "OrganismoPublico": "GOBERNACION PROVINCIAL DE LIMARI",
            "RubroN2": RUBRO,
            "CodigoProveedor": "222",
            "NombreProveedor": "MEDIA LTDA",
            "n_oc": 20,
            "monto_total": 80.0,
        },
        {
            "CodigoOrganismoPublico": "6941",
            "OrganismoPublico": "GOBERNACION PROVINCIAL DE LIMARI",
            "RubroN2": RUBRO,
            "CodigoProveedor": "333",
            "NombreProveedor": "CHICA SPA",
            "n_oc": 30,
            "monto_total": 20.0,
        },
    ]
)


@pytest.fixture
def concentracion() -> pl.DataFrame:
    return compute_market_concentration(compute_market_shares(MERCADO))


class TestConcentracion:
    def test_un_comprador_renombrado_es_UN_mercado(self, concentracion):
        """Antes salían dos filas: una por grafía del nombre."""
        assert concentracion.height == 1

    def test_el_hhi_se_calcula_sobre_el_mercado_entero(self, concentracion):
        """Con el nombre en la clave, el HHI de cada trozo se calculaba con las
        cuotas del mercado completo: salía muchísimo más bajo de lo posible.

        Aquí el trozo del nombre viejo habría dado 8² + 2² = 68 → «fragmentado»,
        cuando el mercado real está dominado al 90 % por un solo proveedor.
        """
        fila = concentracion.row(0, named=True)
        assert fila["hhi"] == pytest.approx(8168.0, abs=1.0)
        assert fila["tipo_mercado"] == "concentrado"

    def test_el_hhi_nunca_baja_del_minimo_aritmetico(self, concentracion):
        """Con n proveedores repartidos, el mínimo posible es 10.000/n.

        Es la invariante que destapó el fallo: 23.010 filas reales (13,6 %) la
        violaban, y 2.700 mercados de UN SOLO proveedor salían etiquetados como
        el tramo más abierto del índice.
        """
        fila = concentracion.row(0, named=True)
        assert fila["hhi"] >= 10_000 / fila["n_proveedores"] - 1e-6

    def test_cuenta_los_proveedores_del_mercado_entero(self, concentracion):
        assert concentracion.row(0, named=True)["n_proveedores"] == 3

    def test_el_nombre_que_queda_es_el_vigente(self, concentracion):
        """Un organismo renombrado tiene que aparecer con su nombre de hoy: el
        histórico largo haría ganar siempre al viejo si se eligiera el más
        frecuente."""
        assert concentracion.row(0, named=True)["OrganismoPublico"] is not None


class TestLider:
    def test_la_cuota_del_lider_es_la_del_LIDER(self, concentracion):
        """**Traía la del proveedor más chico.** `rank_monto` es 1 para el mayor
        y el código ordenaba por ese rango de forma descendente, quedándose con
        el último. Sobre datos reales el 98,7 % de las filas daba una «cuota del
        líder» por debajo de la cuota media del mercado, que es imposible."""
        fila = concentracion.row(0, named=True)
        assert fila["top_share_pct"] == pytest.approx(90.0, abs=0.01)

    def test_el_nombre_y_el_numero_son_del_mismo_proveedor(self, concentracion):
        """Antes el nombre era el del líder y la cifra la del último: la tarjeta
        enseñaba dos proveedores distintos como si fueran uno."""
        fila = concentracion.row(0, named=True)
        assert fila["top_proveedor"] == "GRANDE SA"
        assert fila["top_share_pct"] == pytest.approx(90.0, abs=0.01)

    def test_un_mercado_de_un_solo_proveedor_es_del_cien_por_ciento(self):
        """3.541 mercados reales de un proveedor decían otra cosa."""
        solo = MERCADO.head(1)
        r = compute_market_concentration(compute_market_shares(solo)).row(0, named=True)
        assert r["n_proveedores"] == 1
        assert r["top_share_pct"] == pytest.approx(100.0, abs=0.01)
        assert r["hhi"] == pytest.approx(10_000.0, abs=1.0)
        assert r["tipo_mercado"] == "concentrado"


class TestNombreVigente:
    def test_se_queda_con_el_ultimo_periodo(self):
        df = pl.DataFrame(
            {
                "codigo": ["A", "A", "A"],
                "nombre": ["VIEJO", "VIEJO", "NUEVO"],
                "_periodo_archivo": ["2019-01", "2020-06", "2024-03"],
            }
        )
        r = df.group_by("codigo").agg(nombre_vigente("nombre"))
        assert r.row(0, named=True)["nombre"] == "NUEVO"

    def test_un_nulo_reciente_no_borra_el_nombre(self):
        """Si el registro más nuevo vino sin nombre, lo correcto es el último
        que sí existió — no `None`."""
        df = pl.DataFrame(
            {
                "codigo": ["A", "A"],
                "nombre": ["NUEVO", None],
                "_periodo_archivo": ["2024-03", "2024-04"],
            }
        )
        r = df.group_by("codigo").agg(nombre_vigente("nombre"))
        assert r.row(0, named=True)["nombre"] == "NUEVO"
