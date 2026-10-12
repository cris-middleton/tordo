"""Contrato de los 18 endpoints de BI.

El golden master verifica `services/bi/`: que las funciones devuelvan los mismos
números. **No verifica la capa HTTP.** Este archivo cubre esa capa: se declara lo
esperado y el test recorre las rutas reales. Un endpoint nuevo aparece como fallo
hasta que alguien decida explícitamente qué protección le toca.

Desde el pivote público (docs/PIVOTE_PUBLICO_2026-10.md) queda un solo nivel:

- `publica` — **ninguna** dependencia de sesión, empresa, plan ni cuota. La única
              protección es el límite por IP de `/api/v1/bi/*`.

El nivel `cuenta` desapareció con las cuentas. Si vuelve a hacer falta otro
nivel, se declara aquí con su motivo.
"""

from __future__ import annotations

import pytest

from app.core.versionado import PREFIJO_API
from app.main import app
from tests.rutas import comprobar_recorrido, rutas_con_metodo

CONTRATO: dict[tuple[str, str], str] = {
    ("GET", "/bi/competidores/{organismo_id}"): "publica",
    ("GET", "/bi/comprador/{organismo_id}"): "publica",
    ("GET", "/bi/descuento"): "publica",
    ("GET", "/bi/diversificacion/{codigo_proveedor}"): "publica",
    ("GET", "/bi/estacionalidad/{organismo_id}"): "publica",
    ("GET", "/bi/forecast_competidores"): "publica",
    # El panel deja de enriquecerse con la postulación y el estado hábil de la
    # empresa: sin cuentas no hay empresa a la que mirar.
    ("GET", "/bi/licitacion/{codigo_externo}/panel"): "publica",
    ("GET", "/bi/oportunidades"): "publica",
    ("GET", "/bi/precio/{codigo_producto}"): "publica",
    ("GET", "/bi/resumen"): "publica",
    ("GET", "/bi/sector"): "publica",
    ("GET", "/bi/tendencia"): "publica",
    ("GET", "/bi/ventana/{codigo_externo}"): "publica",
    ("GET", "/bi/rubros"): "publica",
    ("GET", "/bi/productos"): "publica",
    ("GET", "/bi/panorama"): "publica",
    # La exportación ya no descuenta cuota porque no hay cuota. La acota el tope
    # de filas de `exportar.MAX_FILAS_CSV` (spec del pivote §7.4).
    ("GET", "/bi/exportar/precio/{codigo_producto}"): "publica",
    ("GET", "/bi/exportar/competidores/{organismo_id}"): "publica",
}

#: Lo ÚNICO que una ruta `publica` puede declarar: la sesión de base de datos.
#: Son los nombres de las funciones de dependencia, que es lo que
#: `rutas_con_metodo` devuelve. Era una lista de prohibidas (sesión, empresa,
#: plan, cuota); sin cuentas, una lista de permitidas es más estricta — una
#: dependencia nueva de cualquier tipo obliga a decidir si cabe aquí.
PERMITIDAS_EN_PUBLICA = {"get_db"}


def _rutas_bi() -> list[tuple[str, str, set[str]]]:
    """Las rutas de BI, con la ruta SIN el prefijo de versión.

    La tabla de arriba se escribe relativa (`/bi/rubros`) a propósito: sacar
    una v2 no debería obligar a reescribir 18 líneas que no han cambiado de
    significado.

    El recorrido vive en tests/rutas.py, compartido con otros tests
    estructurales: FastAPI 0.141 dejó de aplanar los routers incluidos y todos
    pasaron a encontrar cero rutas a la vez.
    """
    marca = f"{PREFIJO_API}/bi/"
    return [
        (metodo, ruta[len(PREFIJO_API) :], deps)
        for metodo, ruta, deps in rutas_con_metodo(app)
        if ruta.startswith(marca)
    ]


def test_el_recorrido_de_rutas_funciona():
    """Guarda antes que nada: sin esto, un recorrido roto deja el resto en verde
    comprobando el vacío."""
    comprobar_recorrido(app)
    # Eran 20; el paso 8 del pivote retiró `/bi/matching` y `/bi/clusters`.
    assert len(_rutas_bi()) >= 15, f"se esperaban ≥15 endpoints de BI, hay {len(_rutas_bi())}"


def test_no_hay_endpoints_de_bi_sin_contrato_declarado():
    """Un endpoint nuevo tiene que decidir su protección, no heredarla por olvido."""
    sin_declarar = {(m, p) for m, p, _ in _rutas_bi()} - set(CONTRATO)
    assert not sin_declarar, (
        "Endpoints de BI sin contrato declarado:\n  "
        + "\n  ".join(f"{m} {p}" for m, p in sorted(sin_declarar))
        + "\n\nAñádelos a CONTRATO con el nivel que les toque y el porqué."
    )


def test_el_contrato_no_menciona_rutas_que_ya_no_existen():
    """Si no, la tabla se llena de entradas muertas y deja de significar algo."""
    fantasmas = set(CONTRATO) - {(m, p) for m, p, _ in _rutas_bi()}
    assert not fantasmas, f"Rutas en CONTRATO que ya no existen: {sorted(fantasmas)}"


@pytest.mark.parametrize(
    "metodo,path,deps",
    [(m, p, d) for m, p, d in sorted(_rutas_bi())],
    ids=[f"{m}{p}" for m, p, _ in sorted(_rutas_bi())],
)
def test_cada_endpoint_declara_la_proteccion_que_le_toca(metodo, path, deps):
    esperado = CONTRATO.get((metodo, path))
    if esperado is None:
        pytest.skip("cubierto por test_no_hay_endpoints_de_bi_sin_contrato_declarado")

    assert esperado == "publica", f"{metodo} {path}: nivel desconocido {esperado!r}"
    sobran = deps - PERMITIDAS_EN_PUBLICA
    assert not sobran, (
        f"{metodo} {path} es pública y declara {sorted(sobran)}: "
        "pediría sesión o cuota en un sitio sin cuentas."
    )


@pytest.mark.asyncio
async def test_una_ruta_publica_responde_sin_sesion(async_db):
    """Lo declarado no basta: se pide sin cabecera `Authorization` y no puede
    llegar ni 401 (sesión) ni 402 (cuota). Un 503 por `FEATURE_ANALYTICS`
    apagado en el entorno de tests es aceptable: significa que pasó la puerta."""
    from httpx import ASGITransport, AsyncClient

    from app.db import get_db

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            respuestas = [
                await c.get(f"{PREFIJO_API}/bi/rubros"),
                await c.get(f"{PREFIJO_API}/bi/precio/41116000"),
                await c.get(f"{PREFIJO_API}/bi/licitacion/NO-EXISTE/panel"),
            ]
    finally:
        app.dependency_overrides.clear()

    for r in respuestas:
        assert r.status_code not in (401, 402, 403), (
            f"{r.request.url.path} pidió sesión o cuota: {r.status_code} {r.text[:200]}"
        )
