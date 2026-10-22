"""Las sesiones de asyncpg planifican cada consulta con sus parámetros.

asyncpg prepara las sentencias con nombre y las reutiliza; Postgres, tras la
quinta ejecución, puede pasar a un plan genérico hecho sin mirar los valores. El
catálogo vive de ellos (el término entra en `plainto_tsquery`, `unaccent` y una
regex), y con el plan genérico se evalúan fila por fila: `GET /tenders/?search=de`
pasaba de ~55 ms a ~800 ms desde la sexta petición, con 61.000 licitaciones
(medido el 2026-10-22). Ver `OPCIONES_DE_SESION` en `app/db/__init__.py`.
"""

from __future__ import annotations

from sqlalchemy import text

from app.db import OPCIONES_DE_SESION, AsyncSessionLocal, async_engine


def test_la_opcion_pide_el_plan_a_medida():
    assert OPCIONES_DE_SESION == {"plan_cache_mode": "force_custom_plan"}


async def test_la_sesion_de_la_api_lleva_el_plan_a_medida(esquema_migrado):
    """Por la sesión que usan las rutas y el MCP (`AsyncSessionLocal`), no por un
    motor de test: lo que se comprueba es que la opción llega a Postgres."""
    # Conexiones que otro bucle de eventos dejó en el pozo: se abandonan sin
    # cerrarlas (cerrarlas desde este bucle revienta), como en `test_mcp.py`.
    await async_engine.dispose(close=False)
    try:
        async with AsyncSessionLocal() as sesion:
            modo = (await sesion.execute(text("SHOW plan_cache_mode"))).scalar()
    finally:
        await async_engine.dispose()
    assert modo == "force_custom_plan"
