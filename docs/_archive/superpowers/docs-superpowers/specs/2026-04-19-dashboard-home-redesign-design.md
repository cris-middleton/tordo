# Dashboard Home Redesign — Centro de comando operacional

**Date**: 2026-04-19
**Status**: Approved (pending implementation plan)
**Scope**: Full rewrite of `frontend/app/dashboard/page.tsx` + new unified backend endpoint + Celery pre-compute task + cache table + deletion of `/dashboard/analytics` route. No changes to BI panel (`/dashboard/bi`), already redesigned per `2026-04-12-bi-panel-redesign.md`.

---

## Problem

The current dashboard home is functional but does not fulfill its role as an operational center of command:

- It does not reflect the product's value proposition. A new user landing here cannot tell what Tordo does for them.
- It has no clear actionables — the user opens it but sees no answer to "what should I do now?".
- It feels like a collection of widgets rather than a triage surface.
- It mixes operational data with market analytics (BI widgets) on the same screen.
- Two of the five top-level KPIs are global counts (e.g. "42,000 licitaciones publicadas in Chile"), useless to the individual user.
- A counter "Alertas sin leer: 3" gives no information about urgency or content — forces a click to triage.
- Every page load consumes BI quota via probe calls to `/api/bi/oportunidades`.
- Multi-empresa users see only their first company's data, silently — no UI cue.

## Target User

PYME commercial/sales person who bids on public tenders via Mercado Público. Opens Tordo between meetings, between calls, first thing in the morning. Has 2 minutes, not 20. Needs to know: **what is closing, where is fresh opportunity, what is at risk, and how do I act in one click**.

## Strategic decisions (locked in during brainstorm)

1. **Source of "top opportunities" = TF-IDF matching** (specific licitaciones, not BI markets). `FEATURE_TFIDF` enabled in paid production.
2. **Three operational zones**: Urgency (today/this week) + Matches (TF-IDF) + Pipeline (funnel). Plus a **conditional mini-trend widget** that appears only if the empresa has ≥30 days of postulaciones history.
3. **Multi-empresa handling = use first empresa with explicit "Actuando como" badge + modal switcher.** No global refactor of AuthContext for v1. Active empresa persisted in localStorage.
4. **Narrative summary = deterministic template** for v1. LLM-generated briefing is an explicit *post-launch* bet, not in scope.
5. **Pre-computed matches via Celery daily task** (~6 AM Santiago). Home reads from `dashboard_home_cache` — never calls BI live.
6. **Delete `/dashboard/analytics`** entirely. The home absorbs the "personal pulse" role via the trend widget. A future "mi desempeño" deep-dive can be a separate project if demand emerges.

---

## Audit of the current dashboard

### What exists today (`frontend/app/dashboard/page.tsx`)

1. `DataFreshnessBar` — strip showing BI last update
2. Page header — "Dashboard" + today's date in Spanish
3. Onboarding nudge — warning if no empresa
4. **5 KPI cards** — Licitaciones publicadas (global), Órdenes en proceso (global), Alertas sin leer, Postulaciones activas, Docs por vencer
5. Estado Hábil banner — hábil/inhábil + RUT
6. Two collections (Licitaciones + Órdenes) with Saved/Applied tabs, persisted in `localStorage`
7. `TopOpportunities` — 3 BI markets (organismo+rubro pairs)
8. `MiniTrendChart` + `MiniActivityBars` — two BI market charts

### What fails (operational lens)

| # | Problem | Severity |
|---|---------|----------|
| 1 | No hierarchy by urgency — all 5 KPIs share the same visual weight | High |
| 2 | KPIs not personal — 2 of 5 are global system counts | High |
| 3 | "Alertas sin leer: N" is a content-less counter | High |
| 4 | BI widgets crowd the home, confuse purpose, and burn BI quota on every page load | High |
| 5 | **No "closing soon" view** — the #1 actionable for a tenders product is missing | Critical |
| 6 | Pipeline collapsed to a single number — 6 estados reduced to "activas: N" | High |
| 7 | Collections live in localStorage — fragile, lost on device change | Medium |
| 8 | Empty states feel broken (gray "Análisis BI no disponible") | Medium |
| 9 | Multi-empresa silently ignored | Medium |
| 10 | No quick actions — to postular requires home → tenders → search → click | Medium |

