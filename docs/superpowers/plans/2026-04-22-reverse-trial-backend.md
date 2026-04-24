# Reverse Trial Backend (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing CTA "Probar Pro 14 días" truthful by provisioning a 14-day full-Pro trial for every new signup, automatically downgrading at day 15, sending reminders at day 7 and day 12, and aligning the in-product billing flow with the 2-tier (Free + Pro monthly/annual) pricing model.

**Architecture:** Keep the backend's existing 4 `plan_tier` values (`basico/pyme/pro/enterprise`) intact — don't rename or migrate data. Add `trial_ends_at` column on `users`; while it's in the future and `subscription_status='trialing'`, the user's *effective* plan is `pro` regardless of `plan_tier`. All quota checks route through a new `effective_plan_tier(user)` helper. Trial-to-Free transition is a Celery daily task. Monthly/annual Pro is handled by a second Stripe price ID passed as a `billing_period` argument to the existing checkout flow. The user-facing billing dashboard only shows Free + Pro; the legacy `pyme/enterprise` tiers remain in the code but are hidden from the plans endpoint.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async + psycopg2 for migrations, Alembic, Celery + Redis + celery-beat, Stripe SDK, SMTP email (`core/email.py`), Next.js 14 client components for the billing dashboard.

**Spec:** `docs/superpowers/specs/2026-04-22-landing-pricing-redesign-design.md` (section "Backend Implications").

---

## File Structure

**Backend (modified):**
- `backend/alembic/versions/009_trial_tracking.py` — **NEW**: migration adding 3 nullable timestamp columns to `users`.
- `backend/app/models/user.py` — add the 3 columns to the ORM model.
- `backend/app/schemas/user.py` — add `trial_ends_at` (and the sent-at flags for admin/debug) to `UserResponse`.
- `backend/app/core/plan_limits.py` — add `effective_plan_tier(user)` helper; route every tier check through it.
- `backend/app/api/auth.py` — new signups (email/password) get `trial_ends_at = now() + 14d` and `subscription_status = "trialing"`.
- `backend/app/services/oauth_service.py` — Google OAuth new-user branch gets the same trial provisioning.
- `backend/app/tasks/trial_tasks.py` — **NEW**: daily downgrade + day-7/day-12 reminder Celery tasks.
- `backend/app/celery_app.py` — register the 2 new beat-scheduled tasks and import `trial_tasks`.
- `backend/app/services/stripe_service.py` — `create_checkout_session` takes a `billing_period` arg; mapping includes Pro annual.
- `backend/app/config.py` — add `stripe_price_pro_annual` setting.
- `backend/app/api/billing.py` — `/plans` endpoint returns Free + Pro with both prices; `/checkout` accepts `billing_period`.
- `backend/app/schemas/billing.py` — extend `Plan` and `CheckoutRequest` schemas.
- `backend/tests/test_trial_flow.py` — **NEW**: pytest covering trial provisioning, effective-tier helper, downgrade idempotency, and reminder idempotency.

**Frontend (modified):**
- `frontend/components/Layout.tsx` — replace the plain plan badge with a trial-aware version.
- `frontend/contexts/AuthContext.tsx` — expose `trial_ends_at` on the user object (it already proxies whatever `/api/auth/me` returns, so the backend schema change is the only real lift).
- `frontend/app/dashboard/billing/page.tsx` — show a single Pro card with Monthly/Annual toggle; use `billing_period` when calling checkout.
- `frontend/lib/api.ts` — `createCheckoutSession` accepts `billing_period`.

No new frontend files.

## Testing Strategy

- **Backend:** pytest with fakeredis/in-memory SQLite is not set up in this repo, so tests hit the real Postgres via the existing test harness. Tests added in this plan cover the new logic directly (trial_ends_at-based effective tier, downgrade idempotency, reminder idempotency). Run with `cd backend && pytest tests/test_trial_flow.py -v`.
- **Alembic:** verify up + down migrations on a local DB.
- **Frontend:** no automated test suite. Manual QA: register a new account, verify badge shows "Prueba · 14 días", verify `/dashboard/billing` shows only Pro with a working toggle. Fast-forward `trial_ends_at` in the DB to simulate day 7 / day 12 / day 15 states.

## Task Order Rationale

Schema first (Task 1–2), then domain logic (Task 3), then the entry points that set the trial (Task 4). The UI badge (Task 5) requires Task 2's schema change but nothing else. Celery tasks (Tasks 6–7) can run after the trial is provisioned. Stripe alignment (Tasks 8–10) is a logical second half that ships the Monthly/Annual checkout promised by the pricing page.

---

### Task 1: Alembic migration — trial tracking columns

**Files:**
- Create: `backend/alembic/versions/009_trial_tracking.py`

Add three nullable timestamp columns to `users`: `trial_ends_at` (the actual deadline), `trial_reminder_day7_sent_at` (idempotency flag for the day-7 email), `trial_reminder_day12_sent_at` (same for day 12).

- [ ] **Step 1: Create the migration file**

```python
"""Add trial tracking columns to users.

Revision ID: 009
Revises: 008
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("trial_reminder_day7_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("trial_reminder_day12_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_users_trial_ends_at",
        "users",
        ["trial_ends_at"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_users_trial_ends_at", table_name="users")
    op.drop_column("users", "trial_reminder_day12_sent_at")
    op.drop_column("users", "trial_reminder_day7_sent_at")
    op.drop_column("users", "trial_ends_at")
```

- [ ] **Step 2: Run the migration**

Run from `backend/`:
```bash
alembic upgrade head
```
Expected output: `INFO  [alembic.runtime.migration] Running upgrade 008 -> 009, Add trial tracking columns to users`.

- [ ] **Step 3: Verify schema**

```bash
psql "$DATABASE_URL" -c "\d users" | grep trial_
```
Expected: three columns present with `timestamp with time zone` type, all nullable.

- [ ] **Step 4: Verify downgrade works (smoke test)**

```bash
alembic downgrade -1
psql "$DATABASE_URL" -c "\d users" | grep -c trial_ || echo "columns removed: OK"
alembic upgrade head
```
Leave the DB on `head` when done.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/009_trial_tracking.py
git commit -m "feat(trial): migration for trial_ends_at and reminder flags"
```

---

### Task 2: Update User model and UserResponse schema

**Files:**
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/schemas/user.py`

Expose the three new columns on the SQLAlchemy model and surface `trial_ends_at` to the frontend via `UserResponse`. The reminder-sent flags stay server-side only.

- [ ] **Step 1: Add columns to the User model**

In `backend/app/models/user.py`, locate the `# Plan / billing` block and append the new columns right after `stripe_subscription_id`:

