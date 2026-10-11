"""Contrato de los 26 endpoints de BI.

El golden master verifica `services/bi/`: que las funciones devuelvan los mismos
números. **No verifica la capa HTTP.** Este archivo cubre esa capa, con el mismo
enfoque que `test_tenancy_estructural.py`: se declara lo esperado y el test recorre
las rutas reales. Un endpoint nuevo aparece como fallo hasta que alguien decida
explícitamente qué protección le toca.

Qué significa cada nivel (pivote público, docs/PIVOTE_PUBLICO_2026-10.md)
------------------------
- `publica` — **ninguna** dependencia de sesión, empresa, plan ni cuota. La única
              protección es el límite por IP de `/api/v1/bi/*`. Es lo normal desde
              que TORDO es un sitio público.
- `cuenta`  — **transitorio.** Rutas que dependen de una empresa y se retiran
              enteras en el paso 3 del pivote, junto con las empresas. Este nivel
              desaparece con ellas.
"""

from __future__ import annotations

import pytest

from app.core.versionado import PREFIJO_API
from app.main import app
from tests.rutas import comprobar_recorrido, rutas_con_metodo

CONTRATO: dict[tuple[str, str], str] = {
    ("GET", "/bi/clusters"): "publica",
    ("GET", "/bi/competidores/{organismo_id}"): "publica",
    ("GET", "/bi/comprador/{organismo_id}"): "publica",
    ("GET", "/bi/descuento"): "publica",
    ("GET", "/bi/diversificacion/{codigo_proveedor}"): "publica",
    ("GET", "/bi/estacionalidad/{organismo_id}"): "publica",
    ("GET", "/bi/forecast_competidores"): "publica",
    # El panel deja de enriquecerse con la postulación y el estado hábil de la
    # empresa: sin cuentas no hay empresa a la que mirar.
    ("GET", "/bi/licitacion/{codigo_externo}/panel"): "publica",
    ("GET", "/bi/matching"): "publica",
    ("GET", "/bi/oportunidades"): "publica",
    ("GET", "/bi/precio/{codigo_producto}"): "publica",
    ("GET", "/bi/resumen"): "publica",
    ("GET", "/bi/sector"): "publica",
    ("GET", "/bi/tendencia"): "publica",
    ("GET", "/bi/ventana/{codigo_externo}"): "publica",
    ("GET", "/bi/rubros"): "publica",
    ("GET", "/bi/productos"): "publica",
    ("GET", "/bi/panorama"): "publica",
    # La exportación ya no descuenta cuota porque no hay cuota. El tope de filas
    # que la acota llega en el paso 10 del pivote (spec §7.4).
    ("GET", "/bi/exportar/precio/{codigo_producto}"): "publica",
    ("GET", "/bi/exportar/competidores/{organismo_id}"): "publica",
    # ── Se retiran en el paso 3, con las empresas ──
    ("GET", "/bi/perfil/{empresa_id}"): "cuenta",
    ("PUT", "/bi/perfil/{empresa_id}"): "cuenta",
    ("GET", "/bi/rubros/sugerir"): "cuenta",
    ("GET", "/bi/mi_posicion"): "cuenta",
    ("GET", "/bi/radar_semanal"): "cuenta",
    ("GET", "/bi/licitacion-match/{codigo_externo}"): "cuenta",
}

#: Lo que una ruta `publica` NO puede declarar. Son los nombres de las funciones
#: de dependencia, que es lo que `rutas_con_metodo` devuelve.
PROHIBIDAS_EN_PUBLICA = {
    "_exigir_cuota_bi",
    "_exigir_plan",
    "empresa_facturable",
    "empresa_ctx",
    "_dep",
    "get_current_user",
    "get_current_active_user",
}

#: Lo que una ruta `cuenta` sigue declarando hasta que se retire.
DEPENDENCIAS_DE_CUENTA = {
    "_exigir_cuota_bi",
    "_exigir_plan",
    "empresa_ctx",
    "_dep",
    "get_current_active_user",
}


