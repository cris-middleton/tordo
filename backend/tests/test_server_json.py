"""La ficha del servidor MCP en los registros (spec del rediseño §7.4).

`server.json` (raíz del repo) es lo que `mcp-publisher publish` sube al registro
oficial de MCP, y de ahí la copian Glama y otros agregadores. Tres cosas que un
cambio bienintencionado rompe sin que nada falle:

1. **Que cumpla el esquema oficial.** El registro lo valida al publicar; aquí se
   valida antes, sin red, contra una copia (`fixtures/`).
2. **Que su URL sea la canónica del sitio** —`URL_MCP` en
   `frontend/lib/abierto.ts`, con barra final—. Si el dominio cambia y la ficha
   no, los registros mandan a la gente a otro sitio.
3. **Que la versión sea exacta.** El registro no acepta rangos, y cada versión
   publicada es inmutable: cambiar la ficha exige subirla (docs/DESPLIEGUE.md §12.1).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from jsonschema import Draft7Validator, Draft202012Validator

RAIZ = Path(__file__).resolve().parents[2]
FICHA = RAIZ / "server.json"
ESQUEMA = Path(__file__).resolve().parent / "fixtures" / "mcp-server.schema-2025-12-11.json"
ABIERTO = RAIZ / "frontend" / "lib" / "abierto.ts"

URL_ESQUEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json"

_ORIGEN = re.compile(r"export const ORIGEN_API_PUBLICA = '([^']+)';")
_URL_MCP = re.compile(r"export const URL_MCP = `\$\{ORIGEN_API_PUBLICA\}([^`]+)`;")
_SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def _ficha() -> dict:
    return json.loads(FICHA.read_text(encoding="utf-8"))


def test_cumple_el_esquema_oficial():
    esquema = json.loads(ESQUEMA.read_text(encoding="utf-8"))
    validador = (
        Draft7Validator if "draft-07" in esquema.get("$schema", "") else Draft202012Validator
    )
    errores = sorted(validador(esquema).iter_errors(_ficha()), key=lambda e: list(e.path))
    assert not errores, "\n".join(f"{list(e.path)}: {e.message}" for e in errores)


def test_el_esquema_valida_de_verdad():
    # Guarda: el esquema oficial cuelga todo de un `$ref` en la raíz. Si el validador
    # lo ignorara, `test_cumple_el_esquema_oficial` pasaría con cualquier cosa.
    esquema = json.loads(ESQUEMA.read_text(encoding="utf-8"))
    validador = (
        Draft7Validator if "draft-07" in esquema.get("$schema", "") else Draft202012Validator
    )
    assert list(validador(esquema).iter_errors({})), "el esquema acepta una ficha vacía"


def test_declara_el_esquema_que_se_valida():
    assert _ficha()["$schema"] == URL_ESQUEMA


def test_es_un_servidor_remoto_sin_paquetes():
    ficha = _ficha()
    assert "packages" not in ficha
    assert len(ficha["remotes"]) == 1
    assert ficha["remotes"][0]["type"] == "streamable-http"
    # Anónimo: ni cabeceras ni variables que pedir al usuario.
    assert "headers" not in ficha["remotes"][0]
    assert "variables" not in ficha["remotes"][0]


def test_la_url_es_la_canonica_del_frontend():
    fuente = ABIERTO.read_text(encoding="utf-8")
    origen = _ORIGEN.search(fuente)
    sufijo = _URL_MCP.search(fuente)
    # Guarda: una expresión que no encuentra nada compararía el vacío con el vacío.
    assert origen and sufijo, "no se encontró ORIGEN_API_PUBLICA / URL_MCP en lib/abierto.ts"
    url_mcp = origen.group(1) + sufijo.group(1)
    assert url_mcp.endswith("/mcp/"), url_mcp
    assert _ficha()["remotes"][0]["url"] == url_mcp


def test_el_nombre_es_del_dominio_del_sitio():
    # Verificado por DNS sobre tordo.cl: el espacio de nombres es su forma inversa.
    assert _ficha()["name"].startswith("cl.tordo/")


def test_la_version_es_semver_exacta():
    assert _SEMVER.match(_ficha()["version"]), _ficha()["version"]


def test_los_iconos_y_la_web_son_del_sitio_y_https():
    ficha = _ficha()
    assert ficha["websiteUrl"].startswith("https://tordo.cl/")
    assert ficha["icons"], "sin iconos la ficha sale con uno genérico"
    for icono in ficha["icons"]:
        assert icono["src"].startswith("https://tordo.cl/"), icono["src"]
        # Cada icono es un fichero que el sitio sirve de verdad desde frontend/public.
        ruta = RAIZ / "frontend" / "public" / icono["src"].removeprefix("https://tordo.cl/")
        assert ruta.is_file(), f"{icono['src']} no existe en frontend/public"


def test_el_repositorio_es_el_publico():
    # Desde la 1.1.0: con el repo ya público (2026-10-15). Una URL privada daría un 404
    # a quien la siga desde el registro. Es la misma que REPOSITORIO_URL en Vercel.
    repo = _ficha()["repository"]
    assert repo == {"url": "https://github.com/cris-middleton/tordo", "source": "github"}, repo