### Data available but unexploited

- Alert types (`PLAZO_24H`, `PLAZO_48H`, `DOCUMENTO_VENCIDO`, `ESTADO_HABIL_CAMBIO`, `NUEVA_LICITACION_MATCH`) — only counted, not triaged by type
- `Licitacion.fecha_cierre` joined with active postulaciones → countdown
- Per-postulacion checklist completion percentage
- TF-IDF matching endpoint (`/api/bi/matching`) gives specific licitaciones, not markets
- 30-day `estado_habil_log` history
- Postulaciones grouped by estado + timestamps → funnel + sparkline

### Widgets to remove (belong in `/bi`)

- `TopOpportunities`, `MiniTrendChart`, `MiniActivityBars`, `DataFreshnessBar`

---

## Principles of the new dashboard

1. **Triage by time, not by category.** Top: what closes today. Middle: what to look at this week. Bottom: context. Inspired by Superhuman's Today view.
2. **Actionable or out.** Each element on the home has a verb: postular, subir, revisar, renovar, marcar como enviada. If an element does not answer "what do I do with this?", it does not belong.
3. **Personal, not global.** The user does not need to know there are 42,000 licitaciones in Chile. They need to know which are *for them*. Every number is theirs.
4. **Operational ≠ analytical.** Zero CAGR, HHI, forecasts, market trends on the home. All of that lives in `/bi`. The home answers "what do I do", not "how is the market".
5. **Silence is good news — explicitly.** When there are no urgencies, the banner says clearly *"Estás al día. Ningún plazo en las próximas 72h."* — green, not gray. "All clear" should feel earned, not empty.

---

## Design

### Layout (desktop ≥1280px, 1440×900 reference)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [A] Banda superior — Badge empresa + Resumen narrativo            ~90px    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [B] PARA HOY                                  [C] OPORTUNIDADES             │
│      Urgencias accionables                          Matches TF-IDF           │
│      (lista densa, 5 items máx)                     (3 cards)                │
│                                                                  ~440px      │
│                                                                              │
│                                                                  ── fold     │
├──────────────────────────────────────────────────────────────────────────────┤
│  [D] TU PIPELINE — funnel 5 etapas clickeables                    ~140px    │
├──────────────────────────────────────────────────────────────────────────────┤
│  [E] TU MES (condicional)        [F] ACCIONES RÁPIDAS — 4 tiles  ~160px    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Above the fold (≤900px tall): zones [A], [B], [C]. Always — even with the narrative summary expanded to 3 lines.

### Endpoint contract (single roundtrip)

```
GET /api/dashboard/home?empresa_id={uuid}

Response (200):
{
  "empresa": {
    "id": "uuid",
    "nombre": "Constructora Ejemplo",
    "rut": "76.543.210-K",
    "estado_habil": "habil" | "inhabil" | "no_inscrito",
    "estado_habil_updated_at": "2026-04-19T08:00:00-03:00"
  },
  "resumen": {
    "matches_semana": 8,
    "matches_72h": 2,
    "postulaciones_activas": 5,
    "postulaciones_cierran_72h": 2,
    "docs_por_vencer_30d": 1,
    "docs_por_vencer_7d": 0,
    "adjudicaciones_mes": 3,
    "enviadas_mes": 7
  },
  "urgencias": [
    {
      "id": "string-stable-key",
      "tipo": "postulacion_cierre" | "documento_vence" | "match_alto" | "estado_inhabil" | "checklist_incompleto",
      "severidad": "rojo" | "naranja" | "amarillo",
      "tiempo_label": "36h" | "6d" | "—",
      "titulo": "LIC-4234 Servicios de aseo para Municipalidad de Ñuñoa",
      "subtitulo": "Cierre viernes 17:00 · Checklist 60%",
      "cta_label": "Completar",
      "cta_href": "/dashboard/postulaciones/{id}"
    }
  ],
  "matches": [
    {
      "codigo_externo": "LIC-...",
      "nombre": "Servicios de aseo general",
      "organismo": "Municipalidad de Ñuñoa",
      "monto_estimado": 12400000,
      "moneda": "CLP",
      "fecha_cierre": "2026-04-27T12:00:00-03:00",
      "score": 82,
      "href": "/dashboard/tenders/{codigo_externo}"
    }
  ],
  "matches_cached_at": "2026-04-19T06:00:00-03:00",
  "matches_total_disponibles": 20,
  "pipeline": {
    "en_seguimiento": 12,
    "en_preparacion": 4,
    "enviada": 8,
    "adjudicada": 3,
    "no_adjudicada": 2,
    "tasa_adjudicacion_90d": 0.60,
    "decididas_90d": 5
  },
  "trend": {
    "disponible": true,
    "postulaciones_semana": [3, 4, 5, 4, 6, 5, 7],
    "tasa_adjudicacion_actual": 0.60,
    "tasa_adjudicacion_anterior": 0.55,
    "delta_enviadas_pp": 2
  },
  "plan": {
    "tier": "free" | "paid",
    "matches_visibles": 1 | 3
  }
}
```

