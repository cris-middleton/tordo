# Landing + Pricing Redesign

**Date:** 2026-04-22
**Scope:** `frontend/app/page.tsx` (marketing landing) and pricing model changes
**Goal:** Reduce cognitive load on landing, consolidate pricing into a 2-tier model with reverse trial, increase signup volume.

## Context

Current landing has 9 sections with notable redundancy: stats appear in hero and in a dedicated "Data Trust" block, "sin tarjeta" messaging repeats 4+ times, a secondary gray paragraph in the hero duplicates FAQ content, and 6 FAQ items include one ("¿Puedo cancelar?") whose answer already belongs in pricing.

Current pricing has 4 tiers (Free / Starter $5.900 / Pro $11.900 / Enterprise). Starter at $5.900 is underpowered — the anchor user who pays $5.900 would likely pay $11.900 if the BI is convincing. Four options also fragments the decision and crowds the pricing grid on mobile.

Business priority for this phase: **maximize signup volume** (prioritize top-of-funnel learning over early revenue per user).

## Goals

1. Reduce text on the landing **without losing depth** — cut only redundancies and trim verbose copy.
2. Collapse pricing to **2 visible tiers** (Free + Pro) with a monthly/annual toggle on Pro.
3. Introduce a **reverse trial**: 14 days of full Pro access on signup, no card required; after 14 days the account automatically downgrades to Free if the user has not subscribed.
4. Align all CTAs around the new trial language ("Probar Pro 14 días" / "Probar 14 días gratis").
5. Keep Enterprise available but demote it from a pricing card to a one-line contact link.

## Non-Goals

- No change to the product/dashboard UI, only the marketing landing.
- No change to payment processing (Stripe Checkout + Billing Portal already in place).
- No copy changes to the three product mockups (`MockupPrecio`, `MockupScore`, `MockupMatching`).
- No backend plan-quota restructure beyond what the reverse trial requires (see "Backend implications" below).

## Pricing Model

### Structure

**Two visible tiers** in the pricing grid, plus a single Enterprise line below.

| Tier | Price | Target | Notes |
|---|---|---|---|
| **Free** | $0 | Explorers, post-trial users who didn't convert | Permanent, no card |
| **Pro** | $11.900/mes (or $9.900/mes facturado anual, −17%) | The paying segment — the only paid SKU | Monthly/annual toggle on the card |
| Enterprise | "A conversar" | Multi-RUT / teams | Not a card — single link under the grid |

### Free tier — what it includes (post-trial or direct signup)

- Exploración de licitaciones (search, filters, detail view)
- 3 alertas/mes (hard limit — was unlimited on Starter, stricter here to preserve Pro value)
- Monitor de estado hábil (1 empresa)
- Sin tarjeta de crédito

### Free tier — what it excludes

- BI panel (precio, competidores, score, matching semántico, buyer profile, etc.)
- Alertas ilimitadas
- Checklist de postulación
- Alertas de vencimiento de documentos

### Pro tier — what it includes (shown on the card)

- Alertas ilimitadas
- Benchmarks de precio por producto
- Análisis de competidores
- Score de oportunidad
- Matching semántico
- Checklist por tipo de licitación
- Alertas de vencimiento de documentos

(Kept close to the current Pro card's 6-bullet pattern so scanability doesn't regress. "Soporte por correo" is implicit and omitted to keep the card tight — it was the weakest bullet commercially.)

### Pro — annual toggle

The pricing card has a `Mensual | Anual (−17%)` segmented control at the top. Toggling updates the price display inline (same card, no layout shift).

- **Mensual:** $11.900/mes
- **Anual:** $9.900/mes facturado anual ($118.800/año — 2 meses gratis)

Annual is billed as a single $118.800 charge at checkout; monthly is $11.900 recurring. Both map to separate Stripe prices on the same product.

### Enterprise

Single line below the grid, center-aligned:

> ¿Equipos o múltiples RUTs? **Hablemos →**

