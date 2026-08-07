"""Recorrido de las rutas de la app, en un solo sitio.

Por qué existe
--------------
Dos tests de seguridad se apoyan en introspeccionar las rutas: el estructural de
multi-tenancy y el de contrato de BI. Ambos recorrían `app.routes` directamente.

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

from collections.abc import Iterator

from fastapi.routing import APIRoute

# Por debajo de esto, el recorrido está roto y no es que falten rutas. La app
# tiene ~90; el margen es amplio a propósito para que no haya que tocarlo cada
# vez que se añade o se quita un endpoint.
MINIMO_PLAUSIBLE = 50


def iter_rutas(app) -> Iterator[APIRoute]:
    """Todas las `APIRoute` de la app, incluidas las de routers anidados."""

    def _recorrer(routes) -> Iterator[APIRoute]:
        for r in routes:
            if isinstance(r, APIRoute):
                yield r
            elif hasattr(r, "original_router"):
                # `_IncludedRouter` (FastAPI ≥ 0.115): el envoltorio guarda el
                # router original, y sus rutas ya llevan el prefijo aplicado.
                yield from _recorrer(r.original_router.routes)

    yield from _recorrer(app.routes)


def rutas_con_metodo(app) -> list[tuple[str, str, set[str]]]:
    """(método, path, nombres de las dependencias declaradas) por ruta.

    Es la forma que consumen los tests estructurales: lo que les interesa no es
    la ruta en sí, sino **qué protección declara**.
    """
    filas: list[tuple[str, str, set[str]]] = []
    for r in iter_rutas(app):
        deps = {d.call.__name__ for d in r.dependant.dependencies if getattr(d, "call", None)}
        for metodo in r.methods - {"HEAD", "OPTIONS"}:
            filas.append((metodo, r.path, deps))
    return filas
