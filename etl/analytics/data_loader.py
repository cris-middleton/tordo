"""
Carga lazy de datos históricos con Polars.

Maneja schema drift entre años usando intersección de columnas disponibles.
Procesa archivo por archivo para controlar memoria.
"""

import logging
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import polars as pl

from .config import LIC_COLS_CORE, LIC_PARQUET_DIR, OC_COLS_CORE, OC_PARQUET_DIR
from .personas import codigos_persona_natural, columnas_para_enmascarar, enmascarar

logger = logging.getLogger(__name__)


def _available_cols(parquet_dir: Path, wanted: list[str]) -> list[str]:
    """Determina qué columnas del listado deseado existen en los parquets."""
    sample = next(parquet_dir.glob("*.parquet"), None)
    if sample is None:
        raise FileNotFoundError(f"No parquets in {parquet_dir}")
    schema = pl.read_parquet_schema(sample)
    return [c for c in wanted if c in schema]


#: Columnas numéricas del archivo de órdenes. Vienen como TEXTO y con COMA
#: decimal («1449449,75»): `cast(Float64, strict=False)` las convertía en nulo,
#: y cada módulo filtraba los nulos. Medido en los seis meses locales: **el 53 %
#: de las filas** tenía coma, así que más de la mitad de las compras no contaba
#: en ningún monto del BI — y sesgado: fuera quedaban justo las que tienen
#: centavos. No hay separador de miles, así que basta cambiar la coma.
NUMERICAS_OC = (
    "MontoTotalOC",
    "MontoTotalOC_PesosChilenos",
    "TotalNetoOC",
    "totalLineaNeto",
    "precioNeto",
    "cantidad",
    "totalCargos",
    "totalDescuentos",
    "totalImpuestos",
)


def con_numeros(df: pl.DataFrame) -> pl.DataFrame:
    """Las columnas numéricas presentes, como número (coma decimal incluida)."""
    return df.with_columns(
        [
            pl.col(c)
            .cast(pl.Utf8)
            .str.replace(",", ".", literal=True)
            .cast(pl.Float64, strict=False)
            for c in NUMERICAS_OC
            if c in df.columns
        ]
    )


#: Columnas de texto que el archivo marca como vacías con la PALABRA «NA» (o
#: «null», o nada). Los módulos filtraban `is_not_null()` y `!= "null"`, pero no
#: «NA»: así «NA» salía como un sector más en el mapa de sectores y como el rubro
#: más grande de la tabla de competencia (8.918 filas).
CATEGORICAS_OC = (
    "sector",
    "RubroN1",
    "RubroN2",
    "RubroN3",
    "RegionUnidadCompra",
    "CodigoOrganismoPublico",
    "CodigoProveedor",
)
MARCAS_DE_VACIO = ("NA", "null", "")


def con_vacios(df: pl.DataFrame) -> pl.DataFrame:
    """«NA», «null» y «» como nulos de verdad en las columnas categóricas."""
    return df.with_columns(
        [
            pl.when(pl.col(c).cast(pl.Utf8).str.strip_chars().is_in(MARCAS_DE_VACIO))
            .then(None)
            .otherwise(pl.col(c))
            .alias(c)
            for c in CATEGORICAS_OC
            if c in df.columns
        ]
    )


def con_monto_por_linea(df: pl.DataFrame) -> pl.DataFrame:
    """Añade `monto_linea_clp`: el total de la orden repartido entre sus líneas.

    El archivo trae una fila por LÍNEA y repite en cada una el total de la ORDEN
    (`MontoTotalOC_PesosChilenos`, verificado en 34.333 de 34.333 órdenes de
    varias líneas). Sumarlo por fila multiplicaba cada orden por su número de
    líneas (≈2,9) y, en una orden con ítems de varios rubros, le atribuía el
    total entero a cada uno. Se reparte en proporción a `totalLineaNeto`
    —que está en la moneda de la orden, por eso sólo se usa como peso— y,
    si no hay netos, a partes iguales. Sumado sobre cualquier agrupación da el
    monto correcto: las líneas de una orden suman exactamente su total.
    """
    if not {"Codigo", "MontoTotalOC_PesosChilenos"} <= set(df.columns):
        return df
    if "totalLineaNeto" in df.columns:
        neto = pl.col("totalLineaNeto").clip(lower_bound=0).fill_null(0)
        suma = neto.sum().over("Codigo")
        peso = pl.when(suma > 0).then(neto / suma).otherwise(1.0 / pl.len().over("Codigo"))
    else:
        peso = 1.0 / pl.len().over("Codigo")
    return df.with_columns((pl.col("MontoTotalOC_PesosChilenos") * peso).alias("monto_linea_clp"))


def orden_por_fila(df: pl.DataFrame) -> pl.DataFrame:
    """Una fila por ORDEN (la primera de sus líneas).

    Para lo que es de la orden y no de la línea —comprador, sector, región,
    fechas, estado, total—: contar filas contaba líneas (≈2,9 por orden).
    """
    if "Codigo" not in df.columns:
        return df
    return df.unique(subset=["Codigo"], keep="first", maintain_order=True)


