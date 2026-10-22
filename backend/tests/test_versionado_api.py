"""Las dos decisiones del ADR 0009, fijadas.

Ninguna de las dos rompe nada al deshacerse: un endpoint nuevo montado sin
versión funciona perfectamente, y una respuesta envuelta en `{success, data}`
también. Por eso hacen falta tests — el coste de la incoherencia sólo se paga
más tarde, cuando un integrador ya depende de las dos formas.
"""

from __future__ import annotations

import pytest

from app.core.versionado import PREFIJO_API, VERSION_API
from app.main import app
from tests.rutas import comprobar_recorrido, rutas_con_metodo

# Fuera de la versión a propósito. `/health` lo consulta el healthcheck de la
# plataforma; `/` es la raíz informativa; `/robots.txt` lo buscan los rastreadores
# en la raíz del dominio. Versionarlos obligaría a tocar la
# configuración de Railway en cada subida de versión.
SIN_VERSIONAR = {"/", "/robots.txt", "/health/", "/health/ready"}


def test_el_prefijo_es_el_que_dice_el_adr():
    """Si alguien sube a v2, tiene que ser una decisión, no un descuido."""
    assert VERSION_API == "v1"
    assert PREFIJO_API == "/api/v1"


def test_toda_ruta_del_producto_esta_versionada():
    comprobar_recorrido(app)

    sin_version = sorted(
        {
            ruta
            for _m, ruta, _d in rutas_con_metodo(app)
            if not ruta.startswith(PREFIJO_API) and ruta not in SIN_VERSIONAR
        }
    )
    assert not sin_version, (
        "Rutas fuera de la versión de la API:\n  "
        + "\n  ".join(sin_version)
        + f"\n\nMóntalas en main.py con `prefix={PREFIJO_API}` o añádelas a SIN_VERSIONAR "
        "con el motivo."
    )


def test_el_healthcheck_no_lleva_version():
    """Lo consulta la plataforma, no un cliente. Versionarlo obligaría a tocar
    la configuración de Railway en cada subida."""
    rutas = {ruta for _m, ruta, _d in rutas_con_metodo(app)}
    assert "/health/" in rutas
    assert f"{PREFIJO_API}/health/" not in rutas


def test_ningun_router_declara_la_version_por_su_cuenta():
    """El prefijo vive en un solo sitio.

    Si un router volviera a traer `/api` en su propio prefijo, publicar una v2
    dejaría de ser cambiar una línea y volvería a ser editar cada router —
    que es exactamente de donde se viene.
    """
    import pathlib

    api = pathlib.Path(__file__).resolve().parents[1] / "app" / "api"
    culpables = []
    for fichero in sorted(api.glob("*.py")):
        texto = fichero.read_text()
        if 'prefix="/api' in texto or '@router.get("/api/' in texto:
            culpables.append(fichero.name)
    assert not culpables, (
        "Estos routers declaran `/api` por su cuenta: " + ", ".join(culpables) + ". "
        "El prefijo lo pone main.py."
    )


@pytest.mark.parametrize(
    "ruta",
    [
        "/tenders/",
        "/tenders/codigo/{codigo_externo}",
        "/bi/rubros",
        "/bi/precio/{codigo_producto}",
        "/bi/licitacion/{codigo_externo}/panel",
    ],
)
def test_las_rutas_conocidas_siguen_existiendo_bajo_la_version(ruta):
    """Guarda contra un renombrado a medias: que TODO esté versionado no sirve
    de nada si por el camino se perdió media docena de endpoints."""
    documentadas = set(app.openapi()["paths"])
    assert f"{PREFIJO_API}{ruta}" in documentadas


def test_las_respuestas_no_van_envueltas():
    """ADR 0009: objeto plano, no `{success, data}`.

    Se comprueba sobre el propio OpenAPI y no sobre una respuesta suelta: lo que
    importa es el contrato publicado, que es lo que lee quien integra.
    """
    esquemas = app.openapi()["components"]["schemas"]
    envueltos = [
        nombre
        for nombre, esquema in esquemas.items()
        if isinstance(esquema.get("properties"), dict)
        and {"success", "data"} <= set(esquema["properties"])
    ]
    assert not envueltos, (
        "Estos esquemas devuelven un envelope: "
        + ", ".join(envueltos)
        + ". El ADR 0009 fija respuestas planas — el éxito ya lo lleva el código HTTP."
    )


def test_ningun_modulo_escribe_una_ruta_de_la_api_a_mano():
    """Una ruta literal `/api/...` en el código es una bomba de relojería.

    No falla al arrancar ni al compilar: sigue ahí, apuntando a una versión que
    ya no existe. Al versionar la API esto dejó **cuatro** referencias rotas, y
    ninguna hizo fallar un test:

    - el middleware de límite de peticiones dejó de coincidir con los endpoints
      de BI, así que los 22 más caros del producto quedaron **sin límite, en
      silencio**;
    - `get_download_url` devolvía un enlace de descarga a un 404;
    - el `tokenUrl` de OAuth2 dejó el botón «Authorize» de la documentación
      apuntando a una ruta inexistente;
    - el catálogo de `/data/tables` anunciaba endpoints que ya no estaban.

    Todas se componen ahora con `PREFIJO_API`.
    """
    import pathlib

    app_dir = pathlib.Path(__file__).resolve().parents[1] / "app"
    culpables: list[str] = []
    for fichero in sorted(app_dir.rglob("*.py")):
        if fichero.name == "versionado.py":
            continue
        for numero, linea in enumerate(fichero.read_text().splitlines(), 1):
            # Sólo cadenas: los comentarios y docstrings que citan una ruta como
            # ejemplo no rompen nada.
            if '"/api/' in linea or "'/api/" in linea:
                sin_comentario = linea.split("#", 1)[0]
                if '"/api/' in sin_comentario or "'/api/" in sin_comentario:
                    culpables.append(f"{fichero.relative_to(app_dir)}:{numero}")

    assert not culpables, (
        "Rutas de la API escritas a mano:\n  "
        + "\n  ".join(culpables)
        + "\n\nCompónlas con `PREFIJO_API`: al subir de versión, una cadena literal no "
        "falla — deja de coincidir en silencio."
    )
