"""compra_agil_mensual: publicadas (acumuladas) y adjudicadas por comprador y mes."""

from datetime import date

import polars as pl

from etl.analytics import compra_agil_mensual as cam


def _ordenes(*filas):
    return pl.DataFrame(
        [
            dict(
                zip(
                    [
                        "Codigo",
                        "CodigoOrganismoPublico",
                        "RutUnidadCompra",
                        "FechaCreacion",
                        "EsCompraAgil",
                        "Estado",
                    ],
                    f,
                    strict=True,
                )
            )
            for f in filas
        ]
    )


ARCHIVO_MARZO = _ordenes(
    ("1-1-AG26", "7084", "61.608.700-2", "2026-03-02", "Si", "Aceptada"),
    ("1-2-AG26", "7084", "61.608.700-2", "2026-03-20", "Si", "Recepcion Conforme"),
    ("1-3-AG26", "7084", "61.608.700-2", "2026-03-21", "Si", "Cancelacion solicitada"),
    ("1-4-SE26", "7084", "61.608.700-2", "2026-03-21", "No", "Aceptada"),
    ("2-1-AG26", "115167", "69.255.600-3", "2026-02-27", "Si", "Aceptada"),
    # La misma orden en dos líneas: cuenta una vez.
    ("2-2-AG26", "115167", "69.255.600-3", "2026-03-05", "Si", "Aceptada"),
    ("2-2-AG26", "115167", "69.255.600-3", "2026-03-05", "Si", "Aceptada"),
)
# El archivo de abril repite una orden de marzo: tampoco cuenta dos veces.
ARCHIVO_ABRIL = _ordenes(("1-1-AG26", "7084", "61.608.700-2", "2026-03-02", "Si", "Aceptada"))


def _tabla(df):
    return {
        (r["CodigoOrganismoPublico"], r["mes"]): (r["publicadas"], r["adjudicadas"])
        for r in df.to_dicts()
    }


def _publicadas(*filas):
    return pl.DataFrame(
        list(filas), schema={"rut": pl.Utf8, "mes": pl.Date, "n": pl.Int64}, orient="row"
    )


def test_adjudicadas_cuenta_ordenes_vigentes_de_compra_agil(tmp_path):
    tabla = cam.run_compra_agil_mensual(
        tmp_path, frames=[ARCHIVO_MARZO, ARCHIVO_ABRIL], publicadas=_publicadas()
    )
    assert _tabla(tabla) == {
        ("7084", date(2026, 3, 1)): (None, 2),  # sin la cancelada ni la que no es AG
        ("115167", date(2026, 2, 1)): (None, 1),
        ("115167", date(2026, 3, 1)): (None, 1),
    }


def test_publicadas_se_traducen_de_rut_a_codigo(tmp_path):
    tabla = cam.run_compra_agil_mensual(
        tmp_path,
        frames=[ARCHIVO_MARZO],
        publicadas=_publicadas(
            ("616087002", date(2026, 3, 1), 10),
            ("692556003", date(2026, 3, 1), 4),
            # Un comprador sin órdenes de Compra Ágil: se cuenta igual, sin código.
            ("999999999", date(2026, 3, 1), 7),
        ),
    )
    t = _tabla(tabla)
    assert t[("7084", date(2026, 3, 1))] == (10, 2)
    assert t[("115167", date(2026, 3, 1))] == (4, 1)
    assert t[(None, date(2026, 3, 1))] == (7, None)


def test_publicadas_se_acumulan_semana_a_semana(tmp_path):
    """Postgres guarda 30 días: lo ya contado no se pierde al purgarse."""
    cam.run_compra_agil_mensual(
        tmp_path,
        frames=[ARCHIVO_MARZO],
        publicadas=_publicadas(
            ("616087002", date(2026, 2, 1), 30), ("616087002", date(2026, 3, 1), 10)
        ),
    )
    # Una semana después: febrero ya no está en Postgres y marzo está a medio purgar.
    tabla = cam.run_compra_agil_mensual(
        tmp_path,
        frames=[ARCHIVO_MARZO],
        publicadas=_publicadas(
            ("616087002", date(2026, 3, 1), 6), ("616087002", date(2026, 4, 1), 3)
        ),
    )
    t = _tabla(tabla)
    assert t[("7084", date(2026, 2, 1))][0] == 30
    assert t[("7084", date(2026, 3, 1))] == (10, 2)
    assert t[("7084", date(2026, 4, 1))] == (3, None)


def test_sin_nada_sale_una_tabla_vacia_con_su_esquema(tmp_path):
    tabla = cam.run_compra_agil_mensual(tmp_path, frames=[], publicadas=_publicadas())
    assert tabla.schema == cam.ESQUEMA
    assert (tmp_path / cam.SALIDA).exists()
