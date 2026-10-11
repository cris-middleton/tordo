"""La anotación de un parámetro con `Depends` tiene que decir lo que llega.

Por qué existe
--------------
FastAPI **no comprueba la anotación de un parámetro que viene por `Depends`**:
inyecta lo que devuelva la dependencia, diga lo que diga el tipo. Así que una
firma puede mentir sin que falle nada — ni el arranque, ni ruff, ni un test.

Y mintió. `check_bi_quota_dep` devuelve la **empresa** que paga la consulta, y
diecinueve endpoints de BI la recibían así:

    current_user: User = Depends(check_bi_quota_dep)

El nombre y el tipo se equivocaban a la vez. Diecisiete no tocaban el parámetro
y por eso funcionaban; los dos que sí —`/bi/mi_posicion` y el panel de
licitación— mandaban el UUID de la empresa a una columna de enteros y morían con
500: «invalid input for query argument $2: UUID(…) (value out of int32 range)».
Falla cerrado —no se escapó ningún dato— pero se cayeron dos pantallas, y una de
ellas es «Tu posición», que es de lo que se vende.

Lo que no existía era algo que comparase las dos cosas. Esto lo hace.

Las dependencias sin anotación de retorno se saltan: la comprobación es sobre lo
que el código **declara**, y obligar a anotarlo todo es otra discusión.
"""

from __future__ import annotations

import inspect
import typing
from collections.abc import AsyncGenerator, AsyncIterator, Generator, Iterator

from fastapi.params import Depends as DependsParam

from app.main import app
from tests.rutas import iter_rutas

#: `get_db` es un generador que **cede** una `AsyncSession`, así que el
#: parámetro se anota con lo cedido y no con el generador. Sin desenvolverlo,
#: las rutas que piden `db` saldrían como falsos positivos y el test sería
#: ruido que alguien acabaría borrando.
ENVOLTORIOS = (AsyncGenerator, AsyncIterator, Generator, Iterator)

#: Cuántos parámetros con `Depends` y anotación tiene que encontrar el recorrido.
#: Antes era `MINIMO_PLAUSIBLE` (50); el pivote público retiró las cuentas y con
#: ellas las dependencias de sesión, empresa y cuota. Quedan las rutas que piden
#: `db` —las tres del catálogo y el panel de licitación—. La guarda sigue: un
#: recorrido roto daría cero.
MINIMO_REVISADOS = 4


def _tipo_inyectado(dependencia) -> object | None:
    """Lo que la dependencia deja en el parámetro, desenvuelto si es generador."""
    try:
        devuelto = typing.get_type_hints(dependencia).get("return")
    except Exception:
        return None
    if devuelto is None:
        return None

    origen = typing.get_origin(devuelto)
    if origen is not None and any(origen is getattr(e, "__origin__", e) for e in ENVOLTORIOS):
        args = typing.get_args(devuelto)
        return args[0] if args else None
    return devuelto


def _parametros_con_depends():
    for prefijo, ruta in iter_rutas(app):
        try:
            firma = inspect.signature(ruta.endpoint)
            pistas = typing.get_type_hints(ruta.endpoint)
        except Exception:  # pragma: no cover — una firma que no se puede leer
            continue
        for nombre, par in firma.parameters.items():
            dependencia = getattr(par.default, "dependency", None)
            if not isinstance(par.default, DependsParam) or dependencia is None:
                continue
            yield prefijo + ruta.path, nombre, pistas.get(nombre), dependencia


def test_ninguna_firma_declara_un_tipo_que_no_recibe():
    revisados = 0
    mentiras = []

    for ruta, nombre, declarado, dependencia in _parametros_con_depends():
        inyectado = _tipo_inyectado(dependencia)
        if declarado is None or inyectado is None:
            continue
        revisados += 1
        if declarado is not inyectado:
            mentiras.append(
                f"{ruta} — `{nombre}` se anota "
                f"{getattr(declarado, '__name__', declarado)} pero "
                f"{dependencia.__name__}() inyecta "
                f"{getattr(inyectado, '__name__', inyectado)}"
            )

    # La guarda importa tanto como la comprobación: si el recorrido de rutas se
    # rompe —ya pasó al subir de FastAPI 0.104— este test se quedaría mudo
    # dando el vacío por bueno.
    assert revisados >= MINIMO_REVISADOS, (
        f"sólo se revisaron {revisados} parámetros con Depends y anotación; "
        "el recorrido de rutas está roto, no es que no haya nada que revisar"
    )

    assert not mentiras, "FastAPI inyecta lo que devuelve la dependencia, no lo " + (
        "que dice la anotación:\n  " + "\n  ".join(sorted(mentiras))
    )
