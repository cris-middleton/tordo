"""Recorrido de las rutas de la app, en un solo sitio.

Por qué existe
--------------
Varios tests estructurales se apoyan en introspeccionar las rutas —entonces el de
multi-tenancy y el de contrato de BI—, y recorrían `app.routes` directamente.

**FastAPI 0.141 dejó de aplanar los routers incluidos**: `app.routes` devuelve
envoltorios `_IncludedRouter` en vez de las `APIRoute` de dentro. Al actualizar
desde 0.104, los dos tests pasaron a encontrar **cero rutas**.

Lo que salvó la situación fue tener guardas explícitas —"se esperaban ≥10 rutas
con empresa_id, hay 0"— en vez de dar por bueno un recorrido vacío. Un test
estructural sin esa guarda habría seguido en verde sin comprobar nada.

Concentrarlo aquí es la consecuencia: cuando FastAPI vuelva a cambiar la forma
de sus rutas, se rompe **un** archivo y la guarda lo dice, en vez de que dos
tests se queden mudos.
"""

from __future__ import annotations

import re
from collections.abc import Iterator

from fastapi.routing import APIRoute

# Por debajo de esto, el recorrido está roto y no es que falten rutas. Antes 50,
# con ~90 rutas; el pivote público retiró las cuentas y el TF-IDF de la API, y
# quedan 24 (tenders 3, bi 18, health 2, raíz 1). El margen sigue siendo amplio a propósito para que no
# haya que tocarlo cada vez que se añade o se quita un endpoint.
MINIMO_PLAUSIBLE = 20


def iter_rutas(app) -> Iterator[tuple[str, APIRoute]]:
    """`(prefijo acumulado, APIRoute)` de toda la app, routers anidados incluidos.

    El prefijo se acumula porque **ya no viene dentro de la ruta**: desde que la
    versión (`/api/v1`) se aplica en `include_router`, `route.path` vale
    `/tenders/` y no `/api/v1/tenders/`. Concatenarlo aquí es lo que hace que los
    tests de contrato sigan comparando rutas de verdad.
    """

    def _recorrer(routes, prefijo: str) -> Iterator[tuple[str, APIRoute]]:
        for r in routes:
            if isinstance(r, APIRoute):
                yield prefijo, r
            elif hasattr(r, "original_router"):
                # `_IncludedRouter` (FastAPI ≥ 0.115) envuelve el router original
                # y guarda en `include_context` el prefijo con que se incluyó.
                contexto = getattr(r, "include_context", None)
                yield from _recorrer(
                    r.original_router.routes,
                    prefijo + (getattr(contexto, "prefix", "") or ""),
                )

    yield from _recorrer(app.routes, "")


def rutas_con_metodo(app) -> list[tuple[str, str, set[str]]]:
    """(método, path completo, nombres de las dependencias declaradas) por ruta.

    Es la forma que consumen los tests estructurales: lo que les interesa no es
    la ruta en sí, sino **qué protección declara**.
    """
    filas: list[tuple[str, str, set[str]]] = []
    for prefijo, r in iter_rutas(app):
        deps = {d.call.__name__ for d in r.dependant.dependencies if getattr(d, "call", None)}
        for metodo in r.methods - {"HEAD", "OPTIONS"}:
            filas.append((metodo, prefijo + r.path, deps))
    return filas


def comprobar_recorrido(app) -> None:
    """Falla si el recorrido perdió rutas o dejó de componer bien los prefijos.

    Compara contra el propio OpenAPI, que es la lista de rutas que FastAPI
    publica de verdad. Se exige que **toda** ruta documentada aparezca en el
    recorrido; puede haber más (una ruta con `include_in_schema=False` no sale en
    OpenAPI pero sí aquí), nunca menos.

    Hace falta porque el prefijo se saca de `include_context`, que es detalle
    interno de FastAPI. Si un día deja de existir, esto lo dice — en vez de que
    los tests estructurales se queden comparando `/tenders/`
    contra `/api/v1/tenders/` y encuentren cero coincidencias.
    """

    # `{key:path}` en la ruta se publica como `{key}` en OpenAPI: el conversor
    # es detalle de enrutado, no parte del contrato.
    def _sin_conversor(ruta: str) -> str:
        return re.sub(r"\{([^:}]+):[^}]+\}", r"{\1}", ruta)

    recorridas = {_sin_conversor(ruta) for _m, ruta, _d in rutas_con_metodo(app)}

    assert len(recorridas) >= MINIMO_PLAUSIBLE, (
        f"el recorrido encuentra {len(recorridas)} rutas, se esperaban ≥{MINIMO_PLAUSIBLE} — "
        "revisa tests/rutas.py"
    )

    documentadas = set(app.openapi()["paths"])
    perdidas = documentadas - recorridas
    assert not perdidas, (
        "el recorrido no encuentra rutas que la app sí publica — probablemente "
        "se perdió el prefijo al recorrer los routers incluidos:\n  "
        + "\n  ".join(sorted(perdidas)[:10])
    )
