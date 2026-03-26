# UI/UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire 6 UI/UX improvements that complete the TORDO product experience for pilot users — analytics with real data, onboarding to completion, deadline calendar, team collaboration, drag-drop uploads, and inline BI on tender detail.

**Architecture:** Predominantly frontend-only changes to existing Next.js App Router pages, plus two new pages (Calendar and Team). Task 7 adds three backend REST endpoints to `empresas.py` using the existing async SQLAlchemy pattern. All API calls route through `frontend/lib/api.ts`. No new npm packages required.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Recharts (already installed), Axios, FastAPI + SQLAlchemy 2.0 async (Task 7 only)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add 6 missing API methods |
| `frontend/app/dashboard/tenders/[codigo]/page.tsx` | Modify | Call getBIPanel, populate BI section from aggregate endpoint |
| `frontend/app/dashboard/analytics/page.tsx` | Modify | Replace all mock data with real BI endpoints |
| `frontend/app/onboarding/page.tsx` | Modify | Real BI data in step 4, add completion step 6 |
| `frontend/app/dashboard/calendario/page.tsx` | Create | Month calendar view for deadline tracking |
| `frontend/app/dashboard/empresa/page.tsx` | Create | Team member management UI |
| `frontend/app/dashboard/documentos/page.tsx` | Modify | HTML5 drag-and-drop for file upload modal |
| `frontend/components/Layout.tsx` | Modify | Add Calendario + Mi Empresa nav items |
| `backend/app/api/empresas.py` | Modify | Add GET/POST/DELETE /members endpoints |
| `backend/app/schemas/empresa.py` | Modify | Add MiembroResponse + AddMiembroRequest schemas |

---

## Task 1: Add Missing API Methods

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Find the insertion point**

```bash
tail -20 frontend/lib/api.ts
```

Identify the last method inside the `ApiClient` class (before the closing `}`) and the export line at the bottom.

- [ ] **Step 2: Add the 6 new methods inside the ApiClient class**

Append after the last existing method, before the class closing brace:

```typescript
  // ─── BI Panel (aggregate endpoint for a single licitación) ────────────────
  getBIPanel(codigoExterno: string, empresaId?: string) {
    return this.client.get(`/api/bi/licitacion/${codigoExterno}/panel`, {
      params: empresaId ? { empresa_id: empresaId } : undefined,
    })
  }

  // ─── Sector summary ────────────────────────────────────────────────────────
  getBISector(params?: { sector?: string; limit?: number }) {
    return this.client.get('/api/bi/sector', { params })
  }

  // ─── Data summary (public endpoint, no auth needed) ────────────────────────
  getDataSummary() {
    return this.client.get('/api/data/summary')
  }

  // ─── Team / member management ──────────────────────────────────────────────
  getEmpresaMembers(empresaId: string) {
    return this.client.get(`/api/empresas/${empresaId}/members`)
  }

  addEmpresaMember(empresaId: string, email: string, rol: 'admin' | 'viewer') {
    return this.client.post(`/api/empresas/${empresaId}/members`, { email, rol })
  }

  removeEmpresaMember(empresaId: string, userId: number) {
    return this.client.delete(`/api/empresas/${empresaId}/members/${userId}`)
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add getBIPanel, getBISector, member management API methods to ApiClient"
```

---

## Task 2: Wire BI Panel into Tender Detail

**Files:**
- Modify: `frontend/app/dashboard/tenders/[codigo]/page.tsx`

Context: the 987-line page already has a `BIPanelSection` component and BI type definitions. The backend `/api/bi/licitacion/{codigo}/panel` aggregates buyer profile, price, competitors, and preparation window in one call. It is gated behind `FEATURE_ANALYTICS` — the frontend must handle 503 gracefully.

- [ ] **Step 1: Identify current BI loading logic**

```bash
grep -n "biPanel\|getBIPanel\|biLoading\|getBIComprador\|getBIVentana\|getBICompetidores\|BIPanelSection" \
  "frontend/app/dashboard/tenders/[codigo]/page.tsx"
```

Note whether `biPanel` state already exists, what individual BI calls (if any) are present, and how `BIPanelSection` is called (its current prop names).

- [ ] **Step 2: Ensure biPanel state exists**