### [A] Banda superior — Empresa + Resumen narrativo

**Visual** (single horizontal band, ~90px):

```
┌────────────────────────────────────────────────────────────────────────────┐
│  [icono]  Actuando como Constructora Ejemplo · 76.543.210-K · [Cambiar]      │
│                                                                            │
│  Buenos días, Cristián.                                                    │
│  Esta semana aparecieron 8 matches nuevos — 2 cierran en menos de 72h.     │
│  Tu estado es hábil y 1 documento vence este mes.                          │
└────────────────────────────────────────────────────────────────────────────┘
```

**Template engine — concise, precise, warm, with a deep variant pool to feel dynamic.**

The template must NOT have only 2-3 variants of each phrase. It must have a **broad pool** so users who open the home daily see meaningful variation, even when underlying numbers are identical. Variant selection is **seeded by date** (so the message is stable through the day on refresh, but rotates day-to-day).

#### Variant pools

**Greeting (by Santiago hour):**
- 06:00–11:59: `"Buenos días"`, `"Buen día"`, `"Hola"`, `"Arrancando el día"`, `"Empezamos"`, `"Cómo va el día"`, `"Bienvenido de vuelta"`, `"Listo para hoy"`
- 12:00–18:59: `"Buenas tardes"`, `"Hola"`, `"Cómo vas"`, `"Buen día por la tarde"`, `"Espero buena tarde"`, `"En la mitad del día"`, `"De vuelta"`
- 19:00–23:59: `"Buenas noches"`, `"Cerrando el día"`, `"Última pasada del día"`, `"Hola"`, `"Resumen de cierre"`
- 00:00–05:59: `"Hola"`, `"Trabajando temprano"`, `"Buen día"` (treat as morning)

Greeting always followed by `, {first_name}.` (firstName from User record, fallback "Hola.").

**Frase de matches (cuando `matches_semana > 0`):**
- `"Esta semana aparecieron {N} matches nuevos"`
- `"Hay {N} licitaciones nuevas que calzan con tu perfil"`
- `"Encontramos {N} oportunidades para ti esta semana"`
- `"{N} licitaciones cruzaron tu radar"`
- `"Se publicaron {N} licitaciones que encajan con lo que haces"`
- `"Tienes {N} matches frescos para revisar"`
- `"{N} oportunidades nuevas te apuntan"`
- `"Aparecieron {N} licitaciones nuevas en tus rubros"`

**Sufijo de urgencia (cuando `matches_72h > 0` o `postulaciones_cierran_72h > 0`):**
- `" — {M} cierran en menos de 72h"`
- `" — {M} vencen pronto"`
- `" — {M} están en cuenta regresiva"`
- `" — {M} necesitan respuesta esta semana"`
- `" — ojo, {M} cierran en <72h"`
- `" — {M} requieren atención inmediata"`

