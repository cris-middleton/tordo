# BI Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the BI "Inteligencia de Mercado" page into a narrative, auto-loading dashboard driven by a rubro dropdown, and add a BI intelligence card to the tender detail page.

**Architecture:** Decompose the current monolithic `bi/page.tsx` (1,228 lines) into 7 focused section components + 1 filter bar component + 1 plan gate component + 1 tender detail card. The page orchestrator handles init flow and rubro state; each section only receives the rubro and its loaded data. No backend changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Recharts, Lucide Icons, existing `apiClient` from `frontend/lib/api.ts`.

---

## File Map

**New files (create):**
- `frontend/app/dashboard/bi/types.ts` — all shared BI TypeScript interfaces
- `frontend/app/dashboard/bi/components/PlanGate.tsx` — blurred overlay + upgrade CTA for locked sections
- `frontend/app/dashboard/bi/components/RubroFilter.tsx` — sticky dropdown + "Editar mis rubros" modal
- `frontend/app/dashboard/bi/components/OportunidadesSection.tsx` — § 1: KPI cards + table
- `frontend/app/dashboard/bi/components/TendenciasSection.tsx` — § 2: horizontal bar chart
- `frontend/app/dashboard/bi/components/CompetenciaSection.tsx` — § 3: scatter chart + organismo selector
- `frontend/app/dashboard/bi/components/CompradoresSection.tsx` — § 4: collapsible buyer cards
- `frontend/app/dashboard/bi/components/EstacionalidadSection.tsx` — § 5: line + confidence band chart
- `frontend/app/dashboard/tenders/[codigo]/components/BICard.tsx` — collapsible BI card for tender detail

**Modified files:**
- `frontend/app/dashboard/bi/page.tsx` — full rewrite: orchestration + init flow only
- `frontend/app/dashboard/tenders/[codigo]/page.tsx` — add `<BICard>` below tender info

---

## Task 1: Shared types

**Files:**
- Create: `frontend/app/dashboard/bi/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// frontend/app/dashboard/bi/types.ts

export interface OportunidadItem {
  CodigoOrganismoPublico: string;
  RubroN2: string;
  opportunity_score: number;
  n_transacciones: number;
  coef_variacion: number;
  hhi: number;
  n_proveedores: number;
  cagr: number;
}

export interface TendenciaItem {
  CodigoOrganismoPublico?: string;
  RubroN2: string;
  cagr: number;
  tendencia: string;
  slope_mensual?: number;
  r_squared?: number;
  n_anios?: number;
  total_oc?: number;
  monto_acumulado?: number;
}

export interface CompetidorItem {
  CodigoProveedor: string;
  NombreProveedor: string;
  RubroN2: string;
  market_share_pct: number;
  win_rate_pct: number;
  rank_monto: number;
  n_oc: number;
  monto_total?: number;
}

export interface ConcentracionItem {
  RubroN2: string;
  hhi: number;
  tipo_mercado: string;
  n_proveedores: number;
}

export interface CompradorResult {
  disponible: boolean;
  nombre?: string;
  buyer_score?: number;
  clasificacion?: string;
  pago?: {
    mediana_dias_pago?: number;
    tasa_cancelacion?: number;
    tasa_adjudicacion?: number;
    p75_dias_pago?: number;
  };
  risk_flags?: {
    n_flags: number;
    pago_lento: boolean;
    cancelaciones: boolean;
    baja_calificacion: boolean;
  };
  motivo?: string;
}

export interface DescuentoItem {
  CodigoTipo?: string;
  Rubro2?: string;
  n_oferentes_rango?: string;
  p10?: number;
  p50?: number;
  p90?: number;
  media?: number;
  senial_competencia?: string;
  n?: number;
}

export interface EstacionalidadMes {
  mes: number;
  compras_mes?: number;
  prob_mes?: number;
  consistencia?: number;
  z_score?: number;
  es_pico_estacional?: boolean;
}

export interface ClusterItem {
  cluster_id: number;
  label: string;
  keywords?: string;
  n_productos?: number;
  rubro_dominante?: string;
}

export interface TFIDFPerfilData {
  empresa_id: string;
  rubros_usados?: string[];
  modelo_version?: string;
  actualizado_en?: string;
  tiene_vector: boolean;
}

// Months in Spanish for chart labels
export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Score color helper
export function scoreColor(score: number): string {
  if (score >= 7) return 'text-accent';
  if (score >= 4.5) return 'text-gold';
  return 'text-danger';
}

export function scoreBg(score: number): string {
  if (score >= 7) return 'bg-accent/15 text-accent border-accent/25';
  if (score >= 4.5) return 'bg-gold/15 text-gold border-gold/25';
  return 'bg-danger/15 text-danger border-danger/25';
}

// Plan check helpers
export type PlanTier = 'basico' | 'pyme' | 'pro' | 'enterprise';
export function isPaidPlan(tier: PlanTier | undefined): boolean {
  return tier === 'pyme' || tier === 'pro' || tier === 'enterprise';
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/bi/types.ts
git commit -m "feat(bi): add shared BI types and helpers"
```

---

## Task 2: PlanGate component

**Files:**
- Create: `frontend/app/dashboard/bi/components/PlanGate.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/app/dashboard/bi/components/PlanGate.tsx
'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';

interface PlanGateProps {
  children: React.ReactNode;
  locked: boolean;
  label?: string; // e.g. "Análisis de competencia"
}

export function PlanGate({ children, locked, label }: PlanGateProps) {
  if (!locked) return <>{children}</>;

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Blurred children */}
      <div className="pointer-events-none select-none blur-sm opacity-50">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
        <div className="rounded-full bg-surface border border-border p-3">
          <Lock className="h-5 w-5 text-muted" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-text">
            {label || 'Disponible en plan PYME'}
          </p>
          <p className="text-xs text-muted mt-0.5">
            Actualiza tu plan para desbloquear esta sección
          </p>
        </div>
        <Link href="/dashboard/billing" className="btn-primary text-sm">
          Ver planes
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/bi/components/PlanGate.tsx
git commit -m "feat(bi): add PlanGate component for locked sections"
```

---

## Task 3: RubroFilter component

