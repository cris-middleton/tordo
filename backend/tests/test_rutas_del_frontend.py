"""Toda ruta que llama el frontend existe en el backend.

`frontend/lib/api.ts` pedía `/bi/licitacion/{codigo}/match` y la ruta es
`/bi/licitacion-match/{codigo}`. El 404 se lo tragaba un `.catch` comentado
como «TF-IDF not enabled — skip», así que el encaje —el matching semántico que
se vende en Pro— no salía en ninguna ficha de licitación y nada lo decía.

Ningún test lo podía ver: los del backend prueban sus rutas y los del frontend
simulan las respuestas. Éste lee las rutas del cliente y las busca en la app.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.core.versionado import PREFIJO_API
from app.main import app
from tests.rutas import MINIMO_PLAUSIBLE, iter_rutas

FRONTEND_LIB = Path(__file__).resolve().parents[2] / "frontend" / "lib"
#: Los dos clientes del backend: el del navegador (por el proxy) y el de los
#: componentes de servidor (sitemap, fichas públicas, portada). Hasta el
#: rediseño sólo se leía el primero, y una ruta mal escrita en el segundo
#: ocultaba un bloque de la portada para siempre sin que nada fallara.
CLIENTES = (FRONTEND_LIB / "api.ts", FRONTEND_LIB / "publicoServidor.ts")

# `${API}/…` hasta el cierre de la plantilla.
_LLAMADA = re.compile(r"\$\{API\}(/[^`'\"]*)")
_INTERPOLACION = re.compile(r"\$\{[^}]*\}")
_PARAMETRO = re.compile(r"\{[^}]+\}")
# `/publico${ruta}`: un segmento pegado a una interpolación se compone en
# ejecución; no hay ruta fija que comprobar.
_COMPUESTA = re.compile(r"[^/]\$\{")


def rutas_del_frontend() -> set[str]:
    rutas: set[str] = set()
    for cliente in CLIENTES:
        for m in _LLAMADA.finditer(cliente.read_text()):
            ruta = m.group(1).split("?", 1)[0]
            # `${API}/${ruta}` y `/publico${ruta}` componen la ruta en ejecución.
            if ruta.startswith("/${") or _COMPUESTA.search(ruta):
                continue
            rutas.add(ruta)
    return rutas


def _como_patron(ruta_backend: str) -> re.Pattern[str]:
    partes = _PARAMETRO.split(ruta_backend)
    cuerpo = "[^/]+".join(re.escape(p) for p in partes).rstrip("/")
    # La barra final no decide nada: FastAPI redirige de una a otra.
    return re.compile(f"^{cuerpo}/?$")


def test_el_recorrido_encuentra_rutas_en_los_dos_lados():
    # Antes ≥40; el pivote público retiró las cuentas y el cliente sólo llama al
    # catálogo y al BI (~20 rutas). La guarda sigue: con la regex rota serían 0.
    assert len(rutas_del_frontend()) >= 15, "el cliente cambió de forma; revisa _LLAMADA"
    assert len(list(iter_rutas(app))) >= MINIMO_PLAUSIBLE


def test_cada_ruta_del_cliente_existe_en_la_api():
    patrones = [_como_patron(prefijo + r.path) for prefijo, r in iter_rutas(app)]

    faltan = sorted(
        ruta
        for ruta in rutas_del_frontend()
        if not any(p.match(PREFIJO_API + _INTERPOLACION.sub("X", ruta)) for p in patrones)
    )

    assert not faltan, f"el frontend llama rutas que el backend no tiene: {faltan}"