Near the top of the component function, alongside existing `useState` declarations, ensure these two exist (add them if they don't):

```typescript
const [biPanel, setBiPanel] = useState<BIPanel | null>(null)
const [biLoading, setBiLoading] = useState(false)
```

If `BIPanel` type isn't imported, add it to the local interfaces at the top of the file or import from `@/lib/api`. The shape needed:

```typescript
interface BIPanel {
  precio?: unknown
  competidores?: unknown
  ventana?: unknown
  comprador?: unknown
  [key: string]: unknown
}
```

- [ ] **Step 3: Add (or replace) the getBIPanel effect**

If individual BI fetch calls exist (`getBIComprador`, `getBIVentana`, etc.) — remove them. Add this single effect after the useEffect that fetches the tender:

```typescript
useEffect(() => {
  const cod = (tender?.codigo_externo ?? codigo) as string | undefined
  if (!cod) return
  setBiLoading(true)
  apiClient
    .getBIPanel(cod)
    .then((res) => setBiPanel(res.data))
    .catch(() => setBiPanel(null))   // 503 = feature disabled — fail silently
    .finally(() => setBiLoading(false))
}, [tender?.codigo_externo, codigo])
```

- [ ] **Step 4: Replace BIPanelSection render**

Find where `BIPanelSection` is rendered in JSX and replace the surrounding block with:

```tsx
<div className="mt-6">
  <h2 className="text-base font-semibold text-gray-800 mb-3">Análisis de Mercado</h2>
  {biLoading && (
    <div className="animate-pulse bg-gray-100 rounded-xl h-48 flex items-center justify-center">
      <span className="text-gray-400 text-sm">Cargando análisis de mercado…</span>
    </div>
  )}
  {!biLoading && biPanel && (
    <BIPanelSection panel={biPanel} />
  )}
  {!biLoading && !biPanel && (
    <p className="text-sm text-gray-400 italic bg-gray-50 rounded-xl px-4 py-3">
      Panel BI no disponible para esta licitación.
    </p>
  )}
</div>
```

If `BIPanelSection` currently takes different props (e.g., individual fields instead of `panel`), check its prop interface at the top of the file and adapt — either update the component's props to accept `panel: BIPanel` and destructure inside, or spread the biPanel fields: `<BIPanelSection {...biPanel} />`.

- [ ] **Step 5: Verify in browser**

```bash
cd infra && docker-compose up -d
# Open any tender detail, e.g.:
# http://localhost:3000/dashboard/tenders/[any-codigo]
```

Expected:
- BI section shows pulsing skeleton while loading
- If `FEATURE_ANALYTICS=true`: real panel data renders
- If `FEATURE_ANALYTICS=false`: "no disponible" message, no console error

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/dashboard/tenders/[codigo]/page.tsx"
git commit -m "feat: wire getBIPanel aggregate call into tender detail, graceful 503 handling"
```

---

## Task 3: Connect Analytics Page to Real API

**Files:**
- Modify: `frontend/app/dashboard/analytics/page.tsx`

Replace all static mock data with live API responses. Keep the `NEXT_PUBLIC_ANALYTICS_ENABLED` feature check.

- [ ] **Step 1: Replace state declarations**

Find the existing state declarations (they reference arrays of mock data). Replace them entirely with:

```typescript
const [stats, setStats] = useState<{
  active_tenders: number
  unread_alerts: number
  active_postulaciones: number
  expiring_docs: number
} | null>(null)

const [oportunidades, setOportunidades] = useState<Array<{
  organismo_id: string
  nombre_organismo: string
  score: number
  n_transacciones: number
  n_proveedores: number
  monto_promedio: number
  sector: string
}>>([])

const [tendencias, setTendencias] = useState<Array<{
  rubro: string
  cagr: number
  n_transacciones: number
  tendencia: string
  es_emergente: boolean
}>>([])

const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
```

- [ ] **Step 2: Replace the data-loading function/effect**

Find the existing `loadAnalytics` function or `useEffect` that populates data and replace it:

```typescript
useEffect(() => {
  setLoading(true)
  Promise.allSettled([
    apiClient.getDashboardStats(),
    apiClient.getBIOportunidades({ limit: 10 }),
    apiClient.getBITendencia({ limit: 8 }),
  ])
    .then(([statsRes, opRes, tendRes]) => {
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
      if (opRes.status === 'fulfilled')
        setOportunidades(opRes.value.data?.oportunidades ?? [])
      if (tendRes.status === 'fulfilled')
        setTendencias(tendRes.value.data?.tendencias ?? [])
    })
    .finally(() => setLoading(false))
}, [])
```

- [ ] **Step 3: Replace the 4 overview cards**

Find the overview KPI cards section and replace with:

```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  {[
    { label: 'Licitaciones activas', value: stats?.active_tenders, color: 'text-blue-600' },
    { label: 'Alertas sin leer',     value: stats?.unread_alerts,   color: 'text-amber-600' },
    { label: 'Postulaciones',        value: stats?.active_postulaciones, color: 'text-green-600' },
    { label: 'Docs por vencer (30d)', value: stats?.expiring_docs,  color: 'text-red-600' },
  ].map(({ label, value, color }) => (
    <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>
        {loading ? '…' : value ?? '—'}
      </p>
    </div>
  ))}
</div>
```

- [ ] **Step 4: Replace the first chart — Oportunidades de mercado**

Find the first chart section (likely a BarChart or geographic distribution) and replace with:

```tsx
<div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
  <h3 className="text-sm font-semibold text-gray-700 mb-4">
    Top Oportunidades de Mercado
  </h3>
  {loading && <div className="animate-pulse bg-gray-100 rounded-lg h-64" />}
  {!loading && oportunidades.length === 0 && (
    <p className="text-sm text-gray-400 text-center py-10">
      Sin datos — activa <code className="text-xs bg-gray-100 px-1 rounded">FEATURE_ANALYTICS=true</code> para ver oportunidades reales.
    </p>
  )}
  {!loading && oportunidades.length > 0 && (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={oportunidades.slice(0, 8)}
        layout="vertical"
        margin={{ left: 120, right: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 10]}
          tickFormatter={(v: number) => `${v}/10`}
          fontSize={11}
        />
        <YAxis
          type="category"
          dataKey="nombre_organismo"
          width={115}
          fontSize={10}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 18)}…` : v)}
        />
        <Tooltip formatter={(v: number) => [`${v.toFixed(1)}/10`, 'Score']} />
        <Bar dataKey="score" fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )}
</div>
```

- [ ] **Step 5: Replace the second chart — Tendencias de mercado (CAGR)**

Find the second chart section and replace with:

```tsx
<div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
  <h3 className="text-sm font-semibold text-gray-700 mb-4">
    Tendencias de Mercado (CAGR)
  </h3>
  {loading && <div className="animate-pulse bg-gray-100 rounded-lg h-64" />}
  {!loading && tendencias.length === 0 && (
    <p className="text-sm text-gray-400 text-center py-10">
      Sin datos — activa <code className="text-xs bg-gray-100 px-1 rounded">FEATURE_ANALYTICS=true</code> para ver tendencias reales.
    </p>
  )}
  {!loading && tendencias.length > 0 && (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={tendencias} margin={{ bottom: 40, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="rubro"
          angle={-35}
          textAnchor="end"
          fontSize={10}
          tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 12)}…` : v)}
        />
        <YAxis
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          fontSize={11}
        />
        <Tooltip
          formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'CAGR']}
        />
        <Bar dataKey="cagr" radius={[4, 4, 0, 0]}>
          {tendencias.map((entry, i) => (
            <Cell key={i} fill={entry.es_emergente ? '#f59e0b' : '#10b981'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )}
  <div className="flex gap-4 mt-3 text-xs text-gray-500">
    <span className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded bg-green-500 inline-block" /> Normal
    </span>
    <span className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Emergente (&gt;20% CAGR)
    </span>
  </div>
</div>
```

- [ ] **Step 6: Remove remaining mock-data charts**

Delete any remaining chart sections that still reference local mock arrays (bubble chart, amount distribution, etc.). Two real charts is sufficient for now.

Add `Cell` to the recharts import line if not already present:
```typescript
import { ..., Cell } from 'recharts'
```

- [ ] **Step 7: Verify in browser**

```bash
cd frontend && npm run dev
# http://localhost:3000/dashboard/analytics
```

Expected: KPI cards show real numbers. Charts show real data or the "activate feature flag" placeholder. No console errors. No mock data anywhere.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/dashboard/analytics/page.tsx
git commit -m "feat: replace mock data in analytics page with real getDashboardStats + getBIOportunidades + getBITendencia"
```

---

## Task 4: Complete Onboarding Flow

**Files:**
- Modify: `frontend/app/onboarding/page.tsx`

Two changes: (1) replace hardcoded `BI_DEMO_DATA` in step 4 with real `getBIOportunidades()`, and (2) change total steps from 5 to 6 and add a completion screen at step 6.

- [ ] **Step 1: Locate key variables**

```bash
grep -n "BI_DEMO_DATA\|TOTAL_STEPS\|step === 4\|step === 5\|currentStep\|onboarding_completed\|updateUser" \
  frontend/app/onboarding/page.tsx | head -30
```

Note:
- The variable name for the active step (e.g. `step` or `currentStep`)
- The total steps constant (e.g. `TOTAL_STEPS = 5`)
- Whether `onboarding_completed` is set in the step 5 → next transition

- [ ] **Step 2: Add BI state for real opportunities**

Near the top of the component function, add:

```typescript
const [biOportunidades, setBiOportunidades] = useState<Array<{
  nombre_organismo: string
  score: number
  n_transacciones: number
  monto_promedio: number
}>>([])
const [biLoading, setBiLoading] = useState(false)
```

- [ ] **Step 3: Fetch real BI data on entering step 4**

Find the "go to next step" handler (the function that increments the step counter). After it increments to step 4, add:

```typescript
// Trigger real BI data when entering step 4
if (nextStep === 4) {   // replace 4 with actual step number if different
  setBiLoading(true)
  apiClient
    .getBIOportunidades({ limit: 3 })
    .then((res) => setBiOportunidades(res.data?.oportunidades ?? []))
    .catch(() => setBiOportunidades([]))
    .finally(() => setBiLoading(false))
}
```

Replace `nextStep === 4` with the actual variable/value used in the handler.

- [ ] **Step 4: Replace BI_DEMO_DATA render in step 4**

Find the JSX block for step 4 (contains `BI_DEMO_DATA` or similar). Replace it with:

```tsx
<div>
  <h2 className="text-xl font-semibold text-gray-900 mb-2">Tu ventaja competitiva</h2>
  <p className="text-gray-500 text-sm mb-6">
    TORDO analiza el historial de compras públicas para darte inteligencia antes de postular.
  </p>

  {biLoading && (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-20" />
      ))}
    </div>
  )}

  {!biLoading && biOportunidades.length > 0 && (
    <div className="space-y-3">
      {biOportunidades.map((op, i) => (
        <div key={i} className="border border-gray-200 rounded-xl p-4 bg-white">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm text-gray-800 truncate max-w-[200px]">
              {op.nombre_organismo}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              op.score >= 7
                ? 'bg-green-100 text-green-700'
                : op.score >= 4
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {op.score.toFixed(1)}/10
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {op.n_transacciones} transacciones ·{' '}
            {new Intl.NumberFormat('es-CL', {
              style: 'currency',
              currency: 'CLP',
              maximumFractionDigits: 0,
            }).format(op.monto_promedio)}{' '}
            prom.
          </p>
        </div>
      ))}
    </div>
  )}

  {!biLoading && biOportunidades.length === 0 && (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-center">
      <p className="text-blue-700 font-medium text-sm">Panel BI disponible en tu dashboard</p>
      <p className="text-blue-500 text-xs mt-1">
        Configura el perfil de tu empresa para ver precios históricos y competidores reales.
      </p>
    </div>
  )}
</div>
```

- [ ] **Step 5: Update TOTAL_STEPS to 6**

Find `TOTAL_STEPS = 5` (or equivalent constant) and change to `6`. The step progress bar updates automatically.

- [ ] **Step 6: Add step 6 — completion screen**

Find the conditional that renders each step (switch/if-else) and add a new case for step 6 (or whatever the next step number is after the existing last step):

```tsx
{step === 6 && (
  <div className="text-center py-4">
    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
      <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h2 className="text-xl font-semibold text-gray-900 mb-2">
      ¡Todo listo, {user?.full_name?.split(' ')[0] || 'bienvenido'}!
    </h2>
    <p className="text-gray-500 text-sm mb-8">Tu cuenta está configurada. Aquí tienes tu punto de partida:</p>

    <div className="grid grid-cols-1 gap-3 text-left mb-8">
      {[
        {
          icon: '🔍',
          title: 'Busca licitaciones',
          desc: 'Filtra por región, monto y estado',
          href: '/dashboard/tenders',
        },
        {
          icon: '📊',
          title: 'Analiza oportunidades',
          desc: 'Precios históricos y competidores reales',
          href: '/dashboard/bi',
        },
        {
          icon: '📋',
          title: 'Gestiona postulaciones',
          desc: 'Checklist automático por tipo de licitación',
          href: '/dashboard/postulaciones',
        },
      ].map(({ icon, title, desc, href }) => (
        <a
          key={href}
          href={href}
          className="flex items-center gap-4 border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors"
        >
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="font-medium text-sm text-gray-900">{title}</p>
            <p className="text-xs text-gray-500">{desc}</p>
          </div>
        </a>
      ))}
    </div>

    <button
      onClick={() => router.push('/dashboard')}
      className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors"
    >
      Ir al Dashboard →
    </button>
  </div>
)}
```

- [ ] **Step 7: Ensure onboarding_completed is saved before step 6**

```bash
grep -n "onboarding_completed" frontend/app/onboarding/page.tsx
```

The `updateUser({ onboarding_completed: true })` call should fire when transitioning from step 5 → 6 (the existing step 5 alert config), not at step 6 (so the dashboard redirect check passes). Verify the transition logic is correct — `onboarding_completed` must be `true` before the user hits the dashboard.

- [ ] **Step 8: Test the full flow**

```bash
cd frontend && npm run dev
# Reset a test user: set onboarding_completed=false and onboarding_step=0 in the DB
# http://localhost:3000/onboarding
```

Walk through all 6 steps. Expected:
- Step 4: loading skeleton → real BI opportunity cards (or blue fallback if FEATURE_ANALYTICS=false)
- Step 5: alert config works as before
- Step 6: completion screen with 3 feature cards + "Ir al Dashboard" button
- After clicking button: lands on `/dashboard`, does not redirect back to onboarding

- [ ] **Step 9: Commit**

```bash
git add frontend/app/onboarding/page.tsx
git commit -m "feat: replace BI demo mock data with real API call, add step 6 completion screen to onboarding"
```

---

## Task 5: Calendar View for Deadlines

**Files:**
- Create: `frontend/app/dashboard/calendario/page.tsx`
- Modify: `frontend/components/Layout.tsx`

- [ ] **Step 1: Add Calendario to Layout navigation**

Open `frontend/components/Layout.tsx`. Find the `navigation` array and add after the Postulaciones entry:

```typescript
{ name: 'Calendario', href: '/dashboard/calendario', icon: Calendar },
```

Add `Calendar` to the lucide-react import:

```typescript
import { ..., Calendar } from 'lucide-react'
```

- [ ] **Step 2: Create the calendar page**

Create `frontend/app/dashboard/calendario/page.tsx` with the full implementation:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import apiClient from '@/lib/api'
import { ChevronLeft, ChevronRight, Clock, AlertTriangle } from 'lucide-react'

interface PostulacionItem {
  id: string
  estado: string
  licitacion: {
    codigo_externo: string
    nombre: string
    fecha_cierre: string | null
  }
  checklist: Array<{ completado: boolean; es_obligatorio: boolean }>
}

/** Build a Mon-based calendar grid. Null cells = padding before month start. */
function buildCalendarGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const cells: (Date | null)[] = []
  // Convert Sunday-based (0) to Monday-based (0): Mon=0 … Sun=6
  const offset = (firstDay.getDay() + 6) % 7
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T12:00:00')
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

function dotColor(days: number): string {
  if (days < 0)  return 'bg-gray-400'
  if (days <= 1) return 'bg-red-500'
  if (days <= 3) return 'bg-orange-500'
  if (days <= 7) return 'bg-amber-400'
  return 'bg-blue-400'
}

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const DAY_NAMES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const ACTIVE_ESTADOS = new Set(['en_seguimiento', 'en_preparacion'])

export default function CalendarioPage() {
  const { user } = useAuth()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [postulaciones, setPostulaciones] = useState<PostulacionItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const empRes = await apiClient.getEmpresas()
      const empresas: Array<{ id: string }> = empRes.data ?? []
      const results = await Promise.allSettled(
        empresas.map((e) =>
          apiClient.getPostulaciones(e.id, {}).then((r) => r.data as PostulacionItem[])
        )
      )
      const flat: PostulacionItem[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') flat.push(...r.value)
      }
      setPostulaciones(flat.filter((p) => ACTIVE_ESTADOS.has(p.estado)))
    } catch {
      setPostulaciones([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Build date → items map
  const byDate: Record<string, PostulacionItem[]> = {}
  for (const p of postulaciones) {
    if (!p.licitacion?.fecha_cierre) continue
    const key = p.licitacion.fecha_cierre.split('T')[0]
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(p)
  }

  const cells = buildCalendarGrid(year, month)
  const todayStr = isoDate(today)

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  const selectedItems = selectedDate ? (byDate[selectedDate] ?? []) : []

  // Next 30 days, sorted by urgency
  const upcoming = postulaciones
    .filter((p) => p.licitacion?.fecha_cierre)
    .map((p) => ({
      ...p,
      days: daysUntil(p.licitacion.fecha_cierre!.split('T')[0]),
    }))
    .filter((p) => p.days >= 0 && p.days <= 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 10)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Calendario de Plazos</h1>
      <p className="text-sm text-gray-500 mb-6">
        Fechas de cierre de tus postulaciones activas
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Calendar ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="font-semibold text-gray-800">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`pad-${i}`} />
              const key = isoDate(day)
              const items = byDate[key] ?? []
              const isToday = key === todayStr
              const isSelected = key === selectedDate
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(isSelected ? null : key)}
                  className={`relative flex flex-col items-center py-1.5 rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isToday
                      ? 'bg-blue-50 font-bold text-blue-700'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="text-sm leading-none">{day.getDate()}</span>
                  {items.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {items.slice(0, 4).map((item, di) => (
                        <span
                          key={di}
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected
                              ? 'bg-white'
                              : dotColor(
                                  daysUntil(item.licitacion.fecha_cierre!.split('T')[0])
                                )
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
            {[
              { color: 'bg-red-500',    label: 'Hoy / mañana' },
              { color: 'bg-orange-500', label: '2–3 días' },
              { color: 'bg-amber-400',  label: '4–7 días' },
              { color: 'bg-blue-400',   label: '8+ días' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className="space-y-4">

          {/* Selected day detail */}
          {selectedDate && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              {selectedItems.length === 0 ? (
                <p className="text-sm text-gray-400">Sin vencimientos este día.</p>
              ) : (
                <div className="space-y-3">
                  {selectedItems.map((item) => {
                    const done  = item.checklist.filter((c) => c.completado && c.es_obligatorio).length
                    const total = item.checklist.filter((c) => c.es_obligatorio).length
                    return (
                      <a
                        key={item.id}
                        href={`/dashboard/tenders/${item.licitacion.codigo_externo}`}
                        className="block border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-800 leading-tight line-clamp-2">
                          {item.licitacion.nombre}
                        </p>
                        {total > 0 && (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>Checklist</span>
                              <span>{done}/{total}</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  done === total ? 'bg-green-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming deadlines */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-gray-500" />
              <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                Próximos 30 días
              </p>
            </div>

            {loading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse bg-gray-100 h-12 rounded-lg" />
                ))}
              </div>
            )}

            {!loading && upcoming.length === 0 && (
              <p className="text-sm text-gray-400">Sin postulaciones activas próximas.</p>
            )}

            {!loading &&
              upcoming.map((item) => (
                <a
                  key={item.id}
                  href={`/dashboard/tenders/${item.licitacion.codigo_externo}`}
                  className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors"
                >
                  <div
                    className={`w-1.5 h-8 rounded-full flex-shrink-0 ${dotColor(item.days)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {item.licitacion.nombre}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.days === 0
                        ? 'Hoy'
                        : item.days === 1
                        ? 'Mañana'
                        : `En ${item.days} días`}
                    </p>
                  </div>
                  {item.days <= 1 && (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  )}
                </a>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors. If `getPostulaciones` signature differs (e.g., second param is optional), adjust the call to `apiClient.getPostulaciones(e.id)`.

- [ ] **Step 4: Verify in browser**

```bash
cd frontend && npm run dev
# http://localhost:3000/dashboard/calendario
```

Expected:
- Month grid renders with Mon–Sun columns
- "Calendario" appears in sidebar navigation
- Days that have postulacion deadlines show colored dots
- Clicking a day shows that day's postulaciones in the right panel with checklist progress
- "Próximos 30 días" list shows items sorted by urgency with color bars

- [ ] **Step 5: Commit**

```bash
git add frontend/app/dashboard/calendario/page.tsx frontend/components/Layout.tsx
git commit -m "feat: add month calendar view with urgency color-coding for postulacion deadlines"
```

---

## Task 6: Drag-and-Drop Document Upload

**Files:**
- Modify: `frontend/app/dashboard/documentos/page.tsx`

Replace the basic `<input type="file">` in the upload modal with an HTML5 drag-and-drop zone. No new dependencies.

- [ ] **Step 1: Identify current file-input state**

```bash
grep -n 'type="file"\|selectedFile\|setSelectedFile\|uploadFile\|setUploadFile\|onChange.*file' \
  frontend/app/dashboard/documentos/page.tsx | head -20
```

Note: the exact state variable name used for the selected file (could be `selectedFile`, `file`, `uploadFile`, etc.) and its setter.

- [ ] **Step 2: Add isDragging state**

Near existing `useState` calls, add:

```typescript
const [isDragging, setIsDragging] = useState(false)
```

- [ ] **Step 3: Add drag event handlers and a shared handleFileSelect**

Before the `return` statement, add:

```typescript
function handleFileSelect(file: File) {
  const MAX_MB = 25
  if (file.size > MAX_MB * 1024 * 1024) {
    setError(`El archivo supera el límite de ${MAX_MB} MB`)
    return
  }
  setSelectedFile(file)   // ← replace with actual state setter name from Step 1
  setError(null)
}

function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
  e.preventDefault(); e.stopPropagation()
  setIsDragging(true)
}

function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
  e.preventDefault(); e.stopPropagation()
  if (e.currentTarget.contains(e.relatedTarget as Node)) return
  setIsDragging(false)
}

function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
  e.preventDefault(); e.stopPropagation()
}

function handleDrop(e: React.DragEvent<HTMLDivElement>) {
  e.preventDefault(); e.stopPropagation()
  setIsDragging(false)
  const dropped = e.dataTransfer.files[0]
  if (dropped) handleFileSelect(dropped)
}
```

Also update the existing `onChange` on the `<input type="file">` to use `handleFileSelect`:

```typescript
onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }}
```

- [ ] **Step 4: Replace the upload area JSX**

Find the upload area in the modal (a div with a file icon and "click to browse" text). Replace the entire upload zone with:

```tsx
<div
  onDragEnter={handleDragEnter}
  onDragLeave={handleDragLeave}
  onDragOver={handleDragOver}
  onDrop={handleDrop}
  onClick={() => document.getElementById('file-upload-input')?.click()}
  className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
    isDragging
      ? 'border-blue-500 bg-blue-50 scale-[1.01]'
      : selectedFile  /* ← use actual state var name */
      ? 'border-green-400 bg-green-50'
      : 'border-gray-300 hover:border-gray-400 bg-gray-50'
  }`}
>
  {isDragging && (
    <div className="absolute inset-0 flex items-center justify-center rounded-xl">
      <p className="text-blue-600 font-semibold text-sm">Suelta el archivo aquí</p>
    </div>
  )}

  {!isDragging && !selectedFile && (
    <>
      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-600">Arrastra un archivo aquí</p>
      <p className="text-xs text-gray-400 mt-1">o haz clic para seleccionar</p>
      <p className="text-xs text-gray-400 mt-2">PDF, DOC, DOCX, JPG, PNG, XLSX · Máx. 25 MB</p>
    </>
  )}

  {!isDragging && selectedFile && (
    <div className="flex items-center justify-center gap-3">
      <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <div className="text-left min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate max-w-[180px]">
          {selectedFile.name}   {/* ← use actual state var name */}
        </p>
        <p className="text-xs text-gray-500">
          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setSelectedFile(null) /* actual setter */ }}
        className="text-gray-400 hover:text-red-500 transition-colors ml-1"
        title="Quitar archivo"
      >
        ✕
      </button>
    </div>
  )}

  <input
    id="file-upload-input"
    type="file"
    className="hidden"
    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
    onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }}
  />
