"""`get_descuento` devuelve los contextos con más licitaciones primero.

Era un `LIMIT 100` sin orden: sin filtros, cien filas cualesquiera de
`discount_by_context`, las que Postgres leyera primero. El frontend siempre
pide con rubro (`/mercado`, pestaña Descuentos y simulador), pero la API es
pública y sin rubro tiene que devolver algo con sentido.
"""

from __future__ import annotations

from app.services.bi import mercado
from tests.analytics_en_memoria import AnalyticsEnMemoria


def _contexto(rubro: str, rango: str, n: int) -> dict:
    return {
        "CodigoTipo": "1",
        "Rubro2": rubro,
        "n_oferentes_rango": rango,
        "n": n,
        "p50": 0.1,
    }


def test_sin_filtros_van_primero_los_contextos_con_mas_licitaciones(monkeypatch):
    datos = AnalyticsEnMemoria()
    filas = [_contexto(f"Rubro {i:03d}", "1", n=i) for i in range(150)]
    datos["discount_by_context.parquet"] = filas
    datos.instalar(monkeypatch, mercado)

    r = mercado.get_descuento()

    assert r["total"] == mercado.MAX_CONTEXTOS_DESCUENTO
    ns = [d["n"] for d in r["descuentos"]]
    assert ns == sorted(ns, reverse=True)
    assert ns[0] == 149 and ns[-1] == 150 - mercado.MAX_CONTEXTOS_DESCUENTO


def test_con_rubro_vienen_todos_sus_contextos(monkeypatch):
    datos = AnalyticsEnMemoria()
    datos["discount_by_context.parquet"] = [
        _contexto("Aseo", "1", 5),
        _contexto("Aseo", "2-3", 40),
        _contexto("Obras", "1", 99),
    ]
    datos.instalar(monkeypatch, mercado)

    r = mercado.get_descuento(rubro="Aseo")

    assert [d["n_oferentes_rango"] for d in r["descuentos"]] == ["2-3", "1"]