**Frase de postulaciones (cuando `postulaciones_activas > 0`, omitible si no hay):**
- `"Tienes {N} postulaciones en curso"`
- `"{N} postulaciones activas en tu pipeline"`
- `"Hay {N} en preparación o seguimiento"`
- `"Estás trabajando en {N} postulaciones"`
- `"{N} licitaciones en tu mesa"`

**Frase de documentos (cuando `docs_por_vencer_30d > 0`):**
- `"{N} documento(s) vencen este mes"`
- `"{N} documento(s) por renovar pronto"`
- `"Atención: {N} doc(s) caduca(n) en los próximos 30 días"`
- `"{N} documento(s) requiere(n) renovación"`

**Frase de estado hábil (solo si `estado_habil != 'habil'`):**
- `"Importante: tu empresa figura inhábil"`
- `"Atención: estás inhábil en Mercado Público"`
- `"Ojo: tu estado actual es inhábil"`
- `"Estado inhábil — revisa documentos en Tesorería"`

**Frase de adjudicaciones positivas (cuando `adjudicaciones_mes > 0`):**
- `"Ya van {N} adjudicaciones este mes"`
- `"Has ganado {N} licitaciones este mes"`
- `"{N} adjudicaciones a tu favor en {mes}"`
- `"Buen mes: {N} adjudicada(s)"`

**Estado completamente vacío (no hay matches, no hay postulaciones, no hay docs por vencer, hábil):**
- `"No hay nada urgente por ahora. Buen momento para revisar tu perfil de rubros."`
- `"Todo despejado por ahora. Aprovecha para configurar alertas."`
- `"Sin novedades urgentes. Es buena hora para mirar tu pipeline con calma."`
- `"Día tranquilo. Revisa tus alertas o explora `/bi` para encontrar nuevos compradores."`

#### Composition rules

1. Maximum **3 phrases** on desktop, **2 phrases** on mobile.
2. Phrase order: `[matches+urgencia] → [postulaciones | docs | estado_hábil | adjudicaciones]`.
3. **Omit any phrase whose underlying value is zero.** Never write "0 matches", "0 postulaciones", etc.
4. Estado hábil phrase **always wins** over docs and adjudicaciones if not hábil — push it to second position.
5. Variant selection: hash `(empresa_id + date_yyyymmdd)` → integer → pick from pool by modulo. Same day = same message on refresh; new day = rotates.
6. The composer never produces the same exact string two days in a row for the same data shape — if the seed picks the same phrase, advance to the next pool slot.

#### Examples by data shape

> *"Buenos días, Cristián. Esta semana aparecieron 8 matches nuevos — 2 cierran en menos de 72h. Tu estado es hábil y 1 documento vence este mes."*

> *"Buenas tardes, María. Tienes 4 matches frescos para revisar. Estás trabajando en 6 postulaciones."*

> *"Hola, Pedro. Importante: tu empresa figura inhábil. 3 documentos vencen este mes."*

> *"Cerrando el día, Cristián. Buen mes: 3 adjudicada(s). Tienes 2 postulaciones en curso."*

> *"Hola, Ana. Todo despejado por ahora. Aprovecha para configurar alertas."*

#### Badge "Cambiar empresa"

Click → modal with the user's empresa list (only those where the user has a membership). Selecting a different empresa stores `empresa_activa_id` in `localStorage` and triggers a full re-fetch of `/api/dashboard/home`. Modal is dismissable via Esc and click-outside.

**Endpoint:** `GET /api/dashboard/home` — fields `empresa` + `resumen`.

**Free vs paid:** identical. Narrative is free.

**Mobile:** band collapses to two lines. Greeting + first phrase only (max ~140 chars).

### [B] Para hoy — Urgencias accionables

```
┌─────────────────────────────────────────────────────────────────────┐
│  Para hoy                                            Ver todas ›    │
│  ─────────────────────────────────────────────────────────────────  │
│  ● 36h    LIC-4234 Servicios de aseo para Municipalidad de Ñuñoa    │
│           Cierre viernes 17:00 · Checklist 60%       [Completar ›]  │
│                                                                     │
│  ● 52h    LIC-4101 Mantención redes                                 │
│           Cierre domingo 12:00 · Sin enviar          [Postular ›]   │
│                                                                     │
│  ● 6d     Documento: Certificado de antecedentes                    │
│           Vence el 25 abr · Quedan 6 días            [Subir nuevo ›]│
│                                                                     │
│  ● 3d     Nueva licitación con match 87%                            │
│           "Suministro de computadores" · MINEDUC     [Revisar ›]    │
│                                                                     │
│  ● —      Estado inhábil desde 15 abr                               │
│           Revisa deudas en Tesorería                 [Ver detalle ›]│
└─────────────────────────────────────────────────────────────────────┘
```