def _rutas_bi() -> list[tuple[str, str, set[str]]]:
    """Las rutas de BI, con la ruta SIN el prefijo de versión.

    La tabla de arriba se escribe relativa (`/bi/clusters`) a propósito: sacar
    una v2 no debería obligar a reescribir 22 líneas que no han cambiado de
    significado.

    El recorrido vive en tests/rutas.py, compartido con el test estructural de
    multi-tenancy: FastAPI 0.141 dejó de aplanar los routers incluidos y los dos
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
    assert len(_rutas_bi()) >= 20, f"se esperaban ≥20 endpoints de BI, hay {len(_rutas_bi())}"


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

    if esperado == "publica":
        sobran = deps & PROHIBIDAS_EN_PUBLICA
        assert not sobran, (
            f"{metodo} {path} es pública y declara {sorted(sobran)}: "
            "pediría sesión o cuota en un sitio sin cuentas."
        )
    else:
        assert deps & DEPENDENCIAS_DE_CUENTA, (
            f"{metodo} {path} depende de una empresa y declara {sorted(deps)}."
        )


def test_el_nivel_transitorio_no_crece():
    """`cuenta` sólo puede encoger hasta desaparecer en el paso 3 del pivote."""
    cuenta = [k for k, v in CONTRATO.items() if v == "cuenta"]
    assert len(cuenta) <= 6, f"{len(cuenta)} rutas de cuenta: {sorted(cuenta)}"


def test_matching_semantico_exige_plan_pro():
    """`/licitacion-match` implementa "Matching semántico", que se VENDE como Pro.

    Está en la lista de capacidades del plan Pro que devuelve `/api/billing/plans`,
    y el endpoint no comprobaba el plan: sólo el flag de la feature y la
    pertenencia a la empresa. Con `FEATURE_TFIDF` apagado no se notaba —responde
    503 para todos— pero encenderlo regalaba una capacidad de pago.
    """
    from app.api.billing import PLANS

    pro = next(p for p in PLANS if p.id == "pro")
    assert any("Matching semántico" in f for f in pro.features), (
        "Si el matching deja de venderse como Pro, este test y el gating del "
        "endpoint tienen que cambiar juntos."
    )

    deps = next(d for m, p, d in _rutas_bi() if p == "/bi/licitacion-match/{codigo_externo}")
    assert deps & {"_exigir_plan"}, (
        f"/licitacion-match declara {sorted(deps)} y no comprueba el plan, "
        "pero el matching semántico se vende como capacidad Pro."
    )


# ── Que el gating funcione, no sólo que esté declarado ───────────────────────


@pytest.mark.asyncio
async def test_un_plan_basico_recibe_402_en_el_matching(async_db, sample_user, sample_empresa):
    """Prueba de extremo a extremo del arreglo.

    La dependencia se resuelve ANTES del cuerpo, así que el 402 del plan llega
    antes que el 503 del feature flag. Es el orden correcto: al usuario le
    interesa saber que le falta plan, no que la feature está apagada.
    """
    from httpx import ASGITransport, AsyncClient

    from app.core.security import get_current_active_user
    from app.db import get_db
    from app.main import app

    # La empresa nace con trial, que da acceso `pro`. Se le quita para probar
    # el plan gratuito de verdad.
    sample_empresa.plan_tier = "basico"
    sample_empresa.subscription_status = "active"
    sample_empresa.trial_ends_at = None
    await async_db.flush()

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_active_user] = lambda: sample_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get(
                f"{PREFIJO_API}/bi/licitacion-match/ABC-1",
                params={"empresa_id": str(sample_empresa.id), "texto": "servicios de aseo"},
            )
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 402, f"esperaba 402 por plan, llegó {r.status_code}: {r.text[:200]}"
    assert r.json()["detail"]["bloqueada_por_plan"] is True


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
