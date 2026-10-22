"""Ninguna ruta de `/publico/*` trae una tabla de analytics entera por petición.

Es la guarda de `test_bi_mercado_acotado.py` aplicada a las páginas públicas
(`api/publico.py` → `services/publico/`), que la API sirve a cualquiera y que en
producción leen 36 meses de analytics (12 en las bandas de precio): seis veces lo
que hay en local, en un contenedor de 512 MB con un worker.

Tres reglas, cada una con su test:

1. **Toda ruta de `/publico/*` tiene llamadas aquí** (`LLAMADAS`) o una exención
   con su motivo (`EXENTAS`). Una ruta nueva hace fallar el test hasta que
   alguien decida qué lee.
2. **Cada lectura de una petición va acotada** —filtro de igualdad o `LIMIT`—, o
   está en `LECTURA_ENTERA_PERMITIDA` con su motivo.
3. **Lo que es de la tabla entera por naturaleza sólo lo lee el índice**
   (`indexables.construir`, `LECTURAS_DEL_INDICE`), que se construye una vez cada
   `TTL_SEGUNDOS` y no en cada petición: con el índice en caché, ninguna ruta
   vuelve a leerlo.

Las tablas son las del fixture del golden en el doble en memoria, como en la
guarda de BI. El SQL de verdad lo prueban `test_publico_fixture.py` y
`test_publico_indice_sql.py`.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl
import pytest

from app.core.versionado import PREFIJO_API
from app.main import app
from app.repositories import analytics_sync
from app.services.bi import (
    competencia,
    comprador,
    mercado,
    oportunidad,
    precio,
    rubro,
    temporal,
)
from app.services.publico import indexables, paginas
from app.services.publico import mercado as publico_mercado
from tests.analytics_en_memoria import RegistroDeLecturas
from tests.rutas import iter_rutas

GOLDEN = Path(__file__).parent / "golden"
PREFIJO = f"{PREFIJO_API}/publico"


def _clave(lectura: dict) -> tuple[str, str]:
    """`(tabla, cómo)`: «filas», o el agregado, el conteo o los distintos por columna."""
    for tipo in ("agregado", "totales", "distintos", "conteo", "busqueda", "sql"):
        if tipo in lectura:
            return lectura["tabla"], f"{tipo}:{lectura[tipo]}"
    return lectura["tabla"], "filas"


def _acotada(lectura: dict) -> bool:
    return bool(lectura.get("filtros") or lectura.get("limite"))


#: Lecturas de la tabla entera que sólo hace `indexables.construir`. El índice
#: ES la lista de compradores, rubros y productos con página: no se puede acotar,
#: así que se agrega en SQL, viaja sólo lo que el índice guarda y se construye
#: una vez cada `TTL_SEGUNDOS` (10 min). Medido el 2026-10-21: +41–45 MiB de
#: RSS con las tablas locales y +88–95 a tres veces esa escala (antes, +79–97 y
#: +207–248, leyendo filas). Ver «Se agrega en Postgres» en `indexables.py`.
LECTURAS_DEL_INDICE = {
    # Una fila por comprador con mercado (~1.000), con su primer nombre.
    ("market_concentration.parquet", "agregado:CodigoOrganismoPublico"),
    # Una fila por rubro (~300) con sus órdenes.
    ("market_concentration.parquet", "agregado:RubroN2"),
    # Los rubros con competidores (~300 valores): DISTINCT en Postgres.
    ("competitors_by_market.parquet", "distintos:RubroN2"),
    # Una fila por firma (~50.000 en local) con sus compras: el índice de
    # productos. Viene por trozos (`analytics_sync._por_trozos`).
    ("product_price_bands_L0N.parquet", "agregado:firma_producto"),
    # Una fila por comprador con perfil (~1.300), tres columnas.
    ("buyer_scores.parquet", "filas"),
}

#: Lecturas enteras permitidas en una petición, cada una con su motivo.
LECTURA_ENTERA_PERMITIDA = {
    # `/publico/mercado`: dos agregados en SQL de la tabla entera, que devuelven
    # ~40 meses por ~8 sectores y diez tramos. La tabla nunca llega a la API, y
    # la respuesta completa se guarda 10 min (`publico/mercado.py`).
    ("time_series", "sql:gasto_mensual_por_sector"),
    ("market_concentration", "sql:concentracion_de_mercados"),
    # La red: un recorrido entero de `competitors_by_market` (4,2 M filas) agrupado
    # por comprador en SQL; lo demás va por el índice de comprador, sólo para los
    # 30 de más monto. Vuelve un JSON de unos cientos de nodos y enlaces, y se
    # guarda con el resto de la respuesta.
    ("competitors_by_market", "sql:red_de_compradores"),
    # `/rubros/{slug}` (el panorama de BI): ~200 filas, los compradores con
    # banderas de riesgo. La misma excepción que en `test_bi_mercado_acotado.py`.
    ("buyer_risk_flags.parquet", "filas"),
}

#: Rutas que, con el índice en caché, no leen nada: salen enteras de él.
SOLO_DEL_INDICE = {"/sitemap"}

#: Rutas que no leen analytics, con su motivo.
EXENTAS = {
    # Cuenta el catálogo (`licitaciones`) con `count(*)` agrupados en SQL; lo
    # fijan `test_portada_hoy.py` y `test_licitaciones_abiertas.py`.
    "/portada",
}


def _primer_comprador_indexable() -> str:
    df = indexables.indice().compradores.filter(pl.col("indexable"))
    return df.get_column("codigo").to_list()[0]


def _primer_rubro_indexable() -> str:
    df = indexables.indice().rubros.filter(pl.col("indexable"))
    return df.get_column("slug").to_list()[0]


#: Las llamadas de cada ruta, con lo que pide un visitante: páginas que existen,
#: que no existen, y búsquedas con y sin palabras útiles.
LLAMADAS = {
    "/sitemap": [paginas.sitemap],
    "/mercado": [publico_mercado.mercado],
    "/compradores/{codigo}": [
        lambda: paginas.comprador(_primer_comprador_indexable()),
        lambda: paginas.comprador("999999999"),
    ],
    "/rubros/{slug}": [
        lambda: paginas.rubro(_primer_rubro_indexable()),
        lambda: paginas.rubro("no-existe"),
    ],
    "/productos": [
        lambda: paginas.buscar_productos("guante", 20),
        lambda: paginas.buscar_productos("jabon liquido", paginas.MAX_RESULTADOS_BUSQUEDA),
        lambda: paginas.buscar_productos("de la", 20),
    ],
    "/productos/{slug}": [
        lambda: paginas.producto("guante-nitrilo-prueba"),
        lambda: paginas.producto("cloro-prueba-unico"),
        lambda: paginas.producto("no-existe"),
    ],
}


class Registro(RegistroDeLecturas):
    """El doble de BI, más los tres agregados en SQL de `/publico/mercado`."""

    def instalar_mercado(self, monkeypatch) -> None:
        def registrar(nombre):
            def leer(tabla, *_args, **_kwargs):
                self.lecturas.append({"tabla": tabla, "sql": nombre})
                # Sin tabla: el bloque sale `null`. La forma la fija
                # `test_publico_mercado.py`, contra Postgres.
                return None

            return leer

        for nombre in (
            "gasto_mensual_por_sector",
            "concentracion_de_mercados",
            "red_de_compradores",
        ):
            monkeypatch.setattr(analytics_sync, nombre, registrar(nombre))


@pytest.fixture
def datos(monkeypatch) -> Registro:
    r = Registro()
    for parquet in sorted((GOLDEN / "fixture_analytics").glob("*.parquet")):
        r.tablas[parquet.name] = pl.read_parquet(parquet)
    r.instalar(
        monkeypatch,
        indexables,
        paginas,
        competencia,
        comprador,
        mercado,
        oportunidad,
        precio,
        rubro,
        temporal,
    )
    r.instalar_mercado(monkeypatch)
    indexables.invalidar()
    publico_mercado.invalidar()
    yield r
    indexables.invalidar()
    publico_mercado.invalidar()


def _rutas_publicas() -> set[str]:
    rutas = {
        prefijo + ruta.path
        for prefijo, ruta in iter_rutas(app)
        if (prefijo + ruta.path).startswith(PREFIJO + "/")
    }
    return {r.removeprefix(PREFIJO) for r in rutas}


def test_cada_ruta_publica_tiene_llamadas_o_una_exencion():
    rutas = _rutas_publicas()
    # Guarda: sin rutas, el test comprobaría el vacío (tests/rutas.py).
    assert len(rutas) >= 7, rutas
    sin_decidir = rutas - set(LLAMADAS) - EXENTAS
    assert not sin_decidir, (
        f"rutas de /publico sin llamadas en esta guarda: {sorted(sin_decidir)} — "
        "añádelas a LLAMADAS (o a EXENTAS, con su motivo, si no leen analytics)"
    )
    # Y nada de más: una entrada de una ruta que ya no existe es una guarda muerta.
    assert set(LLAMADAS) | EXENTAS <= rutas, sorted((set(LLAMADAS) | EXENTAS) - rutas)


def test_el_indice_solo_lee_entero_lo_declarado(datos):
    indexables.construir()

    enteras = {_clave(x) for x in datos.lecturas if not _acotada(x)}
    # Igualdad y no inclusión: una entrada que ya nadie lee entera es una excusa vieja.
    assert enteras == LECTURAS_DEL_INDICE
    # Lo demás que lee (la ventana) va acotado.
    assert any(_acotada(x) for x in datos.lecturas)


@pytest.mark.parametrize("ruta", sorted(LLAMADAS))
def test_ninguna_ruta_lee_una_tabla_entera_por_peticion(datos, ruta):
    # El índice, en caché como en producción: se construye antes y fuera de la cuenta.
    indexables.indice()
    datos.lecturas.clear()

    for llamada in LLAMADAS[ruta]:
        llamada()

    if ruta in SOLO_DEL_INDICE:
        assert datos.lecturas == [], f"{ruta} lee analytics con el índice en caché"
        return
    # Guarda: una ruta que no lee nada no comprueba nada (y una que dejó de leer
    # por un cambio de nombre de tabla tampoco).
    assert datos.lecturas, f"{ruta}: ninguna de sus llamadas registró una lectura"
    for lectura in datos.lecturas:
        clave = _clave(lectura)
        assert _acotada(lectura) or clave not in LECTURAS_DEL_INDICE, (
            f"{ruta} vuelve a leer lo que lee el índice, que está en caché: {lectura}"
        )
        assert _acotada(lectura) or clave in LECTURA_ENTERA_PERMITIDA, (
            f"{ruta} lee {lectura['tabla']} entera: {lectura}"
        )


def test_la_lista_de_lecturas_enteras_no_tiene_entradas_de_mas(datos):
    indexables.indice()
    datos.lecturas.clear()
    for llamadas in LLAMADAS.values():
        for llamada in llamadas:
            llamada()
    enteras = {_clave(x) for x in datos.lecturas if not _acotada(x)}
    assert enteras == LECTURA_ENTERA_PERMITIDA


def test_el_indice_se_lee_una_vez_por_ttl(datos):
    """Diez peticiones seguidas construyen el índice una sola vez."""
    for _ in range(10):
        paginas.sitemap()
        paginas.buscar_productos("guante", 20)

    construcciones = [
        x
        for x in datos.lecturas
        if _clave(x) == ("product_price_bands_L0N.parquet", "agregado:firma_producto")
    ]
    assert len(construcciones) == 1