**Item anatomy:**
- Severity dot (left): red (`#dc2626` band: <48h), orange (`#f97316`: <7d), yellow (`#eab308`: informational urgent like inhábil), gray (general reminder).
- Time column (40px fixed): `"36h"`, `"3d"`, `"6d"`, or `"—"` for non-temporal.
- Title (truncate 1 line) + subtitle (truncate 1 line).
- CTA (small secondary button, verb-first label).

**Item types (priority order, max 5 visible):**

| Type | Trigger | CTA | Severity |
|------|---------|-----|----------|
| Postulación cierre <48h | `Postulacion.estado in (en_preparacion, en_seguimiento)` AND `fecha_cierre - now < 48h` | "Completar" / "Postular" | Red |
| Postulación cierre 48h–7d | idem, range 48h–7d | "Revisar" | Orange |
| Documento vence <7d | `fecha_vencimiento - today < 7` | "Subir nuevo" | Red |
| Documento vence 7–30d | idem, 7–30d | "Renovar" | Orange |
| Nueva licitación match alto no leída | `Alert.alert_type = NUEVA_LICITACION_MATCH` AND `not read` AND score ≥ 80 AND `created_at > now - 5d` | "Revisar" | Orange |
| Estado inhábil | `Empresa.estado_habil != 'habil'` | "Ver detalle" | Yellow |
| Cambio estado hábil últimos 7d | `Alert.alert_type = ESTADO_HABIL_CAMBIO` AND `not read` | "Revisar" | Yellow |
| Checklist incompleto + cierre próximo | `< 80%` complete AND `fecha_cierre - now < 72h` | "Completar" | Red (reinforces postulación) |

**Sort:** severity (red → orange → yellow) then time ascending.

**"Todo al día" state:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  Para hoy                                                           │
│  ─────────────────────────────────────────────────────────────────  │
│     ✓  Estás al día. Ningún plazo en las próximas 72h.              │
│        Tu estado es hábil y no hay documentos próximos a vencer.    │
│        [Revisar pipeline]                                           │
└─────────────────────────────────────────────────────────────────────┘
```

Background: very light green (`bg-accent/5`). CTA leads to pipeline so the user does something productive.

**Onboarding empty state** (empresa without postulaciones, without docs):

```
   Todavía no hay actividad. Empecemos:
   → Completa tu perfil TF-IDF (activa matches)
   → Sube documentos clave (certificado de antecedentes, balance)
   → Configura una preferencia de alerta
```

Each line is a link to the corresponding page.

**Endpoint:** `GET /api/dashboard/home` (field `urgencias`).

**Free vs paid:** identical. Urgencies are free — never gate what could hurt the user.

**Mobile:** vertical stack, each item full-width. "Ver todas" link below the list.

### [C] Oportunidades para ti — Matches TF-IDF

```
┌───────────────────────────────────────────────────────────────┐
│  Oportunidades para ti                       Ver 20 más ›     │
│  Actualizado hoy 06:00 AM                                     │
│  ───────────────────────────────────────────────────────────  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ [████████░░] 82  Servicios de aseo general               │  │
│  │                  Municipalidad de Ñuñoa · $12.4M CLP     │  │
│  │                  Cierre en 8 días        [Guardar] [Ver] │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  (2 cards similares...)                                       │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**Card anatomy:**
- Score bar 0–100 (color band: ≥80 green, 60–79 blue, 40–59 gray — never red, since this is a curated positive list)
- Licitación name (truncate 1 line)
- Organismo + monto
- "Cierre en Xd" (prominent if <7d)
- 2 buttons: Guardar (bookmark) / Ver (→ `/dashboard/tenders/{codigo}`)