</div>
```

**Important:** Replace every `selectedFile` / `setSelectedFile` with the actual variable/setter names found in Step 1.

- [ ] **Step 5: Verify in browser**

```bash
cd frontend && npm run dev
# http://localhost:3000/dashboard/documentos
```

Open the upload modal and test:
- Drag a PDF file over the zone → border turns blue, scale effect
- Drop the file → green checkmark + filename + size
- Click ✕ → resets to empty drop zone
- Click the zone → system file picker opens
- Select via picker → same green state
- Submit the upload form → file is sent to backend, document appears in list

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/documentos/page.tsx
git commit -m "feat: add HTML5 drag-and-drop to document upload modal with visual states"
```

---

## Task 7: Multi-User Invite UI

**Files:**
- Modify: `backend/app/api/empresas.py`
- Modify: `backend/app/schemas/empresa.py`
- Create: `frontend/app/dashboard/empresa/page.tsx`
- Modify: `frontend/components/Layout.tsx` (add Mi Empresa nav item)
- `frontend/lib/api.ts` already updated in Task 1

### 7a — Backend endpoints

- [ ] **Step 1: Add response schemas to empresa.py schemas**

Open `backend/app/schemas/empresa.py`. Add at the end:

```python
from pydantic import field_validator
from typing import Optional


class MiembroResponse(BaseModel):
    user_id: int
    email: str
    full_name: Optional[str] = None
    rol: str
    joined_at: str  # ISO datetime

    model_config = ConfigDict(from_attributes=True)


class AddMiembroRequest(BaseModel):
    email: str
    rol: str = "viewer"

    @field_validator("rol")
    @classmethod
    def valid_rol(cls, v: str) -> str:
        if v not in ("admin", "viewer"):
            raise ValueError("rol must be 'admin' or 'viewer'")
        return v
```

