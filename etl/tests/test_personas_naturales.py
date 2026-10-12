"""Personas naturales: la regla, el enmascarado y el recorrido de toda salida.

El último test es el del Foco de revisión nº 3 del pivote: una persona natural
conocida atraviesa el pipeline entero y se la busca en CADA parquet de salida y
en los artefactos TF-IDF. Ninguna coincidencia.
"""

import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import polars as pl
import pytest

from etl.analytics import data_loader, personas
from etl.analytics.personas import NOMBRE_ENMASCARADO

RAIZ = Path(__file__).resolve().parents[2]

# ── La regla ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("texto", "numero"),
    [
        ("12.708.987-6", 12708987),
        ("76.053.846-9", 76053846),
        ("77563796-K", 77563796),
        (" 9.876.543-2 ", 9876543),
        ("NA", None),
        ("", None),
        (None, None),
    ],
)
def test_rut_numero(texto, numero):
    assert personas.rut_numero(texto) == numero


@pytest.mark.parametrize(
    ("rut", "persona"),
    [
        (12_708_987, True),
        (49_999_999, True),
        (50_000_000, False),
        (76_053_846, False),
        (None, True),
    ],
)
def test_es_persona_natural(rut, persona):
    assert personas.es_persona_natural(rut) is persona


def test_la_expresion_y_la_funcion_escalar_dicen_lo_mismo():
    """El catálogo usa la escalar y analytics la expresión: no pueden discrepar."""
    textos = ["12.708.987-6", "76.053.846-9", "49.999.999-9", "50.000.000-0", "NA", "", None]
    df = pl.DataFrame({"RutSucursal": textos}).with_columns(
        personas.numero_rut("RutSucursal").alias("n")
    )
    for texto, n in zip(textos, df["n"].to_list(), strict=True):
        assert n == personas.rut_numero(texto)


def test_clasificar():
    pares = pl.DataFrame(
        {
            "CodigoProveedor": ["persona", "empresa", "sin_rut", "mixto", "mixto"],
            "rut": [12_708_987, 76_053_846, None, 76_000_000, 9_000_000],
        }
    )
    assert personas.clasificar(pares) == {"persona", "sin_rut", "mixto"}


# ── El enmascarado ───────────────────────────────────────────────────────────

PERSONA = {
    "CodigoProveedor": "918273645",
    "NombreProveedor": "RAÚL MAURICIO HERNÁNDEZ CÁRCAMO",
    "RutSucursal": "12.708.987-6",
    "CodigoSucursal": "1099883",
    "Sucursal": "Raul Hernandez Seguridad",
    "EspecificacionProveedor": "Servicio prestado por RAUL HERNANDEZ",
    "EspecificacionComprador": "Honorarios raul hernandez carcamo, guardia nocturno",
}
EMPRESA = {
    "CodigoProveedor": "192955",
    "NombreProveedor": "Crecer SpA",
    "RutSucursal": "76.473.150-6",
    "CodigoSucursal": "196913",
    "Sucursal": "Crecer SpA",
    "EspecificacionProveedor": "Valor mensual neto",
    "EspecificacionComprador": "Arriendo de bodega Crecer",
}


def _frame(*filas):
    return pl.DataFrame(list(filas))


def test_la_persona_natural_queda_tapada_y_la_empresa_no():
    df = _frame(PERSONA, EMPRESA)
    fuera = personas.enmascarar(df, frozenset({PERSONA["CodigoProveedor"]}))
    persona, empresa = fuera.row(0, named=True), fuera.row(1, named=True)

    assert persona["NombreProveedor"] == NOMBRE_ENMASCARADO
    assert persona["Sucursal"] == NOMBRE_ENMASCARADO
    assert persona["CodigoProveedor"].startswith("PN-")
    assert persona["RutSucursal"] is None
    assert persona["CodigoSucursal"] is None
    assert persona["EspecificacionProveedor"] is None
    # Su nombre sale del texto del comprador, también sin tildes y en minúscula;
    # lo que no es su nombre se queda.
    assert persona["EspecificacionComprador"] == "Honorarios , guardia nocturno"

    assert empresa == EMPRESA


