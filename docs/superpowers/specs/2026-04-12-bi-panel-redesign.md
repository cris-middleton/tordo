# BI Panel Redesign — Inteligencia de Mercado

**Date**: 2026-04-12
**Status**: Approved
**Scope**: Frontend rewrite of `frontend/app/dashboard/bi/page.tsx` + BI card on tender detail page. No backend changes required.

---

## Problem

The current BI page is a disconnected grab-bag of widgets that requires users to know organismo codes, uses jargon labels (CAGR, HHI, "Ventana de Presión"), has broken functionality ("Analizar" button in días promedio pago), wastes the user's 3 daily BI queries on probe calls, and only uses 8 of 16 available API endpoints. The result: users see an empty page that feels neither useful nor insightful.

## Target User

PYME commercial/sales person who actively bids on public tenders via Mercado Público. Knows the domain but not statistics. Needs plain Spanish, zero jargon, and progressive disclosure for depth.

## Design

### Global Filter Bar

A sticky bar at the top with a **rubro dropdown** that drives all sections below.

- **Populated from**: empresa's `rubros_cpv` array, OR TF-IDF `rubros_usados` perfil, OR (fallback) top 20 unique rubros extracted from oportunidades endpoint.
- **Display**: Selected rubro as a removable chip. Default: first rubro from empresa profile.
- **"Editar mis rubros"** link: Opens a modal to configure rubros. Reuses existing clusters endpoint (`getBIClusters`) as a multi-select source. Replaces the current "Calibrar Radar Semántico" section.
- **Free plan**: Dropdown locked to first rubro. Subtle badge: "Desbloquea más rubros con plan PYME".

### Section Layout — Narrative Flow

Five sections auto-loaded on mount, ordered by the questions a bidder asks:

```
[Rubro dropdown + chip]                              ← sticky filter bar
§ 1. Oportunidades destacadas                        ← "¿Dónde hay oportunidad?"
§ 2. Tendencias del mercado                           ← "¿Crece o decrece?"
§ 3. Competencia                                      ← "¿Contra quién compito?"
§ 4. Perfil de compradores                            ← "¿Son confiables?"
§ 5. Estacionalidad                                   ← "¿Cuándo compran?"
```

All sections reload when the rubro filter changes. No manual "Analizar" or "Consultar" buttons — everything is reactive.

### § 1. Oportunidades destacadas

**API**: `getBIOportunidades({ rubro: selectedRubro, min_score: 4, limit: 20 })`

**KPI cards** (3):
- "Oportunidades encontradas" — result count
- "Mejor score" — max `opportunity_score` with ScoreBar
- "Competencia promedio" — avg `n_proveedores` with badge: "Baja" (<5), "Media" (5-15), "Alta" (>15)

**Table** columns:
- Organismo (resolve name from `NombreOrganismo` via buyer_scores — requires a lookup, or use the name if the comprador endpoint is called)
- Rubro
- Score de oportunidad (ScoreBar 0-10, tooltip: "Score 0-10 que combina volumen de compras, nivel de competencia, estacionalidad y tendencia de crecimiento. Mayor score = mejor oportunidad.")
- Transacciones históricas (`n_transacciones`)
- Proveedores activos (`n_proveedores`)

**Row click**: Expands inline to show a mini buyer profile (calls `getBIComprador` for that organismo).

**Label renames**:
- "VOLUMEN CREADO RELEVANTE" → "Transacciones históricas"
- "Hot Leads Detectados" → "Oportunidades encontradas"

### § 2. Tendencias del mercado

**API**: `getBITendencia({ rubro: selectedRubro, limit: 15 })`

**Emergentes badges**: Top 3 from `emergentes[]` as accent chips: "↗ {RubroN2} +{cagr}% anual"

**Horizontal bar chart** (Recharts `BarChart` with `layout="vertical"`):
- Y axis: `RubroN2` (full name, no truncation)
- X axis: labeled "Crecimiento anual (%)" (NOT "CAGR")
- Green bars for positive growth, red for negative
- **Tooltip**: "Crecimiento anual compuesto: este mercado creció un {cagr}% promedio por año en los últimos {n_anios} años, basado en {total_oc} órdenes de compra."

### § 3. Competencia

**API**: `getBICompetidores(topOrganismo, { rubro: selectedRubro, top_n: 10 })` where `topOrganismo` = #1 organismo from Section 1 oportunidades results.

**Summary card**: "En este mercado hay {n_proveedores} proveedores activos. Concentración: {tipo_mercado}" with tooltip: "Mercado concentrado = pocos proveedores dominan. Mercado fragmentado = muchos compiten."

**Scatter chart** (keep Recharts `ScatterChart`):
- X: "Tasa de adjudicación (%)" (renamed from "win_rate")
- Y: "Participación de mercado (%)" (renamed from "market_share")
- Bubble size: volume
- Tooltip per dot: proveedor name + stats

**Table toggle**: Keep existing toggle between chart and table view.

**Organismo selector**: Dropdown populated from oportunidades results (not free text). User can switch which organismo's competition they're viewing.

### § 4. Perfil de compradores

