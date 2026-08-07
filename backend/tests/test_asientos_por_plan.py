"""Tests del límite de asientos por plan.

La suscripción es de la EMPRESA y los planes se diferencian por capacidades, no
por asiento (ADR 0002). Sin un tope, una empresa podía sumar usuarios sin
límite sobre un plan de CLP 11.900/mes.

Los casos que importan no son "5 < 6": son los bordes donde un tope mal puesto
hace daño — reañadir a alguien que ya está dentro, un downgrade que dejaría
gente fuera, y el trial, que debe dar los asientos del plan que se está
probando y no los del plan almacenado.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fastapi import HTTPException

from app.api.deps import EmpresaContext
from app.api.empresas import agregar_miembro, resumen_de_plan
from app.core.plan_limits import get_quota, verificar_asiento_disponible
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.user import User
from app.schemas.empresa import AddMiembroRequest


def empresa_en(tier: str, *, estado: str = "active", trial_ends=None):
    return SimpleNamespace(plan_tier=tier, subscription_status=estado, trial_ends_at=trial_ends)


# ── El tope, plan por plan ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    "tier,limite",
    [("basico", 1), ("pyme", 3), ("pro", 5), ("enterprise", None)],
)
def test_cada_plan_declara_sus_asientos(tier, limite):
    assert get_quota(tier)["max_usuarios"] == limite


@pytest.mark.parametrize("tier,limite", [("basico", 1), ("pyme", 3), ("pro", 5)])
def test_se_puede_llenar_el_plan_pero_no_pasarse(tier, limite):
    empresa = empresa_en(tier)
    # Justo por debajo del tope: entra.
    verificar_asiento_disponible(empresa, limite - 1)
    # En el tope: el siguiente ya no.
    with pytest.raises(HTTPException) as exc:
        verificar_asiento_disponible(empresa, limite)
    assert exc.value.status_code == 402


def test_enterprise_no_tiene_tope():
    verificar_asiento_disponible(empresa_en("enterprise"), 5_000)


def test_el_error_dice_el_plan_el_limite_y_a_donde_subir():
    with pytest.raises(HTTPException) as exc:
        verificar_asiento_disponible(empresa_en("basico"), 1)
    detalle = exc.value.detail
    assert detalle["bloqueada_por_plan"] is True
    assert detalle["plan_actual"] == "basico"
    assert detalle["limite"] == 1
    assert detalle["usado"] == 1
    assert detalle["upgrade_sugerido"] == "pyme"
    # Singular con un asiento: "incluye 1 usuarios" se lee mal en un 402 que el
    # cliente ve tal cual.
    assert "1 usuario." in detalle["mensaje"]


def test_el_trial_da_los_asientos_del_plan_que_se_prueba():
    """Durante el trial `effective_plan_tier` devuelve pro (ADR 0002).

    Si el tope mirara `plan_tier` en vez del efectivo, el equipo no podría
    probarse completo — que es justo el objetivo del reverse-trial.
    """
    en_trial = empresa_en(
        "basico", estado="trialing", trial_ends=datetime.now(UTC) + timedelta(days=7)
    )
    verificar_asiento_disponible(en_trial, 4)  # 5 asientos de pro
    with pytest.raises(HTTPException):
        verificar_asiento_disponible(en_trial, 5)


def test_un_trial_vencido_vuelve_al_plan_almacenado():
    vencido = empresa_en(
        "basico", estado="trialing", trial_ends=datetime.now(UTC) - timedelta(days=1)
    )
    with pytest.raises(HTTPException):
        verificar_asiento_disponible(vencido, 1)


def test_un_downgrade_no_expulsa_a_nadie():
    """Una cancelación deja la empresa en `basico` con 4 miembros dentro.

    Sólo se bloquea SUMAR. Echar gente automáticamente por un impago sería peor
    que el problema: el equipo pierde el acceso sin avisar.
    """
    empresa = empresa_en("basico", estado="canceled")
    with pytest.raises(HTTPException):
        verificar_asiento_disponible(empresa, 4)
    # …pero la comprobación no muta nada ni decide expulsiones.
    assert empresa.plan_tier == "basico"


# ── A través del endpoint, contra Postgres ───────────────────────────────────


@pytest_asyncio.fixture
async def empresa_con_owner(async_db, sample_user) -> Empresa:
    empresa = Empresa(
        rut_empresa=f"7{uuid.uuid4().int % 10_000_000}-1",
        nombre_empresa="Constructora Asientos",
        estado_habil="habil",
        plan_tier="basico",
        subscription_status="active",
    )
    async_db.add(empresa)
    await async_db.flush()
    async_db.add(EmpresaUsuario(user_id=sample_user.id, empresa_id=empresa.id, rol="owner"))
    await async_db.flush()
    return empresa


async def _crear_usuario(db, sufijo: str) -> User:
    user = User(
        username=f"colega{sufijo}",
        email=f"colega{sufijo}@example.com",
        hashed_password="x",
        full_name=f"Colega {sufijo}",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_el_endpoint_rechaza_el_segundo_usuario_en_basico(
    async_db, sample_user, empresa_con_owner
):
    otro = await _crear_usuario(async_db, "a")
    ctx = EmpresaContext(empresa_id=empresa_con_owner.id, rol="owner")

    with pytest.raises(HTTPException) as exc:
        await agregar_miembro(
            AddMiembroRequest(email=otro.email, rol="viewer"),
            ctx=ctx,
            db=async_db,
            current_user=sample_user,
        )
    assert exc.value.status_code == 402
    assert exc.value.detail["limite"] == 1


@pytest.mark.asyncio
async def test_el_endpoint_deja_llenar_el_plan_pro(async_db, sample_user, empresa_con_owner):
    empresa_con_owner.plan_tier = "pro"
    await async_db.flush()
    ctx = EmpresaContext(empresa_id=empresa_con_owner.id, rol="owner")

    # El owner ya ocupa 1 de 5: caben 4 más.
    for i in range(4):
        colega = await _crear_usuario(async_db, f"pro{i}")
        resultado = await agregar_miembro(
            AddMiembroRequest(email=colega.email, rol="viewer"),
            ctx=ctx,
            db=async_db,
            current_user=sample_user,
        )
        assert resultado["ok"] is True

    sobrante = await _crear_usuario(async_db, "sobrante")
    with pytest.raises(HTTPException) as exc:
        await agregar_miembro(
            AddMiembroRequest(email=sobrante.email, rol="viewer"),
            ctx=ctx,
            db=async_db,
            current_user=sample_user,
        )
    assert exc.value.status_code == 402


@pytest.mark.asyncio
async def test_reañadir_a_un_miembro_existente_da_409_y_no_402(
    async_db, sample_user, empresa_con_owner
):
    """Aunque el plan esté lleno.

    En basico el owner ya agota el asiento. Si el tope se comprobara antes de
    mirar si ya es miembro, reañadir a alguien que está dentro devolvería "no te
    caben más usuarios", que es falso y manda a pagar sin motivo.
    """
    otro = await _crear_usuario(async_db, "duplicado")
    empresa_con_owner.plan_tier = "pyme"
    async_db.add(EmpresaUsuario(user_id=otro.id, empresa_id=empresa_con_owner.id, rol="viewer"))
    await async_db.flush()

    empresa_con_owner.plan_tier = "basico"  # plan lleno: 2 miembros, 1 asiento
    await async_db.flush()

    ctx = EmpresaContext(empresa_id=empresa_con_owner.id, rol="owner")
    with pytest.raises(HTTPException) as exc:
        await agregar_miembro(
            AddMiembroRequest(email=otro.email, rol="viewer"),
            ctx=ctx,
            db=async_db,
            current_user=sample_user,
        )
    assert exc.value.status_code == 409


# ── El resumen de plan que consume la UI ─────────────────────────────────────


@pytest.mark.asyncio
async def test_el_resumen_expone_limite_y_uso_de_asientos(async_db, empresa_con_owner):
    """La UI necesita ambos números para decir "1 de 3" sin copiar PLAN_QUOTAS.

    Copiarlas en el frontend es la alternativa evidente y la mala: se
    desincronizan al cambiar precios y nadie se entera hasta que un cliente ve
    un límite que no es el suyo.
    """
    empresa_con_owner.plan_tier = "pyme"
    await async_db.flush()

    resumen = await resumen_de_plan(
        ctx=EmpresaContext(empresa_id=empresa_con_owner.id, rol="viewer"), db=async_db
    )

    assert resumen.tier == "pyme"
    assert resumen.etiqueta == "PYME"
    assert resumen.limites.max_usuarios == 3
    assert resumen.uso.usuarios == 1  # sólo el owner
    assert resumen.siguiente_tier == "pro"


@pytest.mark.asyncio
async def test_el_resumen_declara_el_trial_sin_deducirlo_del_tier(async_db, empresa_con_owner):
    """Una empresa que contrata pro y está en trial da el mismo tier efectivo.

    Si `en_trial` se dedujera comparando el tier efectivo con el contratado,
    este caso saldría como "pagando" y la UI dejaría de avisar de que quedan
    días.
    """
    empresa_con_owner.plan_tier = "pro"
    empresa_con_owner.subscription_status = "trialing"
    empresa_con_owner.trial_ends_at = datetime.now(UTC) + timedelta(days=7)
    await async_db.flush()

    resumen = await resumen_de_plan(
        ctx=EmpresaContext(empresa_id=empresa_con_owner.id, rol="owner"), db=async_db
    )
    assert resumen.tier == "pro"
    assert resumen.tier_contratado == "pro"
    assert resumen.en_trial is True


@pytest.mark.asyncio
async def test_ilimitado_viaja_como_null_no_como_cero(async_db, empresa_con_owner):
    """En JSON, un 0 en `max_usuarios` se leería como "no caben usuarios"."""
    empresa_con_owner.plan_tier = "enterprise"
    await async_db.flush()

    resumen = await resumen_de_plan(
        ctx=EmpresaContext(empresa_id=empresa_con_owner.id, rol="owner"), db=async_db
    )
    assert resumen.limites.max_usuarios is None
    assert resumen.siguiente_tier is None