**Sort:** by score descending. 3 visible in home. "Ver 20 más" → `/dashboard/tenders?source=matches`.

The "Actualizado hoy 06:00 AM" timestamp is honest — communicates this is the daily pre-computed batch.

**TF-IDF empty state (no profile trained yet):**

```
   Aún no tenemos datos suficientes para darte matches.
   Tordo necesita 5–10 postulaciones o compras históricas
   para aprender tu perfil.
   [Completar perfil manualmente →]
```

Link → manual rubro selection screen.

**Endpoint:** `GET /api/dashboard/home` (field `matches`) — read from `dashboard_home_cache`. Never calls BI live.

**Free vs paid:**
- **Free:** sees 1 match unblurred + 2 cards blurred with CTA "Desbloquea tus 20 mejores matches con PYME+". Scores visible, names hidden under blur. Lets user "see the value" without giving it away.
- **Paid:** 3 in home + 20 in "Ver 20 más".

**Mobile:** horizontal swipe carousel (1 full card with peek of next). Dot indicators below.

### [D] Tu pipeline

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Tu pipeline — últimos 90 días                              Ver todas ›     │
│  ──────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│   Seguimiento    Preparación     Enviada    Adjudicada   No adjudicada      │
│      [ 12 ]  →     [  4  ]  →    [  8  ]  →   [  3  ]      [ 2 ]            │
│      ████          ██            ████          ██           █                │
│                                                                              │
│  Tasa de adjudicación últimos 90 días: 60% (3 de 5 decididas)               │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Horizontal bars proportional to count (max bar = max count among the 5).
- Neutral colors except "Adjudicada" (subtle green) and "No adjudicada" (subtle red).
- Arrows between stages suggest flow.
- Each stage clickable → `/dashboard/postulaciones?estado=X`.
- Bottom line shown only if `decididas_90d ≥ 3`. Otherwise omitted.

**Endpoint:** `GET /api/dashboard/home` (field `pipeline`).

**Free vs paid:** identical.

**Mobile:** collapses to vertical — 5 rows, label + count + bar each.

### [E] Tu mes — Mini-widget tendencia (conditional)

Only shown when `trend.disponible = true` (empresa with ≥30 days of postulaciones).

```
┌────────────────────────────────────────────────┐
│  Tu mes                                        │
│  ────────────────────────────────────────────  │
│   ▁▂▄▃▅▆▇   Postulaciones enviadas             │
│             7 esta semana (+2 vs anterior)     │
│                                                │
│   60% tasa de adjudicación (+5pp vs mes prev.) │
└────────────────────────────────────────────────┘
```

When NOT available: the slot collapses in CSS — no empty hole.

**Endpoint:** `GET /api/dashboard/home` (field `trend`).

**Free vs paid:** identical.

**Mobile:** hidden by default (too small to read). Replaced by a link "Ver mi desempeño mensual" that opens a drawer.

### [F] Acciones rápidas

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│   [icon] Buscar  │   [icon] Subir   │   [icon] Ver     │   [icon] Config. │
│   licitaciones   │   documento      │   calendario     │   alertas        │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

Icons from Lucide (consistent with the rest of the product).

1. **Buscar licitaciones** → `/dashboard/tenders`
2. **Subir documento** → opens upload modal (or `/dashboard/documentos`)
3. **Ver calendario** → `/dashboard/calendario`
4. **Configurar alertas** → `/dashboard/alerts`

**Endpoint:** none (static).

**Free vs paid:** identical. Internal gating per page (e.g., max 3 alert preferences in free).

**Mobile:** 2×2 grid.

### Global responsive behavior

| Breakpoint | Layout |
|------------|--------|
| ≥1280px (desktop) | 2-col: B+C side by side, D full-width, E+F side by side |
| 768–1279px (tablet) | B full-width, C below full-width, D full-width, E+F side by side |
| <768px (mobile) | All vertical stack, E hidden (link instead), F as 2×2 |

**Loading:** per-zone skeletons (not full-page). [A] appears first since it's part of the same fetch; urgencies and matches fill in as the response arrives.