def test_el_rut_de_la_fila_basta_aunque_el_codigo_no_este_clasificado():
    fuera = personas.enmascarar(_frame(PERSONA), frozenset())
    assert fuera["NombreProveedor"][0] == NOMBRE_ENMASCARADO


def test_cada_persona_conserva_su_propio_seudonimo():
    """Si colapsaran en un código, competitors_by_market las sumaría en una."""
    otra = {**PERSONA, "CodigoProveedor": "555444333", "RutSucursal": "9.876.543-2"}
    codigos = frozenset({PERSONA["CodigoProveedor"], otra["CodigoProveedor"]})
    fuera = personas.enmascarar(_frame(PERSONA, otra, PERSONA), codigos, sal=b"s")
    assert fuera["CodigoProveedor"].n_unique() == 2
    assert fuera["CodigoProveedor"][0] == fuera["CodigoProveedor"][2]


def test_el_seudonimo_depende_de_la_sal():
    assert personas.seudonimo("918273645", b"a") != personas.seudonimo("918273645", b"b")
    assert personas.seudonimo("918273645", b"a") == personas.seudonimo("918273645", b"a")


def test_funciona_igual_en_lazy():
    codigos = frozenset({PERSONA["CodigoProveedor"]})
    ansioso = personas.enmascarar(_frame(PERSONA, EMPRESA), codigos, sal=b"s")
    perezoso = personas.enmascarar(_frame(PERSONA, EMPRESA).lazy(), codigos, sal=b"s").collect()
    assert ansioso.equals(perezoso)


@pytest.mark.parametrize(
    ("texto", "nombre", "esperado"),
    [
        ("Pago a JOSÉ PÉREZ por servicio", "Jose Perez", "Pago a por servicio"),
        ("Compra de pan", "Jose Perez", "Compra de pan"),
        ("Taller de Juan", "DE LA JUAN", "Taller de"),  # «DE», «LA» no se borran
        (None, "Jose Perez", None),
        ("algo", None, "algo"),
    ],
)
def test_borrar_nombre(texto, nombre, esperado):
    assert personas.borrar_nombre(texto, nombre) == esperado


# ── El cargador: único camino hacia los consolidados ────────────────────────


def test_el_cargador_entrega_los_datos_ya_tapados(tmp_path, monkeypatch):
    oc = tmp_path / "oc"
    oc.mkdir()
    _frame(PERSONA, EMPRESA).with_columns(
        pl.lit("2026-03-01").alias("FechaCreacion")
    ).write_parquet(oc / "2026-3.parquet")
    monkeypatch.setattr(data_loader, "OC_PARQUET_DIR", oc)
    monkeypatch.setattr(data_loader, "LIC_PARQUET_DIR", tmp_path / "lic")

    # Un módulo que sólo pide el nombre recibe sólo el nombre — ya tapado.
    ((_, df),) = list(data_loader.iter_oc_parquets(columns=["NombreProveedor"]))
    assert df.columns == ["NombreProveedor"]
    assert df["NombreProveedor"].to_list() == [NOMBRE_ENMASCARADO, "Crecer SpA"]

    lazy = data_loader.scan_oc(columns=["CodigoProveedor", "FechaCreacion"]).collect()
    assert PERSONA["CodigoProveedor"] not in lazy["CodigoProveedor"].to_list()


# ── Foco nº 3: toda salida, recorrida ────────────────────────────────────────
#
# Un mercado sintético donde la persona natural es la proveedora DOMINANTE de
# su rubro —para que salga como `top_proveedor`— y su nombre aparece también en
# el texto libre del comprador y en el título de una licitación.

NOMBRE = "RAÚL MAURICIO HERNÁNDEZ CÁRCAMO"
CODIGO = "918273645"
RUT = "12.708.987-6"
CODIGO_SUCURSAL = "8877665"
# Lo que se busca: el nombre en palabras sueltas (sin tildes ni mayúsculas) y
# cada identificador.
AGUJAS_TEXTO = ("hernandez", "carcamo", "mauricio")
AGUJAS_ID = (CODIGO, RUT, "12708987", CODIGO_SUCURSAL)

