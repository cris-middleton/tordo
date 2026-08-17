"""
Análisis de Competidores

Mapea quién gana qué, dónde, y con qué frecuencia.

Para cada (organismo, rubro):
  - Top proveedores por volumen y monto
  - Market share (% del gasto total)
  - Win rate (frecuencia relativa)
  - Concentración del mercado (HHI - Herfindahl-Hirschman Index)

Para cada proveedor:
  - Organismos donde más vende
  - Rubros de especialización
  - Evolución temporal

Output:
  - competitors_by_market.parquet: top proveedores por (organismo, rubro)
  - provider_profiles.parquet: perfil completo por proveedor
  - market_concentration.parquet: HHI y métricas de concentración
"""

import logging

import polars as pl

from .agregacion import ContadorDistintos
from .config import MIN_OBSERVATIONS, OUTPUT_DIR
from .data_loader import iter_oc_parquets
from .identidad import nombre_vigente, periodo_maximo

logger = logging.getLogger(__name__)


def build_competitor_aggregates() -> tuple[pl.DataFrame, pl.DataFrame]:
    """
    Pre-agrega proveedores por (organismo, rubro) y por proveedor individual.
    """
    logger.info("Construyendo agregados de competidores...")

    cols_needed = [
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "RubroN2",
        "CodigoProveedor",
        "NombreProveedor",
        "MontoTotalOC_PesosChilenos",
        "RegionUnidadCompra",
        "FechaCreacion",
        "_periodo_archivo",
    ]

    market_frames = []
    provider_frames = []
    # Cuántos organismos, rubros y regiones distintos toca cada proveedor. No
    # sale de un `n_unique()` por tanda: ver `agregacion.py`. Con `max()` un
    # proveedor con tres clientes en enero y otros tres en febrero salía con
    # tres — el 54,8 % quedaba subcontado, con mediana 1 donde la real es 2.
    distintos = {
        "n_organismos": ContadorDistintos("CodigoProveedor", "CodigoOrganismoPublico"),
        "n_rubros": ContadorDistintos("CodigoProveedor", "RubroN2"),
        "n_regiones": ContadorDistintos("CodigoProveedor", "RegionUnidadCompra"),
    }

    for periodo, df in iter_oc_parquets(columns=cols_needed):
        if "CodigoProveedor" not in df.columns:
            continue

        base = df.with_columns(
            [
                pl.col("MontoTotalOC_PesosChilenos").cast(pl.Float64, strict=False).alias("monto"),
            ]
        ).filter(
            pl.col("monto").is_not_null()
            & (pl.col("monto") > 0)
            & pl.col("CodigoProveedor").is_not_null()
        )

        # Agregado por mercado (organismo + rubro + proveedor).
        #
        # **La clave son los CÓDIGOS.** Antes incluía `OrganismoPublico` y
        # `NombreProveedor`, que son nombres para mostrar: un organismo escrito
        # de cuatro formas se convertía en cuatro mercados distintos. Ver
        # `identidad.py` para lo que eso rompía aguas abajo.
        market_agg = base.group_by(
            [
                "CodigoOrganismoPublico",
                "RubroN2",
                "CodigoProveedor",
            ]
        ).agg(
            [
                pl.len().alias("n_oc"),
                pl.col("monto").sum().alias("monto_total"),
                nombre_vigente("OrganismoPublico"),
                nombre_vigente("NombreProveedor"),
                periodo_maximo(),
            ]
        )
        market_frames.append(market_agg)

        # Agregado por proveedor (perfil general)
        for contador in distintos.values():
            contador.añadir(base)

        prov_agg = base.group_by("CodigoProveedor").agg(
            [
                pl.len().alias("n_oc"),
                pl.col("monto").sum().alias("monto_total"),
                nombre_vigente("NombreProveedor"),
                periodo_maximo(),
            ]
        )
        provider_frames.append(prov_agg)

    # Combinar mercados
    markets = pl.concat(market_frames, how="diagonal_relaxed")
    markets = markets.group_by(
        [
            "CodigoOrganismoPublico",
            "RubroN2",
            "CodigoProveedor",
        ]
    ).agg(
        [
            pl.col("n_oc").sum(),
            pl.col("monto_total").sum(),
            nombre_vigente("OrganismoPublico"),
            nombre_vigente("NombreProveedor"),
        ]
    )

    # Combinar proveedores
    providers = pl.concat(provider_frames, how="diagonal_relaxed")
    providers = providers.group_by("CodigoProveedor").agg(
        [
            pl.col("n_oc").sum(),
            pl.col("monto_total").sum(),
            nombre_vigente("NombreProveedor"),
        ]
    )
    for alias, contador in distintos.items():
        conteos = contador.conteos(alias)
        providers = (
            providers.join(conteos, on="CodigoProveedor", how="left")
            if not conteos.is_empty()
            else providers.with_columns(pl.lit(None, dtype=pl.UInt32).alias(alias))
        )

    logger.info(f"Mercados: {len(markets):,} combinaciones | Proveedores: {len(providers):,}")
    return markets, providers


