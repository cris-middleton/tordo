"""El trato directo sale de las ÓRDENES, por orden y sin canceladas.

Se buscaba en la descarga de licitaciones (`CodigoTipo == "TD"`), que no trae
ninguno: la ficha pública de cada comprador decía «Trato directo: 0 %» y el
componente de transparencia de la nota valía el máximo para todos.
"""

from __future__ import annotations

import polars as pl
import pytest

from etl.analytics import data_loader, trato_directo


def _lineas(codigo: str, organismo: str, tipo: str, lineas: int = 1, estado: str = "Aceptada"):
    return [
        {"Codigo": codigo, "CodigoOrganismoPublico": organismo, "Tipo": tipo, "Estado": estado}
    ] * lineas


def test_cuenta_ordenes_y_no_lineas():
    df = pl.DataFrame(
        _lineas("1-TD", "7084", "TD", lineas=5)
        + _lineas("2-AG", "7084", "AG")
        + _lineas("3-SE", "7084", "SE")
        + _lineas("4-CM", "7084", "CM")
    )
    fila = trato_directo.combinar([trato_directo.contar(df)]).row(0, named=True)
    # Por líneas serían 5 de 8; son 1 de 4 órdenes.
    assert fila["n_ordenes"] == 4
    assert fila["n_trato_directo"] == 1
    assert fila["pct_trato_directo"] == pytest.approx(0.25)


def test_una_orden_cancelada_no_cuenta():
    df = pl.DataFrame(
        _lineas("1-TD", "7084", "TD", estado=data_loader.ESTADOS_CANCELADOS[0])
        + _lineas("2-AG", "7084", "AG")
    )
    fila = trato_directo.combinar([trato_directo.contar(df)]).row(0, named=True)
    assert (fila["n_ordenes"], fila["n_trato_directo"]) == (1, 0)


def test_suma_varios_archivos():
    a = pl.DataFrame(_lineas("1-TD", "7084", "TD") + _lineas("2-AG", "7084", "AG"))
    b = pl.DataFrame(_lineas("3-TD", "7084", "TD") + _lineas("4-SE", "999", "SE"))
    tabla = trato_directo.combinar([trato_directo.contar(a), trato_directo.contar(b)])
    por_org = {f["CodigoOrganismoPublico"]: f for f in tabla.iter_rows(named=True)}
    assert por_org["7084"]["pct_trato_directo"] == pytest.approx(2 / 3)
    assert por_org["999"]["pct_trato_directo"] == 0


def test_sin_archivos_no_revienta():
    assert trato_directo.combinar([]).is_empty()