**Files:**
- Create: `frontend/app/dashboard/bi/components/RubroFilter.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/app/dashboard/bi/components/RubroFilter.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, Settings2, X, Check, Loader2 } from 'lucide-react';
import { ClusterItem, TFIDFPerfilData, PlanTier, isPaidPlan } from '../types';

interface RubroFilterProps {
  rubros: string[];               // available rubros for the dropdown
  selectedRubro: string;
  onRubroChange: (rubro: string) => void;
  plan: PlanTier | undefined;
  // Edit modal props
  clusters: ClusterItem[];
  perfil: TFIDFPerfilData | null;
  empresaId: string | null;
  onSavePerfil: (rubros: string[]) => Promise<void>;
}

export function RubroFilter({
  rubros,
  selectedRubro,
  onRubroChange,
  plan,
  clusters,
  perfil,
  empresaId,
  onSavePerfil,
}: RubroFilterProps) {
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState<string[]>(
    perfil?.rubros_usados ?? []
  );
  const [customRubro, setCustomRubro] = useState('');
  const [saving, setSaving] = useState(false);
  const locked = !isPaidPlan(plan);

  const handleSave = async () => {
    if (selectedClusters.length === 0) return;
    setSaving(true);
    try {
      await onSavePerfil(selectedClusters);
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleCluster = (label: string) => {
    setSelectedClusters((prev) =>
      prev.includes(label) ? prev.filter((r) => r !== label) : [...prev, label]
    );
  };

  const addCustom = () => {
    const val = customRubro.trim();
    if (val && !selectedClusters.includes(val)) {
      setSelectedClusters((prev) => [...prev, val]);
    }
    setCustomRubro('');
  };

  return (
    <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex flex-wrap items-center gap-3">
      {/* Title */}
      <span className="text-sm font-semibold text-text shrink-0">Mercado:</span>

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => !locked && setOpen((o) => !o)}
          disabled={locked}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <span className="max-w-[200px] truncate">
            {selectedRubro || 'Seleccionar rubro'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted shrink-0" />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 w-72 rounded-xl border border-border bg-surface shadow-lg z-30 max-h-64 overflow-y-auto">
            {rubros.map((r) => (
              <button
                key={r}
                onClick={() => { onRubroChange(r); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-hover transition-colors flex items-center justify-between ${
                  r === selectedRubro ? 'text-primary font-medium' : 'text-text'
                }`}
              >
                <span className="truncate">{r}</span>
                {r === selectedRubro && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lock badge for basico */}
      {locked && (
        <span className="text-xs text-muted bg-surface border border-border rounded-full px-2.5 py-0.5">
          Desbloquea más rubros con plan PYME
        </span>
      )}

      {/* Edit button */}
      {empresaId && (
        <button
          onClick={() => setShowModal(true)}
          className="ml-auto flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Editar mis rubros
        </button>
      )}

      {/* Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-lg mx-4 p-6 flex flex-col gap-4 max-h-[80vh]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text">Editar mis rubros</h3>
              <button onClick={() => setShowModal(false)}>
                <X className="h-4 w-4 text-muted" />
              </button>
            </div>
            <p className="text-xs text-muted">
              Selecciona los rubros de tu empresa. El panel se ajustará automáticamente.
            </p>
            <div className="flex-1 overflow-y-auto space-y-1">
              {clusters.map((c) => (
                <button
                  key={c.cluster_id}
                  onClick={() => toggleCluster(c.label)}
                  className={`w-full text-left flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    selectedClusters.includes(c.label)
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-hover text-text'
                  }`}
                >
                  <span>{c.label}</span>
                  {selectedClusters.includes(c.label) && (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              ))}
            </div>
            {/* Custom rubro */}
            <div className="flex gap-2">
              <input
                type="text"
                className="input-field flex-1 text-sm"
                placeholder="Añadir rubro personalizado..."
                value={customRubro}
                onChange={(e) => setCustomRubro(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              />
              <button onClick={addCustom} className="btn-secondary text-sm">Añadir</button>
            </div>
            {/* Selected chips */}
            {selectedClusters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedClusters.map((r) => (
                  <span
                    key={r}
                    className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                  >
                    {r}
                    <button onClick={() => toggleCluster(r)}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving || selectedClusters.length === 0}
              className="btn-primary w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/bi/components/RubroFilter.tsx
git commit -m "feat(bi): add RubroFilter dropdown with edit modal"
```

---

## Task 4: OportunidadesSection

**Files:**
- Create: `frontend/app/dashboard/bi/components/OportunidadesSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/app/dashboard/bi/components/OportunidadesSection.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Target } from 'lucide-react';
import { OportunidadItem, CompradorResult, scoreColor, scoreBg } from '../types';
import { apiClient } from '@/lib/api';

interface OportunidadesSectionProps {
  oportunidades: OportunidadItem[];
  loading: boolean;
}

function ScoreBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? 'bg-accent' : pct >= 40 ? 'bg-gold' : 'bg-danger';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted w-6 text-right">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function CompetitionBadge({ n }: { n: number }) {
  if (n < 5) return <span className="badge-success text-xs">Baja ({n})</span>;
  if (n <= 15) return <span className="badge-warning text-xs">Media ({n})</span>;
  return <span className="badge-error text-xs">Alta ({n})</span>;
}

function ExpandedRow({ organismo }: { organismo: string }) {
  const [data, setData] = useState<CompradorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await apiClient.getBIComprador(organismo);
      setData(res);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on mount
  useState(() => { load(); });

  if (loading) return (
    <div className="p-4 flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando perfil del comprador...
    </div>
  );

  if (!data?.disponible) return (
    <div className="p-4 text-sm text-muted">Sin datos de este comprador.</div>
  );

  const scoreClass = data.buyer_score != null ? scoreBg(data.buyer_score) : '';

  return (
    <div className="p-4 bg-surface/60 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
      <div>
        <p className="text-xs text-muted mb-1">Score comprador</p>
        {data.buyer_score != null ? (
          <span className={`font-bold text-base ${scoreColor(data.buyer_score)}`}>
            {data.buyer_score.toFixed(1)}/10
          </span>
        ) : <span className="text-muted">—</span>}
        {data.clasificacion && (
          <span className={`ml-2 text-xs rounded-full border px-2 py-0.5 ${scoreClass}`}>
            {data.clasificacion}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs text-muted mb-1">Pago promedio</p>
        <p className="font-medium text-text">{data.pago?.mediana_dias_pago ?? '—'} días</p>
      </div>
      <div>
        <p className="text-xs text-muted mb-1">Tasa adjudicación</p>
        <p className="font-medium text-text">
          {data.pago?.tasa_adjudicacion != null
            ? `${(data.pago.tasa_adjudicacion * 100).toFixed(0)}%`
            : '—'}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted mb-1">Cancelaciones</p>
        <p className="font-medium text-text">
          {data.pago?.tasa_cancelacion != null
            ? `${(data.pago.tasa_cancelacion * 100).toFixed(0)}%`
            : '—'}
        </p>
      </div>
      {data.risk_flags && data.risk_flags.n_flags > 0 && (
        <div className="col-span-full flex flex-wrap gap-1.5">
          {data.risk_flags.pago_lento && (
            <span title="Este organismo tarda más de 45 días en pagar en promedio" className="badge-error text-xs cursor-help">⚠ Pago lento</span>
          )}
          {data.risk_flags.cancelaciones && (
            <span title="Alta tasa de órdenes canceladas" className="badge-error text-xs cursor-help">⚠ Cancelaciones frecuentes</span>
          )}
          {data.risk_flags.baja_calificacion && (
            <span title="Calificación promedio de proveedores baja" className="badge-error text-xs cursor-help">⚠ Baja calificación</span>
          )}
        </div>
      )}
    </div>
  );
}

export function OportunidadesSection({ oportunidades, loading }: OportunidadesSectionProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const maxScore = oportunidades.length > 0
    ? Math.max(...oportunidades.map((o) => o.opportunity_score))
    : 0;
  const avgCompetidores = oportunidades.length > 0
    ? oportunidades.reduce((s, o) => s + o.n_proveedores, 0) / oportunidades.length
    : 0;

  if (loading) return (
    <div className="card flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  if (!loading && oportunidades.length === 0) return (
    <div className="card flex flex-col items-center gap-3 py-12 text-center">
      <Target className="h-8 w-8 text-muted" />
      <p className="text-sm text-muted">No se encontraron oportunidades para este rubro.</p>
      <p className="text-xs text-subtle">Prueba bajando el filtro mínimo de score o cambiando el rubro.</p>
    </div>
  );

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Oportunidades destacadas
        </h2>
        <p className="text-xs text-muted mt-0.5">¿Dónde hay oportunidad de negocio en este mercado?</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-muted">Oportunidades encontradas</p>
          <p className="text-2xl font-bold text-text mt-1">{oportunidades.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-muted mb-1">Mejor score</p>
          <p className={`text-2xl font-bold ${maxScore > 0 ? scoreColor(maxScore) : 'text-muted'}`}>
            {maxScore > 0 ? maxScore.toFixed(1) : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs text-muted mb-1.5">Competencia promedio</p>
          {avgCompetidores > 0 ? (
            <CompetitionBadge n={Math.round(avgCompetidores)} />
          ) : (
            <span className="text-muted text-sm">—</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/60 text-left">
              <th className="px-4 py-2.5 text-xs font-medium text-muted">Organismo</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted">Rubro</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted w-40">
                <span title="Score 0-10 que combina volumen de compras, nivel de competencia, estacionalidad y tendencia de crecimiento. Mayor score = mejor oportunidad." className="cursor-help underline decoration-dotted">
                  Score de oportunidad ℹ
                </span>
              </th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted">Transacciones históricas</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted">Proveedores activos</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {oportunidades.slice(0, 10).map((op, i) => {
              const rowKey = `${op.CodigoOrganismoPublico}-${op.RubroN2}-${i}`;
              const isExpanded = expandedRow === rowKey;
              return (
                <>
                  <tr
                    key={rowKey}
                    className="border-b border-border last:border-0 hover:bg-hover cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted">{op.CodigoOrganismoPublico}</td>
                    <td className="px-4 py-3 text-text max-w-[180px] truncate">{op.RubroN2}</td>
                    <td className="px-4 py-3 w-40">
                      <ScoreBar value={op.opportunity_score} />
                    </td>
                    <td className="px-4 py-3 text-text text-right">{op.n_transacciones.toLocaleString('es-CL')}</td>
                    <td className="px-4 py-3">
                      <CompetitionBadge n={op.n_proveedores} />
                    </td>
                    <td className="px-4 py-3">
                      {isExpanded
                        ? <ChevronUp className="h-3.5 w-3.5 text-muted" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${rowKey}-expanded`}>
                      <td colSpan={6} className="p-0">
                        <ExpandedRow organismo={op.CodigoOrganismoPublico} />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify** — Open `http://localhost:3000/dashboard/bi`. Section 1 should show KPI cards and a table with rows. Clicking a row should expand to show buyer profile.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/bi/components/OportunidadesSection.tsx
git commit -m "feat(bi): add OportunidadesSection with KPI cards and expandable rows"
```

---

## Task 5: TendenciasSection

**Files:**
- Create: `frontend/app/dashboard/bi/components/TendenciasSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/app/dashboard/bi/components/TendenciasSection.tsx
'use client';

import { Loader2, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { TendenciaItem } from '../types';

interface TendenciasSectionProps {
  tendencias: TendenciaItem[];
  emergentes: TendenciaItem[];
  loading: boolean;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as TendenciaItem;
  return (
    <div className="rounded-xl border border-border bg-surface shadow-lg px-4 py-3 text-sm max-w-xs">
      <p className="font-semibold text-text mb-1">{d.RubroN2}</p>
      <p className="text-muted">
        Crecimiento anual: <span className={`font-bold ${d.cagr >= 0 ? 'text-accent' : 'text-danger'}`}>
          {d.cagr > 0 ? '+' : ''}{d.cagr.toFixed(1)}%
        </span>
      </p>
      {d.n_anios && (
        <p className="text-xs text-subtle mt-1">
          Basado en {d.total_oc?.toLocaleString('es-CL') ?? '?'} órdenes de compra en {d.n_anios} año{d.n_anios !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export function TendenciasSection({ tendencias, emergentes, loading }: TendenciasSectionProps) {
  if (loading) return (
    <div className="card flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  const chartData = [...tendencias]
    .sort((a, b) => b.cagr - a.cagr)
    .slice(0, 12)
    .map((t) => ({
      ...t,
      label: t.RubroN2.length > 35 ? t.RubroN2.slice(0, 35) + '…' : t.RubroN2,
    }));

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Tendencias del mercado
        </h2>
        <p className="text-xs text-muted mt-0.5">¿Este mercado está creciendo o contrayéndose?</p>
      </div>

      {/* Emergentes badges */}
      {emergentes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-muted self-center">En alza:</span>
          {emergentes.slice(0, 3).map((e) => (
            <span
              key={e.RubroN2}
              className="flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/25 px-3 py-1 text-xs font-semibold text-accent"
            >
              ↗ {e.RubroN2} {e.cagr > 0 ? '+' : ''}{e.cagr.toFixed(0)}% anual
            </span>
          ))}
        </div>
      )}

      {/* Horizontal bar chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 36)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
            <XAxis
              type="number"
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
              tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
              label={{ value: 'Crecimiento anual (%)', position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--color-muted)' }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={200}
              tick={{ fontSize: 11, fill: 'var(--color-text)' }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-hover)' }} />
            <ReferenceLine x={0} stroke="var(--color-border)" strokeWidth={1.5} />
            <Bar dataKey="cagr" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {chartData.map((entry, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={entry.cagr >= 0 ? 'var(--color-accent)' : 'var(--color-danger)'}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <TrendingUp className="h-7 w-7 text-muted" />
          <p className="text-sm text-muted">No hay datos de tendencias para este rubro.</p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify** — Section 2 should show horizontal bars with green/red coloring, full rubro names, and a tooltip with plain-Spanish explanation. "CAGR" should not appear anywhere in the UI.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/bi/components/TendenciasSection.tsx
git commit -m "feat(bi): add TendenciasSection with horizontal bar chart, no CAGR jargon"
```

---

## Task 6: CompetenciaSection

**Files:**
- Create: `frontend/app/dashboard/bi/components/CompetenciaSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/app/dashboard/bi/components/CompetenciaSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { Loader2, Users } from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CompetidorItem, ConcentracionItem } from '../types';
import { apiClient } from '@/lib/api';

interface CompetenciaSectionProps {
  topOrganismos: string[];   // from oportunidades results
  selectedOrganismo: string;
  onOrganismoChange: (o: string) => void;
  rubro: string;
}

const COLORS = [
  'var(--color-primary)',
  'var(--color-accent)',
  'var(--color-gold)',
  'var(--color-danger)',
  '#8b5cf6',
  '#06b6d4',
];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as CompetidorItem;
  return (
    <div className="rounded-xl border border-border bg-surface shadow-lg px-4 py-3 text-sm max-w-xs">
      <p className="font-semibold text-text">{d.NombreProveedor}</p>
      <p className="text-muted mt-1">Participación: <span className="text-text font-medium">{d.market_share_pct.toFixed(1)}%</span></p>
      <p className="text-muted">Tasa adjudicación: <span className="text-text font-medium">{d.win_rate_pct.toFixed(1)}%</span></p>
      <p className="text-muted">{d.n_oc.toLocaleString('es-CL')} órdenes de compra</p>
    </div>
  );
};

export function CompetenciaSection({
  topOrganismos,
  selectedOrganismo,
  onOrganismoChange,
  rubro,
}: CompetenciaSectionProps) {
  const [competidores, setCompetidores] = useState<CompetidorItem[]>([]);
  const [concentracion, setConcentracion] = useState<ConcentracionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!selectedOrganismo) return;
    setLoading(true);
    apiClient.getBICompetidores(selectedOrganismo, { rubro: rubro || undefined, top_n: 10 })
      .then((res) => {
        if (res.disponible) {
          setCompetidores(res.competidores ?? []);
          setConcentracion(res.concentracion ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedOrganismo, rubro]);

  const tipoMercado = concentracion[0]?.tipo_mercado;
  const nProveedores = concentracion[0]?.n_proveedores;
  const tipoLabel: Record<string, string> = {
    concentrado: 'Concentrado — pocos proveedores dominan',
    moderado: 'Moderado — competencia normal',
    fragmentado: 'Fragmentado — muchos proveedores compiten',
  };

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Competencia
          </h2>
          <p className="text-xs text-muted mt-0.5">¿Contra quién compites en este mercado?</p>
        </div>

        {/* Organismo selector */}
        {topOrganismos.length > 1 && (
          <select
            value={selectedOrganismo}
            onChange={(e) => onOrganismoChange(e.target.value)}
            className="text-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-text"
          >
            {topOrganismos.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
      </div>

      {/* Concentration summary */}
      {tipoMercado && (
        <div className="rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm flex items-center gap-3">
          <span className="font-medium text-text">
            {nProveedores != null ? `${nProveedores} proveedores activos.` : ''}
          </span>
          <span
            className="text-muted"
            title="El HHI (índice Herfindahl-Hirschman) mide qué tan concentrado está un mercado. Un valor alto significa que pocos proveedores controlan la mayoría de las compras."
          >
            {tipoLabel[tipoMercado] ?? tipoMercado}{' '}
            <span className="cursor-help underline decoration-dotted">ℹ</span>
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : competidores.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Users className="h-7 w-7 text-muted" />
          <p className="text-sm text-muted">Sin datos de competencia para este organismo.</p>
        </div>
      ) : (
        <>
          {/* Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowTable(false)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${!showTable ? 'bg-primary text-white border-primary' : 'border-border text-muted hover:text-text'}`}
            >
              Gráfico
            </button>
            <button
              onClick={() => setShowTable(true)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${showTable ? 'bg-primary text-white border-primary' : 'border-border text-muted hover:text-text'}`}
            >
              Tabla
            </button>
          </div>

          {!showTable ? (
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="win_rate_pct"
                  name="Tasa adjudicación"
                  type="number"
                  label={{ value: 'Tasa de adjudicación (%)', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--color-muted)' }}
                  tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                />
                <YAxis
                  dataKey="market_share_pct"
                  name="Participación"
                  type="number"
                  label={{ value: 'Participación de mercado (%)', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--color-muted)' }}
                  tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
                />
                <ZAxis dataKey="n_oc" range={[40, 400]} />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={competidores} isAnimationActive={false}>
                  {competidores.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} fillOpacity={0.75} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface/60 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">#</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">Proveedor</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">Participación</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">Tasa adjudicación</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-muted">OC</th>
                  </tr>
                </thead>
                <tbody>
                  {competidores.map((c, i) => (
                    <tr key={c.CodigoProveedor} className="border-b border-border last:border-0 hover:bg-hover">
                      <td className="px-4 py-2.5 text-muted text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-text">{c.NombreProveedor}</td>
                      <td className="px-4 py-2.5">{c.market_share_pct.toFixed(1)}%</td>
                      <td className="px-4 py-2.5">{c.win_rate_pct.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-muted">{c.n_oc.toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/bi/components/CompetenciaSection.tsx
git commit -m "feat(bi): add CompetenciaSection with scatter chart and organismo selector"
```

---

## Task 7: CompradoresSection

**Files:**
- Create: `frontend/app/dashboard/bi/components/CompradoresSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/app/dashboard/bi/components/CompradoresSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Loader2, Building2 } from 'lucide-react';
import { CompradorResult, DescuentoItem, scoreColor, scoreBg } from '../types';
import { apiClient } from '@/lib/api';

interface CompradorSectionProps {
  topOrganismos: string[];
  rubro: string;
}

function DescuentosInline({ rubro }: { rubro: string }) {
  const [data, setData] = useState<DescuentoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await apiClient.getBIDescuento({ rubro: rubro || undefined });
      if (res.disponible) setData(res.descuentos ?? []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => { if (!open) load(); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Ver descuentos típicos
      </button>
      {open && (
        <div className="mt-3">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : data.length === 0 ? (
            <p className="text-xs text-muted">Sin datos de descuento para este rubro.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/60 text-left">
                    <th className="px-3 py-2 text-muted">N° oferentes</th>
                    <th className="px-3 py-2 text-muted">P10</th>
                    <th className="px-3 py-2 text-muted">P50</th>
                    <th className="px-3 py-2 text-muted">P90</th>
                    <th className="px-3 py-2 text-muted">Señal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 5).map((d, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{d.n_oferentes_rango ?? '—'}</td>
                      <td className="px-3 py-2">{d.p10 != null ? `${d.p10.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2 font-medium">{d.p50 != null ? `${d.p50.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2">{d.p90 != null ? `${d.p90.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2">{d.senial_competencia ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompradorCard({ organismoId, rubro }: { organismoId: string; rubro: string }) {
  const [data, setData] = useState<CompradorResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); // cards after first start collapsed

  useEffect(() => {
    apiClient.getBIComprador(organismoId)
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [organismoId]);

  if (loading) return (
    <div className="rounded-xl border border-border p-4 flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
    </div>
  );

  if (!data?.disponible) return (
    <div className="rounded-xl border border-border p-4 text-sm text-muted">
      Sin datos para organismo {organismoId}.
    </div>
  );

  const scoreClass = data.buyer_score != null ? scoreBg(data.buyer_score) : '';
  const scoreColorClass = data.buyer_score != null ? scoreColor(data.buyer_score) : 'text-muted';

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface/60 hover:bg-hover transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Building2 className="h-4 w-4 text-muted shrink-0" />
          <span className="font-medium text-text text-sm truncate">{data.nombre ?? organismoId}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data.buyer_score != null && (
            <span className={`text-sm font-bold ${scoreColorClass}`}>{data.buyer_score.toFixed(1)}</span>
          )}
          {data.clasificacion && (
            <span className={`text-xs rounded-full border px-2 py-0.5 ${scoreClass}`}>
              {data.clasificacion}
            </span>
          )}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="px-4 py-4 space-y-4 border-t border-border">
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface border border-border p-3">
              <p className="text-xs text-muted">Pago promedio</p>
              <p className="text-base font-semibold text-text mt-0.5">
                {data.pago?.mediana_dias_pago ?? '—'} días
              </p>
            </div>
            <div className="rounded-lg bg-surface border border-border p-3">
              <p className="text-xs text-muted">Tasa adjudicación</p>
              <p className="text-base font-semibold text-text mt-0.5">
                {data.pago?.tasa_adjudicacion != null
                  ? `${(data.pago.tasa_adjudicacion * 100).toFixed(0)}%`
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-surface border border-border p-3">
              <p className="text-xs text-muted">Cancelaciones</p>
              <p className="text-base font-semibold text-text mt-0.5">
                {data.pago?.tasa_cancelacion != null
                  ? `${(data.pago.tasa_cancelacion * 100).toFixed(0)}%`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Risk flags */}
          {data.risk_flags && data.risk_flags.n_flags > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.risk_flags.pago_lento && (
                <span title="Este organismo tarda más de 45 días en pagar en promedio" className="badge-error text-xs cursor-help">⚠ Pago lento</span>
              )}
              {data.risk_flags.cancelaciones && (
                <span title="Alta tasa de órdenes canceladas" className="badge-error text-xs cursor-help">⚠ Cancelaciones frecuentes</span>
              )}
              {data.risk_flags.baja_calificacion && (
                <span title="Calificación promedio de proveedores baja" className="badge-error text-xs cursor-help">⚠ Baja calificación</span>
              )}
            </div>
          )}

          {/* Descuentos */}
          <DescuentosInline rubro={rubro} />
        </div>
      )}
    </div>
  );
}

export function CompradoresSection({ topOrganismos, rubro }: CompradorSectionProps) {
  const [openFirst, setOpenFirst] = useState(true);

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Perfil de compradores
        </h2>
        <p className="text-xs text-muted mt-0.5">¿Son confiables los organismos que más compran?</p>
      </div>

      <div className="space-y-3">
        {topOrganismos.slice(0, 3).map((org, i) => (
          <CompradorCard key={org} organismoId={org} rubro={rubro} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/bi/components/CompradoresSection.tsx
git commit -m "feat(bi): add CompradoresSection with collapsible buyer cards and discount detail"
```

---

## Task 8: EstacionalidadSection

**Files:**
- Create: `frontend/app/dashboard/bi/components/EstacionalidadSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/app/dashboard/bi/components/EstacionalidadSection.tsx
'use client';

import { useState, useEffect } from 'react';
import { Loader2, Calendar } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { EstacionalidadMes, MESES } from '../types';
import { apiClient } from '@/lib/api';

interface EstacionalidadSectionProps {
  topOrganismos: string[];
  rubro: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as EstacionalidadMes & { label: string };
  if (!d) return null;
  const prob = d.prob_mes != null ? (d.prob_mes * 100).toFixed(0) : '?';
  const consist = d.consistencia != null ? (d.consistencia * 100).toFixed(0) : '?';
  return (
    <div className="rounded-xl border border-border bg-surface shadow-lg px-4 py-3 text-sm max-w-xs">
      <p className="font-semibold text-text mb-1">{d.label}</p>
      <p className="text-muted">
        Probabilidad de compra: <span className="text-text font-medium">{prob}%</span>
      </p>
      <p className="text-muted">
        Consistencia: <span className="text-text font-medium">{consist}%</span>
      </p>
      {d.es_pico_estacional && (
        <p className="text-accent font-medium mt-1">📈 Mes pico</p>
      )}
    </div>
  );
};

export function EstacionalidadSection({ topOrganismos, rubro }: EstacionalidadSectionProps) {
  const [selectedOrg, setSelectedOrg] = useState(topOrganismos[0] ?? '');
  const [patrones, setPatrones] = useState<EstacionalidadMes[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedOrg) return;
    setLoading(true);
    apiClient.getBIEstacionalidad(selectedOrg, { rubro: rubro || undefined })
      .then((res) => {
        if (res.disponible) setPatrones(res.patrones ?? []);
        else setPatrones([]);
      })
      .catch(() => setPatrones([]))
      .finally(() => setLoading(false));
  }, [selectedOrg, rubro]);

  // Build chart data: 12 months, add confidence band from consistencia
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const found = patrones.find((p) => p.mes === mes);
    const prob = found?.prob_mes ?? 0;
    const consist = found?.consistencia ?? 0;
    // Band: ± (1 - consistency) * prob — wide band when inconsistent
    const spread = (1 - consist) * prob * 0.5;
    return {
      label: MESES[i],
      mes,
      prob_mes: found?.prob_mes,
      consistencia: found?.consistencia,
      es_pico_estacional: found?.es_pico_estacional ?? false,
      // Area chart needs [lower, upper] — encode as bandLow and bandHigh
      bandLow: Math.max(0, prob - spread),
      bandHigh: Math.min(1, prob + spread),
      probPct: prob * 100,
    };
  });

  // Auto-annotation
  const picoMeses = chartData.filter((d) => d.es_pico_estacional).map((d) => d.label);
  const avgConsist = patrones.length > 0
    ? (patrones.reduce((s, p) => s + (p.consistencia ?? 0), 0) / patrones.length * 100).toFixed(0)
    : null;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Estacionalidad de compras
          </h2>
          <p className="text-xs text-muted mt-0.5">¿En qué meses compran más?</p>
        </div>

        {topOrganismos.length > 1 && (
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="text-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-text"
          >
            {topOrganismos.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
      </div>

      {/* Auto-annotation */}
      {picoMeses.length > 0 && (
        <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          Este organismo suele comprar más en <span className="font-semibold">{picoMeses.join(', ')}</span>.
          {avgConsist && ` Consistencia promedio: ${avgConsist}%.`}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : patrones.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Calendar className="h-7 w-7 text-muted" />
          <p className="text-sm text-muted">Sin datos de estacionalidad para este organismo y rubro.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} />
            <YAxis
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
              domain={[0, 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Confidence band (upper) */}
            <Area
              type="monotone"
              dataKey="bandHigh"
              stroke="none"
              fill="url(#bandGradient)"
              isAnimationActive={false}
            />
            {/* Confidence band (lower) — masks to create band effect */}
            <Area
              type="monotone"
              dataKey="bandLow"
              stroke="none"
              fill="var(--color-background)"
              isAnimationActive={false}
            />
            {/* Main line */}
            <Area
              type="monotone"
              dataKey="probPct"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="none"
              dot={(props: any) => {
                const d = props.payload as typeof chartData[0];
                if (!d.es_pico_estacional) return <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="var(--color-primary)" opacity={0.5} />;
                return (
                  <circle
                    key={props.key}
                    cx={props.cx}
                    cy={props.cy}
                    r={6}
                    fill="var(--color-accent)"
                    stroke="var(--color-background)"
                    strokeWidth={2}
                  />
                );
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/bi/components/EstacionalidadSection.tsx
git commit -m "feat(bi): add EstacionalidadSection with line + confidence band chart"
```

---

## Task 9: Rewrite bi/page.tsx

**Files:**
- Modify: `frontend/app/dashboard/bi/page.tsx` — full replacement

- [ ] **Step 1: Replace the file entirely**

```tsx
// frontend/app/dashboard/bi/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, BarChart3, Search } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  OportunidadItem,
  TendenciaItem,
  ClusterItem,
  TFIDFPerfilData,
  PlanTier,
  isPaidPlan,
} from './types';
import { RubroFilter } from './components/RubroFilter';
import { PlanGate } from './components/PlanGate';
import { OportunidadesSection } from './components/OportunidadesSection';
import { TendenciasSection } from './components/TendenciasSection';
import { CompetenciaSection } from './components/CompetenciaSection';
import { CompradoresSection } from './components/CompradoresSection';
import { EstacionalidadSection } from './components/EstacionalidadSection';

// Advanced tools (matching semántico) - lazy
import { Search as SearchIcon } from 'lucide-react';

function BIDisabledBanner() {
  return (
    <div className="card flex flex-col items-center gap-4 py-12 text-center">
      <div className="rounded-full bg-gold/15 p-4">
        <BarChart3 className="h-10 w-10 text-gold" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-text">Módulo BI desactivado</h2>
        <p className="mt-2 text-sm text-muted max-w-md">
          La inteligencia de negocios requiere que el pipeline ETL de analytics haya generado
          los parquets de datos históricos (<code>etl/data/analytics/</code>) y que el flag{' '}
          <code>FEATURE_ANALYTICS=true</code> esté activo.
        </p>
      </div>
    </div>
  );
}

export default function BIPage() {
  const { user } = useAuth();
  const plan = (user?.plan_tier ?? 'basico') as PlanTier;
  const paid = isPaidPlan(plan);

  // ── Init state ─────────────────────────────────────────────────────────────
  const [biEnabled, setBiEnabled] = useState<boolean | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loadingInit, setLoadingInit] = useState(false);

  // ── Empresa / perfil state ─────────────────────────────────────────────────
  const [firstEmpresaId, setFirstEmpresaId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<TFIDFPerfilData | null>(null);
  const [clusters, setClusters] = useState<ClusterItem[]>([]);

  // ── Rubro state ────────────────────────────────────────────────────────────
  const [availableRubros, setAvailableRubros] = useState<string[]>([]);
  const [selectedRubro, setSelectedRubro] = useState('');

  // ── Section data ───────────────────────────────────────────────────────────
  const [oportunidades, setOportunidades] = useState<OportunidadItem[]>([]);
  const [loadingOp, setLoadingOp] = useState(false);
  const [tendencias, setTendencias] = useState<TendenciaItem[]>([]);
  const [emergentes, setEmergentes] = useState<TendenciaItem[]>([]);
  const [loadingTend, setLoadingTend] = useState(false);

  // Derived: top 3 organismos from oportunidades
  const topOrganismos = [
    ...new Set(oportunidades.slice(0, 5).map((o) => o.CodigoOrganismoPublico)),
  ].slice(0, 3);
  const [selectedCompOrg, setSelectedCompOrg] = useState('');
  useEffect(() => {
    if (topOrganismos.length > 0 && !selectedCompOrg) {
      setSelectedCompOrg(topOrganismos[0]);
    }
  }, [topOrganismos.join(',')]);

  // ── Load oportunidades ─────────────────────────────────────────────────────
  const loadOportunidades = useCallback(async (rubro: string) => {
    setLoadingOp(true);
    try {
      const res = await apiClient.getBIOportunidades({
        rubro: rubro || undefined,
        min_score: 4,
        limit: 20,
      });
      if (res.disponible) setOportunidades(res.oportunidades ?? []);
    } catch {
      setOportunidades([]);
    } finally {
      setLoadingOp(false);
    }
  }, []);

  // ── Load tendencias ────────────────────────────────────────────────────────
  const loadTendencias = useCallback(async (rubro: string) => {
    setLoadingTend(true);
    try {
      const res = await apiClient.getBITendencia({
        rubro: rubro || undefined,
        limit: 15,
      });
      if (res.disponible) {
        setTendencias(res.tendencias ?? []);
        setEmergentes(res.emergentes ?? []);
      }
    } catch {
      setTendencias([]);
      setEmergentes([]);
    } finally {
      setLoadingTend(false);
    }
  }, []);

  // ── Rubro change handler ───────────────────────────────────────────────────
  const handleRubroChange = useCallback((rubro: string) => {
    setSelectedRubro(rubro);
    setOportunidades([]);
    setTendencias([]);
    setEmergentes([]);
    setSelectedCompOrg('');
    loadOportunidades(rubro);
    loadTendencias(rubro);
  }, [loadOportunidades, loadTendencias]);

  // ── Init: load empresa + probe BI + seed rubros ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoadingInit(true);
      try {
        // Load empresa
        let empresaRubros: string[] = [];
        try {
          const empresas = await apiClient.getEmpresas();
          if (!cancelled && empresas.length > 0) {
            const emp = empresas[0];
            setFirstEmpresaId(emp.id);
            if (emp.rubros_cpv?.length) empresaRubros = emp.rubros_cpv;

            // Load TF-IDF perfil (non-blocking)
            apiClient.getTFIDFPerfil(emp.id)
              .then((p: TFIDFPerfilData) => {
                if (cancelled) return;
                setPerfil(p);
                if (empresaRubros.length === 0 && p.rubros_usados?.length) {
                  empresaRubros = p.rubros_usados;
                }
              })
              .catch(() => {});
          }
        } catch { /* no empresa */ }

        // Probe BI + load initial oportunidades in one call
        const firstRubro = empresaRubros[0] ?? '';
        const res = await apiClient.getBIOportunidades({
          rubro: firstRubro || undefined,
          min_score: 4,
          limit: 20,
        });
        if (cancelled) return;

        const enabled = res.disponible !== false;
        setBiEnabled(enabled);

        if (enabled) {
          const opData: OportunidadItem[] = res.oportunidades ?? [];
          setOportunidades(opData);

          // Build available rubros: empresa rubros + top rubros from data
          const dataRubros = [...new Set(opData.map((o) => o.RubroN2))].slice(0, 8);
          const merged = [...new Set([...empresaRubros, ...dataRubros])].slice(0, 15);
          setAvailableRubros(merged.length > 0 ? merged : dataRubros);
          setSelectedRubro(firstRubro || merged[0] || '');

          // Load tendencias in parallel
          loadTendencias(firstRubro);
        }
      } catch (err: any) {
        if (!cancelled) setBiEnabled(err?.response?.status === 503 ? false : null);
      } finally {
        if (!cancelled) {
          setLoadingInit(false);
          setInitialized(true);
        }
      }
    };

    init();

    // Load clusters for edit modal (non-blocking)
    apiClient.getBIClusters(100)
      .then((res: any) => { if (res.disponible) setClusters(res.clusters ?? []); })
      .catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save perfil handler ────────────────────────────────────────────────────
  const handleSavePerfil = async (rubros: string[]) => {
    if (!firstEmpresaId) return;
    const updated = await apiClient.updateTFIDFPerfil(firstEmpresaId, { rubros_usados: rubros });
    setPerfil(updated);
    const merged = [...new Set([...rubros, ...availableRubros])].slice(0, 15);
    setAvailableRubros(merged);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadingInit || !initialized) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (biEnabled === false) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-2xl font-semibold text-text flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Inteligencia de Mercado
        </h1>
        <BIDisabledBanner />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sticky filter bar */}
      <RubroFilter
        rubros={availableRubros}
        selectedRubro={selectedRubro}
        onRubroChange={handleRubroChange}
        plan={plan}
        clusters={clusters}
        perfil={perfil}
        empresaId={firstEmpresaId}
        onSavePerfil={handleSavePerfil}
      />

      <div className="flex-1 space-y-6 p-4 pb-12">
        <h1 className="text-2xl font-semibold text-text flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Inteligencia de Mercado
        </h1>

        {/* § 1 — Always visible */}
        <OportunidadesSection oportunidades={oportunidades} loading={loadingOp} />

        {/* § 2 — Always visible */}
        <TendenciasSection tendencias={tendencias} emergentes={emergentes} loading={loadingTend} />

        {/* § 3 — Locked for basico */}
        <PlanGate locked={!paid} label="Análisis de competencia — plan PYME o superior">
          <CompetenciaSection
            topOrganismos={topOrganismos}
            selectedOrganismo={selectedCompOrg}
            onOrganismoChange={setSelectedCompOrg}
            rubro={selectedRubro}
          />
        </PlanGate>

        {/* § 4 — Locked for basico */}
        <PlanGate locked={!paid} label="Perfil de compradores — plan PYME o superior">
          {topOrganismos.length > 0 && (
            <CompradoresSection topOrganismos={topOrganismos} rubro={selectedRubro} />
          )}
        </PlanGate>

        {/* § 5 — Locked for basico */}
        <PlanGate locked={!paid} label="Estacionalidad — plan PYME o superior">
          {topOrganismos.length > 0 && (
            <EstacionalidadSection topOrganismos={topOrganismos} rubro={selectedRubro} />
          )}
        </PlanGate>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify checklist:**
  - Page loads and auto-populates oportunidades + tendencias for the empresa's rubro
  - Sections 3-5 are blurred with upgrade CTA for basico users
  - RubroFilter dropdown is populated and switching rubro reloads all sections
  - No free-text rubro input anywhere
  - No "CAGR", "HHI", "Ventana de Presión" jargon visible without explanation
  - "Actualizar Dashboards" button gone — everything reactive

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): rewrite BI page as narrative auto-loading dashboard"
```

---

## Task 10: BICard on tender detail page

**Files:**
- Create: `frontend/app/dashboard/tenders/[codigo]/components/BICard.tsx`
- Modify: `frontend/app/dashboard/tenders/[codigo]/page.tsx`

- [ ] **Step 1: Create BICard component**

```tsx
// frontend/app/dashboard/tenders/[codigo]/components/BICard.tsx
'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, BarChart3, Loader2, AlertTriangle, Clock, Users, DollarSign } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { scoreBg, scoreColor, PlanTier, isPaidPlan } from '../../../bi/types';

interface BICardProps {
  codigoExterno: string;
  empresaId?: string;
  plan?: PlanTier;
}

interface BIPanelData {
  comprador: {
    disponible: boolean;
    nombre?: string;
    buyer_score?: number;
    clasificacion?: string;
    mediana_dias_pago?: number;
    tasa_adjudicacion?: number;
    n_flags?: number;
  };
  ventana: {
    disponible: boolean;
    alerta_ventana_corta?: boolean;
    presion_score?: number;
    window_days?: number;
    clasificacion_ventana?: string;
    pct_del_tipico?: number;
  };
  competidores: {
    disponible: boolean;
    hhi?: number;
    tipo_mercado?: string;
    top5?: Array<{ NombreProveedor: string }>;
    n_proveedores?: number;
  };
  precios: Array<{
    disponible: boolean;
    codigo_producto?: string;
    p50?: number;
    confianza?: string;
  }>;
}

export function BICard({ codigoExterno, empresaId, plan = 'basico' }: BICardProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BIPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const paid = isPaidPlan(plan);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await apiClient.getBIPanel(codigoExterno, empresaId);
      setData(res);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  // Load summary on mount (1 API call for the summary line)
  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoExterno]);

  // Build summary line
  const buyerScore = data?.comprador?.buyer_score;
  const ventanaClasif = data?.ventana?.clasificacion_ventana ?? '—';
  const nProveedores = data?.competidores?.n_proveedores;
  const hasAlert = data?.ventana?.alerta_ventana_corta;

  const summaryLine = [
    buyerScore != null && `Comprador: ${buyerScore.toFixed(1)}/10`,
    `Plazo: ${ventanaClasif}`,
    nProveedores != null && `${nProveedores} competidores`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        onClick={() => {
          if (!open) load();
          setOpen((o) => !o);
        }}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-hover transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-sm text-text">Inteligencia de mercado</span>
          {hasAlert && (
            <span className="flex items-center gap-1 text-xs text-gold font-medium">
              <AlertTriangle className="h-3 w-3" /> Plazo corto
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
          ) : (
            <span className="text-xs text-muted hidden sm:block">{summaryLine}</span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border px-5 py-4">
          {!paid ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-sm text-muted">Análisis detallado disponible en plan PYME o superior.</p>
              <a href="/dashboard/billing" className="btn-primary text-sm">Ver planes</a>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : !data ? (
            <p className="text-sm text-muted py-4 text-center">No se pudo cargar el análisis.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Plazo */}
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="h-3.5 w-3.5 text-muted" />
                  <p className="text-xs font-medium text-muted">Plazo de preparación</p>
                </div>
                {data.ventana.disponible ? (
                  <>
                    {data.ventana.alerta_ventana_corta && (
                      <span className="inline-flex items-center gap-1 text-xs text-gold font-medium mb-1">
                        <AlertTriangle className="h-3 w-3" /> Plazo corto
                      </span>
                    )}
                    <p className="text-sm font-semibold text-text">
                      {data.ventana.window_days != null ? `${data.ventana.window_days} días` : '—'}
                    </p>
                    {data.ventana.pct_del_tipico != null && (
                      <p className="text-xs text-muted mt-0.5">
                        {data.ventana.pct_del_tipico.toFixed(0)}% del plazo típico
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>

              {/* Comprador */}
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart3 className="h-3.5 w-3.5 text-muted" />
                  <p className="text-xs font-medium text-muted">Comprador</p>
                </div>
                {data.comprador.disponible ? (
                  <>
                    {data.comprador.buyer_score != null && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-base font-bold ${scoreColor(data.comprador.buyer_score)}`}>
                          {data.comprador.buyer_score.toFixed(1)}
                        </span>
                        {data.comprador.clasificacion && (
                          <span className={`text-xs rounded-full border px-2 py-0.5 ${scoreBg(data.comprador.buyer_score)}`}>
                            {data.comprador.clasificacion}
                          </span>
                        )}
                      </div>
                    )}
                    {data.comprador.mediana_dias_pago != null && (
                      <p className="text-xs text-muted">Pago: {data.comprador.mediana_dias_pago} días</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>

              {/* Competencia */}
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="h-3.5 w-3.5 text-muted" />
                  <p className="text-xs font-medium text-muted">Competencia</p>
                </div>
                {data.competidores.disponible ? (
                  <>
                    <p className="text-sm font-semibold text-text">
                      {data.competidores.n_proveedores ?? '—'} proveedores
                    </p>
                    {data.competidores.tipo_mercado && (
                      <p className="text-xs text-muted mt-0.5 capitalize">{data.competidores.tipo_mercado}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>

              {/* Precios */}
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted" />
                  <p className="text-xs font-medium text-muted">Precios de referencia</p>
                </div>
                {data.precios.length > 0 && data.precios[0].disponible ? (
                  <div className="space-y-1">
                    {data.precios.slice(0, 2).map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-muted truncate max-w-[80px]">{p.codigo_producto ?? `Ítem ${i + 1}`}</span>
                        <span className="font-medium text-text">
                          {p.p50 != null ? `$${p.p50.toLocaleString('es-CL')}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into the tender detail page**

Open `frontend/app/dashboard/tenders/[codigo]/page.tsx`. Find where the existing `OpportunityScoreCard`, `PriceBandChart`, `CompetitorsList`, or `BuyerProfilePanel` are rendered (or the end of the main content section). Add the `BICard` import and render it.

Add the import at the top (after existing imports):
```tsx
import { BICard } from './components/BICard';
```

Find the section where `OpportunityScoreCard` is used (it receives `panel` and `plan` props) — or find the end of the main tender detail content. After the last existing section, add:

```tsx
{/* Inteligencia de mercado */}
<BICard
  codigoExterno={tender.codigo_externo}
  empresaId={empresa?.id}
  plan={(user?.plan_tier ?? 'basico') as PlanTier}
/>
```

> Note: `empresa` comes from the existing companies/empresas state in the page. Look for `getEmpresas()` call in the tender detail page — it likely has an `empresas` array. Use `empresas?.[0]?.id`. If `TenderDetail` page doesn't load empresas, add the load pattern from `bi/page.tsx` init.

- [ ] **Step 3: Check imports compile**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors (typically: missing fields in the `BIPanelData` interface that don't match what the API actually returns — adjust field names to match the `CompradorPanel`, `VentanaPanel`, `CompetidoresPanel` interfaces already defined in `components/OpportunityScoreCard.tsx`).

- [ ] **Step 4: Verify** — Open a tender detail page (e.g., `http://localhost:3000/dashboard/tenders/XXXX-XX-LPXX`). The "Inteligencia de mercado" card should be collapsed at bottom, showing a 1-line summary. Paid users can expand it to see 4 mini-cards.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/dashboard/tenders/[codigo]/components/BICard.tsx
git add frontend/app/dashboard/tenders/[codigo]/page.tsx
git commit -m "feat(bi): add BICard to tender detail page using composite getBIPanel endpoint"
```

---

## Self-Review Against Spec

### Spec coverage check:
- [x] Global filter bar — dropdown of empresa's rubros → `RubroFilter.tsx` (Task 3)
- [x] Free plan locked to first rubro → `RubroFilter` `locked` prop + `PlanGate` (Task 2)
- [x] § 1 Oportunidades — KPI cards + table + row expand → `OportunidadesSection.tsx` (Task 4)
- [x] "VOLUMEN CREADO RELEVANTE" → "Transacciones históricas" → Task 4 table headers
- [x] § 2 Tendencias — horizontal bar chart, "Crecimiento anual (%)" label, tooltip explaining the concept → `TendenciasSection.tsx` (Task 5)
- [x] No "CAGR" jargon visible without explanation → tooltip text provided (Task 5)
- [x] § 3 Competencia — scatter chart + organismo dropdown → `CompetenciaSection.tsx` (Task 6)
- [x] "Radar de Competencia" → "Competencia", renamed axes → Task 6
- [x] § 4 Compradores — collapsible cards, risk flags with tooltips, descuentos expandable → `CompradoresSection.tsx` (Task 7)
- [x] "Analizar" button broken → removed; data loads automatically → Task 9 (page rewrite, no Analizar button)
- [x] § 5 Estacionalidad — line + confidence band, auto-annotation → `EstacionalidadSection.tsx` (Task 8)
- [x] Sections 3-5 blurred for basico → `PlanGate` wraps each (Task 9)
- [x] Tender detail BI card — collapsed summary + 4 mini-cards on expand → `BICard.tsx` (Task 10)
- [x] Free plan sees summary only on tender detail → `BICard` checks `paid` (Task 10)
- [x] "Calibrar Radar Semántico" moved to "Editar mis rubros" modal → `RubroFilter` modal (Task 3)
- [x] "Ventana de Presión" moved to tender detail → `BICard` ventana card (Task 10)
- [x] Hardcoded organismo '7485' removed → auto-selects from oportunidades (Task 9)
- [x] File decomposition into 8 components → Tasks 2-8, 10
- [x] No backend changes → confirmed, all tasks are frontend-only

### Placeholder scan: None found.

### Type consistency check:
- `OportunidadItem`, `TendenciaItem`, `CompetidorItem`, `CompradorResult`, `EstacionalidadMes`, `ClusterItem`, `TFIDFPerfilData`, `PlanTier`, `MESES`, `scoreColor`, `scoreBg`, `isPaidPlan` — all defined in `types.ts` (Task 1) and imported consistently across Tasks 3-10.
- `BIPanelData` in `BICard.tsx` — separate interface since the `/panel` endpoint returns a different shape than the individual endpoints. Cross-referenced with `OpportunityScoreCard.tsx` which has `BIPanel` type — field names checked for consistency.