PROVEEDORES = [
    # código, nombre, RUT, peso
    (CODIGO, NOMBRE, RUT, 6),
    ("192955", "CRECER SPA", "76.473.150-6", 2),
    ("1080396", "LABORATORIO LABEE CHILE LIMITADA", "76.053.846-9", 2),
    ("1836704", "ECOFOSA SPA", "77.563.796-K", 1),
    ("1237333", "MEDCORP S.A.", "76.131.542-0", 1),
    # Más empresas: TF-IDF exige que un término aparezca en 5 proveedores o más.
    *[(f"30000{i:02d}", f"EMPRESA SINTETICA {i} SPA", f"77.{100 + i}.000-1", 1) for i in range(12)],
]
ORGANISMOS = [("7084", "HOSPITAL DEL SALVADOR"), ("115167", "I MUNICIPALIDAD DE VITACURA")]
RUBROS = [
    ("Servicios de seguridad", "Vigilancia", "46171600", "Servicio de guardia"),
    ("Suministros de oficina", "Papelería", "44121700", "Lápices de pasta"),
]


#: Variantes del producto: TF-IDF descarta a un proveedor con menos de 20
#: caracteres de texto.
#:
#: Cada proveedor ve SÓLO 3 de las 6 (las suyas, fijas), así que cada palabra
#: aparece en ~la mitad de los proveedores: dentro de [min_df=5, max_df=80 %].
#: Rotarlas todas para todos hacía que cada palabra estuviera en todos, TF-IDF
#: las podaba y sólo quedaban bigramas que cruzan productos — y ésos dependen del
#: orden de un `set`, que cambia en cada proceso. El test fallaba una de cada pocas.
VARIANTES = [
    "nocturno perimetral bodega central",
    "diurno acceso principal recepcion",
    "fin semana estacionamiento subterraneo",
    "eventos masivos control credenciales",
    "monitoreo camaras circuito cerrado",
    "ronda patrullaje sector norte",
]


def _ordenes(anio: int, mes: int) -> pl.DataFrame:
    filas = []
    n = 0
    for org_cod, org_nom in ORGANISMOS:
        for rubro1, rubro2, onu, producto in RUBROS:
            for indice, (codigo, nombre, rut, peso) in enumerate(PROVEEDORES):
                for k in range(peso):
                    n += 1
                    es_persona = codigo == CODIGO
                    espec = (
                        f"Honorarios {nombre.lower()} turno {k}"
                        if es_persona
                        else f"{producto} modelo estandar"
                    )
                    monto = 100_000 * (k + 1) + 7_000 * n
                    filas.append(
                        {
                            "ID": f"{anio}{mes:02d}{n}",
                            "Codigo": f"{org_cod}-{n}-SE{anio % 100}",
                            "Nombre": f"OC {producto} {nombre if es_persona else ''}".strip(),
                            "Descripcion/Obervaciones": f"Contratación {nombre}"
                            if es_persona
                            else "Compra",
                            "Tipo": "SE",
                            # Una orden de cada proveedor es Compra Ágil: la persona
                            # natural también gana en `compra_agil_comprador`.
                            "EsCompraAgil": "Si" if k == 0 else "No",
                            "CodigoTipo": "8",
                            "Estado": "Aceptada",
                            "FechaCreacion": date(anio, mes, 1 + k % 27).isoformat(),
                            "FechaEnvio": date(anio, mes, 1 + k % 27).isoformat(),
                            "FechaAceptacion": date(anio, mes, 2 + k % 26).isoformat(),
                            "MontoTotalOC": str(monto),
                            "TipoMonedaOC": "CLP",
                            "MontoTotalOC_PesosChilenos": str(monto),
                            "TotalNetoOC": str(monto),
                            "CodigoUnidadCompra": "1",
                            "CodigoOrganismoPublico": org_cod,
                            "RutUnidadCompra": f"61.{org_cod[:3]}.000-1",
                            "OrganismoPublico": org_nom,
                            "sector": "Salud",
                            "RegionUnidadCompra": "Región Metropolitana de Santiago",
                            "CodigoSucursal": CODIGO_SUCURSAL if es_persona else "196913",
                            "RutSucursal": rut,
                            "Sucursal": nombre,
                            "CodigoProveedor": codigo,
                            "NombreProveedor": nombre,
                            "CodigoLicitacion": "NA",
                            "codigoCategoria": onu[:6] + "00",
                            "Categoria": f"{rubro1} / {rubro2} / {producto}",
                            "codigoProductoONU": onu,
                            "NombreroductoGenerico": f"{producto} {VARIANTES[(indice + mes % 3) % len(VARIANTES)]}",
                            "RubroN1": rubro1,
                            "RubroN2": rubro2,
                            "RubroN3": producto,
                            "EspecificacionComprador": espec,
                            "EspecificacionProveedor": f"Atiende {nombre}",
                            "cantidad": "10",
                            "UnidadMedida": "Unidad",
                            "precioNeto": str(monto / 10).replace(".", ","),
                            "totalLineaNeto": str(monto),
                            "_periodo_archivo": f"{anio}-{mes}",
                        }
                    )
    return pl.DataFrame(filas)