**API**: `getBIComprador(organismoId)` — auto-loaded for top 3 organismos from Section 1.

**Card per organismo** (collapsible, first expanded):
- **Header**: Name + buyer_score badge (green/yellow/red) + clasificacion
- **3 metrics**: "Pago promedio: {mediana_dias_pago} días" | "Tasa de adjudicación: {tasa_adjudicacion}%" | "Cancelaciones: {tasa_cancelacion}%"
- **Risk flags**: Only if `n_flags > 0`. Red badges with one-line explanation on hover.
- **Expandable detail**: "Ver descuentos típicos" → loads `getBIDescuento({ rubro: selectedRubro })` inline.

### § 5. Estacionalidad

**API**: `getBIEstacionalidad(topOrganismo, { rubro: selectedRubro })`

**Line chart with confidence band** (Recharts `AreaChart` + `Line` + `Area`):
- **Line**: `prob_mes` (probability of purchase per month)
- **Shaded band**: Width derived from `consistencia` — high consistency = narrow band, low = wide
- **Marked dots**: Months where `es_pico_estacional = true`, larger dot in accent color
- **Tooltip per month**: "En {mes}, este comprador realiza compras el {prob_mes}% de los años. Consistencia: {consistencia}%"
- **Auto-annotation**: "Este organismo suele comprar más en {peak_months}. Consistencia: {avg_consistencia}%"

**Organismo dropdown**: Same as Section 3 — switch between top organismos from oportunidades.

### § 6. Tender Detail Integration

**Where**: `frontend/app/dashboard/tenders/[codigo]/page.tsx`

**API**: `getBIPanel(codigoExterno, empresaId)` — single composite call.

**Collapsible card** below tender info:
- **Collapsed**: One-line summary: "Score comprador: 7.2 · Plazo: Normal · 12 competidores"
- **Expanded**: 4 mini-cards:
  1. **Plazo de preparación**: Alert badge if short + "Tienes {window_days} días, {pct_del_tipico}% del plazo típico"
  2. **Comprador**: buyer_score badge + clasificacion + pago promedio
  3. **Competencia**: "{n_proveedores} competidores · Mercado {tipo_mercado}"
  4. **Precios de referencia**: "Precio mediano: ${p50}" per product item

**Free plan**: Shows collapsed summary only. Expansion requires paid plan.

### Removed / Moved Widgets

| Current widget | New location |
|---|---|
| "Ventana de Presión" (free-text código input) | Tender detail page (§ 6) |
| "Matching Semántico" (TF-IDF search) | Collapsible "Herramientas avanzadas" at bottom |
| "Calibrar Radar Semántico" (TF-IDF config) | "Editar mis rubros" modal in filter bar |
| "Bandas de Descuento Óptimo" | Expandable inside § 4 (buyer profile) |
| KPI cards row (3 separate) | Contextual KPIs inside § 1 |
| Hardcoded organismo '7485' | Removed — auto-selects from oportunidades |

### Free vs Paid Plan Behavior

| Section | Básico (free) | PYME+ (paid) |
|---|---|---|
| Filter bar | Locked to first rubro | Full dropdown |
| § 1 Oportunidades | Full (top 10) | Full (top 20) + row expand |
| § 2 Tendencias | Full | Full |
| § 3 Competencia | Blurred preview + upgrade CTA | Full |
| § 4 Compradores | Blurred preview + upgrade CTA | Full + descuentos |
| § 5 Estacionalidad | Blurred preview + upgrade CTA | Full |
| Tender detail BI card | Summary line only | Full expanded |
| Matching Semántico | Hidden | Available |

**Rationale**: Sections 1-2 hook the user with free value. Sections 3-5 answer the questions that drive upgrade decisions — blurred previews create urgency.

## Technical Notes

- **No backend changes required**. All API endpoints and parquet data already exist.
- **Frontend only**: Rewrite `bi/page.tsx` (currently 1,228 lines). Split into sub-components for each section (~200-300 lines each).
- **New component**: `BICard` on `tenders/[codigo]/page.tsx` — calls `getBIPanel()`.
- **Organismo name resolution**: The `buyer_scores.parquet` contains `NombreOrganismo`. The `getBIComprador` endpoint already returns `nombre`. For the oportunidades table, call `getBIComprador` on row expand (lazy) rather than batch-resolving all names upfront.
- **API call budget**: On page mount, fires 3 calls: oportunidades + tendencia + estacionalidad. Competidores and comprador load on demand (row expand or section scroll). This keeps basico plan usage under control for users who haven't been upgraded.
- **File decomposition**: Split `bi/page.tsx` into:
  - `bi/page.tsx` — layout, filter state, data fetching orchestration
  - `bi/components/RubroFilter.tsx` — filter bar + edit modal
  - `bi/components/OportunidadesSection.tsx`
  - `bi/components/TendenciasSection.tsx`
  - `bi/components/CompetenciaSection.tsx`
  - `bi/components/CompradoresSection.tsx`
  - `bi/components/EstacionalidadSection.tsx`
  - `bi/components/PlanGate.tsx` — blurred overlay + upgrade CTA
  - `dashboard/tenders/[codigo]/components/BICard.tsx` — tender detail integration
