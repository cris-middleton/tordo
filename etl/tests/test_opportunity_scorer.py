"""El score de oportunidad: qué vale un componente cuando no hay dato.

Es el número que ordena «Dónde mirar primero», así que un mercado que sube por
falta de información desplaza a uno que subió por mérito.
"""

from __future__ import annotations

import polars as pl
import pytest

from etl.analytics.opportunity_scorer import NEUTRO_POR_COMPONENTE, _exigir_clave_unica


class TestNeutrosPorComponente:
    def test_la_tendencia_desconocida_vale_crecimiento_cero(self):
        """**Valía 0,5, y ese componente vive en [-0,5; 1,0].**

        `score_tendencia_raw` es `cagr × r²`; sobre los datos reales su mediana
        entre los mercados que SÍ tienen histórico es 0,0008. Rellenar con 0,5
        dejaba a un mercado sin datos en el percentil 98,5 de crecimiento:
        4.078 mercados (1,7 %) entraban al ranking como si estuvieran entre los
        que más crecen, precisamente por no tener con qué medirlos.
        """
        assert NEUTRO_POR_COMPONENTE["score_tendencia_raw"] == 0.0

    def test_los_componentes_acotados_a_cero_uno_siguen_en_el_medio(self):
        """Para precio y competencia 0,5 sí es el punto medio de su escala. El
        error no fue el valor: fue usar el mismo para todas."""
        assert NEUTRO_POR_COMPONENTE["score_precio_raw"] == 0.5
        assert NEUTRO_POR_COMPONENTE["score_competencia_raw"] == 0.5

    def test_hay_un_neutro_declarado_para_cada_componente(self):
        """Trinquete: un componente nuevo sin neutro volvería al 0,5 implícito."""
        assert set(NEUTRO_POR_COMPONENTE) == {
            "score_precio_raw",
            "score_competencia_raw",
            "score_estacionalidad_raw",
            "score_tendencia_raw",
        }


class TestClaveUnica:
    """El join de oportunidad exige *(organismo, rubro)* única en cada tabla.

    No lo era: con el nombre del comprador dentro de la clave de agregación, un
    organismo con cuatro grafías daba cuatro filas por mercado en cada tabla y
    el join las cruzaba. El resultado real tenía 237.946 filas para 148.966
    mercados — el mismo mercado repetido hasta dieciséis veces en la lista, y la
    normalización min-max calculada sobre esa población inflada.
    """

    def _tabla(self, filas):
        return pl.DataFrame([{"CodigoOrganismoPublico": c, "RubroN2": r} for c, r in filas])

    def test_pasa_cuando_la_clave_es_unica(self):
        _exigir_clave_unica({"t": self._tabla([("A", "X"), ("A", "Y"), ("B", "X")])})

    def test_falla_y_dice_cuántas_filas_sobran(self):
        with pytest.raises(ValueError, match="1 filas con"):
            _exigir_clave_unica({"market_concentration": self._tabla([("A", "X"), ("A", "X")])})

    def test_nombra_la_tabla_culpable(self):
        with pytest.raises(ValueError, match="market_concentration"):
            _exigir_clave_unica({"market_concentration": self._tabla([("A", "X"), ("A", "X")])})

    def test_una_tabla_sin_esas_columnas_no_se_comprueba(self):
        """`seasonality_patterns` llega ya agrupada por otra clave; exigirle
        estas columnas sería inventar un requisito que no tiene."""
        _exigir_clave_unica({"otra": pl.DataFrame({"algo": [1, 1]})})