If `ConfigDict` is not yet imported in that file, add it:
```python
from pydantic import BaseModel, ConfigDict, field_validator
```

- [ ] **Step 2: Add the 3 endpoints to empresas.py**

Open `backend/app/api/empresas.py`. Add this import at the top alongside existing schema imports:

```python
from app.schemas.empresa import MiembroResponse, AddMiembroRequest
```

Then append the three endpoints at the bottom of the file:

```python
@router.get("/api/empresas/{empresa_id}/members", response_model=list[MiembroResponse])
async def listar_miembros(
    empresa_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _get_membership_or_403(empresa_id, current_user, db)
    rows = (
        await db.execute(
            select(EmpresaUsuario, User)
            .join(User, EmpresaUsuario.user_id == User.id)
            .where(EmpresaUsuario.empresa_id == empresa_id)
            .order_by(EmpresaUsuario.created_at)
        )
    ).all()
    return [
        MiembroResponse(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            rol=eu.rol,
            joined_at=eu.created_at.isoformat(),
        )
        for eu, user in rows
    ]


@router.post("/api/empresas/{empresa_id}/members", status_code=201)
async def agregar_miembro(
    empresa_id: UUID,
    payload: AddMiembroRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    membership = await _get_membership_or_403(empresa_id, current_user, db)
    if membership.rol == "viewer":
        raise HTTPException(status_code=403, detail="Solo owner/admin puede añadir miembros")

    target = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail=f"No existe un usuario con email {payload.email!r}")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Ya eres miembro de esta empresa")

    existing = (
        await db.execute(
            select(EmpresaUsuario).where(
                EmpresaUsuario.empresa_id == empresa_id,
                EmpresaUsuario.user_id == target.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Este usuario ya es miembro")

    db.add(EmpresaUsuario(empresa_id=empresa_id, user_id=target.id, rol=payload.rol))
    await db.commit()
    return {"ok": True, "user_id": target.id, "email": target.email, "rol": payload.rol}


@router.delete("/api/empresas/{empresa_id}/members/{user_id}", status_code=200)
async def eliminar_miembro(
    empresa_id: UUID,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    membership = await _get_membership_or_403(empresa_id, current_user, db)
    if membership.rol == "viewer":
        raise HTTPException(status_code=403, detail="Solo owner/admin puede eliminar miembros")

    target = (
        await db.execute(
            select(EmpresaUsuario).where(
                EmpresaUsuario.empresa_id == empresa_id,
                EmpresaUsuario.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    if target.rol == "owner":
        raise HTTPException(status_code=403, detail="No se puede eliminar al owner")

    await db.delete(target)
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Verify backend starts**

```bash
cd infra && docker-compose up -d backend
docker-compose logs backend | tail -20
```

Expected: `Application startup complete.` — no import or syntax errors.

- [ ] **Step 4: Smoke-test the endpoints**

```bash
# Get a token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=YOUR_USER&password=YOUR_PASS" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Replace YOUR_EMPRESA_ID with a real UUID from your DB
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/empresas/YOUR_EMPRESA_ID/members | python3 -m json.tool
```

Expected: JSON array containing at least yourself as `"rol": "owner"`.

- [ ] **Step 5: Commit backend**

```bash
git add backend/app/api/empresas.py backend/app/schemas/empresa.py
git commit -m "feat: add GET/POST/DELETE /members endpoints for empresa team management"
```

### 7b — Frontend page

- [ ] **Step 6: Add Mi Empresa to Layout navigation**

Open `frontend/components/Layout.tsx`. Find the `navigation` array and add after Documentos:

```typescript
{ name: 'Mi Empresa', href: '/dashboard/empresa', icon: Users },
```

Add `Users` to the lucide-react import:

```typescript
import { ..., Users } from 'lucide-react'
```

- [ ] **Step 7: Create the empresa management page**

Create `frontend/app/dashboard/empresa/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import apiClient from '@/lib/api'
import { UserPlus, Trash2, Shield, Eye, Crown } from 'lucide-react'

