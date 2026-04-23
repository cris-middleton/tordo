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
