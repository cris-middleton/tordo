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

from app.db import (
    OPCIONES_DE_SESION,
    TIEMPO_MAXIMO_CONSULTA_MS,
    AsyncSessionLocal,
    async_engine,
    sync_engine,
)


def test_la_opcion_pide_el_plan_a_medida():
    assert OPCIONES_DE_SESION["plan_cache_mode"] == "force_custom_plan"


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


async def test_ninguna_consulta_de_la_api_corre_mas_de_su_tope(esquema_migrado):
    """Una consulta que el cliente abandonó seguía corriendo en Postgres. Las dos
    vías de la API —async (rutas, MCP) y sync (analytics)— llevan el tope."""
    await async_engine.dispose(close=False)
    try:
        async with AsyncSessionLocal() as sesion:
            async_tope = (await sesion.execute(text("SHOW statement_timeout"))).scalar()
    finally:
        await async_engine.dispose()
    with sync_engine.connect() as conexion:
        sync_tope = conexion.execute(text("SHOW statement_timeout")).scalar()
    esperado = f"{TIEMPO_MAXIMO_CONSULTA_MS // 1000}s"
    assert async_tope == esperado
    assert sync_tope == esperado
