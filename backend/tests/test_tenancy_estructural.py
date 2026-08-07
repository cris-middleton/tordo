"""Verifica que ninguna ruta con `{empresa_id}` en el path se salte la autorización.

Este test no prueba una función: prueba una **propiedad del código**. Recorre las
rutas registradas en la app y comprueba que las que reciben un `empresa_id` por
path declaren la dependencia que resuelve el contexto de empresa.

Por qué importa: TORDO es multi-inquilino y hasta F3 el aislamiento dependía de
que cada endpoint llamara a mano a un helper, repetido en 12+ sitios y con cuatro
variantes distintas inlineadas en `bi.py`. Un endpoint nuevo al que se le olvide
la llamada es una fuga de datos entre empresas — y nada lo impedía.

Este test es lo que lo impide ahora: si alguien añade una ruta con `{empresa_id}`
sin la dependencia, CI falla.

Limitación conocida y deliberada: sólo cubre el `empresa_id` que llega por PATH.
Cuando llega por query o en el cuerpo del request no puede resolverse como
dependencia, y esos casos llaman a `verificar_acceso_empresa` directamente. El
test los lista abajo de forma explícita para que la excepción sea visible y no
se pueda ampliar sin querer.
"""

from __future__ import annotations

from fastapi.routing import APIRoute

from app.api.deps import empresa_ctx, empresa_ctx_opcional, verificar_acceso_empresa
from app.main import app
from tests.rutas import MINIMO_PLAUSIBLE, iter_rutas

# Nombres de dependencia que cuentan como autorización resuelta.
DEPENDENCIAS_VALIDAS = {empresa_ctx.__name__, empresa_ctx_opcional.__name__}

# Rutas con `{empresa_id}` que a propósito NO usan la dependencia.
# Vacío hoy. Añadir algo aquí exige justificarlo en la revisión del PR.
EXCEPCIONES: set[str] = set()

# Endpoints donde el empresa_id NO viene por path y por tanto no puede resolverse
# como dependencia. Verifican con `verificar_acceso_empresa`, que es la misma
# implementación. Se listan para que la excepción sea visible.
VERIFICAN_A_MANO = {
    "crear_postulacion",  # empresa_id en el cuerpo
    "obtener_postulacion",  # empresa_id de la entidad cargada
    "actualizar_postulacion",
    "toggle_checklist_item",
}


def _nombres_de_dependencias(ruta: APIRoute) -> set[str]:
    """Todos los nombres de callable del árbol de dependencias de la ruta."""
    nombres: set[str] = set()
    pendientes = list(ruta.dependant.dependencies)
    while pendientes:
        d = pendientes.pop()
        if d.call is not None:
            nombres.add(getattr(d.call, "__name__", ""))
        pendientes.extend(d.dependencies)
    return nombres


def _rutas_con_empresa_id_en_path() -> list[APIRoute]:
    # El recorrido vive en tests/rutas.py: FastAPI 0.141 dejó de aplanar los
    # routers incluidos y `app.routes` pasó a devolver envoltorios.
    return [r for r in iter_rutas(app) if "{empresa_id}" in r.path]


def test_hay_rutas_que_verificar():
    """Si esto falla, el test dejó de cubrir nada y hay que revisarlo."""
    # Dos guardas, no una. La segunda distingue "faltan rutas de empresa" de
    # "el recorrido está roto", que es lo que pasó al actualizar FastAPI.
    assert len(list(iter_rutas(app))) >= MINIMO_PLAUSIBLE, (
        "el recorrido de rutas no encuentra la app entera — revisa tests/rutas.py, "
        "probablemente FastAPI cambió la forma de sus rutas"
    )
    rutas = _rutas_con_empresa_id_en_path()
    assert len(rutas) >= 10, f"se esperaban ≥10 rutas con empresa_id, hay {len(rutas)}"


def test_toda_ruta_con_empresa_id_declara_la_dependencia():
    sin_proteger = []
    for ruta in _rutas_con_empresa_id_en_path():
        nombre = ruta.name
        if nombre in EXCEPCIONES:
            continue
        if not (_nombres_de_dependencias(ruta) & DEPENDENCIAS_VALIDAS):
            sin_proteger.append(f"{list(ruta.methods)[0]} {ruta.path} → {nombre}()")

    assert not sin_proteger, (
        "Estas rutas reciben un empresa_id por path pero NO declaran "
        "`empresa_ctx` ni `require_rol(...)`. Sin eso, cualquier usuario "
        "autenticado accede a los datos de cualquier empresa adivinando el UUID.\n\n"
        + "\n".join(f"  - {r}" for r in sin_proteger)
        + "\n\nVer .claude/skills/endpoint-empresa/SKILL.md"
    )


def test_los_que_verifican_a_mano_usan_la_misma_implementacion():
    """Los endpoints que no pueden usar la dependencia deben llamar a la función
    compartida, no reimplementar la consulta."""
    import inspect

    from app.api import postulaciones

    for nombre in VERIFICAN_A_MANO:
        fn = getattr(postulaciones, nombre, None)
        assert fn is not None, f"{nombre} ya no existe — actualiza VERIFICAN_A_MANO"
        fuente = inspect.getsource(fn)
        assert verificar_acceso_empresa.__name__ in fuente, (
            f"{nombre}() recibe un empresa_id que no viene por path y debe verificarlo "
            f"con verificar_acceso_empresa(), no con una consulta propia."
        )


def test_no_quedan_consultas_de_membresia_reimplementadas():
    """Nadie debe volver a inlinear la comprobación en un router.

    Es exactamente lo que había antes: la misma consulta repetida con variantes
    sutilmente distintas, imposible de auditar.
    """
    import pathlib

    raiz = pathlib.Path(__file__).resolve().parents[1] / "app" / "api"
    ofensores = []
    for archivo in raiz.glob("*.py"):
        if archivo.name == "deps.py":
            continue
        texto = archivo.read_text()
        if "EmpresaUsuario.user_id ==" in texto and "select(EmpresaUsuario)" in texto:
            ofensores.append(archivo.name)

    # bi.py conserva UNA consulta deliberada: un chequeo blando que sólo decide
    # si enriquecer la respuesta, sin rechazar la petición.
    # Excepciones legítimas, cada una con su motivo:
    #  - empresas.py: consulta las membresías DEL PROPIO usuario (listar sus
    #    empresas, comprobar si ya tiene acceso al crear). No autoriza un
    #    empresa_id de entrada, así que no es el patrón peligroso.
    #  - bi.py: un chequeo blando que sólo decide si enriquecer la respuesta.
    #  - dashboard.py, tenders.py, data_inspection.py: filtran por las empresas
    #    del usuario, no autorizan un empresa_id ajeno.
    permitidos = {"empresas.py", "bi.py", "dashboard.py", "tenders.py", "data_inspection.py"}
    inesperados = set(ofensores) - permitidos
    assert not inesperados, (
        "Estos routers reimplementan la consulta de membresía en vez de usar "
        f"app/api/deps.py: {sorted(inesperados)}"
    )