def compute_market_shares(markets: pl.DataFrame) -> pl.DataFrame:
    """
    Calcula market share y ranking de cada proveedor dentro de su mercado.
    """
    logger.info("Calculando market shares...")

    # Total por mercado
    market_totals = (
        markets.group_by(["CodigoOrganismoPublico", "RubroN2"])
        .agg(
            [
                pl.col("monto_total").sum().alias("monto_mercado"),
                pl.col("n_oc").sum().alias("oc_mercado"),
                pl.col("CodigoProveedor").n_unique().alias("n_proveedores"),
            ]
        )
        .filter(pl.col("oc_mercado") >= MIN_OBSERVATIONS)
    )

    result = (
        markets.join(market_totals, on=["CodigoOrganismoPublico", "RubroN2"], how="inner")
        .with_columns(
            [
                (pl.col("monto_total") / pl.col("monto_mercado") * 100).alias("market_share_pct"),
                (pl.col("n_oc") / pl.col("oc_mercado") * 100).alias("win_rate_pct"),
            ]
        )
        # Ranking dentro de cada mercado
        .with_columns(
            [
                pl.col("monto_total")
                .rank(descending=True)
                .over(["CodigoOrganismoPublico", "RubroN2"])
                .alias("rank_monto"),
            ]
        )
        .sort(["CodigoOrganismoPublico", "RubroN2", "rank_monto"])
    )

    logger.info(f"Market shares: {len(result):,} filas")
    return result


def compute_market_concentration(market_shares: pl.DataFrame) -> pl.DataFrame:
    """
    Calcula Herfindahl-Hirschman Index (HHI) por mercado.
    HHI = Σ(market_share_i²)
    - HHI < 1500: fragmentado
    - HHI 1500-2500: moderadamente concentrado
    - HHI > 2500: altamente concentrado

    Mercados concentrados = oportunidad para nuevos entrantes es baja.
    Mercados fragmentados = más oportunidad pero más competencia.

    **El tramo bajo se llamaba «competitivo», y se cambió.** El eje que mide el
    HHI es la concentración, así que el opuesto de «concentrado» es
    «fragmentado». «Competitivo» se lee al revés de lo que significa: suena a
    «acá es difícil», cuando el dato dice justamente que hay espacio. Además
    convivía con «fragmentado», que es lo que devuelven los servicios de BI, y
    el usuario veía dos palabras distintas para el mismo mercado en la misma
    pantalla. Los cortes (1.500 / 2.500) no cambian: son los de las guías de
    competencia del DOJ/FTC.
    """
    logger.info("Calculando concentración de mercados (HHI)...")

    hhi = (
        market_shares.with_columns(
            [
                (pl.col("market_share_pct").pow(2)).alias("share_sq"),
            ]
        )
        .group_by(["CodigoOrganismoPublico", "RubroN2"])
        .agg(
            [
                pl.col("share_sq").sum().alias("hhi"),
                pl.col("OrganismoPublico").drop_nulls().first().alias("OrganismoPublico"),
                pl.col("CodigoProveedor").n_unique().alias("n_proveedores"),
                pl.col("oc_mercado").first().alias("n_transacciones"),
                pl.col("monto_mercado").first().alias("monto_total_mercado"),
                # Top proveedor.
                #
                # **`top_share_pct` traía la cuota del proveedor más CHICO.**
                # `rank_monto` es 1 para el mayor, y esto ordenaba por ese rango
                # de forma descendente, así que se quedaba con el último. El
                # nombre, ordenado al derecho, sí era el del líder: la tarjeta
                # enseñaba el nombre de uno y el número de otro. Medido sobre
                # datos reales, el 98,7 % de las filas daba una «cuota del
                # líder» menor que la cuota media del mercado —imposible— y
                # 3.541 mercados de un solo proveedor no decían 100 %.
                #
                # Se calcula con `max()` y no reordenando: la cuota del líder ES
                # la cuota máxima, y así no hay dirección que equivocar.
                pl.col("NombreProveedor")
                .sort_by("market_share_pct", descending=True)
                .first()
                .alias("top_proveedor"),
                pl.col("market_share_pct").max().alias("top_share_pct"),
            ]
        )
        .with_columns(
            [
                pl.when(pl.col("hhi") < 1500)
                .then(pl.lit("fragmentado"))
                .when(pl.col("hhi") < 2500)
                .then(pl.lit("moderado"))
                .otherwise(pl.lit("concentrado"))
                .alias("tipo_mercado"),
            ]
        )
        .sort("hhi", descending=True)
    )

    for tipo in ["fragmentado", "moderado", "concentrado"]:
        n = hhi.filter(pl.col("tipo_mercado") == tipo).shape[0]
        logger.info(f"  {tipo}: {n:,} mercados")

    _avisar_de_hhi_imposible(hhi)
    return hhi