def _licitaciones(anio: int, mes: int) -> pl.DataFrame:
    filas = []
    for i, (codigo, nombre, rut, _peso) in enumerate(PROVEEDORES):
        for org_cod, org_nom in ORGANISMOS:
            es_persona = codigo == CODIGO
            filas.append(
                {
                    "CodigoExterno": f"{org_cod}-{i}{mes}-LE{anio % 100}",
                    "Nombre": f"Servicio de guardia {nombre}" if es_persona else "Servicio de aseo",
                    "Descripcion": f"Adjudicado a {nombre}" if es_persona else "Aseo",
                    "CodigoEstado": "8",
                    "Estado": "Adjudicada",
                    "CodigoOrganismo": org_cod,
                    "NombreOrganismo": org_nom,
                    "sector": "Salud",
                    "RegionUnidad": "Región Metropolitana de Santiago",
                    "CodigoTipo": "LE",
                    "Tipo": "LE",
                    "FechaCreacion": date(anio, mes, 1).isoformat(),
                    "FechaCierre": date(anio, mes, 15).isoformat(),
                    "FechaAdjudicacion": date(anio, mes, 25).isoformat(),
                    "MontoEstimado": "1000000",
                    "CodigoMoneda": "CLP",
                    "NumeroOferentes": str(2 + i),
                    "CodigoProductoONU": "46171600",
                    "Rubro1": "Servicios de seguridad",
                    "Rubro2": "Vigilancia",
                    "Rubro3": "Servicio de guardia",
                    "Nombre producto genrico": "Servicio de guardia",
                    "CodigoProveedor": codigo,
                    "RutProveedor": rut,
                    "NombreProveedor": nombre,
                    "MontoLineaAdjudica": "900000",
                    "Oferta seleccionada": "Seleccionada",
                    "_periodo_archivo": f"{anio}-{mes}",
                }
            )
    return pl.DataFrame(filas)


def _textos_de_parquet(ruta: Path) -> list[str]:
    df = pl.read_parquet(ruta)
    textos = []
    for columna in df.columns:
        serie = df[columna]
        if serie.dtype in (pl.List, pl.Struct) or isinstance(serie.dtype, (pl.List, pl.Struct)):
            serie = serie.cast(pl.Utf8, strict=False)
        textos.extend(str(v) for v in serie.drop_nulls().cast(pl.Utf8, strict=False).to_list())
    textos.extend(df.columns)
    return textos


