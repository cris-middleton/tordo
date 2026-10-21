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


#: Lo mismo en el archivo de licitaciones, con un agravante: los montos grandes
#: vienen en notación científica y con coma («2,5e+07», «1,053e+09»). Medido en
#: los 42 meses de 2023-01 a 2026-06: **el 21 % de las licitaciones (95.158 de
#: 450.922) tenía un `MontoEstimado` que no se leía**, y sesgado hacia los
#: presupuestos redondos, que son justo los que se escriben así. Cada módulo
#: hacía su propio `cast(Float64, strict=False)` y los perdía todos.
NUMERICAS_LIC = (
    "MontoEstimado",
    "MontoLineaAdjudica",
    "Monto Estimado Adjudicado",
    "MontoUnitarioOferta",
    "Valor Total Ofertado",
    "CantidadAdjudicada",
    "NumeroOferentes",
    "CantidadReclamos",
)


def con_numeros(df: pl.DataFrame, columnas: tuple[str, ...] = NUMERICAS_OC) -> pl.DataFrame:
    """Las columnas numéricas presentes, como número (coma decimal incluida)."""
    return df.with_columns(
        [
            pl.col(c)
            .cast(pl.Utf8)
            .str.replace(",", ".", literal=True)
            .cast(pl.Float64, strict=False)
            for c in columnas
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


#: Monedas de la orden cuyo paso a pesos sale mal a veces: ChileCompra
#: multiplica `MontoTotalOC` por el valor de la UF (~$39.700) o de la UTM
#: (~$69.500), y hay órdenes que dicen «CLF» con el monto ya en pesos.
MONEDAS_INDEXADAS = ("CLF", "UTM")

#: Por encima de esto, una orden en UF o UTM no se cree: su monto en pesos queda
#: nulo. Son $120.000 millones, ≈ 3 M UF. Medido en los 36 meses de la ventana
#: (2023-11 a 2026-10, 5,6 M de órdenes): por encima quedan cinco, todas
#: imposibles (135 M «UTM» en control de sotobosque, 7,3 M «UF» en el seguro de
#: vida del personal de un servicio, 3,7 M «UF» en una orden municipal…).
#: Entre 1 y 3 M UF hay cuatro órdenes que parecen legítimas
#: (pago de pensiones, la red de comunicaciones de salud, el sistema de
#: identificación: 1,2–2,7 M UF) y dos imposibles (1,1 y 2,2 M UF). Con el
#: umbral de partida, 1 M UF, caían las cuatro legítimas ($314 mil millones)
#: para quitar $129 mil millones falsos. No se tira lo legítimo.
UMBRAL_PESOS_ORDEN_INDEXADA = 120_000_000_000


def con_monto_saneado(df: pl.DataFrame) -> pl.DataFrame:
    """`MontoTotalOC_PesosChilenos` sin las conversiones imposibles de UF y UTM.

    Dos reglas, por orden:

    (a) **Una orden en otra moneda cuyos ítems están TODOS en pesos**
        (`monedaItem`) tiene su monto en pesos: vale `MontoTotalOC`. Es lo que
        más pesa: 144 órdenes en 36 meses sumaban $34 billones y eran $553
        millones. Las dos mayores, 233,5 y 187,4 millones de pesos marcados como
        UTM, valían $15,7 y $12,4 billones: más que un año de compras de todos
        los municipios. Tiene un costo medido y pequeño: hay órdenes de verdad
        en UF o dólares con el ítem marcado en pesos (pólizas de unos cientos
        de UF), y se quedan en unos pocos pesos: unos $1.000 millones en 36 meses.
    (b) **Una orden en UF o UTM que en pesos pasa de
        `UMBRAL_PESOS_ORDEN_INDEXADA`** queda SIN monto (nulo: la orden sigue
        contando, pero no suma) y va al log con su código, organismo y monto,
        para poder auditarla. Una Gran Compra de 36 millones de «UF»
        ($1,44 billones, cancelada) era el 14 % de seis meses de compras.

    Comparar el total con la suma de las líneas no sirve: en las órdenes
    imposibles las líneas también cuadran, porque el error está en la moneda,
    no en la suma.

    El resto, la inmensa mayoría, no se toca. Se aplica antes de repartir el
    monto por línea, así que todo módulo que lea por `iter_oc_parquets` lo
    hereda.
    """
    necesarias = {"Codigo", "MontoTotalOC_PesosChilenos", "MontoTotalOC", "TipoMonedaOC"}
    if not necesarias <= set(df.columns):
        return df
    moneda = pl.col("TipoMonedaOC").cast(pl.Utf8).str.strip_chars()
    en_otra_moneda = moneda.is_not_null() & (moneda != "CLP")
    if "monedaItem" in df.columns:
        items_en_pesos = (
            (pl.col("monedaItem").cast(pl.Utf8).str.strip_chars() == "CLP")
            .fill_null(False)
            .all()
            .over("Codigo")
        )
        en_pesos_de_verdad = en_otra_moneda & items_en_pesos
    else:
        en_pesos_de_verdad = pl.lit(False)
    imposible = (
        ~en_pesos_de_verdad
        & moneda.is_in(MONEDAS_INDEXADAS)
        & (pl.col("MontoTotalOC_PesosChilenos") > UMBRAL_PESOS_ORDEN_INDEXADA)
    )
    df = df.with_columns(
        en_pesos_de_verdad.alias("_en_pesos_de_verdad"), imposible.alias("_imposible")
    )

    fuera = df.filter(pl.col("_imposible")).unique(subset=["Codigo"], keep="first")
    organismo = "OrganismoPublico" if "OrganismoPublico" in df.columns else None
    for fila in fuera.iter_rows(named=True):
        logger.warning(
            "Orden fuera de los montos (%s %s → $%s en pesos): %s, %s",
            fila["TipoMonedaOC"],
            f"{fila['MontoTotalOC']:,.0f}",
            f"{fila['MontoTotalOC_PesosChilenos']:,.0f}",
            fila["Codigo"],
            fila[organismo] if organismo else "organismo sin dato",
        )
    corregidas = df.filter(pl.col("_en_pesos_de_verdad"))["Codigo"].n_unique()
    if corregidas:
        logger.info(f"{corregidas} órdenes en otra moneda con los ítems en pesos: monto en pesos")

    return df.with_columns(
        pl.when(pl.col("_imposible"))
        .then(None)
        .when(pl.col("_en_pesos_de_verdad"))
        .then(pl.col("MontoTotalOC"))
        .otherwise(pl.col("MontoTotalOC_PesosChilenos"))
        .alias("MontoTotalOC_PesosChilenos")
    ).drop("_en_pesos_de_verdad", "_imposible")


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


#: Estados de una orden que no llegó a comprar nada.
ESTADOS_CANCELADOS = ("Cancelacion solicitada", "Cancelada", "Cancelación solicitada")


def sin_canceladas(df: pl.DataFrame) -> pl.DataFrame:
    """Fuera las órdenes canceladas, enteras (el estado es de la orden y se
    repite en cada línea). Una orden sin estado se queda: no se sabe que no
    comprara.

    Ojo con los paréntesis: `~col.is_in(...).fill_null(True)` niega DESPUÉS de
    rellenar, y entonces es la orden sin estado la que se va.
    """
    if "Estado" not in df.columns:
        return df
    return df.filter((~pl.col("Estado").is_in(ESTADOS_CANCELADOS)).fill_null(True))


#: Lo que hace falta para sanear el monto (`con_monto_saneado`) y anotar en el
#: log de quién era la orden. Se lee y se quita: nadie recibe lo que no pidió.
COLUMNAS_PARA_SANEAR = ("TipoMonedaOC", "MontoTotalOC", "monedaItem", "OrganismoPublico")


def _columnas_para_montos(cols: list[str]) -> list[str]:
    """Quien pide el monto necesita también con qué sanearlo y repartirlo por línea."""
    if "MontoTotalOC_PesosChilenos" not in cols:
        return list(cols)
    return list(dict.fromkeys([*cols, "Codigo", "totalLineaNeto", *COLUMNAS_PARA_SANEAR]))


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
    # **Un archivo que no se puede leer hace fallar la corrida.** Antes se
    # saltaba con un WARNING y el módulo terminaba bien: publicaba un análisis
    # con un mes menos, sin que nada lo dijera, y el latido daba verde. Un
    # parquet roto se arregla rehaciéndolo; leer sin él es publicar otra cosa.
    # La clasificación de personas naturales lee TODOS los archivos: se hace
    # antes, para que su error no salga atribuido al primer archivo de la ventana.
    _personas_naturales()
    for p in archivos:
        try:
            df = _leer(p, cols)
        except Exception as e:
            raise RuntimeError(f"No se pudo leer {p}: {e}") from e
        if filtro is not None and "FechaCreacion" in df.columns:
            df = df.filter(filtro)
        if anadida and "FechaCreacion" in df.columns:
            df = df.drop("FechaCreacion")
        yield p.stem, df


def iter_oc_parquets(
    columns: list[str] | None = None,
    min_year: int | None = None,
    max_date: date | None = None,
    meses: int | None = VENTANA_ANALYTICS_MESES,
    *,
    canceladas: bool = False,
):
    """Un DataFrame de OC por archivo, dentro de la ventana de `meses`.

    `max_date` (harness de evaluación) corta además por arriba, y ancla la
    ventana en su mes. `meses=None` lee toda la historia.

    **Sin las órdenes canceladas, salvo `canceladas=True`.** Una orden cancelada
    no compró nada: no es un precio pagado, ni una cuota de mercado, ni un mes
    con compras. Antes sólo `sector_dashboard` las quitaba y todo lo demás las
    sumaba. Las piden quien las cuenta (`buyer_scoring`, la tasa de cancelación
    y su denominador) y el modelo de referencia del harness (`tfidf_matcher` y
    `evaluation/`), cuyos datos de entrenamiento no deben cambiar con esto.
    Se quitan antes de sanear el monto y repartirlo por línea, así que se va la
    orden entera.
    """
    pedidas = list(columns or OC_COLS_CORE)
    cols = _columnas_para_montos(pedidas)
    if not canceladas:
        cols = list(dict.fromkeys([*cols, "Estado"]))
    sobran = [c for c in (*COLUMNAS_PARA_SANEAR, "Estado") if c in cols and c not in pedidas]
    for periodo, df in _iterar(OC_PARQUET_DIR, cols, min_year, max_date, meses):
        if not canceladas:
            df = sin_canceladas(df)
        df = con_monto_por_linea(con_monto_saneado(con_numeros(con_vacios(df))))
        yield periodo, df.drop([c for c in sobran if c in df.columns])


def iter_lic_parquets(
    columns: list[str] | None = None,
    min_year: int | None = None,
    max_date: date | None = None,
    meses: int | None = VENTANA_ANALYTICS_MESES,
):
    """Un DataFrame de licitaciones por archivo, dentro de la ventana de `meses`.

    Los montos y conteos (`NUMERICAS_LIC`) llegan ya como número: coma decimal y
    notación científica incluidas. Ningún módulo los convierte por su cuenta.
    """
    pedidas = list(columns or LIC_COLS_CORE)
    for periodo, df in _iterar(LIC_PARQUET_DIR, pedidas, min_year, max_date, meses):
        yield periodo, con_numeros(df, NUMERICAS_LIC)