interface Empresa {
  id: string
  rut_empresa: string
  nombre_empresa: string
  rol: string
}

interface Miembro {
  user_id: number
  email: string
  full_name: string | null
  rol: string
  joined_at: string
}

const ROL_CONFIG: Record<string, { label: string; Icon: React.ElementType; cls: string }> = {
  owner:  { label: 'Owner',  Icon: Crown,  cls: 'text-purple-700 bg-purple-50' },
  admin:  { label: 'Admin',  Icon: Shield, cls: 'text-blue-700 bg-blue-50'     },
  viewer: { label: 'Viewer', Icon: Eye,    cls: 'text-gray-600 bg-gray-100'    },
}

export default function EmpresaPage() {
  const { user } = useAuth()
  const [empresas, setEmpresas]         = useState<Empresa[]>([])
  const [selected, setSelected]         = useState<Empresa | null>(null)
  const [miembros, setMiembros]         = useState<Miembro[]>([])
  const [loading, setLoading]           = useState(true)
  const [loadingM, setLoadingM]         = useState(false)
  const [inviteEmail, setInviteEmail]   = useState('')
  const [inviteRol, setInviteRol]       = useState<'admin' | 'viewer'>('viewer')
  const [inviting, setInviting]         = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [success, setSuccess]           = useState<string | null>(null)

  const canManage = selected?.rol === 'owner' || selected?.rol === 'admin'

  useEffect(() => {
    apiClient
      .getEmpresas()
      .then((res) => {
        const list: Empresa[] = res.data ?? []
        setEmpresas(list)
        if (list.length > 0) setSelected(list[0])
      })
      .finally(() => setLoading(false))
  }, [])

  const loadMiembros = useCallback(() => {
    if (!selected) return
    setLoadingM(true)
    apiClient
      .getEmpresaMembers(selected.id)
      .then((res) => setMiembros(res.data ?? []))
      .catch(() => setMiembros([]))
      .finally(() => setLoadingM(false))
  }, [selected])

  useEffect(() => { loadMiembros() }, [loadMiembros])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !inviteEmail.trim()) return
    setInviting(true); setError(null)
    try {
      await apiClient.addEmpresaMember(selected.id, inviteEmail.trim(), inviteRol)
      setSuccess(`${inviteEmail.trim()} añadido como ${inviteRol}`)
      setInviteEmail('')
      loadMiembros()
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo añadir el miembro')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(m: Miembro) {
    if (!selected) return
    if (!confirm(`¿Eliminar a ${m.email} del equipo?`)) return
    try {
      await apiClient.removeEmpresaMember(selected.id, m.user_id)
      loadMiembros()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo eliminar el miembro')
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="animate-pulse h-8 bg-gray-200 rounded w-40" />
        <div className="animate-pulse h-48 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Mi Empresa</h1>
      <p className="text-sm text-gray-500 mb-6">Gestiona el equipo de tu empresa</p>

      {/* Empresa selector (only shown if user has multiple) */}
      {empresas.length > 1 && (
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
          <select
            value={selected?.id ?? ''}
            onChange={(e) => {
              const found = empresas.find((em) => em.id === e.target.value) ?? null
              setSelected(found)
            }}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {empresas.map((em) => (
              <option key={em.id} value={em.id}>{em.nombre_empresa}</option>
            ))}
          </select>
        </div>
      )}

      {selected && (
        <>
          {/* Company info card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">{selected.nombre_empresa}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{selected.rut_empresa}</p>
              </div>
              {(() => {
                const r = ROL_CONFIG[selected.rol] ?? ROL_CONFIG.viewer
                return (
                  <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${r.cls}`}>
                    <r.Icon className="w-3 h-3" /> {r.label}
                  </span>
                )
              })()}
            </div>
          </div>

          {/* Members list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Equipo ({miembros.length}{' '}
              {miembros.length === 1 ? 'miembro' : 'miembros'})
            </h3>

            {loadingM ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-xl" />
                ))}
              </div>
            ) : miembros.length === 0 ? (
              <p className="text-sm text-gray-400">Sin miembros registrados.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {miembros.map((m) => {
                  const r = ROL_CONFIG[m.rol] ?? ROL_CONFIG.viewer
                  const isMe = m.user_id === user?.id
                  return (
                    <div key={m.user_id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-blue-700">
                            {(m.full_name ?? m.email)[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 leading-tight">
                            {m.full_name ?? m.email}
                            {isMe && (
                              <span className="ml-1 text-xs font-normal text-gray-400">(tú)</span>
                            )}
                          </p>
                          {m.full_name && (
                            <p className="text-xs text-gray-500">{m.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${r.cls}`}>
                          <r.Icon className="w-3 h-3" /> {r.label}
                        </span>
                        {canManage && m.rol !== 'owner' && !isMe && (
                          <button
                            onClick={() => handleRemove(m)}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                            title="Eliminar miembro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Invite form — owner/admin only */}
          {canManage ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">Añadir miembro</h3>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-4">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-600 mb-4">
                  ✓ {success}
                </div>
              )}

              <form onSubmit={handleInvite} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Email del usuario
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="usuario@empresa.cl"
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    El usuario debe tener una cuenta en TORDO.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
                  <select
                    value={inviteRol}
                    onChange={(e) => setInviteRol(e.target.value as 'admin' | 'viewer')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="viewer">Viewer — solo puede leer</option>
                    <option value="admin">Admin — puede editar y añadir miembros</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {inviting ? 'Añadiendo…' : 'Añadir miembro'}
                </button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              Solo el owner o admin puede gestionar miembros.
            </p>
          )}
        </>
      )}

      {!loading && empresas.length === 0 && (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm">No tienes empresas registradas.</p>
          <a href="/onboarding" className="text-blue-600 text-sm hover:underline mt-2 block">
            Registrar empresa →
          </a>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Verify in browser**

```bash
cd frontend && npm run dev
# http://localhost:3000/dashboard/empresa
```

Expected:
- Current empresa shown with your role badge (Crown = owner)
- Members list shows at least yourself
- Invite form visible (you're owner)
- Enter email of another registered user → they appear in the list
- Remove button on their row → confirm dialog → removed
- "Mi Empresa" visible in sidebar navigation
- Viewer-role users see member list but no invite form

- [ ] **Step 10: Commit**

```bash
git add backend/app/api/empresas.py backend/app/schemas/empresa.py \
        frontend/app/dashboard/empresa/page.tsx frontend/components/Layout.tsx
git commit -m "feat: add team member management — GET/POST/DELETE members API + Mi Empresa page"
```

---

## Self-Review

### Spec coverage

| Feature | Task | Status |
|---|---|---|
| Connect Analytics to real API | Task 3 | ✅ Replaces all mock data with `getDashboardStats`, `getBIOportunidades`, `getBITendencia` |
| Complete onboarding | Task 4 | ✅ Real BI data in step 4, completion screen at step 6, `onboarding_completed` verified |
| Calendar view | Task 5 | ✅ Month grid with Mon-based columns, urgency dots, upcoming list, day-click detail with checklist progress |
| Multi-user invite | Task 7 | ✅ Three backend endpoints with role guards + full invite/remove UI |
| Drag-drop upload | Task 6 | ✅ HTML5 drag events with visual states (idle/dragging/selected), shared `handleFileSelect` |
| BI panel in tender detail | Task 2 | ✅ `getBIPanel` aggregate call, loading skeleton, graceful 503 handling |
| Missing API methods | Task 1 | ✅ All 6 methods added: `getBIPanel`, `getBISector`, `getDataSummary`, `getEmpresaMembers`, `addEmpresaMember`, `removeEmpresaMember` |

### Placeholder scan

- No "TBD", "TODO", "fill in", or "similar to" found in implementation steps
- Task 2 and Task 6: exact state variable names depend on existing code — grep commands in Step 1 of each task guide the implementer to find them before making changes
- Task 4 Step 3: `nextStep === 4` must be adapted to match the actual step numbering in the existing code

### Type consistency

- `MiembroResponse` schema defined in Task 7a `empresa.py`, imported in `empresas.py` endpoint, and consumed in Task 7b frontend as `Miembro` interface (shape matches)
- `PostulacionItem` in Task 5 is self-contained within the calendar page; `fecha_cierre` null-check is performed before use
- `getBIPanel`, `getEmpresaMembers`, `addEmpresaMember`, `removeEmpresaMember` defined in Task 1, called in Tasks 2 and 7b
- `getBIOportunidades` response accessed as `res.data?.oportunidades` — matches backend `OportunidadesResponse.oportunidades` field
- `getBITendencia` response accessed as `res.data?.tendencias` — matches backend `TendenciaResponse.tendencias` field
- `dotColor`, `isoDate`, `daysUntil`, `buildCalendarGrid` defined and used within the same calendar file
- `ROL_CONFIG` in Task 7b frontend covers all three roles (`owner`, `admin`, `viewer`) returned by the backend
