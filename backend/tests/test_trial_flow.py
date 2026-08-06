"""Tests de resolución de plan con trial.

El sujeto es la EMPRESA, no el usuario: la suscripción y el trial le pertenecen
a ella (ADR 0002). Los usuarios son asientos."""

from datetime import UTC, datetime, timedelta

from app.api.empresas import aplicar_trial_inicial
from app.core.plan_limits import effective_plan_tier, meets_min_tier


class _FakeEmpresa:
    """Sustituto mínimo de Empresa para tests unitarios."""

    def __init__(self, plan_tier="basico", subscription_status="inactive", trial_ends_at=None):
        self.plan_tier = plan_tier
        self.subscription_status = subscription_status
        self.trial_ends_at = trial_ends_at


def _future(days: float) -> datetime:
    return datetime.now(UTC) + timedelta(days=days)


def _past(days: float) -> datetime:
    return datetime.now(UTC) - timedelta(days=days)


def test_effective_tier_is_plan_tier_when_no_trial():
    empresa = _FakeEmpresa(plan_tier="basico")
    assert effective_plan_tier(empresa) == "basico"


def test_effective_tier_is_pro_during_active_trial():
    empresa = _FakeEmpresa(
        plan_tier="basico",
        subscription_status="trialing",
        trial_ends_at=_future(7),
    )
    assert effective_plan_tier(empresa) == "pro"


def test_effective_tier_falls_back_when_trial_expired():
    empresa = _FakeEmpresa(
        plan_tier="basico",
        subscription_status="trialing",
        trial_ends_at=_past(1),
    )
    assert effective_plan_tier(empresa) == "basico"


def test_effective_tier_is_pro_for_paying_pro_user():
    empresa = _FakeEmpresa(plan_tier="pro", subscription_status="active")
    assert effective_plan_tier(empresa) == "pro"


def test_meets_min_tier_respects_active_trial():
    empresa = _FakeEmpresa(
        plan_tier="basico",
        subscription_status="trialing",
        trial_ends_at=_future(3),
    )
    assert _cumple_minimo(empresa, "pro") is True


def _cumple_minimo(empresa, requerido: str) -> bool:
    return meets_min_tier(effective_plan_tier(empresa), requerido)


def test_el_trial_arranca_con_14_dias_al_crear_la_empresa():
    empresa = _FakeEmpresa(subscription_status="inactive", trial_ends_at=None)
    antes = datetime.now(UTC)
    aplicar_trial_inicial(empresa)
    despues = datetime.now(UTC)

    assert empresa.subscription_status == "trialing"
    assert empresa.trial_ends_at is not None
    assert (
        antes + timedelta(days=14) - timedelta(seconds=2)
        <= empresa.trial_ends_at
        <= despues + timedelta(days=14) + timedelta(seconds=2)
    )


def test_no_reinicia_un_trial_en_curso():
    fin_existente = _future(10)
    empresa = _FakeEmpresa(subscription_status="trialing", trial_ends_at=fin_existente)
    aplicar_trial_inicial(empresa)
    assert empresa.trial_ends_at == fin_existente


def test_no_toca_una_empresa_que_ya_paga():
    empresa = _FakeEmpresa(plan_tier="pro", subscription_status="active")
    aplicar_trial_inicial(empresa)
    assert empresa.subscription_status == "active"
    assert empresa.trial_ends_at is None


from app.tasks.trial_tasks import _pick_reminder_kind


def test_pick_reminder_kind_day7_window():
    trial_end = datetime.now(UTC) + timedelta(days=7, hours=-1)
    kind = _pick_reminder_kind(trial_end, day7_sent=None, day12_sent=None)
    assert kind == "day7"


def test_pick_reminder_kind_day12_window():
    trial_end = datetime.now(UTC) + timedelta(days=2, hours=-1)
    kind = _pick_reminder_kind(trial_end, day7_sent=_past(5), day12_sent=None)
    assert kind == "day12"


def test_pick_reminder_kind_returns_none_after_day7_sent():
    trial_end = datetime.now(UTC) + timedelta(days=7, hours=-1)
    kind = _pick_reminder_kind(trial_end, day7_sent=_past(0.007), day12_sent=None)
    assert kind is None


def test_pick_reminder_kind_skips_outside_windows():
    trial_end = datetime.now(UTC) + timedelta(days=10)
    kind = _pick_reminder_kind(trial_end, day7_sent=None, day12_sent=None)
    assert kind is None


def test_pick_reminder_kind_none_after_both_sent():
    trial_end = datetime.now(UTC) + timedelta(days=2, hours=-1)
    kind = _pick_reminder_kind(trial_end, day7_sent=_past(5), day12_sent=_past(0.01))
    assert kind is None
