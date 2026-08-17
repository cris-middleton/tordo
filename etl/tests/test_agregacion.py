"""Contar entidades distintas cuando el dato llega mes a mes.

El error que fija esto: `n_unique()` por tanda combinado con `max()` no cuenta
la unión de los conjuntos, sino el tamaño del mayor. Con diecinueve años de
histórico eso reporta «el mes más movido», no «la historia».

Se veía en la pantalla de BI: `sector_dashboard` declaraba **49.116 proveedores**
sumando todos los sectores, contra **313.129** distintos en el histórico. Y
pasaba desapercibido porque `n_organismos` sí salía casi bien (1.155 contra
1.186) — los mismos compradores compran todos los meses, así que ahí el máximo
se acerca al total. El número plausible tapaba al que no lo era.
"""

from __future__ import annotations

import polars as pl

from etl.analytics.agregacion import ContadorDistintos


def _tanda(pares: list[tuple[str, str]]) -> pl.DataFrame:
    return pl.DataFrame({"sector": [p[0] for p in pares], "CodigoProveedor": [p[1] for p in pares]})


class TestContadorDistintos:
    def test_une_los_conjuntos_de_varias_tandas(self):
        """El caso exacto del bug: tres en enero y OTROS tres en febrero son
        seis, no tres."""
        c = ContadorDistintos("sector", "CodigoProveedor")
        c.añadir(_tanda([("Salud", "A"), ("Salud", "B"), ("Salud", "C")]))
        c.añadir(_tanda([("Salud", "D"), ("Salud", "E"), ("Salud", "F")]))
        assert c.conteos("n")["n"].to_list() == [6]

    def test_no_cuenta_dos_veces_al_que_repite(self):
        c = ContadorDistintos("sector", "CodigoProveedor")
        c.añadir(_tanda([("Salud", "A"), ("Salud", "B")]))
        c.añadir(_tanda([("Salud", "A"), ("Salud", "B")]))
        assert c.conteos("n")["n"].to_list() == [2]

    def test_el_maximo_por_tanda_habria_dado_el_numero_viejo(self):
        """Deja escrito por qué el número anterior era un techo: con estas dos
        tandas, `max(3, 3)` da 3 y la respuesta correcta es 6."""
        c = ContadorDistintos("sector", "CodigoProveedor")
        tandas = [
            _tanda([("Salud", "A"), ("Salud", "B"), ("Salud", "C")]),
            _tanda([("Salud", "D"), ("Salud", "E"), ("Salud", "F")]),
        ]
        for t in tandas:
            c.añadir(t)
        maximo_por_tanda = max(t["CodigoProveedor"].n_unique() for t in tandas)
        assert maximo_por_tanda == 3
        assert c.conteos("n")["n"].to_list() == [6]

    def test_separa_por_grupo(self):
        c = ContadorDistintos("sector", "CodigoProveedor")
        c.añadir(_tanda([("Salud", "A"), ("Municipal", "A"), ("Municipal", "B")]))
        r = c.conteos("n").sort("sector")
        assert r.to_dicts() == [
            {"sector": "Municipal", "n": 2},
            {"sector": "Salud", "n": 1},
        ]

    def test_ignora_los_nulos(self):
        """Un proveedor sin código no es un proveedor más."""
        c = ContadorDistintos("sector", "CodigoProveedor")
        c.añadir(pl.DataFrame({"sector": ["Salud", "Salud"], "CodigoProveedor": ["A", None]}))
        assert c.conteos("n")["n"].to_list() == [1]

    def test_una_tanda_sin_las_columnas_se_salta(self):
        """Los parquets viejos de ChileCompra no traen todas las columnas."""
        c = ContadorDistintos("sector", "CodigoProveedor")
        c.añadir(pl.DataFrame({"otra_cosa": [1, 2]}))
        c.añadir(_tanda([("Salud", "A")]))
        assert c.conteos("n")["n"].to_list() == [1]

    def test_sin_ninguna_tanda_no_inventa_filas(self):
        c = ContadorDistintos("sector", "CodigoProveedor")
        assert c.conteos("n").is_empty()

    def test_admite_una_clave_compuesta(self):
        c = ContadorDistintos(["sector", "region"], "CodigoProveedor")
        c.añadir(
            pl.DataFrame(
                {
                    "sector": ["Salud", "Salud"],
                    "region": ["RM", "V"],
                    "CodigoProveedor": ["A", "A"],
                }
            )
        )
        assert sorted(c.conteos("n")["n"].to_list()) == [1, 1]
