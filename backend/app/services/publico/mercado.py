"""El mercado entero en tres bloques para la portada (`GET /publico/mercado`).

- **`gasto_mensual`**: cuánto compró el Estado cada mes, por sector (de
  `analytics.time_series`). El sector vacío se suma a «Otros».
- **`concentracion`**: en cuántos mercados —un comprador en un rubro, la fila
  de `analytics.market_concentration`— un solo proveedor se lleva la mitad o
  más, y cómo se reparte la cuota del líder en tramos de 10 puntos, con el
  monto de cada tramo.
- **`red`**: los `N_COMPRADORES` compradores de más monto y los proveedores que
  les venden (de `analytics.competitors_by_market`, con el sector de cada
  comprador de `time_series`): los `POR_COMPRADOR` primeros de cada uno más los
  `AMPLIOS` que venden a más de ellos. Las personas naturales (seudónimos `PN-`)
  no son nodos ni enlaces, pero cuentan en los totales.

**Todo se agrega en Postgres** (`repositories/analytics_sync.py`): `time_series`
pesa 301 MB y `competitors_by_market` 497 MB en producción y leerla entera mató la API por memoria el
2026-10-14. Aquí sólo llegan unas decenas de filas.

Sin una de las tablas (un despliegue antes de la primera corrida semanal), su
bloque sale `null` y los otros siguen (la red sin `time_series` pone a todos sus
compradores en «Otros»): una portada a medias es mejor que un 500.

**Caché.** El resultado es igual toda la semana (analytics se re-materializa los
domingos), así que se guarda `TTL_SEGUNDOS` en memoria del proceso: un visitante
que repite la petición no repite el recorrido de dos tablas grandes. Sólo se
guarda una respuesta completa —los tres bloques—; con uno `null` se vuelve a preguntar, como
`existe_tabla` con el no.
"""

from __future__ import annotations

import threading
import time

from app.repositories import analytics_sync as repo

#: Las tablas de las que sale cada bloque. Variables de módulo para que un test
#: las apunte a tablas de juguete sin tocar las del golden master.
TABLA_GASTO = "time_series"
TABLA_CONCENTRACION = "market_concentration"
TABLA_RED = "competitors_by_market"

#: La red: cuántos compradores (los de más monto), cuántos proveedores de cada
#: uno y cuántos de los que venden a más de ellos. Variables de módulo para que
#: un test las cambie.
N_COMPRADORES = 30
POR_COMPRADOR = 4
AMPLIOS = 12
#: Hasta cuántos de los que le venden a la mitad o más se dibujan (todos, salvo que
#: pasen de esto: cada uno trae una línea a 15 o más compradores).
TOPE_AMPLIOS = 48

#: Cuánto vive la respuesta en memoria. Ver «Caché» en el docstring del módulo.
TTL_SEGUNDOS = 600

#: Ancho de cada tramo de la cuota del líder, en puntos porcentuales.
ANCHO_TRAMO = 100 // repo.TRAMOS_CUOTA


def _fecha(valor) -> str | None:
    """La ventana como `AAAA-MM-DD`: la tabla puede traerla como fecha o como texto."""
    return str(valor)[:10] if valor is not None else None


def _concentracion() -> dict | None:
    datos = repo.concentracion_de_mercados(TABLA_CONCENTRACION)
    if datos is None:
        return None
    por_tramo = {t["tramo"]: t for t in datos.pop("tramos")}
    tramos = [
        {
            "desde": i * ANCHO_TRAMO,
            "hasta": (i + 1) * ANCHO_TRAMO,
            "mercados": por_tramo.get(i, {}).get("mercados", 0),
            "monto": por_tramo.get(i, {}).get("monto", 0.0),
        }
        for i in range(repo.TRAMOS_CUOTA)
    ]
    return {
        **datos,
        "ventana_desde": _fecha(datos.get("ventana_desde")),
        "ventana_hasta": _fecha(datos.get("ventana_hasta")),
        "tramos": tramos,
    }


def _red() -> dict | None:
    red = repo.red_de_compradores(
        TABLA_RED,
        TABLA_GASTO,
        n_compradores=N_COMPRADORES,
        por_comprador=POR_COMPRADOR,
        amplios=AMPLIOS,
        tope_amplios=TOPE_AMPLIOS,
    )
    if red is None:
        return None
    return {
        **red,
        "ventana_desde": _fecha(red.get("ventana_desde")),
        "ventana_hasta": _fecha(red.get("ventana_hasta")),
    }


def construir() -> dict:
    """Lee los tres bloques. Sin caché: para eso está `mercado()`."""
    return {
        "gasto_mensual": repo.gasto_mensual_por_sector(TABLA_GASTO),
        "concentracion": _concentracion(),
        "red": _red(),
    }


#: El reloj de la caché, aparte para que un test lo mueva sin tocar `time`.
_reloj = time.monotonic

_cerrojo = threading.Lock()
_cache: tuple[float, dict] | None = None


def mercado() -> dict:
    """La respuesta, construida como mucho una vez cada `TTL_SEGUNDOS`.

    El cerrojo evita que varias peticiones simultáneas tras expirar la
    construyan a la vez: FastAPI corre estos endpoints síncronos en un threadpool.
    """
    global _cache
    with _cerrojo:
        ahora = _reloj()
        if _cache is not None and ahora - _cache[0] <= TTL_SEGUNDOS:
            return _cache[1]
        respuesta = construir()
        completa = all(v is not None for v in respuesta.values())
        _cache = (ahora, respuesta) if completa else None
        return respuesta


def invalidar() -> None:
    """Tira la respuesta en memoria. Para los tests, que cambian las tablas."""
    global _cache
    with _cerrojo:
        _cache = None
