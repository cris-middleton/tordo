"""Límite de peticiones por clave de API.

Lo que se fija aquí:

- **se cuenta por clave, no por IP** — es la unidad con la que se vende el
  acceso, y una IP de oficina mete a toda la empresa en el mismo cubo;
- **el límite sale del plan**, así que subir de plan sube el límite sin tocar
  código;
- **si Redis no responde, se deja pasar** — y no se anuncian cabeceras, porque
  cualquier número sería inventado;
- **una clave no gasta el cubo de otra**, que es la mitad del sentido de esto.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio

from app.core import limites_api
from app.core.plan_limits import PLAN_QUOTAS
from app.core.versionado import PREFIJO_API
from app.services import api_keys


class RedisFalso:
    """Lo justo de Redis que usa el limitador: `incr` y `expire`."""

    def __init__(self):
        self.cubos: dict[str, int] = {}
        self.expiraciones: dict[str, int] = {}

    def incr(self, clave: str) -> int:
        self.cubos[clave] = self.cubos.get(clave, 0) + 1
        return self.cubos[clave]

    def expire(self, clave: str, segundos: int) -> None:
        self.expiraciones[clave] = segundos


class RedisCaido:
    def incr(self, clave: str):
        raise ConnectionError("Redis no responde")


@pytest.fixture
def redis_falso(monkeypatch) -> RedisFalso:
    """Se parchea en `limites_api`, no en `plan_limits`.

    El módulo importa `redis_client` por nombre, así que parchear el origen no
    alcanzaría al nombre ya vinculado — el fallo silencioso clásico de este tipo
    de test: pasa, pero comprobando el código de verdad, no el falso.
    """
    falso = RedisFalso()
    monkeypatch.setattr(limites_api, "redis_client", lambda: falso)
    return falso


@pytest.fixture
def minuto_congelado(monkeypatch):
    """Clava el cubo del limitador en un minuto fijo.

    **La ventana es fija, no deslizante**: `_cubo` mete `YYYYMMDDHHMM` dentro de
    la clave de Redis, así que al cambiar el minuto el contador vuelve a cero.
    Eso está bien en producción —la contrapartida la documenta el propio módulo—
    y es veneno para un test que necesita agotar el cubo: agotar el de `pro` son
    120 peticiones HTTP seguidas, y si cruzan el borde del minuto el contador se
    reinicia a media prueba y la petición 121 devuelve 200.

    Falla **según la hora a la que corra**, no según el código. En local entraba
    dentro del minuto y pasaba; en Actions, más lento, se partió y bloqueó un
    merge con `assert 200 == 429`. Congelar el minuto prueba lo que el test dice
    que prueba —que pasado el límite se corta— sin depender del reloj.

    Se congela el RELOJ, no `_cubo`: sustituir la función dejaría de ejercitar
    la construcción de la clave, que es justo donde vive el minuto. Así el
    código real sigue corriendo y lo único fijo es qué hora cree que es.
    """
    instante = datetime(2026, 8, 17, 3, 30, tzinfo=UTC)

    class RelojParado:
        @staticmethod
        def now(tz=None):
            return instante

    monkeypatch.setattr(limites_api, "datetime", RelojParado)


# ── El límite sale del plan ──────────────────────────────────────────────────


@pytest.mark.parametrize("tier", sorted(PLAN_QUOTAS))
def test_cada_plan_declara_su_limite(tier: str):
    """Un plan sin límite declarado reventaría con KeyError en la primera
    petición autenticada con clave — en producción, no aquí."""
    assert limites_api.limite_del_tier(tier) > 0


def test_un_plan_mayor_no_limita_mas_que_uno_menor():
    limites = [limites_api.limite_del_tier(t) for t in ("basico", "pyme", "pro", "enterprise")]
    assert limites == sorted(limites), f"la escalera va al revés: {limites}"


# ── El contador ──────────────────────────────────────────────────────────────


def test_cuenta_por_clave(redis_falso):
    limites_api.consumir("clave-a", "pro")
    limites_api.consumir("clave-a", "pro")
    consumo_b = limites_api.consumir("clave-b", "pro")

    assert consumo_b.usadas == 1, "la clave B empezó con el cubo de la A"


def test_al_pasarse_lo_dice(redis_falso):
    limite = limites_api.limite_del_tier("basico")
    for _ in range(limite):
        consumo = limites_api.consumir("clave", "basico")
    assert not consumo.excedido and consumo.restantes == 0

    assert limites_api.consumir("clave", "basico").excedido


def test_el_cubo_caduca(redis_falso):
    """Sin TTL, un cubo por clave y minuto llenaría Redis para siempre."""
    limites_api.consumir("clave", "pro")

    assert list(redis_falso.expiraciones.values()) == [limites_api.TTL_SEGUNDOS]


def test_si_redis_no_responde_se_deja_pasar(monkeypatch):
    """Falla abierto, igual que el resto del sistema: quedarse sin límite un rato
    es peor que dejar sin API a quien paga."""
    monkeypatch.setattr(limites_api, "redis_client", lambda: RedisCaido())

    assert limites_api.consumir("clave", "pro") is None


# ── A través de HTTP ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def cliente(async_db):
    from httpx import ASGITransport, AsyncClient

    from app.db import get_db
    from app.main import app

    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def clave(async_db, sample_empresa, sample_user) -> str:
    secreto, _ = await api_keys.crear(
        async_db, empresa_id=sample_empresa.id, nombre="integración", creada_por=sample_user.id
    )
    return secreto


@pytest.mark.asyncio
async def test_la_respuesta_dice_cuanto_queda(cliente, clave, redis_falso):
    """Se anuncia **al dejar pasar**, no sólo al cortar: una integración sólo
    puede espaciarse si sabe cuánto le queda, y enterarse por el 429 es tarde."""
    r = await cliente.get(f"{PREFIJO_API}/auth/me", headers={"Authorization": f"Bearer {clave}"})

    assert r.status_code == 200, r.text
    assert int(r.headers["X-RateLimit-Limit"]) > 0
    assert int(r.headers["X-RateLimit-Remaining"]) == int(r.headers["X-RateLimit-Limit"]) - 1


@pytest.mark.asyncio
async def test_al_pasarse_devuelve_429_con_retry_after(
    cliente, clave, redis_falso, minuto_congelado, sample_empresa
):
    """El `Retry-After` es lo que convierte el corte en algo que un cliente puede
    obedecer solo, en vez de reintentar en bucle."""
    cabeceras = {"Authorization": f"Bearer {clave}"}
    # La empresa arranca en trial, que da plan `pro`.
    for _ in range(limites_api.limite_del_tier("pro")):
        await cliente.get(f"{PREFIJO_API}/auth/me", headers=cabeceras)

    r = await cliente.get(f"{PREFIJO_API}/auth/me", headers=cabeceras)

    assert r.status_code == 429
    assert r.headers["Retry-After"] == "60"
    assert "por minuto" in r.json()["detail"]


@pytest.mark.asyncio
async def test_un_jwt_no_lleva_limite_por_clave(cliente, async_db, sample_user, redis_falso):
    """El navegador no es el caso de uso: lo limita el de BI, por IP.

    Contarlo aquí además haría que una pestaña abierta consumiera la cuota de la
    integración de la empresa.
    """
    from app.core.security import create_access_token

    token = create_access_token({"sub": str(sample_user.id)})

    r = await cliente.get(f"{PREFIJO_API}/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200, r.text
    assert "X-RateLimit-Limit" not in r.headers
    assert redis_falso.cubos == {}