def _columnas_para_montos(cols: list[str]) -> list[str]:
    """Quien pide el monto necesita también con qué repartirlo por línea."""
    if "MontoTotalOC_PesosChilenos" not in cols:
        return list(cols)
    return list(dict.fromkeys([*cols, "Codigo", "totalLineaNeto"]))


def _personas_naturales() -> frozenset[str]:
    """Los códigos a tapar, clasificados con TODA la historia de OC y LIC.

    Todo lo que sale de este módulo pasa por aquí: es el único camino hacia los
    parquets consolidados, y por eso el enmascarado vive en él (ver `personas`).
    """
    return codigos_persona_natural(OC_PARQUET_DIR, LIC_PARQUET_DIR)


def _leer(p: Path, cols: list[str]) -> pl.DataFrame:
    """Lee las columnas pedidas, con las personas naturales ya tapadas.

    Para decidir hacen falta el código y el RUT aunque el módulo no los pida;
    se leen y se descartan después.
    """
    esquema = pl.read_parquet_schema(p)
    pedidas = [c for c in cols if c in esquema]
    df = pl.read_parquet(p, columns=columnas_para_enmascarar(pedidas, esquema))
    return enmascarar(df, _personas_naturales()).select(pedidas)


def _escanear(p: Path, cols: list[str]) -> pl.LazyFrame:
    esquema = pl.read_parquet_schema(p)
    pedidas = [c for c in cols if c in esquema]
    lf = pl.scan_parquet(p).select(columnas_para_enmascarar(pedidas, esquema))
    return enmascarar(lf, _personas_naturales()).select(pedidas)


def _parse_periodo(periodo_str: str) -> tuple[int, int]:
    """Parsea '2024-3' → (2024, 3)."""
    parts = periodo_str.split("-")
    return int(parts[0]), int(parts[1])


#: Meses de historia que lee analytics, por defecto. Con más, la RAM del
#: semanal crece sin techo: medido, CADA módulo sube con los meses de historia
#: (de 0,04 a 0,5 GB por mes), y con años en R2 el servicio no cabría en ningún
#: tamaño razonable. Y es lo correcto en producto: cuotas o precios de hace cinco
#: años describen otro mercado. 36 y no menos porque estacionalidad y tendencia
#: necesitan varios años para tener algo que decir.
VENTANA_ANALYTICS_MESES = 36


def _periodos(directorio: Path) -> list[tuple[tuple[int, int], Path]]:
    """Los parquets mensuales en orden CRONOLÓGICO (por nombre, «2025-10»
    quedaba antes que «2025-2»)."""
    return sorted((_parse_periodo(p.stem), p) for p in directorio.glob("*.parquet"))