@pytest.fixture(scope="module")
def salida(tmp_path_factory) -> Path:
    datos = tmp_path_factory.mktemp("datos")
    oc = datos / "consolidated" / "oc"
    lic = datos / "consolidated" / "lic"
    oc.mkdir(parents=True)
    lic.mkdir(parents=True)
    meses = [(2024 + (m - 1) // 12, (m - 1) % 12 + 1) for m in range(1, 25)]
    for anio, mes in meses:
        _ordenes(anio, mes).write_parquet(oc / f"{anio}-{mes}.parquet")
        _licitaciones(anio, mes).write_parquet(lic / f"{anio}-{mes}.parquet")

    # En otro proceso, como corre de verdad: los módulos leen la ruta al importarse.
    # TF-IDF ya no está en la corrida semanal, pero sigue entrenándose a mano
    # (`--modulo tfidf`, modelo del harness): sus artefactos también se revisan.
    for argumentos in ([], ["--modulo", "tfidf"]):
        resultado = subprocess.run(
            [sys.executable, "-m", "etl.analytics.run_all", *argumentos],
            cwd=RAIZ,
            env={**os.environ, "ETL_DATA_DIR": str(datos)},
            capture_output=True,
            text=True,
            timeout=900,
        )
        assert resultado.returncode == 0, resultado.stderr[-3000:]
    return datos / "analytics"


#: Las salidas que DEBEN existir: son las que llevan proveedores. Si una no se
#: generara, buscar en ella no probaría nada.
SALIDAS_CON_PROVEEDOR = (
    "competitors_by_market.parquet",
    "market_concentration.parquet",
    "provider_profiles.parquet",
    "provider_diversification.parquet",
    "tfidf_corpus.parquet",
    "tfidf_provider_index.parquet",
    "product_price_bands_L0.parquet",
    # Sólo conteos de proveedores, pero la persona gana órdenes de Compra Ágil.
    "compra_agil_comprador.parquet",
    "comprador_rut.parquet",
)


def test_las_salidas_con_proveedor_existen_y_la_persona_esta_seudonimizada(salida):
    log = salida / "analytics.log"
    errores = [
        linea
        for linea in (log.read_text().splitlines() if log.exists() else [])
        if "ERROR" in linea
    ]
    for nombre in SALIDAS_CON_PROVEEDOR:
        assert (salida / nombre).exists(), (
            f"{nombre} no se generó: el recorrido no probaría nada.\n" + "\n".join(errores)
        )

    competidores = pl.read_parquet(salida / "competitors_by_market.parquet")
    personas_naturales = competidores.filter(pl.col("NombreProveedor") == NOMBRE_ENMASCARADO)
    assert len(personas_naturales) > 0, "la persona tiene que estar, sólo que tapada"
    assert personas_naturales["CodigoProveedor"].str.starts_with("PN-").all()

    # Es la dominante de su rubro: `top_proveedor` la nombraría si no estuviera tapada.
    concentracion = pl.read_parquet(salida / "market_concentration.parquet")
    assert NOMBRE_ENMASCARADO in concentracion["top_proveedor"].to_list()

    # La persona gana Compras Ágiles en los dos organismos: se cuenta (sin nombre).
    compra_agil = pl.read_parquet(salida / "compra_agil_comprador.parquet")
    assert len(compra_agil) == len(ORGANISMOS)
    assert (compra_agil["proveedores_distintos"] == len(PROVEEDORES)).all()


def test_ninguna_salida_contiene_a_la_persona_natural(salida):
    archivos = sorted(p for p in salida.rglob("*") if p.is_file() and p.suffix != ".log")
    assert len(archivos) >= len(SALIDAS_CON_PROVEEDOR)

    hallazgos = []
    for archivo in archivos:
        if archivo.suffix == ".parquet":
            texto = "\n".join(_textos_de_parquet(archivo))
        else:
            # joblib, npz y lo que venga: se busca en los bytes.
            texto = archivo.read_bytes().decode("utf-8", errors="ignore")
        plano = personas._sin_tildes(texto).lower()
        for aguja in AGUJAS_TEXTO:
            if aguja in plano:
                hallazgos.append(f"{archivo.name}: «{aguja}»")
        for aguja in AGUJAS_ID:
            if aguja in texto:
                hallazgos.append(f"{archivo.name}: {aguja}")

    assert not hallazgos, "la persona natural se escapa por:\n" + "\n".join(hallazgos)


#: Salidas que se escribían y nada leía —ni la API, ni `materialize`, ni otro
#: módulo—, retiradas para que la corrida semanal no gaste RAM ni R2 en ellas.
SALIDAS_RETIRADAS = (
    "seasonality_monthly_agg.parquet",
    "seasonality_predictions.parquet",
    "trend_by_sector.parquet",
    "provider_concentration_alerts.parquet",
    "region_dashboard.parquet",
    "sector_region_matrix.parquet",
    "window_norms.parquet",
    "window_norms_type.parquet",
    "competitor_low_competition.parquet",
    "price_model_params.parquet",
    "product_price_coverage.parquet",
    "product_clusters.parquet",
    "cluster_taxonomy.parquet",
)


def test_las_salidas_retiradas_no_se_escriben(salida):
    assert [n for n in SALIDAS_RETIRADAS if (salida / n).exists()] == []