**Error handling:** if `/api/dashboard/home` fails, each zone shows "No pudimos cargar esta sección · Reintentar". The page does not crash entirely.

---

## Backend — new components

### Endpoint

`GET /api/dashboard/home?empresa_id={uuid}`

- Reads from `Postulacion`, `Licitacion`, `Alert`, `DocumentoEmpresa`, `Empresa`, and the new `dashboard_home_cache` table.
- Composes the urgencias array from 4 sources.
- Returns the full payload defined above.
- Membership check: 403 if user is not a member of `empresa_id`.

If the user has no empresa_id provided, default to first membership. Returns `empresa: null` only if user has zero memberships (onboarding state).

### Cache table

```sql
CREATE TABLE dashboard_home_cache (
    empresa_id UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    matches JSONB NOT NULL DEFAULT '[]',
    matches_count INTEGER NOT NULL DEFAULT 0,
    cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_dashboard_home_cache_cached_at ON dashboard_home_cache (cached_at);
```

### Celery task

`precompute_dashboard_matches`

- Schedule: daily at 06:00 Santiago (`celery beat`).
- For each empresa with at least one membership and a TF-IDF profile:
  - Call `tfidf_matcher.score_licitaciones_for_empresa(empresa_id, top_n=20)`.
  - Filter to only currently open licitaciones (`estado = 'Publicada'`, `fecha_cierre > now`).
  - Upsert into `dashboard_home_cache` with `cached_at = now`.
- If `FEATURE_TFIDF` is off, skip silently.
- Log row counts and elapsed time per empresa.

### Removed routes

Delete `frontend/app/dashboard/analytics/` directory. Remove the sidebar nav entry.

---

## Top 10 improvements (ranked by impact × effort)

### Tier 1 — Critical

