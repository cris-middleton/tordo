"""Tests for trial-aware plan tier resolution."""
from datetime import datetime, timedelta, timezone

from app.core.plan_limits import effective_plan_tier, meets_min_tier


class _FakeUser:
    """Minimal user stand-in for unit tests."""
    def __init__(self, plan_tier="basico", subscription_status="inactive", trial_ends_at=None):
        self.plan_tier = plan_tier
        self.subscription_status = subscription_status
        self.trial_ends_at = trial_ends_at


def _future(days: float) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def _past(days: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def test_effective_tier_is_plan_tier_when_no_trial():
    user = _FakeUser(plan_tier="basico")
    assert effective_plan_tier(user) == "basico"


def test_effective_tier_is_pro_during_active_trial():
    user = _FakeUser(
        plan_tier="basico",
        subscription_status="trialing",
        trial_ends_at=_future(7),
    )
    assert effective_plan_tier(user) == "pro"


def test_effective_tier_falls_back_when_trial_expired():
    user = _FakeUser(
        plan_tier="basico",
        subscription_status="trialing",
        trial_ends_at=_past(1),
    )
    assert effective_plan_tier(user) == "basico"


def test_effective_tier_is_pro_for_paying_pro_user():
    user = _FakeUser(plan_tier="pro", subscription_status="active")
    assert effective_plan_tier(user) == "pro"


def test_meets_min_tier_respects_active_trial():
    user = _FakeUser(
        plan_tier="basico",
        subscription_status="trialing",
        trial_ends_at=_future(3),
    )
    assert meets_min_tier_for_user(user, "pro") is True


def meets_min_tier_for_user(user, required):
    return meets_min_tier(effective_plan_tier(user), required)


from app.api.auth import _apply_trial_defaults


def test_apply_trial_defaults_sets_14_day_window():
    user = _FakeUser(subscription_status="inactive", trial_ends_at=None)
    before = datetime.now(timezone.utc)
    _apply_trial_defaults(user)
    after = datetime.now(timezone.utc)

    assert user.subscription_status == "trialing"
    assert user.trial_ends_at is not None
    expected_min = before + timedelta(days=14) - timedelta(seconds=2)
    expected_max = after + timedelta(days=14) + timedelta(seconds=2)
    assert expected_min <= user.trial_ends_at <= expected_max


def test_apply_trial_defaults_is_noop_when_already_trialing():
    existing_end = _future(10)
    user = _FakeUser(subscription_status="trialing", trial_ends_at=existing_end)
    _apply_trial_defaults(user)
    assert user.trial_ends_at == existing_end


def test_apply_trial_defaults_is_noop_for_paying_user():
    user = _FakeUser(plan_tier="pro", subscription_status="active")
    _apply_trial_defaults(user)
    assert user.subscription_status == "active"
    assert user.trial_ends_at is None