Links to `#contacto` or a `mailto:`/contact form (to be decided in the plan — leave as `#contacto` for now).

### Reverse trial mechanics

- **Signup is free and card-less.** On registration the user's account is provisioned as Pro for 14 calendar days.
- On day 15 without a paid subscription, an automated job downgrades the account to Free. The account is **not** locked — the user loses BI/matching/unlimited-alerts but retains exploration + 3 alerts/mes + estado hábil.
- **Reminders during trial:** in-app banner + transactional email on day 7 ("vas por la mitad") and day 12 ("quedan 2 días"). Both link to `/dashboard/billing`.
- Trial status is exposed in the UI as a badge in `Layout.tsx` (e.g., "Pro · 9 días restantes").
- If the user subscribes during the trial, the trial ends and billing starts immediately — annual is charged on subscribe, monthly starts recurring.
- A user who downgrades cannot re-trial (one trial per account).

## Landing Copy Changes

Changes are scoped to `frontend/app/page.tsx`. Each edit below references the current line intent, not exact line numbers (file will evolve).

### 1. Hero

- **Keep:** H1 with rotating rubro, main subhead, product mockup, final CTA buttons.
- **Remove:** secondary gray paragraph "No importa el tamaño de tu empresa ni tu experiencia en licitaciones…" (duplicates FAQ #2).
- **Remove:** 3-stat grid at the bottom of the hero (same concept lives in the Data Trust section below).
- **Shorten:** trust line to `Sin tarjeta · Cancela cuando quieras` (drop "Datos públicos de ChileCompra" — already shown as caption under the mockup).
- **Change primary CTA label:** `Prueba gratis — sin tarjeta` → **`Probar Pro 14 días`**.
- **Keep secondary CTA** `Ver el producto` unchanged.

### 2. Benefits section (`#beneficios`)

- **Keep:** H2 "Inteligencia para decidir. Orden para postular.", both columns and their 3 items each.
- **Replace** the subhead paragraph with:
  > "Te mostramos si tu precio es competitivo y qué tan confiable es el comprador — antes de que inviertas tiempo postulando."

  Rationale: focuses on the BI differentiator (the part of the product that is fully built and the strongest hook), warmer tone than the original, doesn't over-promise on the "al postular" side since some of those outcomes are still maturing. The H2 itself already balances both halves.

### 3. Product demo (`#producto`)

No changes. This is the core of the demo and must stay intact.

### 4. How it works (`#como-funciona`)

- **Shorten** each step description to one sentence. Remove the parenthetical in step 1 about ChileCompra registration (already covered in FAQ #1).
  - Step 01: "Ingresa tu RUT y rubros. Verificamos tu estado hábil automáticamente."
  - Step 02: "Encuentra licitaciones que calzan con tu perfil, cada una con su score de oportunidad."
  - Step 03: "Revisa precios históricos, competidores y prepara tu documentación con el checklist."

### 5. Data Trust

- **Keep unchanged.** This is now the single home for stats on the landing.

### 6. Pricing (`#precios`)

Full restructure per the Pricing Model section above.

- **Grid layout:** 2 cards side-by-side on desktop, stacked on mobile (`grid-cols-1 sm:grid-cols-2` — no longer `lg:grid-cols-4`).
- **Pro card:**
  - Highlighted (dark `#0F2942` background, white text — current "Pro" card style).
  - "Más elegido" badge (was "Más popular").
  - Monthly/annual segmented toggle at top of card — client-side state, updates price inline.
  - CTA: **`Probar 14 días gratis`**.
- **Free card:**
  - White card, standard style.
  - CTA: **`Crear cuenta gratis`**.
- **Below the grid:**
  - Line 1 (small, centered): `¿Equipos o múltiples RUTs? Hablemos →` linking to `#contacto`.
  - Line 2 (existing, keep): `Precios en CLP. Sin contratos. Cancela cuando quieras.`
  - **Remove** the current trailing note "El plan Free no tiene límite de tiempo…" (implicit once there are only 2 tiers).

### 7. FAQ (`#faq`)

Reduce from 6 → 4 questions.

- **Fuse** "¿Necesito estar registrado en ChileCompra?" + "¿Qué es el 'estado hábil'?" into one: `¿Necesito algo de ChileCompra antes de usar TORDO?`
- **Keep:** `¿Necesito experiencia en licitaciones?`, `¿De dónde vienen los datos?`, `¿En qué se diferencia de otras herramientas?`.
- **Remove:** `¿Puedo cancelar cuando quiera?` (already addressed in pricing subtext).

### 8. Final CTA (`#contacto`)

- **Shorten** subtitle to one line: `Cuenta gratis en 2 minutos. Sin tarjeta.`
- **Change CTA:** `Crear cuenta gratis` → **`Probar Pro 14 días`** (match hero).

### 9. Navbar + sticky mobile CTA

- Both CTAs change from `Prueba gratis` → **`Probar Pro 14 días`**.

## CTA Vocabulary — Final Map

| Location | Old | New |
|---|---|---|
| Nav (desktop + mobile) | Prueba gratis | Probar Pro 14 días |
| Hero primary | Prueba gratis — sin tarjeta | Probar Pro 14 días |
| Hero secondary | Ver el producto | *(unchanged)* |
| Product demo CTA | Quiero ver esto con mis datos | *(unchanged)* |
| Pricing — Pro card | Elegir Pro | Probar 14 días gratis |
| Pricing — Free card | Comenzar gratis | Crear cuenta gratis |
| Final CTA section | Crear cuenta gratis | Probar Pro 14 días |
| Sticky mobile CTA | Prueba gratis | Probar Pro 14 días |

## Backend Implications

Out of scope for this landing-focused design, but flagged so the implementation plan can reference them:

1. **Registration flow:** new accounts must be provisioned on a `trial` plan (full Pro access) with `trial_ends_at = now() + 14 days`. Existing `User` / `plan` fields may need a `trial_ends_at` column.
2. **Downgrade job:** daily Celery beat task that moves expired trials to Free and emits a transactional email.
3. **In-app trial banner + reminders:** email templates at day 7 and day 12, plus a persistent badge in `Layout.tsx` reading days remaining.
4. **Stripe prices:** new annual price ID for Pro; checkout flow must respect the monthly/annual toggle from the pricing page.
5. **Plan-quota updates:** `core/plan_limits.py` needs a `free` tier with the stricter limits listed above (3 alerts/mes, no BI endpoints, no checklist, no doc-expiry alerts). The current Starter tier can be deleted or repurposed; trial-Pro users hit Pro limits.

These are **specifications for the implementation plan** — the landing redesign itself compiles and renders without them, but the CTAs will over-promise until the backend catches up. Recommendation: ship landing + trial-account provisioning + trial badge together; downgrade job and email reminders can follow within the same week.

## Testing / Validation

- Visual QA: desktop (≥1024px), tablet (768px), mobile (375px). Landing must scroll to pricing in ≤3 mobile swipes.
- Lighthouse: maintain current performance budget (no regressions from structural changes — we're removing content, not adding).
- Copy review: the landing copy is in Chilean Spanish with `tú` forms, no voseo (per user preference).
- Click-through tracking: instrument all CTAs with distinct event names so we can measure the shift from "Prueba gratis" → "Probar Pro 14 días".

## Open Questions for the Implementation Plan

- Exact Stripe product/price IDs for Pro monthly and Pro annual (user has to create in Stripe dashboard — already listed as pending in `docs/deploy_steps/tareas_manuales.md`).
- Whether the Enterprise `Hablemos →` link goes to a `mailto:`, a contact form route, or the existing `#contacto` anchor.
- Whether to allow grandfathered Starter users (if any exist in production) to keep that tier, or migrate them to Free with a notice. Default assumption: no production Starter users yet — safe to delete the tier outright.
