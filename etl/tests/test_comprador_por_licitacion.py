"""Las métricas de licitación del comprador: una licitación, un voto; un código, una fila.

El archivo de licitaciones trae una fila por (línea, oferta). `buyer_scoring`
contaba filas: una licitación grande adjudicada con diez líneas pesaba diez
veces lo que una desierta de una línea. Y `competitor_predictor` y
`buyer_transparency` metían el nombre del organismo en la clave (`identidad.py`).
"""

from __future__ import annotations

import polars as pl
import pytest

from etl.analytics import buyer_scoring, buyer_transparency, competitor_predictor, data_loader


def _filas(codigo, estado, lineas, oferentes, tipo="LE", nombre="HOSPITAL", periodo="2026-3"):
    return [
        {
            "CodigoExterno": codigo,
            "CodigoOrganismo": "7084",
            "NombreOrganismo": nombre,
            "Estado": estado,
            "NumeroOferentes": str(oferentes),
            "CantidadReclamos": "0",
            "CodigoTipo": tipo,
            "FechaCreacion": "2026-03-02",
            "_periodo_archivo": periodo,
        }
        for _ in range(lineas)
    ]


@pytest.fixture
def licitaciones(tmp_path, monkeypatch):
    lic = tmp_path / "lic"
    lic.mkdir()
    pl.DataFrame(
        _filas("GRANDE-LP26", "Adjudicada", lineas=10, oferentes=8)
        + _filas("CHICA1-LE26", "Desierta (o art. 3 ó 9 Ley 19.886)", lineas=1, oferentes=1)
        + _filas("CHICA2-LE26", "Revocada", lineas=1, oferentes=2, tipo="TD")
    ).write_parquet(lic / "2026-3.parquet")
    # La grande aparece también en el archivo siguiente: cuenta una vez.
    pl.DataFrame(
        _filas("GRANDE-LP26", "Adjudicada", 10, 8, nombre="HOSPITAL NUEVO", periodo="2026-4")
    ).write_parquet(lic / "2026-4.parquet")
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", lic)
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", tmp_path / "oc")
    return lic


def test_cada_licitacion_cuenta_una_vez(licitaciones):
    fila = buyer_scoring.build_lic_buyer_metrics().row(0, named=True)
    assert fila["n_lic"] == 3
    # Por filas: 10 / (10 + 1 + 1) = 0,83. Por licitaciones: 1 de 3.
    assert fila["tasa_adjudicacion"] == pytest.approx(1 / 3)
    # Por filas: (10·8 + 1 + 2) / 12 = 6,9. Por licitaciones: (8 + 1 + 2) / 3.
    assert fila["prom_oferentes"] == pytest.approx(11 / 3)
    # El trato directo ya no sale de aquí: no hay ninguno en la descarga de
    # licitaciones (`test_trato_directo.py`).
    assert "pct_trato_directo" not in fila
    assert fila["NombreOrganismo"] == "HOSPITAL"


def test_un_organismo_renombrado_es_un_solo_contexto_de_competencia():
    lics = pl.DataFrame(
        {
            "CodigoExterno": [f"L{i}" for i in range(8)],
            "CodigoOrganismo": ["7084"] * 8,
            "NombreOrganismo": ["GOBERNACION"] * 4 + ["DELEGACION"] * 4,
            "Rubro2": ["Vigilancia"] * 8,
            "CodigoTipo": ["LE"] * 8,
            "n_ofer": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
            "_periodo_archivo": ["2025-9"] * 4 + ["2025-12"] * 4,
        }
    )
    l1 = competitor_predictor.compute_competitor_forecast(lics)["l1"]
    # Con el nombre en la clave eran dos contextos de 4, bajo el mínimo de 5: ninguno.
    assert l1.height == 1
    fila = l1.row(0, named=True)
    assert fila["n"] == 8
    assert fila["NombreOrganismo"] == "DELEGACION"
    assert l1.columns[:4] == ["CodigoOrganismo", "NombreOrganismo", "Rubro2", "CodigoTipo"]


def test_la_transparencia_de_un_organismo_renombrado_es_una_fila(tmp_path, monkeypatch):
    lic = tmp_path / "lic"
    lic.mkdir()
    for periodo, nombre, sector in (
        ("2025-9", "GOBERNACION PROVINCIAL", "Gobierno"),
        ("2025-12", "DELEGACION PRESIDENCIAL", "Gob. Central"),
    ):
        filas = [
            _filas(f"{periodo}-{i}", "Adjudicada", 1, 3, nombre=nombre, periodo=periodo)[0]
            for i in range(12)
        ]
        pl.DataFrame(
            [{**f, "sector": sector, "CodigoProveedor": f"P{i % 3}"} for i, f in enumerate(filas)]
        ).write_parquet(lic / f"{periodo}.parquet")
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", lic)
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", tmp_path / "oc")

    tabla = buyer_transparency.build_transparency_metrics()
    # Con nombre y sector en la clave: dos filas de 12, bajo el mínimo de 20.
    assert tabla.height == 1
    fila = tabla.row(0, named=True)
    assert fila["n_lic_total"] == 24
    assert fila["NombreOrganismo"] == "DELEGACION PRESIDENCIAL"
    assert fila["sector"] == "Gob. Central"
    assert tabla.columns[:3] == ["CodigoOrganismo", "NombreOrganismo", "sector"]


def test_la_concentracion_de_ganadores_mira_a_los_ganadores(tmp_path, monkeypatch):
    """El archivo trae una fila por (línea, oferta): la primera es de un oferente
    cualquiera. El HHI de ganadores sale de la oferta seleccionada."""
    lic = tmp_path / "lic"
    lic.mkdir()
    filas = []
    for i in range(20):
        base = _filas(f"L{i}", "Adjudicada", 1, 2)[0]
        # Primero la oferta perdedora, siempre del mismo proveedor…
        filas.append(
            {**base, "CodigoProveedor": "PERDEDOR", "Oferta seleccionada": "No Seleccionada"}
        )
        # …y la ganadora, repartida entre cuatro.
        filas.append(
            {**base, "CodigoProveedor": f"G{i % 4}", "Oferta seleccionada": "Seleccionada"}
        )
    pl.DataFrame([{**f, "sector": "Salud"} for f in filas]).write_parquet(lic / "2026-3.parquet")
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", lic)
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", tmp_path / "oc")

    fila = buyer_transparency.build_transparency_metrics().row(0, named=True)
    assert fila["n_adjudicadas"] == 20
    assert fila["hhi"] == pytest.approx(0.25)
