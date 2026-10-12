"""Al arrancar en producción, la API avisa si el MCP sólo acepta localhost.

Con `MCP_HOSTS_PERMITIDOS` sin tocar, el despliegue arranca sano y el MCP
responde 421 a todo lo que llega por el dominio público: nada falla y nadie se
entera. Va con los avisos de `PROXY_SECRETO` y `CONFIAR_X_FORWARDED_FOR`.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config import Settings
from app.mcp.servidor import aviso_de_hosts


@pytest.mark.parametrize(
    "hosts",
    [["localhost", "127.0.0.1"], ["localhost"], ["127.0.0.1"], [" LOCALHOST "], []],
)
def test_en_produccion_avisa_si_solo_hay_hosts_locales(hosts):
    aviso = aviso_de_hosts(entorno="production", hosts=hosts)
    assert aviso is not None and "MCP_HOSTS_PERMITIDOS" in aviso


def test_con_el_dominio_publico_no_avisa():
    assert aviso_de_hosts(entorno="production", hosts=["localhost", "tordo.cl"]) is None


def test_fuera_de_produccion_no_avisa():
    assert aviso_de_hosts(entorno="development", hosts=["localhost", "127.0.0.1"]) is None


def test_el_valor_por_defecto_es_justamente_el_que_avisa(monkeypatch):
    """Si alguien cambia el valor por defecto, esta guarda tiene que revisarse."""
    monkeypatch.delenv("MCP_HOSTS_PERMITIDOS", raising=False)
    por_defecto = Settings().mcp_hosts_permitidos
    assert aviso_de_hosts(entorno="production", hosts=por_defecto) is not None


def test_main_lo_emite_al_arrancar():
    """El aviso no sirve si nadie lo llama: `main.py` lo emite con los demás."""
    fuente = (Path(__file__).parents[1] / "app" / "main.py").read_text()
    assert "aviso_de_hosts(" in fuente