def _avisar_de_hhi_imposible(hhi: pl.DataFrame) -> None:
    """Avisa si algún mercado viola la aritmética del índice.

    Con n proveedores repartiéndose el mercado, el HHI no puede bajar de
    10.000/n —el mínimo se alcanza cuando todos tienen la misma cuota— y la
    cuota del líder no puede quedar por debajo de la media, 100/n. Las dos
    cosas pasaban a la vez y en masa (13,6 % y 98,7 % de las filas) sin que
    nada lo dijera, porque cada número por separado parecía razonable.

    Avisa en vez de fallar: es calidad del dato de entrada, no un contrato roto,
    y una corrida semanal que muere deja al producto sin analytics.
    """
    problemas = {
        "HHI por debajo del mínimo aritmético (10.000/n)": hhi.filter(
            pl.col("hhi") < (10_000.0 / pl.col("n_proveedores")) * 0.999
        ).height,
        "cuota del líder por debajo de la media (100/n)": hhi.filter(
            pl.col("top_share_pct") < (100.0 / pl.col("n_proveedores")) * 0.999
        ).height,
    }
    for descripcion, n in problemas.items():
        if n:
            logger.warning(f"  ⚠ {n:,} mercados con {descripcion}")


def build_provider_profiles(providers: pl.DataFrame) -> pl.DataFrame:
    """Enriquece perfiles de proveedores con métricas calculadas."""
    return (
        providers.filter(pl.col("n_oc") >= 3)
        .with_columns(
            [
                (pl.col("monto_total") / pl.col("n_oc")).alias("ticket_promedio"),
            ]
        )
        .sort("monto_total", descending=True)
    )


def run_competitor_analysis() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline completo de análisis de competidores."""
    logger.info("=" * 60)
    logger.info("ANÁLISIS DE COMPETIDORES")
    logger.info("=" * 60)

    markets, providers = build_competitor_aggregates()

    # Market shares
    market_shares = compute_market_shares(markets)
    ms_path = OUTPUT_DIR / "competitors_by_market.parquet"
    market_shares.write_parquet(ms_path, compression="snappy")
    logger.info(f"Guardado: {ms_path.name} ({ms_path.stat().st_size / 1024 / 1024:.1f} MB)")

    # Concentración
    concentration = compute_market_concentration(market_shares)
    conc_path = OUTPUT_DIR / "market_concentration.parquet"
    concentration.write_parquet(conc_path, compression="snappy")
    logger.info(f"Guardado: {conc_path.name}")

    # Provider profiles
    profiles = build_provider_profiles(providers)
    prof_path = OUTPUT_DIR / "provider_profiles.parquet"
    profiles.write_parquet(prof_path, compression="snappy")
    logger.info(f"Guardado: {prof_path.name}")

    return {
        "market_shares": market_shares,
        "concentration": concentration,
        "profiles": profiles,
    }
