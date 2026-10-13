"""La existencia de una tabla de analytics se cachea sólo cuando es un sí.

En el lanzamiento la API arrancó antes de la primera corrida semanal: con
`lru_cache` guardó «no existe» para cada tabla y el sitemap siguió vacío con
los datos ya materializados, hasta reiniciarla. Sin base: la consulta se
sustituye por un contador.
"""

from __future__ import annotations

import pytest

from app.repositories import analytics_sync as repo


@pytest.fixture
def consultas(monkeypatch):
    estado = {"existe": False, "n": 0}

    def falsa(tabla: str) -> bool:
        estado["n"] += 1
        return estado["existe"]

    monkeypatch.setattr(repo, "_consultar_existencia", falsa)
    repo.invalidar_cache_existencia()
    yield estado
    repo.invalidar_cache_existencia()


def test_el_no_se_vuelve_a_preguntar(consultas):
    assert repo.existe_tabla("buyer_scores") is False
    consultas["existe"] = True  # corrió la semanal
    assert repo.existe_tabla("buyer_scores") is True


def test_el_si_se_cachea(consultas):
    consultas["existe"] = True
    assert repo.existe_tabla("buyer_scores") is True
    assert repo.existe_tabla("buyer_scores") is True
    assert consultas["n"] == 1


def test_sin_cache_vuelve_a_preguntar(consultas):
    consultas["existe"] = True
    repo.existe_tabla("buyer_scores")
    repo.existe_tabla("buyer_scores", usar_cache=False)
    assert consultas["n"] == 2