```python
    # Plan / billing
    plan_tier = Column(String(20), nullable=False, default="basico")
    subscription_status = Column(String(20), nullable=False, default="inactive")
    stripe_customer_id = Column(String(255))
    stripe_subscription_id = Column(String(255))

    # Trial tracking
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)
    trial_reminder_day7_sent_at = Column(DateTime(timezone=True), nullable=True)
    trial_reminder_day12_sent_at = Column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 2: Add `trial_ends_at` to UserResponse**

In `backend/app/schemas/user.py`, locate the `UserResponse` class and add `trial_ends_at` immediately after `subscription_status`:

```python
class UserResponse(UserBase):
    id: int
    is_active: bool
    is_verified: bool
    notification_email: bool
    notification_in_app: bool
    notification_webhook: bool
    notification_whatsapp: bool = False
    plan_tier: str = "basico"
    subscription_status: str = "inactive"
    trial_ends_at: Optional[datetime] = None
    onboarding_completed: bool = False
    onboarding_step: int = 0
    webhook_url: Optional[str] = None
    whatsapp_number: Optional[str] = None
    has_google: bool = False  # derived: google_id is not None
    created_at: datetime
    last_login: Optional[datetime] = None
```

The existing `model_config = ConfigDict(from_attributes=True)` already handles ORM-to-schema mapping, so no further change needed.

- [ ] **Step 3: Smoke-test the schema serializes**

From `backend/`, open a Python REPL with the venv active:
```bash
python -c "from app.schemas.user import UserResponse; print(UserResponse.model_fields['trial_ends_at'])"
```
Expected: field info with `annotation=Optional[datetime]`, no error.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/user.py backend/app/schemas/user.py
git commit -m "feat(trial): expose trial_ends_at on User model and UserResponse"
```

---

### Task 3: `effective_plan_tier` helper and integration

**Files:**
- Modify: `backend/app/core/plan_limits.py`
- Create: `backend/tests/test_trial_flow.py`

The "while in trial, user is Pro" rule needs one helper called from every tier-gated code path. This task adds the helper and routes all existing deps through it.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_trial_flow.py` with:

```python
"""Tests for trial-aware plan tier resolution."""
from datetime import datetime, timedelta, timezone

from app.core.plan_limits import effective_plan_tier, meets_min_tier


class _FakeUser:
    """Minimal user stand-in for unit tests."""
    def __init__(self, plan_tier="basico", subscription_status="inactive", trial_ends_at=None):
        self.plan_tier = plan_tier
        self.subscription_status = subscription_status
        self.trial_ends_at = trial_ends_at