def inicio_ventana(
    directorio: Path, meses: int | None, max_date: date | None = None
) -> date | None:
    """Primer día de la ventana de `meses`, o None si no hay ventana.

    **Se ancla en el período más reciente de los DATOS, no en hoy**: si
    ChileCompra se atrasa en publicar, la ventana se queda donde están los datos
    en vez de ir vaciándose. Con `max_date` (el harness de evaluación) se ancla ahí.
    """
    if meses is None:
        return None
    periodos = [periodo for periodo, _ in _periodos(directorio)]
    if max_date is not None:
        periodos = [p for p in periodos if p <= (max_date.year, max_date.month)]
    if not periodos:
        return None
    anio, mes = periodos[-1]
    indice = anio * 12 + (mes - 1) - (meses - 1)
    return date(indice // 12, indice % 12 + 1, 1)


def limites_ventana(
    directorio: Path, meses: int, *, hoy: date | None = None
) -> tuple[date, date] | None:
    """(primer día, último día) de la ventana de `meses` sobre `directorio`.

    Es lo que se escribe como `ventana_desde`/`ventana_hasta` en las tablas que
    lo publican: una cuota o una banda sin periodo se lee como «de siempre».

    **El último día no pasa de hoy** (en Chile). ChileCompra publica el archivo
    del mes en curso, así que el último periodo está a medias: tomar su fin de
    mes hacía decir a las páginas públicas «datos al 31 oct 2026» el 13 de
    octubre.
    """
    desde = inicio_ventana(directorio, meses)
    if desde is None:
        return None
    anio, mes = _periodos(directorio)[-1][0]
    siguiente = date(anio + mes // 12, mes % 12 + 1, 1)
    fin_de_mes = date.fromordinal(siguiente.toordinal() - 1)
    hoy = hoy or datetime.now(ZoneInfo("America/Santiago")).date()
    return desde, min(fin_de_mes, hoy)


def con_ventana(df: pl.DataFrame, limites: tuple[date, date] | None) -> pl.DataFrame:
    """Añade `ventana_desde` y `ventana_hasta` (nulas si no hay datos)."""
    desde, hasta = limites or (None, None)
    return df.with_columns(
        pl.lit(desde, dtype=pl.Date).alias("ventana_desde"),
        pl.lit(hasta, dtype=pl.Date).alias("ventana_hasta"),
    )


def _archivos(
    directorio: Path, min_year: int | None, max_date: date | None, meses: int | None
) -> tuple[list[Path], date | None]:
    """Los archivos a leer y desde qué fecha filtrar las filas.

    Saltarse por nombre un archivo anterior a la ventana es seguro: una orden
    aparece en el archivo de su mes de envío, así que su `FechaCreacion` nunca es
    posterior al período del archivo. Las filas de los que SÍ se leen se filtran
    igual, porque un archivo trae órdenes creadas meses antes.
    """
    desde = inicio_ventana(directorio, meses, max_date)
    archivos = [
        p
        for (anio, mes), p in _periodos(directorio)
        if (min_year is None or anio >= min_year)
        and (desde is None or (anio, mes) >= (desde.year, desde.month))
    ]
    return archivos, desde


def _filtro_fechas(desde: date | None, max_date: date | None) -> pl.Expr | None:
    fecha = pl.col("FechaCreacion").cast(pl.Date, strict=False)
    filtro = None
    if desde is not None:
        filtro = fecha >= pl.lit(desde)
    if max_date is not None:
        tope = fecha <= pl.lit(max_date)
        filtro = tope if filtro is None else filtro & tope
    return filtro


def _escanear_todos(
    directorio: Path,
    nombre: str,
    cols: list[str],
    min_year: int | None,
    max_date: date | None,
    meses: int | None,
) -> pl.LazyFrame:
    available = _available_cols(directorio, cols)
    archivos, desde = _archivos(directorio, min_year, max_date, meses)
    if not archivos:
        raise FileNotFoundError(f"No hay parquets de {nombre} en la ventana pedida")
    logger.info(
        f"Scanning {len(archivos)} {nombre} parquets ({archivos[0].stem} → {archivos[-1].stem})"
        + (f", desde {desde}" if desde else "")
    )
    filtro = _filtro_fechas(desde, max_date)
    frames = []
    for p in archivos:
        try:
            lf = _escanear(p, available)
            if filtro is not None and "FechaCreacion" in pl.read_parquet_schema(p):
                lf = lf.filter(filtro)
            frames.append(lf)
        except Exception as e:
            logger.warning(f"Skip {p.name}: {e}")
    return pl.concat(frames, how="diagonal_relaxed")


def _iterar(
    directorio: Path,
    cols: list[str],
    min_year: int | None,
    max_date: date | None,
    meses: int | None,
):
    archivos, desde = _archivos(directorio, min_year, max_date, meses)
    filtro = _filtro_fechas(desde, max_date)
    # Para filtrar hace falta la fecha aunque el módulo no la pida; se quita
    # después, para que nadie reciba una columna que no pidió.
    anadida = filtro is not None and "FechaCreacion" not in cols
    if anadida:
        cols = [*cols, "FechaCreacion"]
    for p in archivos:
        try:
            df = _leer(p, cols)
            if filtro is not None and "FechaCreacion" in df.columns:
                df = df.filter(filtro)
            if anadida and "FechaCreacion" in df.columns:
                df = df.drop("FechaCreacion")
            yield p.stem, df
        except Exception as e:
            logger.warning(f"Skip {p.name}: {e}")


def scan_oc(
    columns: list[str] | None = None,
    min_year: int | None = None,
    max_date: date | None = None,
    meses: int | None = VENTANA_ANALYTICS_MESES,
) -> pl.LazyFrame:
    """Carga lazy de las OC de la ventana (`meses`; None = toda la historia)."""
    return _escanear_todos(OC_PARQUET_DIR, "OC", columns or OC_COLS_CORE, min_year, max_date, meses)


def scan_lic(
    columns: list[str] | None = None,
    min_year: int | None = None,
    max_date: date | None = None,
    meses: int | None = VENTANA_ANALYTICS_MESES,
) -> pl.LazyFrame:
    """Carga lazy de las licitaciones de la ventana."""
    return _escanear_todos(
        LIC_PARQUET_DIR, "LIC", columns or LIC_COLS_CORE, min_year, max_date, meses
    )


def iter_oc_parquets(
    columns: list[str] | None = None,
    min_year: int | None = None,
    max_date: date | None = None,
    meses: int | None = VENTANA_ANALYTICS_MESES,
):
    """Un DataFrame de OC por archivo, dentro de la ventana de `meses`.

    `max_date` (harness de evaluación) corta además por arriba, y ancla la
    ventana en su mes. `meses=None` lee toda la historia.
    """
    cols = _columnas_para_montos(columns or OC_COLS_CORE)
    for periodo, df in _iterar(OC_PARQUET_DIR, cols, min_year, max_date, meses):
        yield periodo, con_monto_por_linea(con_numeros(con_vacios(df)))


def iter_lic_parquets(
    columns: list[str] | None = None,
    min_year: int | None = None,
    max_date: date | None = None,
    meses: int | None = VENTANA_ANALYTICS_MESES,
):
    """Un DataFrame de licitaciones por archivo, dentro de la ventana de `meses`."""
    yield from _iterar(LIC_PARQUET_DIR, list(columns or LIC_COLS_CORE), min_year, max_date, meses)
