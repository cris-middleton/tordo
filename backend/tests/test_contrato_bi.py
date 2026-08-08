"""Contrato de los 22 endpoints de BI.

El golden master verifica `services/bi/`: que las funciones devuelvan los mismos
números. **No verifica la capa HTTP.** Un cambio en un schema de respuesta, o un
endpoint nuevo que se olvide del gating por plan, no lo detecta nadie — y el
gating por plan es de lo que depende que el producto cobre.

Este archivo cubre esa capa, con el mismo enfoque que
`test_tenancy_estructural.py`: se declara lo esperado y el test recorre las rutas
reales. Un endpoint nuevo aparece como fallo hasta que alguien decida
explícitamente qué protección le toca.

Qué significa cada nivel
------------------------
- `cuota`   — `check_bi_quota_dep`: exige empresa, mira el plan efectivo y
              descuenta consulta. Es lo normal para la inteligencia de BI.
- `empresa` — sólo pertenencia a la empresa (`empresa_ctx` / `require_rol`).
- `sesion`  — sólo estar autenticado. **Es el nivel más laxo y hay que
              justificarlo caso por caso**, porque significa que un plan gratuito
              accede sin límite.
"""

from __future__ import annotations

import pytest

from app.api.versionado import PREFIJO_API
from app.main import app
from tests.rutas import comprobar_recorrido, rutas_con_metodo

# Ruta → nivel de protección esperado. Las excepciones llevan su motivo escrito:
# si alguien la cambia, tiene que cambiar también la razón.
CONTRATO: dict[tuple[str, str], str] = {
    ("GET", "/bi/clusters"): "cuota",
    ("GET", "/bi/competidores/{organismo_id}"): "cuota",
    ("GET", "/bi/comprador/{organismo_id}"): "cuota",
    ("GET", "/bi/descuento"): "cuota",
    ("GET", "/bi/diversificacion/{codigo_proveedor}"): "cuota",
    ("GET", "/bi/estacionalidad/{organismo_id}"): "cuota",
    ("GET", "/bi/forecast_competidores"): "cuota",
    ("GET", "/bi/licitacion/{codigo_externo}/panel"): "cuota",
    ("GET", "/bi/matching"): "cuota",
    ("GET", "/bi/mi_posicion"): "cuota",
    ("GET", "/bi/oportunidades"): "cuota",
    ("GET", "/bi/precio/{codigo_producto}"): "cuota",
    ("GET", "/bi/resumen"): "cuota",
    ("GET", "/bi/sector"): "cuota",
    ("GET", "/bi/tendencia"): "cuota",
    ("GET", "/bi/ventana/{codigo_externo}"): "cuota",
    # El perfil TF-IDF es de la empresa: basta con pertenecer a ella. Escribirlo
    # exige además rol de escritura.
    ("GET", "/bi/perfil/{empresa_id}"): "empresa",
    ("PUT", "/bi/perfil/{empresa_id}"): "empresa",
    # Catálogos que alimentan los desplegables de los filtros. Cobrar por leer la
    # lista de rubros dejaría la pantalla inservible antes de poder consultar
    # nada, así que van sin cuota a propósito.
    ("GET", "/bi/rubros"): "sesion",
    ("GET", "/bi/productos"): "sesion",
    # El radar comprueba pertenencia a la empresa por dentro
    # (`verificar_acceso_empresa`), no por dependencia. No está listado como
    # capacidad de ningún plan, así que hoy no se cobra.
    ("GET", "/bi/radar_semanal"): "sesion",
    # `/licitacion-match` NO está aquí a propósito: ver test_matching_semantico_*.
    ("GET", "/bi/licitacion-match/{codigo_externo}"): "plan_pro",
}

# Los nombres internos de `plan_limits.py` eran los tres `_check`, así que al
# introspeccionar las rutas no se podían distinguir "exige plan" de "descuenta
# cuota". Se renombraron para que esta tabla signifique algo — y de paso las
# trazas dicen qué falló.
DEPENDENCIAS_POR_NIVEL = {
    "cuota": {"_exigir_cuota_bi"},
    "empresa": {"empresa_ctx", "_dep"},
    "sesion": {"get_current_active_user"},
    "plan_pro": {"_exigir_plan"},
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

    admitidas = DEPENDENCIAS_POR_NIVEL[esperado]
    assert deps & admitidas, (
        f"{metodo} {path} debería tener protección '{esperado}' "
        f"(una de {sorted(admitidas)}) y declara {sorted(deps)}."
    )


def test_la_mayoria_de_bi_pasa_por_la_cuota():
    """Guarda contra la erosión.

    El día que la mitad de BI esté en 'sesion', el medidor de consultas —y con él
    la diferencia entre el plan gratuito y el de pago— no significa nada. Este
    número es un tope, no un objetivo: si sube, alguien tiene que explicarlo.
    """
    laxos = [k for k, v in CONTRATO.items() if v == "sesion"]
    assert len(laxos) <= 3, (
        f"{len(laxos)} endpoints de BI sin cuota: {sorted(laxos)}. "
        "Cada uno es acceso ilimitado desde el plan gratuito."
    )


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
    assert deps & DEPENDENCIAS_POR_NIVEL["plan_pro"], (
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