def _future(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def _past(days: int) -> datetime:
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
    # Even if the DB still has subscription_status='trialing' because the
    # downgrade task hasn't run yet, an expired deadline means no Pro access.
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
    """Convenience — exercises the same logic used by require_plan()."""
    return meets_min_tier(effective_plan_tier(user), required)
```

- [ ] **Step 2: Run the test — it must fail**

```bash
cd backend && pytest tests/test_trial_flow.py -v
```
Expected: `ImportError: cannot import name 'effective_plan_tier' from 'app.core.plan_limits'`.

- [ ] **Step 3: Implement the helper**

Open `backend/app/core/plan_limits.py`. Directly below the imports (after `logger = logging.getLogger(__name__)`), add:

```python
from datetime import datetime, timezone


def effective_plan_tier(user) -> str:
    """
    Return the user's *effective* plan tier right now.

    Rule: if the user is in an unexpired trial (subscription_status='trialing'
    AND trial_ends_at is in the future), they get full 'pro' access regardless
    of the stored plan_tier. Otherwise return plan_tier as-is.

    Safe against users with trial_ends_at in the past but status not yet
    reconciled by the daily downgrade task — those users are treated as
    whatever their plan_tier says.
    """
    trial_ends = getattr(user, "trial_ends_at", None)
    status = getattr(user, "subscription_status", None)
    if status == "trialing" and trial_ends is not None:
        # trial_ends_at is tz-aware (timestamptz column); compare in UTC.
        now = datetime.now(timezone.utc)
        if trial_ends > now:
            return "pro"
    return (user.plan_tier or "basico").lower()
```

- [ ] **Step 4: Route all tier-gated deps through the helper**

Inside the same file, update each place that currently reads `current_user.plan_tier` or `user_tier`-style arguments:

Replace the body of `require_plan._check`:
```python
    def _check(current_user: User = Depends(get_current_active_user)) -> User:
        if not meets_min_tier(effective_plan_tier(current_user), min_tier):
            label = _TIER_LABEL.get(min_tier, min_tier.title())
            raise HTTPException(
                status_code=402,
                detail=_quota_error(
                    "plan_tier",
                    effective_plan_tier(current_user),
                    None,
                    None,
                    f"Esta función requiere el plan {label} o superior. "
                    f"Actualiza tu suscripción para acceder.",
                ),
            )
        return current_user
```

Replace the quota lookup line inside `_make_bi_quota_dep._check`:
```python
        quota = get_quota(effective_plan_tier(current_user))
```

And the label line:
```python
            label = _TIER_LABEL.get(effective_plan_tier(current_user), effective_plan_tier(current_user).title())
```

Replace the quota lookup line inside `_make_alert_quota_dep_real._check`:
```python
        quota = get_quota(effective_plan_tier(current_user))
```

And the label line:
```python
            label = _TIER_LABEL.get(effective_plan_tier(current_user), effective_plan_tier(current_user).title())
```

For `enforce_doc_quota`, change the signature so the *ORM user object* can be passed (callers will need a one-line change — handle that in Step 5):

```python
def enforce_doc_quota(user, existing_docs: list, new_file_bytes: int) -> None:
    """
    Raise HTTP 402 if adding new_file_bytes would exceed plan document quotas.

    Accepts the full User ORM object so trial status is considered.
    """
    tier = effective_plan_tier(user)
    quota = get_quota(tier)
    max_docs: int | None = quota["max_docs"]
    max_mb: float | None = quota["max_docs_mb"]
    label = _TIER_LABEL.get(tier, tier.title())

    if max_docs is not _UNLIMITED and len(existing_docs) >= max_docs:
        raise HTTPException(
            status_code=402,
            detail=_quota_error(
                "max_docs",
                tier,
                max_docs,
                len(existing_docs),
                f"Has alcanzado el límite de {max_docs} documentos del plan {label}. "
                f"Elimina documentos o actualiza tu plan.",
            ),
        )

    if max_mb is not _UNLIMITED:
        total_bytes = sum(getattr(d, "tamano_bytes", 0) or 0 for d in existing_docs) + new_file_bytes
        total_mb_used = total_bytes / (1024 * 1024)
        if total_mb_used > max_mb:
            raise HTTPException(
                status_code=402,
                detail=_quota_error(
                    "max_docs_mb",
                    tier,
                    max_mb,
                    round(total_mb_used, 1),
                    f"Has superado el límite de almacenamiento de {max_mb} MB "
                    f"del plan {label}. Actualiza tu plan para subir más documentos.",
                ),
            )
```

- [ ] **Step 5: Update callers of `enforce_doc_quota`**

Find every call site:
```bash
cd backend && grep -rn "enforce_doc_quota" app/
```

In `backend/app/api/documentos.py` the call currently passes `current_user.plan_tier`. Change it to pass `current_user` directly. If there's more than one call, update all of them identically. Example transformation:

Before:
```python
enforce_doc_quota(current_user.plan_tier, existing, file_bytes)
```

After:
```python
enforce_doc_quota(current_user, existing, file_bytes)
```

- [ ] **Step 6: Run the tests — they must pass**

```bash
cd backend && pytest tests/test_trial_flow.py -v
```
Expected: 5/5 pass.

- [ ] **Step 7: Smoke-check the app still boots**

```bash
cd backend && python -c "from app.main import app; print('ok')"
```
Expected: `ok`. No import error from the changed `plan_limits.py` or `documentos.py`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/core/plan_limits.py backend/app/api/documentos.py backend/tests/test_trial_flow.py
git commit -m "feat(trial): effective_plan_tier helper - active trials grant Pro access"
```

---

### Task 4: Registration flow — provision the trial on signup

**Files:**
- Modify: `backend/app/api/auth.py`
- Modify: `backend/app/services/oauth_service.py`
- Modify: `backend/tests/test_trial_flow.py` (append)

Both the email/password register endpoint and the Google OAuth first-time-user branch must start the trial clock. Put the common logic in a helper inside `auth.py` and import it from `oauth_service.py`.

- [ ] **Step 1: Append failing tests for trial provisioning**

Append to `backend/tests/test_trial_flow.py`:

```python
from app.api.auth import _apply_trial_defaults


def test_apply_trial_defaults_sets_14_day_window():
    user = _FakeUser(subscription_status="inactive", trial_ends_at=None)
    before = datetime.now(timezone.utc)
    _apply_trial_defaults(user)
    after = datetime.now(timezone.utc)

    assert user.subscription_status == "trialing"
    assert user.trial_ends_at is not None
    # 14 days from "now" ± a second of test-time slack
    expected_min = before + timedelta(days=14) - timedelta(seconds=2)
    expected_max = after + timedelta(days=14) + timedelta(seconds=2)
    assert expected_min <= user.trial_ends_at <= expected_max


def test_apply_trial_defaults_is_noop_when_already_trialing():
    existing_end = _future(10)
    user = _FakeUser(subscription_status="trialing", trial_ends_at=existing_end)
    _apply_trial_defaults(user)
    # Must not reset an existing trial
    assert user.trial_ends_at == existing_end


def test_apply_trial_defaults_is_noop_for_paying_user():
    user = _FakeUser(plan_tier="pro", subscription_status="active")
    _apply_trial_defaults(user)
    assert user.subscription_status == "active"
    assert user.trial_ends_at is None
```

- [ ] **Step 2: Run — they must fail**

```bash
cd backend && pytest tests/test_trial_flow.py -v -k apply_trial_defaults
```
Expected: `ImportError: cannot import name '_apply_trial_defaults'`.

- [ ] **Step 3: Implement the helper in `auth.py`**

In `backend/app/api/auth.py`, at the top after the existing imports, add:

```python
TRIAL_LENGTH_DAYS = 14


def _apply_trial_defaults(user: User) -> None:
    """
    Idempotently initialise a 14-day Pro trial on a fresh user.

    Only runs if the user has no existing subscription and no trial deadline.
    Paying users (status='active', 'past_due', etc.) and already-provisioned
    trial users are left alone — callers may invoke this without checking.
    """
    if user.subscription_status and user.subscription_status != "inactive":
        return
    if user.trial_ends_at is not None:
        return
    user.subscription_status = "trialing"
    user.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=TRIAL_LENGTH_DAYS)
```

- [ ] **Step 4: Call the helper from the email/password register endpoint**

Still in `backend/app/api/auth.py`, inside the existing `register` function, right after `db_user = User(...)` construction and **before** `db.add(db_user)`:

```python
    db_user = User(
        email=user_data.email,
        username=user_data.username,
        full_name=user_data.full_name,
        hashed_password=get_password_hash(user_data.password),
    )
    _apply_trial_defaults(db_user)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user
```

- [ ] **Step 5: Call the helper from the Google OAuth new-user path**

In `backend/app/services/oauth_service.py`, at the top of the file add the import:

```python
from app.api.auth import _apply_trial_defaults
```

Inside `find_or_create_user`, locate the block that **creates a brand-new user** (the final block in the function that constructs `user = User(...)`). Immediately after the `User(...)` construction, before `db.add(user)`:

```python
    user = User(
        email=email,
        username=username,
        full_name=name,
        hashed_password=get_password_hash(secrets.token_hex(32)),  # unusable password
        google_id=google_id,
        is_verified=True,
        last_login=datetime.now(timezone.utc),
    )
    _apply_trial_defaults(user)
    db.add(user)
```

Do NOT add the call to the two earlier branches (existing user found by google_id, existing user found by email) — those users already have whatever plan state they had.

- [ ] **Step 6: Run the unit tests — they must pass**

```bash
cd backend && pytest tests/test_trial_flow.py -v
```
Expected: 8/8 pass (5 from Task 3 + 3 new).

- [ ] **Step 7: Manual end-to-end smoke**

Boot the backend locally and register a new user:
```bash
cd backend && uvicorn app.main:app --reload &
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"trial-smoke@example.com","username":"trialsmoke","password":"password123","full_name":"Smoke Test"}'
```
Expected response includes `"subscription_status":"trialing"` and `"trial_ends_at":"2026-05-06T..."` (14 days out). Clean up:
```bash
psql "$DATABASE_URL" -c "DELETE FROM users WHERE email='trial-smoke@example.com';"
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/auth.py backend/app/services/oauth_service.py backend/tests/test_trial_flow.py
git commit -m "feat(trial): provision 14-day Pro trial on new signups (email + Google)"
```

---

### Task 5: Trial badge in Layout.tsx

**Files:**
- Modify: `frontend/components/Layout.tsx`
- Modify: `frontend/contexts/AuthContext.tsx` (one-line type extension)

Show `Prueba Pro · N días restantes` when the user is in an active trial; fall back to the current plan display otherwise.

- [ ] **Step 1: Extend the `User` type in AuthContext**

Open `frontend/contexts/AuthContext.tsx`. Find the `User` (or equivalent) type definition. It currently includes fields like `plan_tier` and `subscription_status`. Add `trial_ends_at` as an optional nullable ISO string.

Find the type, e.g.:
```tsx
interface User {
  id: number;
  email: string;
  username: string;
  full_name?: string;
  plan_tier: string;
  subscription_status: string;
  // ...
}
```

Add the one line:
```tsx
  trial_ends_at?: string | null;
```

(If the type is declared inline with other names, add only the `trial_ends_at` field — do not rewrite the rest.)

- [ ] **Step 2: Replace the plan badge block in Layout.tsx**

In `frontend/components/Layout.tsx`, find the existing plan badge block (inside the sidebar's user section, currently rendered when `user?.plan_tier` is truthy):

```tsx
          {user?.plan_tier && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-background px-3 py-2">
              <div className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="text-xs font-medium text-muted">
                Plan{' '}
                <span className="font-bold text-text capitalize">
                  {user.plan_tier === 'pro' ? 'Pro' : user.plan_tier === 'starter' ? 'Starter' : 'Free'}
                </span>
              </span>
            </div>
          )}
```

Replace the entire block with:

```tsx
          {user && (() => {
            const isTrial =
              user.subscription_status === 'trialing' && !!user.trial_ends_at;
            const daysLeft = isTrial
              ? Math.max(
                  0,
                  Math.ceil(
                    (new Date(user.trial_ends_at as string).getTime() - Date.now())
                      / (1000 * 60 * 60 * 24)
                  )
                )
              : 0;
            const planLabel =
              user.plan_tier === 'pro' || user.subscription_status === 'active'
                ? 'Pro'
                : 'Free';
            return (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-background px-3 py-2">
                <div className={`h-1.5 w-1.5 rounded-full ${isTrial ? 'bg-gold' : 'bg-accent'}`} />
                <span className="text-xs font-medium text-muted">
                  {isTrial ? (
                    <>
                      Prueba Pro ·{' '}
                      <span className="font-bold text-text">
                        {daysLeft === 1 ? '1 día' : `${daysLeft} días`} restantes
                      </span>
                    </>
                  ) : (
                    <>
                      Plan <span className="font-bold text-text">{planLabel}</span>
                    </>
                  )}
                </span>
              </div>
            );
          })()}
```

This renders a gold dot + "Prueba Pro · N días restantes" during the trial and the regular `Plan Free / Plan Pro` badge otherwise. The existing `bg-gold` utility is already defined in the project.

- [ ] **Step 3: Visual QA**

```bash
cd frontend && npm run dev
```

Register a new user (or update an existing one in SQL):
```sql
UPDATE users
SET subscription_status='trialing',
    trial_ends_at = NOW() + INTERVAL '9 days'
WHERE email='your-test-user@example.com';
```

Reload the dashboard. Verify the badge reads `Prueba Pro · 9 días restantes` with a gold dot.

Then force the trial to end:
```sql
UPDATE users
SET subscription_status='inactive',
    trial_ends_at = NULL
WHERE email='your-test-user@example.com';
```

Reload. Badge should read `Plan Free` with the accent-color dot.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/Layout.tsx frontend/contexts/AuthContext.tsx
git commit -m "feat(trial): show 'Prueba Pro · N días restantes' badge during trial"
```

---

### Task 6: Celery task — daily downgrade of expired trials

**Files:**
- Create: `backend/app/tasks/trial_tasks.py`
- Modify: `backend/app/celery_app.py`
- Modify: `backend/tests/test_trial_flow.py` (append)

A daily beat-scheduled task finds trial users whose deadline has passed and sets `subscription_status='inactive'` + clears `trial_ends_at`. It leaves `plan_tier` as-is (`basico`) — the user becomes "Free" by virtue of effective_plan_tier returning `basico` once the trial is cleared.

- [ ] **Step 1: Append failing test for downgrade logic**

Append to `backend/tests/test_trial_flow.py`:

```python
import pytest
from sqlalchemy import select

from app.models.user import User
from app.tasks.trial_tasks import _downgrade_expired_trials_sync


@pytest.mark.asyncio
async def test_downgrade_moves_expired_trials_to_inactive(db_session):
    # Expired trial user
    u = User(
        email="expired@example.com",
        username="expired",
        hashed_password="x",
        subscription_status="trialing",
        trial_ends_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db_session.add(u)
    await db_session.commit()

    # Act — the task runs sync SQL via psycopg2, so just call the inner helper
    count = _downgrade_expired_trials_sync()
    assert count >= 1

    # Assert
    await db_session.refresh(u)
    assert u.subscription_status == "inactive"
    assert u.trial_ends_at is None


@pytest.mark.asyncio
async def test_downgrade_skips_active_trials(db_session):
    u = User(
        email="active-trial@example.com",
        username="activetrial",
        hashed_password="x",
        subscription_status="trialing",
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=3),
    )
    db_session.add(u)
    await db_session.commit()

    _downgrade_expired_trials_sync()

    await db_session.refresh(u)
    assert u.subscription_status == "trialing"
    assert u.trial_ends_at is not None


@pytest.mark.asyncio
async def test_downgrade_skips_paying_users(db_session):
    u = User(
        email="paying@example.com",
        username="paying",
        hashed_password="x",
        plan_tier="pro",
        subscription_status="active",
        # Edge case: a paying user with a stale trial_ends_at in the past
        # (shouldn't happen in practice, but verify the WHERE clause is tight).
        trial_ends_at=datetime.now(timezone.utc) - timedelta(days=30),
    )
    db_session.add(u)
    await db_session.commit()

    _downgrade_expired_trials_sync()

    await db_session.refresh(u)
    assert u.subscription_status == "active"
    assert u.plan_tier == "pro"
```

Note: this assumes a `db_session` async fixture exists. If the repo doesn't already have one, skip the Postgres-touching tests by marking them `@pytest.mark.skip("requires db_session fixture")` and rely on manual QA in Step 6.

Check whether the fixture exists:
```bash
cd backend && grep -rn "def db_session" tests/
```

If no fixture exists, mark the three tests with `pytest.mark.skip("db_session fixture not provided")` at the top of each function body.

- [ ] **Step 2: Run — they should fail (ImportError) or skip**

```bash
cd backend && pytest tests/test_trial_flow.py -v -k downgrade
```
Expected: `ImportError: cannot import name '_downgrade_expired_trials_sync'` or marked skipped.

- [ ] **Step 3: Implement the task file**

Create `backend/app/tasks/trial_tasks.py`:

```python
"""Celery tasks for reverse-trial lifecycle management.

- `downgrade_expired_trials`: daily job that ends trials whose trial_ends_at
   is in the past.
- `send_trial_reminders`: daily job that emails users at day 7 and day 12
   of their trial (idempotent via the *_sent_at columns).

Both tasks use synchronous SQL via psycopg2 because Celery workers don't run
inside an asyncio loop. The rest of the app uses asyncpg, but that's not
available here without bridging.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, text

from app.celery_app import celery_app
from app.config import settings

logger = logging.getLogger(__name__)


def _sync_engine():
    """Build a psycopg2 engine from the async DATABASE_URL."""
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return create_engine(url, pool_pre_ping=True)


def _downgrade_expired_trials_sync() -> int:
    """
    UPDATE users SET subscription_status='inactive', trial_ends_at=NULL
    WHERE subscription_status='trialing' AND trial_ends_at < NOW().

    Returns the number of rows updated. Used by the Celery task and directly
    by tests.
    """
    engine = _sync_engine()
    with engine.begin() as conn:
        result = conn.execute(
            text(
                """
                UPDATE users
                SET subscription_status = 'inactive',
                    trial_ends_at = NULL
                WHERE subscription_status = 'trialing'
                  AND trial_ends_at IS NOT NULL
                  AND trial_ends_at < NOW()
                """
            )
        )
        count = result.rowcount or 0
    logger.info("Downgraded %d expired trial(s) to inactive.", count)
    return count


@celery_app.task(name="app.tasks.trial_tasks.downgrade_expired_trials")
def downgrade_expired_trials() -> dict:
    """Beat-scheduled task — runs daily at 03:00 America/Santiago."""
    count = _downgrade_expired_trials_sync()
    return {"downgraded": count, "ran_at": datetime.now(timezone.utc).isoformat()}
```

- [ ] **Step 4: Register the task in the beat schedule**

In `backend/app/celery_app.py`, inside the `beat_schedule={...}` dict, append (preserve the existing entries):

```python
        # 03:00 SCL daily: downgrade expired reverse-trials
        "trial-downgrade": {
            "task": "app.tasks.trial_tasks.downgrade_expired_trials",
            "schedule": crontab(hour=3, minute=0),
        },
```

At the bottom of `celery_app.py`, add the import so the task is registered:

```python
from app.tasks import trial_tasks       # noqa
```

- [ ] **Step 5: Run the tests — they must pass (or stay skipped cleanly)**

```bash
cd backend && pytest tests/test_trial_flow.py -v
```
Expected: all prior tests pass, new downgrade tests either pass or are skipped with the documented reason.

- [ ] **Step 6: Manual smoke**

Insert an expired trial user and run the task directly:
```bash
psql "$DATABASE_URL" -c "UPDATE users SET subscription_status='trialing', trial_ends_at=NOW() - INTERVAL '1 hour' WHERE email='trial-smoke@example.com';"
cd backend && python -c "from app.tasks.trial_tasks import _downgrade_expired_trials_sync; print(_downgrade_expired_trials_sync())"
psql "$DATABASE_URL" -c "SELECT subscription_status, trial_ends_at FROM users WHERE email='trial-smoke@example.com';"
```
Expected: the Python invocation prints `1`; the final SELECT shows `subscription_status=inactive` and `trial_ends_at=NULL`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/tasks/trial_tasks.py backend/app/celery_app.py backend/tests/test_trial_flow.py
git commit -m "feat(trial): daily Celery task downgrades expired trials to inactive"
```

---

### Task 7: Celery task — day 7 and day 12 reminder emails

**Files:**
- Modify: `backend/app/tasks/trial_tasks.py` (append the reminder function and its Celery task)
- Modify: `backend/app/celery_app.py` (register the new beat entry)
- Modify: `backend/tests/test_trial_flow.py` (append)

One task runs daily at 09:00 SCL and handles both reminders. It looks up users in the right window, sends an email per user, and stamps the corresponding `*_sent_at` column to guarantee at-most-once.

- [ ] **Step 1: Append failing tests for reminder idempotency**

Append to `backend/tests/test_trial_flow.py`:

```python
from app.tasks.trial_tasks import _pick_reminder_kind


def test_pick_reminder_kind_day7_window():
    # Trial ends 7 days from now → should send day-7 reminder (12 days in, wait — this is the "7 days passed" reminder)
    # Our design: day 7 reminder goes out when 7 days have passed since signup.
    # Since we store trial_ends_at (= signup + 14d), day-7 of the trial means trial_ends_at is 7 days in the future.
    trial_end = datetime.now(timezone.utc) + timedelta(days=7, hours=-1)  # just under 7d to go
    kind = _pick_reminder_kind(trial_end, day7_sent=None, day12_sent=None)
    assert kind == "day7"


def test_pick_reminder_kind_day12_window():
    # Day 12 of trial = 2 days left on the clock.
    trial_end = datetime.now(timezone.utc) + timedelta(days=2, hours=-1)
    kind = _pick_reminder_kind(trial_end, day7_sent=_past(5), day12_sent=None)
    assert kind == "day12"


def test_pick_reminder_kind_returns_none_after_day7_sent():
    trial_end = datetime.now(timezone.utc) + timedelta(days=7, hours=-1)
    # Already sent day-7 reminder 10 minutes ago — should not resend
    kind = _pick_reminder_kind(trial_end, day7_sent=_past(0.007), day12_sent=None)
    assert kind is None


def test_pick_reminder_kind_skips_outside_windows():
    # 10 days remaining — between windows, send nothing
    trial_end = datetime.now(timezone.utc) + timedelta(days=10)
    kind = _pick_reminder_kind(trial_end, day7_sent=None, day12_sent=None)
    assert kind is None


def test_pick_reminder_kind_none_after_both_sent():
    trial_end = datetime.now(timezone.utc) + timedelta(days=2, hours=-1)
    kind = _pick_reminder_kind(trial_end, day7_sent=_past(5), day12_sent=_past(0.01))
    assert kind is None
```

- [ ] **Step 2: Run — they must fail**

```bash
cd backend && pytest tests/test_trial_flow.py -v -k pick_reminder
```
Expected: `ImportError: cannot import name '_pick_reminder_kind'`.

- [ ] **Step 3: Implement the reminder-picker helper and the sender task**

Append to `backend/app/tasks/trial_tasks.py`:

```python
# ── Reminder emails ────────────────────────────────────────────────────────────

from typing import Optional


def _pick_reminder_kind(
    trial_ends_at: datetime,
    day7_sent: Optional[datetime],
    day12_sent: Optional[datetime],
) -> Optional[str]:
    """
    Decide which (if any) reminder to send for this trial right now.

    Day 7 window: <= 8 days remain and > 1 day remain AND day7 not already sent.
    Day 12 window: <= 3 days remain AND > 0 remain AND day12 not already sent.

    Returns 'day7', 'day12', or None. Priority goes to day12 (closer to end).
    """
    now = datetime.now(timezone.utc)
    remaining = trial_ends_at - now
    days_remaining = remaining.total_seconds() / 86400

    # Day 12 reminder: within 3 days of the end (i.e. day 12-13 of trial)
    if 0 < days_remaining <= 3 and day12_sent is None:
        return "day12"

    # Day 7 reminder: between 3 and 8 days remaining (i.e. day 6-11 of trial)
    if 3 < days_remaining <= 8 and day7_sent is None:
        return "day7"

    return None


REMINDER_SUBJECTS = {
    "day7":  "Vas por la mitad de tu prueba de TORDO",
    "day12": "Te quedan 2 días de prueba en TORDO",
}

REMINDER_BODIES = {
    "day7": (
        "Hola,\n\n"
        "Llevas una semana probando TORDO Pro. ¿Ya revisaste alguna licitación "
        "con los benchmarks de precio y el score de oportunidad?\n\n"
        "Si aún no, ve a tu dashboard: {dashboard_url}\n\n"
        "Te quedan 7 días para aprovecharlo. Si quieres continuar al terminar, "
        "puedes activar tu suscripción en cualquier momento: {billing_url}\n\n"
        "— El equipo de TORDO\n"
    ),
    "day12": (
        "Hola,\n\n"
        "Tu prueba de TORDO Pro termina en 2 días.\n\n"
        "Si quieres seguir con la inteligencia completa (BI, matching, alertas "
        "ilimitadas, checklist), activa tu suscripción antes de que termine: "
        "{billing_url}\n\n"
        "Si no, no te preocupes — tu cuenta queda activa con el plan Free y "
        "podrás seguir explorando licitaciones.\n\n"
        "— El equipo de TORDO\n"
    ),
}


def _send_reminder_email(email: str, kind: str) -> bool:
    """Render + send one reminder email. Returns True if delivery succeeded."""
    from app.core.email import send_email

    dashboard_url = f"{settings.frontend_url}/dashboard"
    billing_url = f"{settings.frontend_url}/dashboard/billing"
    body = REMINDER_BODIES[kind].format(
        dashboard_url=dashboard_url,
        billing_url=billing_url,
    )
    return send_email(to=email, subject=REMINDER_SUBJECTS[kind], body=body)


@celery_app.task(name="app.tasks.trial_tasks.send_trial_reminders")
def send_trial_reminders() -> dict:
    """
    Beat-scheduled daily at 09:00 SCL. For every user with an active trial,
    send a day-7 or day-12 reminder if the window applies and we haven't
    already sent one. Stamp the *_sent_at column so we never double-send.
    """
    engine = _sync_engine()
    sent_day7 = 0
    sent_day12 = 0
    failures = 0

    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, email, trial_ends_at,
                       trial_reminder_day7_sent_at,
                       trial_reminder_day12_sent_at
                FROM users
                WHERE subscription_status = 'trialing'
                  AND trial_ends_at IS NOT NULL
                  AND trial_ends_at > NOW()
                """
            )
        ).fetchall()

    for row in rows:
        kind = _pick_reminder_kind(
            row.trial_ends_at,
            row.trial_reminder_day7_sent_at,
            row.trial_reminder_day12_sent_at,
        )
        if kind is None:
            continue

        ok = _send_reminder_email(row.email, kind)
        if not ok:
            failures += 1
            logger.warning("Trial reminder %s failed for user_id=%s", kind, row.id)
            continue

        # Stamp the column right after a successful send
        column = f"trial_reminder_{kind}_sent_at"
        with engine.begin() as conn:
            conn.execute(
                text(f"UPDATE users SET {column} = NOW() WHERE id = :uid"),
                {"uid": row.id},
            )
        if kind == "day7":
            sent_day7 += 1
        else:
            sent_day12 += 1

    result = {
        "sent_day7": sent_day7,
        "sent_day12": sent_day12,
        "failures": failures,
        "ran_at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info("Trial reminders: %s", result)
    return result
```

- [ ] **Step 4: Register the reminder task in beat schedule**

In `backend/app/celery_app.py`, inside `beat_schedule={...}`, append:

```python
        # 09:00 SCL daily: reverse-trial day-7 / day-12 reminder emails
        "trial-reminders": {
            "task": "app.tasks.trial_tasks.send_trial_reminders",
            "schedule": crontab(hour=9, minute=0),
        },
```

(The existing `deadline-reminders` at the same time is fine — Celery can run both.)

- [ ] **Step 5: Run the tests**

```bash
cd backend && pytest tests/test_trial_flow.py -v
```
Expected: all prior tests pass + 5 new `_pick_reminder_kind` tests pass.

- [ ] **Step 6: Smoke test a real email (optional, needs SMTP configured)**

Set a user's `trial_ends_at` to 2 days out and run the task inline:
```bash
psql "$DATABASE_URL" -c "UPDATE users SET subscription_status='trialing', trial_ends_at=NOW()+INTERVAL '2 days', trial_reminder_day12_sent_at=NULL WHERE email='your@email.com';"
cd backend && python -c "from app.tasks.trial_tasks import send_trial_reminders; print(send_trial_reminders())"
```
Expected: the returned dict shows `sent_day12 >= 1` and an email arrives in your inbox.

- [ ] **Step 7: Commit**

```bash
git add backend/app/tasks/trial_tasks.py backend/app/celery_app.py backend/tests/test_trial_flow.py
git commit -m "feat(trial): daily Celery task sends day-7 and day-12 reminder emails"
```

---

### Task 8: Stripe monthly/annual checkout support

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/services/stripe_service.py`
- Modify: `backend/app/schemas/billing.py`
- Modify: `backend/app/api/billing.py`

Add an annual Pro price. `create_checkout_session` accepts a `billing_period` arg. The checkout endpoint passes it through from the request.

- [ ] **Step 1: Add the annual price setting**

In `backend/app/config.py`, find the existing Stripe price block:
```python
    stripe_price_pro: Optional[str] = None        # Stripe price ID for Pro plan
    stripe_price_enterprise: Optional[str] = None  # Stripe price ID for Enterprise plan
```

Add one line right after `stripe_price_pro`:
```python
    stripe_price_pro: Optional[str] = None         # Stripe price ID for Pro monthly
    stripe_price_pro_annual: Optional[str] = None  # Stripe price ID for Pro annual
    stripe_price_enterprise: Optional[str] = None  # Stripe price ID for Enterprise plan
```

(Leaving `stripe_price_pro` as "monthly" preserves backward compatibility — existing deployments don't need to rename env vars.)

- [ ] **Step 2: Update `create_checkout_session` signature and mapping**

In `backend/app/services/stripe_service.py`, replace the `PLAN_PRICE_ENV` dict and the `create_checkout_session` function with:

```python
# Map (plan_tier, billing_period) → settings attribute name
PLAN_PRICE_ENV: dict[tuple[str, str], str] = {
    ("pro", "monthly"):        "stripe_price_pro",
    ("pro", "annual"):         "stripe_price_pro_annual",
    ("enterprise", "monthly"): "stripe_price_enterprise",
}


def create_checkout_session(
    user,
    plan_tier: str,
    success_url: str,
    cancel_url: str,
    billing_period: str = "monthly",
) -> str:
    """
    Create a Stripe Checkout session for the given plan and billing period.
    Returns the session URL.
    """
    _require_billing()
    s = _stripe()
    from app.config import settings

    if billing_period not in ("monthly", "annual"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid billing_period '{billing_period}'. Use 'monthly' or 'annual'.",
        )

    price_attr = PLAN_PRICE_ENV.get((plan_tier, billing_period))
    if not price_attr:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Plan '{plan_tier}' with billing '{billing_period}' is not available.",
        )

    price_id = getattr(settings, price_attr, None)
    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Stripe price ID for plan '{plan_tier}' ({billing_period}) is not configured.",
        )

    customer_id = get_or_create_customer(user)

    session = s.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": str(user.id),
            "plan_tier": plan_tier,
            "billing_period": billing_period,
        },
        subscription_data={
            "metadata": {
                "user_id": str(user.id),
                "plan_tier": plan_tier,
                "billing_period": billing_period,
            }
        },
    )
    return session.url
```

- [ ] **Step 3: Extend the `CheckoutRequest` schema**

In `backend/app/schemas/billing.py`, find the `CheckoutRequest` class. Add `billing_period`:

```python
class CheckoutRequest(BaseModel):
    plan_tier: str
    billing_period: Literal["monthly", "annual"] = "monthly"
    success_url: str
    cancel_url: str
```

If `Literal` is not already imported, add it to the imports at the top of the file:
```python
from typing import Literal
```

- [ ] **Step 4: Pass `billing_period` through the endpoint**

In `backend/app/api/billing.py`, update the `/checkout` endpoint:

```python
@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    payload: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    from app.services.stripe_service import create_checkout_session, get_or_create_customer
    customer_id = get_or_create_customer(current_user)
    if customer_id != current_user.stripe_customer_id:
        current_user.stripe_customer_id = customer_id
        await db.commit()
        await db.refresh(current_user)
    url = create_checkout_session(
        current_user,
        payload.plan_tier,
        payload.success_url,
        payload.cancel_url,
        billing_period=payload.billing_period,
    )
    return CheckoutResponse(checkout_url=url)
```

- [ ] **Step 5: Smoke-check app still boots**

```bash
cd backend && python -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/app/services/stripe_service.py backend/app/schemas/billing.py backend/app/api/billing.py
git commit -m "feat(billing): Stripe checkout accepts billing_period (monthly/annual)"
```

---

### Task 9: Align `/api/billing/plans` with the 2-tier story

**Files:**
- Modify: `backend/app/schemas/billing.py`
- Modify: `backend/app/api/billing.py`

The `/plans` endpoint currently returns 4 plans including Starter-ish `pyme`. Replace with just Free + Pro (monthly + annual prices surfaced as separate fields).

- [ ] **Step 1: Extend the `Plan` schema**

In `backend/app/schemas/billing.py`, replace the `Plan` class with:

```python
class Plan(BaseModel):
    id: str
    nombre: str
    descripcion: str
    features: list[str]
    precio_mensual_clp: Optional[int] = None
    precio_anual_mensualizado_clp: Optional[int] = None  # monthly-equivalent of the annual plan
    precio_anual_total_clp: Optional[int] = None         # one-time annual charge amount
```

(The old single `precio_clp` field is gone; callers needed a migration anyway.)

- [ ] **Step 2: Replace the PLANS list**

In `backend/app/api/billing.py`, replace the `PLANS` constant with:

```python
PLANS: list[Plan] = [
    Plan(
        id="free",
        nombre="Free",
        descripcion="Para explorar sin compromiso.",
        features=[
            "Exploración de licitaciones",
            "3 alertas al mes",
            "Monitor de estado hábil",
            "Sin tarjeta de crédito",
        ],
    ),
    Plan(
        id="pro",
        nombre="Pro",
        descripcion="Inteligencia completa para ganar más licitaciones.",
        features=[
            "Alertas ilimitadas",
            "Benchmarks de precio por producto",
            "Análisis de competidores",
            "Score de oportunidad",
            "Matching semántico",
            "Checklist por tipo de licitación",
            "Alertas de vencimiento de documentos",
        ],
        precio_mensual_clp=11900,
        precio_anual_mensualizado_clp=9900,
        precio_anual_total_clp=118800,
    ),
]
```

Note: the Free tier uses id `"free"` here even though internally the DB column still stores `"basico"`. This is purely a display id; the billing frontend uses it only as a React key. The checkout endpoint only accepts `plan_tier="pro"`, so the `"free"` id is never sent back to the server.

- [ ] **Step 3: Smoke-test the endpoint**

```bash
cd backend && uvicorn app.main:app --reload &
curl -s http://localhost:8000/api/billing/plans | python -m json.tool
```
Expected: a 2-element JSON array with `free` and `pro` objects. The Pro entry has both `precio_mensual_clp: 11900` and `precio_anual_mensualizado_clp: 9900`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/billing.py backend/app/api/billing.py
git commit -m "feat(billing): /api/billing/plans returns Free + Pro with monthly/annual pricing"
```

---

### Task 10: Dashboard billing page — Monthly/Annual toggle + single Pro card

**Files:**
- Modify: `frontend/app/dashboard/billing/page.tsx`
- Modify: `frontend/lib/api.ts`

The current page shows 4 plan cards hard-wired to the old 4-tier backend shape (`precio_clp`). Rewrite it to show a single Pro card with the same Monthly/Annual toggle pattern used on the landing, plus a Free-tier reference card.

- [ ] **Step 1: Update `createCheckoutSession` in `lib/api.ts`**

Find the existing method in `frontend/lib/api.ts` (search for `createCheckoutSession`). Update it to accept and pass `billing_period`:

```ts
  createCheckoutSession(params: {
    plan_tier: string;
    billing_period?: 'monthly' | 'annual';
    success_url: string;
    cancel_url: string;
  }) {
    return this.post<{ checkout_url: string }>('/api/billing/checkout', params);
  },
```

(The existing method signature probably already accepts an object — just add the `billing_period` optional field and make sure it's forwarded. Don't restructure the method beyond that.)

- [ ] **Step 2: Rewrite the billing page**

Replace the body of `frontend/app/dashboard/billing/page.tsx` with the version below. This keeps the existing `BillingStatus` + auth wiring, swaps the plan-list rendering for a 2-card layout with the toggle, and drops `precio_clp` in favour of the new fields.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Star,
  AlertTriangle,
  Lock,
} from 'lucide-react';

interface Plan {
  id: string;
  nombre: string;
  descripcion: string;
  features: string[];
  precio_mensual_clp?: number | null;
  precio_anual_mensualizado_clp?: number | null;
  precio_anual_total_clp?: number | null;
}

interface BillingStatus {
  plan_tier: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_enabled: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:   { label: 'Activa', color: 'text-accent bg-accent/10' },
  trialing: { label: 'Prueba gratuita', color: 'text-info bg-info/10' },
  past_due: { label: 'Pago vencido', color: 'text-danger bg-danger/10' },
  canceled: { label: 'Cancelada', color: 'text-muted bg-surface border border-border' },
  inactive: { label: 'Gratuito', color: 'text-muted bg-surface border border-border' },
};

const formatCLP = (n: number) => `$${n.toLocaleString('es-CL')}`;

export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      const [plansData, statusData] = await Promise.all([
        apiClient.getBillingPlans(),
        apiClient.getBillingStatus(),
      ]);
      setPlans(plansData);
      setBillingStatus(statusData);
    } catch {
      setError('No se pudo cargar la información de facturación.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!billingStatus?.billing_enabled) return;
    setCheckoutLoading(true);
    setError('');
    try {
      const origin = window.location.origin;
      const res = await apiClient.createCheckoutSession({
        plan_tier: 'pro',
        billing_period: billingPeriod,
        success_url: `${origin}/dashboard/billing?success=1`,
        cancel_url: `${origin}/dashboard/billing`,
      });
      window.location.href = res.checkout_url;
    } catch {
      setError('No se pudo iniciar el checkout.');
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await apiClient.createBillingPortalSession();
      window.location.href = res.portal_url;
    } catch {
      setError('No se pudo abrir el portal de facturación.');
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    );
  }

  const freePlan = plans.find((p) => p.id === 'free');
  const proPlan = plans.find((p) => p.id === 'pro');
  const status = billingStatus?.subscription_status ?? 'inactive';
  const statusBadge = STATUS_LABELS[status] ?? STATUS_LABELS.inactive;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Current subscription status */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
              Tu suscripción
            </p>
            <p className="mt-1 text-lg font-bold text-text">
              Plan {billingStatus?.plan_tier === 'pro' ? 'Pro' : 'Free'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.color}`}>
            {statusBadge.label}
          </span>
          {billingStatus?.stripe_customer_id && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text hover:bg-background"
            >
              {portalLoading ? <Loader2 className="animate-spin" size={14} /> : <CreditCard size={14} />}
              Gestionar suscripción
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {!billingStatus?.billing_enabled && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          <Lock size={16} />
          El módulo de facturación está deshabilitado en este entorno.
        </div>
      )}

      {/* Two-card grid */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Free card */}
        {freePlan && (
          <div className="flex flex-col rounded-xl border border-border bg-surface p-6">
            <h3 className="text-lg font-bold text-text">{freePlan.nombre}</h3>
            <p className="mt-1 text-xs text-muted">{freePlan.descripcion}</p>
            <p className="mt-4 text-3xl font-bold text-text">$0</p>
            <div className="mt-4 h-4" />
            <ul className="flex-1 space-y-2.5">
              {freePlan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={14} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-subtle">
              Plan actual si no activas Pro
            </div>
          </div>
        )}

        {/* Pro card */}
        {proPlan && (
          <div className="relative flex flex-col rounded-xl border border-primary bg-primary p-6 text-white shadow-xl">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-[11px] font-bold text-white">
                <Star size={10} /> Más elegido
              </span>
            </div>

            <h3 className="text-lg font-bold">{proPlan.nombre}</h3>
            <p className="mt-1 text-xs text-white/70">{proPlan.descripcion}</p>

            {/* Monthly / Annual toggle */}
            <div className="mt-4 inline-flex self-start rounded-lg bg-white/10 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setBillingPeriod('monthly')}
                className={`rounded-md px-3 py-1.5 transition-all ${
                  billingPeriod === 'monthly' ? 'bg-white text-primary' : 'text-white/70 hover:text-white'
                }`}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod('annual')}
                className={`rounded-md px-3 py-1.5 transition-all ${
                  billingPeriod === 'annual' ? 'bg-white text-primary' : 'text-white/70 hover:text-white'
                }`}
              >
                Anual <span className="ml-1 text-[10px] text-accent">−17%</span>
              </button>
            </div>

            <p className="mt-3 text-3xl font-bold">
              {billingPeriod === 'monthly'
                ? formatCLP(proPlan.precio_mensual_clp ?? 0)
                : formatCLP(proPlan.precio_anual_mensualizado_clp ?? 0)}
              <span className="ml-1 text-sm font-normal text-white/70">/mes</span>
            </p>
            <p className="mt-1 min-h-[1rem] text-xs text-white/60">
              {billingPeriod === 'annual' && proPlan.precio_anual_total_clp
                ? `Facturado anual · ${formatCLP(proPlan.precio_anual_total_clp)}/año`
                : ''}
            </p>

            <ul className="mt-4 flex-1 space-y-2.5">
              {proPlan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/85">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={14} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={handleCheckout}
              disabled={checkoutLoading || !billingStatus?.billing_enabled}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {checkoutLoading ? <Loader2 className="animate-spin" size={14} /> : null}
              {status === 'active' ? 'Ya tienes Pro' : 'Activar Pro'}
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-subtle">
        Precios en CLP. Cancela cuando quieras desde el portal de facturación.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Visual QA**

```bash
cd frontend && npm run dev
```

Sign in as any user. Visit `/dashboard/billing`.

Verify:
- Only 2 cards render (Free + Pro).
- The status block at the top reads `Plan Free` or `Plan Pro` with a status badge matching the DB.
- Toggle Mensual → shows `$11.900 /mes`, no annual note.
- Toggle Anual → shows `$9.900 /mes` + `Facturado anual · $118.800/año`.
- If billing is disabled (feature flag off or Stripe not configured), the warning banner renders and the "Activar Pro" button is disabled.
- Clicking "Activar Pro" while billing is enabled redirects to Stripe Checkout (use test mode).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/billing/page.tsx frontend/lib/api.ts
git commit -m "feat(billing): dashboard billing page - 2 tiers + monthly/annual toggle"
```

---

## Post-Plan Verification

After Tasks 1–10 are complete:

- [ ] **End-to-end trial lifecycle smoke.** Register a new account via the landing. Verify:
  - JWT token returned on register.
  - `/api/auth/me` returns `subscription_status='trialing'` and a `trial_ends_at` ~14 days out.
  - Sidebar badge reads `Prueba Pro · 14 días restantes`.
  - Visiting a Pro-gated BI endpoint succeeds (no 402).
- [ ] **Day-7 reminder smoke.** Fast-forward the DB: `UPDATE users SET trial_ends_at=NOW()+INTERVAL '7 days', trial_reminder_day7_sent_at=NULL WHERE id=<your test user>;`. Run `python -c "from app.tasks.trial_tasks import send_trial_reminders; send_trial_reminders()"`. Check email and verify the `trial_reminder_day7_sent_at` column is now populated.
- [ ] **Downgrade smoke.** `UPDATE users SET trial_ends_at=NOW()-INTERVAL '1 hour' WHERE id=<your test user>;`. Run `python -c "from app.tasks.trial_tasks import downgrade_expired_trials; downgrade_expired_trials()"`. Verify `subscription_status='inactive'` and `trial_ends_at IS NULL`. Reload the dashboard — badge now reads `Plan Free`. BI endpoints return 402.
- [ ] **Checkout smoke.** On the expired-trial account, `/dashboard/billing` shows the Pro card. Toggle Anual, click "Activar Pro". Complete Stripe checkout with a test card. Verify webhook sets `plan_tier='pro'` and `subscription_status='active'`.
- [ ] **Regression check.** Existing docs-upload and alerts endpoints still work for an inactive (free-tier) account — the `enforce_doc_quota` signature change didn't break anything.

## Open Questions / Manual-ops Items

- The Stripe products/prices for Pro monthly and Pro annual must be created in the Stripe dashboard. Grab both price IDs and set `STRIPE_PRICE_PRO` (monthly) and `STRIPE_PRICE_PRO_ANNUAL` in the production env before enabling `FEATURE_BILLING=true`.
- SMTP must be configured (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`) for trial reminders to deliver. Without SMTP, `send_trial_reminders` logs a warning per user but doesn't crash.
- The landing's Pro CTA copy is "Probar 14 días gratis"; Plan A already shipped this. Once Plan B is deployed, the promise becomes real.
- Legacy users on `plan_tier='pyme'` or `plan_tier='enterprise'` remain on those tiers with their old quotas. They are invisible from `/api/billing/plans` and `/dashboard/billing`. If you later want to migrate them to `pro`, that's a one-line UPDATE outside the scope of this plan.