1. **Replace 5 global KPIs with the "Para hoy" urgency zone** — high impact (changes the home's identity), medium effort.
2. **TF-IDF matches in home with daily pre-computation** — critical (the product's promise), medium effort.
3. **Remove all BI widgets from the home** — high impact (clarifies purpose, stops burning BI quota), trivial effort.
4. **Unified `GET /api/dashboard/home` endpoint** — high (latency, simplicity), medium effort.

### Tier 2 — High ROI, low effort

5. **Pipeline funnel visual** — high (gives business pulse), low effort.
6. **Greeting narrative with template** — medium-high (personality), low effort.
7. **"Todo al día" positive empty state** — medium (satisfaction), trivial.
8. **"Actuando como" badge + switcher modal** — medium (honesty), low effort.

### Tier 3 — Polish + conversion

9. **Free/paid gating on matches with blur + CTA** — medium-high conversion impact, low effort.
10. **Conditional mini-trend widget (≥30d history)** — medium impact, medium effort.

---

## Risky bets (speculative, NOT in v1 scope)

### Bet 1 — LLM-generated daily briefing 🎲

**Explicitly post-launch. Not in v1 scope.**

Replace the deterministic template with a Claude API call (Haiku 4.5, prompt-cached) executed once per user per day via cron (~05:50 Santiago, before the home is opened). Cache the result alongside the `dashboard_home_cache`. The prompt receives: resumen stats + last 10 postulaciones + 5 fresh matches + top historical buyer + estado hábil changes.

Output is 3–4 contextual phrases that reference real entity names and patterns the template cannot:

> *"Cristián, MINEDUC — tu mejor cliente del semestre — publicó 3 licitaciones ayer. Una matchea al 89% pero solo te da 5 días. Prioriza LIC-4201 hoy."*

**Cost:** ~$0.002/user/day with Haiku 4.5 + prompt caching → ~$0.60/user/year.
**Risk:** external dependency; fall back to deterministic template on any LLM failure (template is always present — zero downtime risk).
**When to evaluate:** after v1 ships and is stable. A/B test on a paid-plan subset.

### Bet 2 — Adaptive "modo día" 🎲

The home reorders zones based on the user's local hour:

| Hour | Preset | Prioritizes |
|------|--------|-------------|
| 06–11 | "Plan del día" | Urgencies + fresh matches up top |
| 12–17 | "En curso" | Incomplete checklist + postulaciones in preparation |
| 18–22 | "Cierre del día" | What was sent today + monthly rate vs goal + reminders for tomorrow |

Banda [A] also rotates its opening phrase per preset.

**Risk:** can feel gimmicky if the preset shifts are too obvious. Should be subtle — reorder, not replace.
**When to evaluate:** instrument open-time and run an A/B test 2–3 months post-launch.

### Bet 3 — Universal command palette (⌘K) 🎲

Linear / Superhuman / Vercel-style command palette invokable from anywhere on the home:
- `Postular LIC-4234`
- `Subir balance`
- `Ver pipeline MINEDUC`
- `Marcar alerta 123 como leída`

Indexed by: last 50 open licitaciones, the empresa's documents, active postulaciones, unread alerts.

**Effort:** ~1 sprint.
**Value:** power-users (PYMEs with multiple bidders) become evangelists.
**Realistic timing:** v2 post-launch, not now.

---

## What to remove from the current dashboard

### Remove from the home

| Element | Where it goes | Reason |
|---------|---------------|--------|
| `TopOpportunities` | Already exists in `/bi` | Market BI, not operational |
| `MiniTrendChart` | Delete | Market trend chart — belongs to `/bi` |
| `MiniActivityBars` | Delete | Market activity — belongs to `/bi` |
| `DataFreshnessBar` | Delete | BI date indicator — irrelevant for operational |
| KPI "Licitaciones publicadas" (global) | Delete | 42k licitaciones in Chile help no one |
| KPI "Órdenes en proceso" (global) | Delete | Same — global count without filter |
| KPI "Alertas sin leer" (blind counter) | Replaced by zone [B] with content | "3" is useless without knowing what they are |
| KPI "Postulaciones activas" (counter) | Replaced by zone [D] funnel | One number drops 6 estados of info |
| KPI "Docs por vencer (30d)" (counter) | Replaced by items in [B] | Urgent docs already appear as urgencies |
| Estado hábil banner in current position | If `hábil` → mentioned in narrative [A]. If `inhábil` → appears as yellow urgency in [B]. | Better contextual integration |
| Saved/Applied collections (localStorage) | **Remove from home in v1.** Migrate to backend in v2. | They take ~40% of screen without being primary activity. Access via menu or `/dashboard/tenders?filter=saved`. |

### Remove from global navigation

| Route | Action |
|-------|--------|
| `/dashboard/analytics` | **Delete entire route.** Mock data confuses. Home now absorbs "personal pulse". A future deep-dive can be a separate project. |

### Keep (untouched)

- Global sidebar layout (`frontend/app/dashboard/layout.tsx`)
- Onboarding nudge if no empresa — relocated to top of banda [A] when applicable
- Auth context, interceptors, plan checks — all transversal preserved

---

## What ships in the MVP

**Frontend:**
- `frontend/app/dashboard/page.tsx` — rewritten from scratch with the 6 zones ([A]–[F])
- 6 new components: `DashboardHeader`, `UrgencyZone`, `MatchesZone`, `PipelineZone`, `TrendWidget`, `QuickActions`
- Removal of `TopOpportunities`, `MiniTrendChart`, `MiniActivityBars`, `DataFreshnessBar`
- Removal of `frontend/app/dashboard/analytics/` directory
- `EmpresaSwitcher` modal + localStorage persistence
- Sidebar nav: remove `/dashboard/analytics` link

**Backend:**
- `GET /api/dashboard/home` — unified endpoint
- Migration: `dashboard_home_cache` table
- Celery task `precompute_dashboard_matches` — daily 06:00 Santiago
- Celery beat schedule entry

**Estimation:** 4–6 days of work for one full-stack developer.

---

## Open follow-ups (deliberately deferred)

- LLM briefing (post-launch bet)
- Adaptive "modo día" (post-launch bet)
- ⌘K command palette (v2)
- Saved/Applied collections sync to backend (v2)
- Global multi-empresa refactor (`empresa_activa` injected in all API calls) — pending demand from real multi-empresa users
- "Mi desempeño" deep-dive page replacing `/analytics` — only if user feedback demands it
