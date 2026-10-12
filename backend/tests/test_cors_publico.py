"""La API pública acepta llamadas desde el navegador de cualquier origen.

Es una API anónima y de sólo lectura (spec D6): limitarla con CORS a los
dominios del propio sitio bloqueaba justo a los integradores para quienes se
publica, cuando la llaman desde una aplicación web. En producción va
`CORS_ORIGINS=*` **sin credenciales** —no hay cookie ni sesión que filtrar— y el
límite por IP sigue contando a cada visitante por su IP.

Lo que **no** abre: el MCP. Su protección es la lista blanca de `Host` y de
`Origin` contra DNS rebinding (`app/mcp/servidor.py`), que CORS no toca. Un
cliente MCP de servidor no manda `Origin` y funciona; una página de otro
dominio no puede hablarle desde el navegador de un visitante.

Corre en un proceso aparte porque `CORS_ORIGINS` se lee al importar la app.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]

SONDA = r"""
import json
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app).__enter__()  # con ciclo de vida: el MCP necesita su gestor
origen = {"Origin": "https://integrador.example"}
salud = c.get("/health/", headers=origen)
previa = c.options(
    "/api/v1/tenders/",
    headers={**origen, "Access-Control-Request-Method": "GET",
             "Access-Control-Request-Headers": "content-type"},
)
mcp = c.post(
    "/mcp/",
    headers={**origen, "Host": "localhost",
             "Accept": "application/json, text/event-stream",
             "Content-Type": "application/json"},
    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
)
print(json.dumps({
    "acao": salud.headers.get("access-control-allow-origin"),
    "credenciales": salud.headers.get("access-control-allow-credentials"),
    "previa": previa.status_code,
    "acao_previa": previa.headers.get("access-control-allow-origin"),
    "mcp": mcp.status_code,
}))
"""


def _sondear(cors: str) -> dict:
    entorno = {**os.environ, "CORS_ORIGINS": cors}
    salida = subprocess.run(
        [sys.executable, "-c", SONDA],
        cwd=BACKEND,
        env=entorno,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert salida.returncode == 0, salida.stderr[-2000:]
    return json.loads(salida.stdout.strip().splitlines()[-1])


def test_con_asterisco_cualquier_origen_recibe_acao_asterisco():
    r = _sondear("*")
    assert r["acao"] == "*"
    # Sin credenciales: con `*` el navegador no mandaría cookies, y no hay ninguna.
    assert r["credenciales"] is None
    assert r["previa"] == 200 and r["acao_previa"] == "*"


def test_el_mcp_sigue_protegido_por_su_lista_de_origenes():
    """CORS abierto no abre el MCP a una página de otro dominio."""
    assert _sondear("*")["mcp"] in (403, 421)


def test_con_la_lista_del_sitio_otro_origen_no_recibe_acao():
    """El valor anterior, por contraste: es lo que dejaba fuera a los integradores."""
    assert _sondear("https://tordo.cl")["acao"] is None
