# Landing Mockups Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3 generic landing mockups with 3 new rotating mockups that demonstrate TORDO's three core competitive advantages (precio justo, score de oportunidad, matching semántico), plus update hero copy and benefits bullets.

**Architecture:** Extract `BrowserChrome` and the 3 new mockup components into `frontend/components/landing/` to keep `page.tsx` readable (~900 lines). A shared `useRotatingExample` hook handles auto-rotation, hover-pause, IntersectionObserver activation, and `prefers-reduced-motion` compliance. Each mockup carries its own hardcoded data array.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Lucide React v0.294+. No new dependencies.

---

## File Structure

```
frontend/
├── components/
│   └── landing/                          ← NEW directory
│       ├── BrowserChrome.tsx             ← EXTRACTED from page.tsx
│       ├── useRotatingExample.ts         ← NEW hook
│       ├── MockupPrecio.tsx              ← NEW (replaces MockupBIPanel)
│       ├── MockupScore.tsx               ← NEW (replaces MockupDashboard)
│       └── MockupMatching.tsx            ← NEW (replaces MockupPostulaciones)
├── app/
│   └── page.tsx                          ← MODIFY (hero, tabs, benefits, imports)
└── tailwind.config.js                    ← NO CHANGES (animate-fade-in already exists)
```

**Why extract:** `page.tsx` is currently 804 lines. Adding 3 full mockup components inline would push it to ~1100 lines. Extracting keeps each file focused.

---

## Task 1: Extract BrowserChrome into landing components directory

**Files:**
- Create: `frontend/components/landing/BrowserChrome.tsx`
- Modify: `frontend/app/page.tsx` (remove local definition, add import)

- [ ] **Step 1: Create the landing components directory and BrowserChrome component**

Create `frontend/components/landing/BrowserChrome.tsx` with this exact content:

```tsx
// frontend/components/landing/BrowserChrome.tsx

export function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-[#1A1F2C] bg-[#0A0C10] shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0F1117] border-b border-[#1A1F2C]">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F85149]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#00C896]/80" />
        </div>
        <div className="ml-2 flex-1 rounded-md bg-[#0A0C10] border border-[#1A1F2C] px-3 py-1 text-[10px] text-[#94A3B8] font-mono truncate">
          {url}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Update page.tsx — replace local BrowserChrome with import**

In `frontend/app/page.tsx`, find the local `BrowserChrome` function definition (lines ~179-195) and replace it with an import at the top of the file:

```tsx
// Add this import near the top of page.tsx (after existing imports):
import { BrowserChrome } from '@/components/landing/BrowserChrome';
```

Then delete the local `BrowserChrome` function definition (the entire block from `function BrowserChrome(` to its closing `}`).

- [ ] **Step 3: Verify lint passes**

Run from `frontend/`:
```bash
npm run lint
```
Expected: 0 errors. If lint complains about `React` not being imported in `BrowserChrome.tsx`, add `import React from 'react';` at the top (Next.js 14 usually doesn't require it, but if lint flags it, add it).

- [ ] **Step 4: Commit**

```bash
git add frontend/components/landing/BrowserChrome.tsx frontend/app/page.tsx
git commit -m "refactor: extract BrowserChrome to frontend/components/landing/"
```

---

## Task 2: Create `useRotatingExample` hook

**Files:**
- Create: `frontend/components/landing/useRotatingExample.ts`

This hook manages per-mockup rotation: auto-advance with interval, pause on hover, start only when visible in viewport (IntersectionObserver), no autoplay on mobile/touch, and respects `prefers-reduced-motion`.

- [ ] **Step 1: Create the hook**

Create `frontend/components/landing/useRotatingExample.ts`:

```ts
// frontend/components/landing/useRotatingExample.ts
import { useState, useEffect, useRef, useCallback } from 'react';

interface Options {
  count: number;
  intervalMs: number;
}

interface Result {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
}

export function useRotatingExample({ count, intervalMs }: Options): Result {
  const [activeIndex, setActiveIndexState] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Detect touch/mobile (no hover = no autoplay)
  useEffect(() => {
    setIsMobile(window.matchMedia('(hover: none)').matches);
  }, []);

  // IntersectionObserver: start rotating when mockup enters viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-rotation timer
  useEffect(() => {
    if (!isVisible || isPaused || reducedMotion || isMobile) return;
    const timer = setInterval(() => {
      setActiveIndexState((prev) => (prev + 1) % count);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isVisible, isPaused, reducedMotion, isMobile, count, intervalMs, resetKey]);

  // Manual index setter: also resets the timer
  const setActiveIndex = useCallback((index: number) => {
    setActiveIndexState(index);
    setResetKey((k) => k + 1);
  }, []);

  const handleMouseEnter = useCallback(() => setIsPaused(true), []);
  const handleMouseLeave = useCallback(() => setIsPaused(false), []);

  return {
    activeIndex,
    setActiveIndex,
    containerRef,
    handleMouseEnter,
    handleMouseLeave,
  };
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd frontend && npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/landing/useRotatingExample.ts
git commit -m "feat: add useRotatingExample hook for landing mockup rotation"
```

---

## Task 3: Create `MockupPrecio` component

**Files:**
- Create: `frontend/components/landing/MockupPrecio.tsx`

This mockup shows "Cotiza con datos, no con suerte" — rotates through 6 product examples with mediana, range bar, simulator callout, 3 adjudications, and buyer insight footer.

- [ ] **Step 1: Create the component**

Create `frontend/components/landing/MockupPrecio.tsx`:

```tsx
// frontend/components/landing/MockupPrecio.tsx
'use client';

import { BrowserChrome } from './BrowserChrome';
import { useRotatingExample } from './useRotatingExample';

interface Adjudicacion {
  comprador: string;
  fecha: string;
  monto: string;
}

interface PrecioExample {
  producto: string;
  unidad: string;
  mediana: string;
  medianaRaw: number;
  minStr: string;
  maxStr: string;
  minRaw: number;
  maxRaw: number;
  cotizacion: string;
  cotizacionRaw: number;
  target: string;
  tendencia: string;
  adjudicaciones: Adjudicacion[];
  insight: string;
}

const PRECIO_EXAMPLES: PrecioExample[] = [
  {
    producto: 'Servicio aseo terminal recinto salud',
    unidad: 'mes',
    mediana: '$2.8M',
    medianaRaw: 2_800_000,
    minStr: '$2.1M',
    maxStr: '$3.6M',
    minRaw: 2_100_000,
    maxRaw: 3_600_000,
    cotizacion: '$3.2M',
    cotizacionRaw: 3_200_000,
    target: '$2.9M',
    tendencia: '↑ 3%',
    adjudicaciones: [
      { comprador: 'Hospital San Juan de Dios', fecha: 'Nov 2025', monto: '$2.9M' },
      { comprador: 'CESFAM Peñalolén',          fecha: 'Oct 2025', monto: '$2.6M' },
      { comprador: 'Hospital Militar',           fecha: 'Sep 2025', monto: '$3.1M' },
    ],
    insight:
      'Este comprador adjudica típicamente en el rango medio. Puedes ganar sin ofrecer el precio más bajo.',
  },
  {
    producto: 'Notebook corporativo Intel i5',
    unidad: 'unidad',
    mediana: '$680.000',
    medianaRaw: 680_000,
    minStr: '$580K',
    maxStr: '$820K',
    minRaw: 580_000,
    maxRaw: 820_000,
    cotizacion: '$760.000',
    cotizacionRaw: 760_000,
    target: '$695.000',
    tendencia: '↓ 2%',
    adjudicaciones: [
      { comprador: 'Ministerio de Hacienda', fecha: 'Dic 2025', monto: '$640.000' },
      { comprador: 'SUBDERE',                fecha: 'Nov 2025', monto: '$695.000' },
      { comprador: 'Servicio Civil',          fecha: 'Oct 2025', monto: '$620.000' },
    ],
    insight:
      'Este comprador adjudica casi siempre cerca del precio mínimo. Conviene afilar la cotización al máximo.',
  },
  {
    producto: 'Resma papel carta 75g',
    unidad: 'unidad',
    mediana: '$2.450',
    medianaRaw: 2_450,
    minStr: '$2.100',
    maxStr: '$2.900',
    minRaw: 2_100,
    maxRaw: 2_900,
    cotizacion: '$2.700',
    cotizacionRaw: 2_700,
    target: '$2.500',
    tendencia: '↑ 1%',
    adjudicaciones: [
      { comprador: 'Municipalidad de La Florida', fecha: 'Ene 2026', monto: '$2.380' },
      { comprador: 'Mun. de Maipú',               fecha: 'Dic 2025', monto: '$2.420' },
      { comprador: 'Gob. Regional RM',             fecha: 'Nov 2025', monto: '$2.510' },
    ],
    insight:
      'Este comprador adjudica casi siempre al precio más bajo. Compite en costo o mira mejores licitaciones.',
  },
  {
    producto: 'Uniforme escolar kit básico',
    unidad: 'kit',
    mediana: '$18.000',
    medianaRaw: 18_000,
    minStr: '$15K',
    maxStr: '$22K',
    minRaw: 15_000,
    maxRaw: 22_000,
    cotizacion: '$20.000',
    cotizacionRaw: 20_000,
    target: '$18.500',
    tendencia: '↑ 5%',
    adjudicaciones: [
      { comprador: 'JUNAEB Región Metropolitana', fecha: 'Feb 2026', monto: '$17.800' },
      { comprador: 'Mun. de Pudahuel',             fecha: 'Ene 2026', monto: '$19.200' },
      { comprador: 'Mun. de San Bernardo',          fecha: 'Dic 2025', monto: '$18.500' },
    ],
    insight: 'Este comprador adjudica en un rango amplio. Hay margen para no ser el más barato.',
  },
  {
    producto: 'Reparación de veredas municipales',
    unidad: 'proyecto',
    mediana: '$12M',
    medianaRaw: 12_000_000,
    minStr: '$9M',
    maxStr: '$16M',
    minRaw: 9_000_000,
    maxRaw: 16_000_000,
    cotizacion: '$14M',
    cotizacionRaw: 14_000_000,
    target: '$12.5M',
    tendencia: '↑ 4%',
    adjudicaciones: [
      { comprador: 'SERVIU Región del Maule', fecha: 'Mar 2026', monto: '$11.8M' },
      { comprador: 'Mun. de Talca',            fecha: 'Feb 2026', monto: '$13.2M' },
      { comprador: 'Mun. de Curicó',           fecha: 'Ene 2026', monto: '$10.9M' },
    ],
    insight:
      'Este comprador adjudica en el rango alto. No tienes que ser el más barato para ganar acá.',
  },
  {
    producto: 'Suministro alimentación JUNAEB',
    unidad: 'ración',
    mediana: '$1.850',
    medianaRaw: 1_850,
    minStr: '$1.650',
    maxStr: '$2.200',
    minRaw: 1_650,
    maxRaw: 2_200,
    cotizacion: '$2.050',
    cotizacionRaw: 2_050,
    target: '$1.900',
    tendencia: '↑ 6%',
    adjudicaciones: [
      { comprador: 'JUNAEB Bío Bío',      fecha: 'Mar 2026', monto: '$1.780' },
      { comprador: 'JUNAEB La Araucanía', fecha: 'Feb 2026', monto: '$1.920' },
      { comprador: 'JUNAEB Valparaíso',   fecha: 'Ene 2026', monto: '$1.840' },
    ],
    insight:
      'Este comprador adjudica típicamente en el rango medio-alto. No bajes al mínimo solo por ganar.',
  },
];

export function MockupPrecio() {
  const { activeIndex, setActiveIndex, containerRef, handleMouseEnter, handleMouseLeave } =
    useRotatingExample({ count: PRECIO_EXAMPLES.length, intervalMs: 5000 });
  const ex = PRECIO_EXAMPLES[activeIndex];
  const range = ex.maxRaw - ex.minRaw;
  const medianPct = (((ex.medianaRaw - ex.minRaw) / range) * 100).toFixed(1);
  const quotePct = (((ex.cotizacionRaw - ex.minRaw) / range) * 100).toFixed(1);
  const trendUp = ex.tendencia.startsWith('↑');

  return (
    <div ref={containerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Ejemplo ${activeIndex + 1} de ${PRECIO_EXAMPLES.length}: ${ex.producto}`}
      </div>

      <BrowserChrome url="tordo.cl/dashboard/bi">
        <div key={activeIndex} className="animate-fade-in">
          {/* Header */}
          <p className="text-[10px] text-[#94A3B8] mb-1 truncate">{ex.producto}</p>

          {/* Mediana XL + tendencia */}
          <div className="flex items-baseline gap-2 mb-0.5">
            <span
              className="text-2xl font-bold text-[#E2E8F0]"
              style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
            >
              {ex.mediana}
            </span>
            <span className="text-[9px] text-[#94A3B8]">/ {ex.unidad}</span>
            <span
              className={`ml-auto text-[9px] font-semibold ${trendUp ? 'text-[#00C896]' : 'text-[#F85149]'}`}
            >
              {ex.tendencia} vs hace 12 m.
            </span>
          </div>
          <p className="text-[8px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">
            Mediana de adjudicación
          </p>

          {/* Range bar */}
          <div className="relative h-1.5 bg-[#1A1F2C] rounded-full mb-1">
            {/* Mediana marker (green) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[#00C896] border-2 border-[#0A0C10]"
              style={{ left: `${medianPct}%` }}
            />
            {/* Cotización marker (yellow) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[#F59E0B] border-2 border-[#0A0C10]"
              style={{ left: `${quotePct}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-[#94A3B8] mb-3">
            <span>{ex.minStr} Mín</span>
            <span className="text-[#00C896]">{ex.mediana} Med.</span>
            <span className="text-[#F59E0B]">{ex.cotizacion} Tu cot.</span>
            <span>{ex.maxStr} Máx</span>
          </div>

          {/* Callout simulador */}
          <div className="rounded-lg bg-[#0EAD69]/10 border border-[#0EAD69]/20 px-3 py-2 mb-3">
            <p className="text-[10px] text-[#E2E8F0] leading-relaxed">
              💡 Tu cotización de <strong>{ex.cotizacion}</strong> está sobre 3 de cada 4
              adjudicaciones. Si bajas a <strong>{ex.target}</strong>, te acercas al precio que
              suele ganar.
            </p>
          </div>

          {/* Tabla adjudicaciones */}
          <div className="rounded-lg bg-[#0F1117] border border-[#1A1F2C] overflow-hidden mb-2">
            <div className="grid grid-cols-[1.8fr_0.9fr_0.8fr] px-3 py-1.5 text-[8px] font-semibold text-[#94A3B8] uppercase tracking-wider border-b border-[#1A1F2C]">
              <span>Comprador</span>
              <span>Fecha</span>
              <span>Monto</span>
            </div>
            {ex.adjudicaciones.map((adj, i) => (
              <div
                key={i}
                className={`grid grid-cols-[1.8fr_0.9fr_0.8fr] px-3 py-1.5 items-center ${
                  i < ex.adjudicaciones.length - 1 ? 'border-b border-[#1A1F2C]' : ''
                }`}
              >
                <span className="text-[9px] text-[#E2E8F0] truncate">{adj.comprador}</span>
                <span className="text-[8px] text-[#94A3B8]">{adj.fecha}</span>
                <span className="text-[9px] font-semibold text-[#00C896]">{adj.monto}</span>
              </div>
            ))}
          </div>

          {/* Footer insight */}
          <p className="text-[9px] text-[#94A3B8] leading-relaxed">📌 {ex.insight}</p>
        </div>
      </BrowserChrome>

      {/* Dots navigation */}
      <div
        className="flex justify-center gap-1.5 mt-3"
        role="tablist"
        aria-label="Ejemplos de análisis de precio"
      >
        {PRECIO_EXAMPLES.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Ejemplo ${i + 1}: ${PRECIO_EXAMPLES[i].producto}`}
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0EAD69] ${
              i === activeIndex ? 'w-4 bg-[#0EAD69]' : 'w-1.5 bg-[#94A3B8]/40 hover:bg-[#94A3B8]'
            }`}
          />
        ))}
      </div>

      {/* Mobile arrows (hidden on md+) */}
      <div className="flex justify-center items-center gap-4 mt-2 md:hidden">
        <button
          onClick={() =>
            setActiveIndex((activeIndex - 1 + PRECIO_EXAMPLES.length) % PRECIO_EXAMPLES.length)
          }
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Ejemplo anterior"
        >
          ‹
        </button>
        <span className="text-[10px] text-[#94A3B8]">
          {activeIndex + 1} / {PRECIO_EXAMPLES.length}
        </span>
        <button
          onClick={() => setActiveIndex((activeIndex + 1) % PRECIO_EXAMPLES.length)}
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Siguiente ejemplo"
        >
          ›
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd frontend && npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/landing/MockupPrecio.tsx
git commit -m "feat: add MockupPrecio component for landing (cotiza con datos, no con suerte)"
```

---

## Task 4: Create `MockupScore` component

**Files:**
- Create: `frontend/components/landing/MockupScore.tsx`

This mockup shows "Postula donde tienes chance real" — 3 licitaciones rotativas with score, 4-component breakdown bars, and insight.

- [ ] **Step 1: Create the component**

Create `frontend/components/landing/MockupScore.tsx`:

```tsx
// frontend/components/landing/MockupScore.tsx
'use client';

import { BrowserChrome } from './BrowserChrome';
import { useRotatingExample } from './useRotatingExample';

interface ScoreComponent {
  label: string;
  value: number; // 1-10
}

interface ScoreExample {
  licitacion: string;
  comprador: string;
  monto: string;
  diasCierre: number;
  score: number;
  verdict: string;
  components: ScoreComponent[];
  insight: string;
}

const SCORE_EXAMPLES: ScoreExample[] = [
  {
    licitacion: 'Suministro aseo terminal',
    comprador: 'Hospital San Juan de Dios',
    monto: '$4.8M',
    diasCierre: 14,
    score: 82,
    verdict: 'Postula ya',
    components: [
      { label: 'Rango de precio saludable', value: 9 },
      { label: 'Calce con tu rubro',        value: 8 },
      { label: 'Calidad del comprador',     value: 8 },
      { label: 'Plazo de preparación',      value: 7 },
    ],
    insight: 'Ganaste 2 licitaciones similares en los últimos 12 meses.',
  },
  {
    licitacion: 'Resmas papel y toners',
    comprador: 'Municipalidad de La Florida',
    monto: '$1.2M',
    diasCierre: 8,
    score: 58,
    verdict: 'Evaluar',
    components: [
      { label: 'Rango de precio saludable', value: 6 },
      { label: 'Calce con tu rubro',        value: 7 },
      { label: 'Calidad del comprador',     value: 5 },
      { label: 'Plazo de preparación',      value: 4 },
    ],
    insight: 'Este comprador adjudicó 4 contratos similares en el último año.',
  },
  {
    licitacion: 'Reparación de veredas',
    comprador: 'SERVIU Región del Maule',
    monto: '$11.2M',
    diasCierre: 5,
    score: 24,
    verdict: 'Prioridad baja',
    components: [
      { label: 'Rango de precio saludable', value: 3 },
      { label: 'Calce con tu rubro',        value: 2 },
      { label: 'Calidad del comprador',     value: 6 },
      { label: 'Plazo de preparación',      value: 2 },
    ],
    insight: 'Solo 1 de cada 3 licitaciones de este tipo se adjudican.',
  },
];

function scoreColor(score: number): string {
  if (score >= 70) return '#00C896';
  if (score >= 40) return '#F59E0B';
  return '#F85149';
}

export function MockupScore() {
  const { activeIndex, setActiveIndex, containerRef, handleMouseEnter, handleMouseLeave } =
    useRotatingExample({ count: SCORE_EXAMPLES.length, intervalMs: 6000 });
  const ex = SCORE_EXAMPLES[activeIndex];
  const color = scoreColor(ex.score);

  return (
    <div ref={containerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Ejemplo ${activeIndex + 1} de ${SCORE_EXAMPLES.length}: ${ex.licitacion}, score ${ex.score}`}
      </div>

      <BrowserChrome url="tordo.cl/dashboard/bi">
        <div key={activeIndex} className="animate-fade-in">
          {/* Header: licitación title */}
          <p className="text-[11px] font-semibold text-[#E2E8F0] mb-0.5 truncate">
            {ex.licitacion}
          </p>
          {/* Meta-info */}
          <div className="flex items-center gap-2 text-[8px] text-[#94A3B8] mb-3">
            <span className="truncate">{ex.comprador}</span>
            <span>·</span>
            <span>{ex.monto}</span>
            <span>·</span>
            <span className="text-[#F59E0B]">Cierra en {ex.diasCierre}d</span>
          </div>

          {/* Score XL + verdict */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border-2"
              style={{
                borderColor: color,
                background: `${color}18`,
              }}
            >
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color, fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                {ex.score}
              </span>
            </div>
            <div>
              <p className="text-[8px] text-[#94A3B8] uppercase tracking-wider">Score</p>
              <p
                className="text-sm font-bold"
                style={{ color, fontFamily: 'var(--font-outfit, system-ui)' }}
              >
                {ex.verdict}
              </p>
            </div>
          </div>

          {/* Component breakdown bars */}
          <div className="space-y-2 mb-3">
            {ex.components.map((comp) => (
              <div key={comp.label} className="flex items-center gap-2">
                <span className="w-[120px] flex-shrink-0 text-[9px] text-[#94A3B8] truncate">
                  {comp.label}
                </span>
                <div className="flex-1 h-1.5 bg-[#1A1F2C] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${comp.value * 10}%`,
                      background: `linear-gradient(90deg, ${color}88, ${color})`,
                    }}
                  />
                </div>
                <span
                  className="w-6 text-right text-[9px] font-semibold tabular-nums"
                  style={{ color }}
                >
                  {comp.value}/10
                </span>
              </div>
            ))}
          </div>

          {/* Insight */}
          <div className="rounded-lg bg-[#0F1117] border border-[#1A1F2C] px-3 py-2">
            <p className="text-[10px] text-[#E2E8F0]">💡 {ex.insight}</p>
          </div>
        </div>
      </BrowserChrome>

      {/* Dots navigation */}
      <div
        className="flex justify-center gap-1.5 mt-3"
        role="tablist"
        aria-label="Ejemplos de score de oportunidad"
      >
        {SCORE_EXAMPLES.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Ejemplo ${i + 1}: ${SCORE_EXAMPLES[i].licitacion}`}
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0EAD69] ${
              i === activeIndex ? 'w-4 bg-[#0EAD69]' : 'w-1.5 bg-[#94A3B8]/40 hover:bg-[#94A3B8]'
            }`}
          />
        ))}
      </div>

      {/* Mobile arrows */}
      <div className="flex justify-center items-center gap-4 mt-2 md:hidden">
        <button
          onClick={() =>
            setActiveIndex((activeIndex - 1 + SCORE_EXAMPLES.length) % SCORE_EXAMPLES.length)
          }
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Ejemplo anterior"
        >
          ‹
        </button>
        <span className="text-[10px] text-[#94A3B8]">
          {activeIndex + 1} / {SCORE_EXAMPLES.length}
        </span>
        <button
          onClick={() => setActiveIndex((activeIndex + 1) % SCORE_EXAMPLES.length)}
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Siguiente ejemplo"
        >
          ›
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd frontend && npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/landing/MockupScore.tsx
git commit -m "feat: add MockupScore component for landing (postula donde tienes chance real)"
```

---

## Task 5: Create `MockupMatching` component

**Files:**
- Create: `frontend/components/landing/MockupMatching.tsx`

This mockup shows "Deja de perder licitaciones por una palabra" — 4 rotative examples showing a search rubro and 3 semantically-matched licitaciones with calce % badges.

- [ ] **Step 1: Create the component**

Create `frontend/components/landing/MockupMatching.tsx`:

```tsx
// frontend/components/landing/MockupMatching.tsx
'use client';

import { Search } from 'lucide-react';
import { BrowserChrome } from './BrowserChrome';
import { useRotatingExample } from './useRotatingExample';

interface MatchResult {
  titulo: string;
  comprador: string;
  monto: string;
  diasCierre: number;
  calce: number; // 70-100
}

interface MatchingExample {
  rubro: string;
  resultados: MatchResult[];
  insight: string;
}

const MATCHING_EXAMPLES: MatchingExample[] = [
  {
    rubro: 'Limpieza hospitalaria',
    resultados: [
      { titulo: 'Aseo terminal recinto salud',      comprador: 'Hospital Metropolitano', monto: '$3.2M', diasCierre: 12, calce: 96 },
      { titulo: 'Sanitización áreas UCI',           comprador: 'Clínica Familiar Ñuñoa', monto: '$1.8M', diasCierre: 8,  calce: 89 },
      { titulo: 'Desinfección clínica ambulatoria', comprador: 'CESFAM Peñalolén',       monto: '$960K', diasCierre: 20, calce: 82 },
    ],
    insight: 'Con una búsqueda por palabras exactas, habrías visto 1 de estas 3 licitaciones.',
  },
  {
    rubro: 'Computadores corporativos',
    resultados: [
      { titulo: "Notebook 14'' Intel i5",               comprador: 'Ministerio de Hacienda', monto: '$2.1M', diasCierre: 9,  calce: 94 },
      { titulo: 'Laptop ejecutivo empresarial',          comprador: 'CORFO',                  monto: '$1.4M', diasCierre: 15, calce: 87 },
      { titulo: 'Equipo portátil usuarios funcionarios', comprador: 'SII',                    monto: '$3.8M', diasCierre: 7,  calce: 78 },
    ],
    insight: "Con una búsqueda por 'computadores', te habrías perdido el 67% de estas.",
  },
  {
    rubro: 'Papelería oficina',
    resultados: [
      { titulo: 'Resmas papel 75g',                  comprador: 'Mun. de La Florida',     monto: '$480K', diasCierre: 6,  calce: 92 },
      { titulo: 'Insumos escritorio administrativo', comprador: 'Gob. Regional RM',        monto: '$720K', diasCierre: 11, calce: 84 },
      { titulo: 'Suministros oficina ministerio',     comprador: 'Ministerio de Economía', monto: '$1.1M', diasCierre: 18, calce: 76 },
    ],
    insight: "Solo la primera aparecería si buscas 'resmas'. Las otras 2 pasan desapercibidas.",
  },
  {
    rubro: 'Construcción vial menor',
    resultados: [
      { titulo: 'Reparación veredas comuna',   comprador: 'Mun. de Talca',  monto: '$8.4M', diasCierre: 22, calce: 91 },
      { titulo: 'Bacheo calles urbanas',        comprador: 'SERVIU Maule',   monto: '$12M',  diasCierre: 14, calce: 85 },
      { titulo: 'Reposición aceras peatonales', comprador: 'Mun. de Curicó', monto: '$5.2M', diasCierre: 30, calce: 80 },
    ],
    insight: "Buscando 'veredas' te pierdes 'bacheo' y 'aceras' — 2 de 3 oportunidades.",
  },
];

function calceColor(pct: number): string {
  if (pct >= 90) return '#00C896';
  if (pct >= 80) return '#00C896BB';
  return '#00C89688';
}

export function MockupMatching() {
  const { activeIndex, setActiveIndex, containerRef, handleMouseEnter, handleMouseLeave } =
    useRotatingExample({ count: MATCHING_EXAMPLES.length, intervalMs: 5000 });
  const ex = MATCHING_EXAMPLES[activeIndex];

  return (
    <div ref={containerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Ejemplo ${activeIndex + 1} de ${MATCHING_EXAMPLES.length}: rubro ${ex.rubro}`}
      </div>

      <BrowserChrome url="tordo.cl/dashboard/tenders">
        <div key={activeIndex} className="animate-fade-in">
          {/* Search bar */}
          <div className="flex items-center gap-2 rounded-lg bg-[#0F1117] border border-[#1A1F2C] px-3 py-2 mb-1">
            <Search className="h-3 w-3 flex-shrink-0 text-[#94A3B8]" />
            <span className="text-[11px] text-[#E2E8F0] font-medium">{ex.rubro}</span>
          </div>
          <p className="text-[9px] text-[#94A3B8] mb-3">
            {ex.resultados.length} licitaciones que calzan con lo que vendes:
          </p>

          {/* Result cards */}
          <div className="space-y-2 mb-3">
            {ex.resultados.map((r, i) => (
              <div
                key={i}
                className="relative rounded-lg bg-[#0F1117] border border-[#1A1F2C] px-3 py-2"
              >
                {/* Calce badge */}
                <span
                  className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-[#0A0C10]"
                  style={{ background: calceColor(r.calce) }}
                >
                  {r.calce}%
                </span>
                <p className="text-[10px] font-semibold text-[#E2E8F0] pr-10 mb-0.5 truncate">
                  {r.titulo}
                </p>
                <div className="flex items-center gap-2 text-[8px] text-[#94A3B8]">
                  <span className="truncate">{r.comprador}</span>
                  <span>·</span>
                  <span>{r.monto}</span>
                  <span>·</span>
                  <span className="text-[#F59E0B] flex-shrink-0">{r.diasCierre}d</span>
                </div>
              </div>
            ))}
          </div>

          {/* Insight */}
          <div className="rounded-lg bg-[#0EAD69]/10 border border-[#0EAD69]/20 px-3 py-2">
            <p className="text-[10px] text-[#E2E8F0]">💡 {ex.insight}</p>
          </div>
        </div>
      </BrowserChrome>

      {/* Dots navigation */}
      <div
        className="flex justify-center gap-1.5 mt-3"
        role="tablist"
        aria-label="Ejemplos de matching semántico"
      >
        {MATCHING_EXAMPLES.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Ejemplo ${i + 1}: ${MATCHING_EXAMPLES[i].rubro}`}
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0EAD69] ${
              i === activeIndex ? 'w-4 bg-[#0EAD69]' : 'w-1.5 bg-[#94A3B8]/40 hover:bg-[#94A3B8]'
            }`}
          />
        ))}
      </div>

      {/* Mobile arrows */}
      <div className="flex justify-center items-center gap-4 mt-2 md:hidden">
        <button
          onClick={() =>
            setActiveIndex(
              (activeIndex - 1 + MATCHING_EXAMPLES.length) % MATCHING_EXAMPLES.length,
            )
          }
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Ejemplo anterior"
        >
          ‹
        </button>
        <span className="text-[10px] text-[#94A3B8]">
          {activeIndex + 1} / {MATCHING_EXAMPLES.length}
        </span>
        <button
          onClick={() => setActiveIndex((activeIndex + 1) % MATCHING_EXAMPLES.length)}
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Siguiente ejemplo"
        >
          ›
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd frontend && npm run lint
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/landing/MockupMatching.tsx
git commit -m "feat: add MockupMatching component for landing (deja de perder licitaciones por una palabra)"
```

---

## Task 6: Update `page.tsx` — hero section

**Files:**
- Modify: `frontend/app/page.tsx` (lines ~430-480)

Two hero changes: (a) replace subtitle text, (b) add trust line after CTA buttons, (c) replace `MockupBIPanel` with `MockupPrecio` in the hero right column.

- [ ] **Step 1: Update imports in page.tsx**

At the top of `frontend/app/page.tsx`, add imports for the new components and remove the old mockup functions (they'll be deleted in Task 7). For now, just add imports without deleting:

```tsx
// Add after existing imports, before the DATA section comment:
import { MockupPrecio } from '@/components/landing/MockupPrecio';
import { MockupScore } from '@/components/landing/MockupScore';
import { MockupMatching } from '@/components/landing/MockupMatching';
```

- [ ] **Step 2: Replace the hero subtitle paragraph**

Find this exact text in the hero section (around line 438):
```tsx
<p className="mb-8 max-w-xl text-lg text-white/65 leading-relaxed">
  Precios históricos, mapa de competidores y checklist de documentos — todo lo que necesitas para decidir si conviene postular, antes de invertir tiempo.
</p>
```

Replace with:
```tsx
<p className="mb-8 max-w-xl text-lg text-white/65 leading-relaxed">
  Sabes a qué precio cotizar, cuáles licitaciones valen la pena postular y qué nuevas calzan con lo que vende tu empresa — sin adivinar.
</p>
```

- [ ] **Step 3: Add trust line after CTA buttons**

Find the closing `</div>` of the CTA flex container (the `div` that wraps the two `<Link>` CTAs, around line 454). Add the trust line immediately after it:

```tsx
              </div>{/* end CTA div */}

              {/* Trust line */}
              <p className="text-xs text-white/35">
                Datos públicos de ChileCompra · Sin tarjeta · Cancelas cuando quieras
              </p>
```

**Note:** The trust line replaces the existing `{/* Stats */}` section or goes between the CTA div and the stats. Look at the code: the CTA div ends, then comes the stats grid. The trust line should go between CTA and stats. Inspect lines 446-468 carefully and insert the trust line `<p>` immediately after the closing `</div>` of the CTA flex container (line ~454), before the stats grid div.

- [ ] **Step 4: Replace MockupBIPanel with MockupPrecio in the hero right column**

Find the hero right column (around line 472):
```tsx
<MockupBIPanel />
```

Replace with:
```tsx
<MockupPrecio />
```

The `animate-float` class and `boxShadow` style on the wrapping div stay as-is.

- [ ] **Step 5: Verify lint passes**

```bash
cd frontend && npm run lint
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat: update hero — new subtitle, trust line, and MockupPrecio in hero column"
```

---

## Task 7: Update `page.tsx` — product demo section

**Files:**
- Modify: `frontend/app/page.tsx` (lines ~330-600)

Update the product tabs labels and replace the three conditional mockup renders. Also delete the now-unused old mockup function definitions.

- [ ] **Step 1: Update productTabs array**

Find (around line 331):
```tsx
const productTabs = [
  { id: 'bi', label: 'Inteligencia BI' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'postulaciones', label: 'Postulaciones' },
] as const;

type TabId = (typeof productTabs)[number]['id'];
```

Replace with:
```tsx
const productTabs = [
  { id: 'precio', label: 'Precio de mercado' },
  { id: 'score', label: 'Score de oportunidad' },
  { id: 'matching', label: 'Matching semántico' },
] as const;

type TabId = (typeof productTabs)[number]['id'];
```

- [ ] **Step 2: Update useState initial value for activeTab**

Find (around line 344):
```tsx
const [activeTab, setActiveTab] = useState<TabId>('bi');
```

Replace with:
```tsx
const [activeTab, setActiveTab] = useState<TabId>('precio');
```

- [ ] **Step 3: Update the conditional mockup rendering in the product demo section**

Find (around line 588):
```tsx
{activeTab === 'bi' && <MockupBIPanel />}
{activeTab === 'dashboard' && <MockupDashboard />}
{activeTab === 'postulaciones' && <MockupPostulaciones />}
```

Replace with:
```tsx
{activeTab === 'precio' && <MockupPrecio />}
{activeTab === 'score' && <MockupScore />}
{activeTab === 'matching' && <MockupMatching />}
```

- [ ] **Step 4: Delete the old mockup function definitions**

Delete the three function bodies in their entirety (they are no longer used):
- `function MockupBIPanel()` — lines ~197-240
- `function MockupDashboard()` — lines ~242-280
- `function MockupPostulaciones()` — lines ~282-325

Delete them completely (from `function MockupXxx()` through to the closing `}`).

Also delete the import of `Users` from `lucide-react` if it is no longer used (check before deleting — `Users` was only in the benefits section which Task 8 will replace with `Sparkles`). Leave this for Task 8.

- [ ] **Step 5: Verify lint passes**

```bash
cd frontend && npm run lint
```
Expected: 0 errors. If TypeScript complains about `TabId` types, ensure the `useState` initial value matches the new tab IDs.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat: update product demo section with new rotating mockup tabs"
```

---

## Task 8: Update `page.tsx` — benefits section + imports cleanup

**Files:**
- Modify: `frontend/app/page.tsx` (lines ~1-20 imports, ~485-560 benefits section)

Rewrite the 6 benefit bullets per the spec (§9.1 BI + §9.2 Compliance). Update lucide-react imports accordingly.

- [ ] **Step 1: Update lucide-react imports**

Find the existing lucide-react import line at the top of `page.tsx`:
```tsx
import {
  BarChart3,
  CheckCircle2,
  ShieldCheck,
  Bell,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Target,
  Users,
  DollarSign,
} from 'lucide-react';
```

Replace with:
```tsx
import {
  CheckCircle2,
  Bell,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Target,
  DollarSign,
  Sparkles,
  FileClock,
  Search,
} from 'lucide-react';
```

**Removed:** `BarChart3` (unused), `ShieldCheck` (replaced by FileClock), `Users` (replaced by Sparkles).
**Added:** `Sparkles` (matching semántico), `FileClock` (documento vencido), `Search` (already used in MockupMatching but also used in hero if applicable — if not used in page.tsx, skip it).

**Note on `Search`:** `MockupMatching` imports `Search` directly from `lucide-react` inside its own file. `page.tsx` does NOT need `Search` unless it's used elsewhere in `page.tsx`. Remove `Search` from this import if it's not used in `page.tsx` itself (it's imported inside `MockupMatching.tsx`, not here).

Corrected final import:
```tsx
import {
  CheckCircle2,
  Bell,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
  Target,
  DollarSign,
  Sparkles,
  FileClock,
} from 'lucide-react';
```

- [ ] **Step 2: Update BI benefits bullets**

Find the BI benefits array (around lines 508-512):
```tsx
{ icon: DollarSign, title: 'Rangos de precio reales', desc: '¿A cuánto se ha adjudicado este tipo de producto? Dato concreto para calibrar tu oferta.' },
{ icon: Users, title: 'Mapa de competidores', desc: 'Cuántos proveedores compiten en tu rubro y quiénes ganan más seguido.' },
{ icon: Target, title: 'Score de oportunidad', desc: 'Un puntaje que resume si la licitación calza con tu perfil y vale la pena el esfuerzo.' },
```

Replace with:
```tsx
{ icon: DollarSign, title: 'Precio de mercado', desc: 'Mediana y rango de adjudicación de los productos que vendes.' },
{ icon: Target, title: 'Score de oportunidad', desc: 'Qué licitaciones valen tu tiempo, ordenadas.' },
{ icon: Sparkles, title: 'Matching semántico', desc: 'Detectamos licitaciones afines aunque usen otras palabras.' },
```

- [ ] **Step 3: Update Compliance benefits bullets**

Find the compliance benefits array (around lines 537-541):
```tsx
{ icon: CheckCircle2, title: 'Checklist de documentos', desc: 'Qué documentos necesitas según el tipo de licitación. Sin adivinar.' },
{ icon: ShieldCheck, title: 'Monitor de estado hábil', desc: 'Revisión diaria automática. Si tu habilitación cambia, te avisa de inmediato.' },
{ icon: Bell, title: 'Alertas de plazo', desc: 'Notificaciones 48h y 24h antes del cierre. Filtradas por rubro y región.' },
```

Replace with:
```tsx
{ icon: Bell, title: 'Alertas cuando aparece algo que te conviene', desc: 'Te avisamos por correo o WhatsApp cuando hay nuevas licitaciones u órdenes de compra que hacen match con tu perfil, y también 48h y 24h antes del cierre.' },
{ icon: CheckCircle2, title: 'Papeles al día sin adivinar', desc: 'Plantilla de documentos según el tipo de licitación (L1, LE, LP). Así no revisas Bases de 40 páginas para saber qué declaraciones pedir.' },
{ icon: FileClock, title: 'No pierdas postulaciones por un documento vencido', desc: 'Te avisamos cuando un certificado, garantía o boleta está próximo a vencer. Renuevas a tiempo y no te descartan por papel caducado.' },
```

- [ ] **Step 4: Verify lint passes — 0 errors, 0 unused variables**

```bash
cd frontend && npm run lint
```
Expected: 0 errors. Pay special attention to TypeScript errors about `FileClock` or `Sparkles` not being found — if they don't exist in lucide-react v0.294, use `Clock` for `FileClock` and `Zap` for `Sparkles` as fallbacks. Check by running:
```bash
node -e "const l = require('./node_modules/lucide-react'); console.log('FileClock:', !!l.FileClock, 'Sparkles:', !!l.Sparkles);"
```
If either returns `false`, substitute: `FileClock` → `Clock`, `Sparkles` → `Zap`.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat: update benefits bullets (BI aligned with A/B/C, compliance with WhatsApp + FileClock)"
```

---

## Task 9: Build verification + icon check

**Files:**
- No code changes in this task — verification only.

- [ ] **Step 1: Check icon availability**

From `frontend/`:
```bash
node -e "const l = require('./node_modules/lucide-react'); console.log('FileClock:', !!l.FileClock, 'Sparkles:', !!l.Sparkles);"
```
Expected output: `FileClock: true Sparkles: true`

If either is `false`, go back to Task 8 Step 4 and apply the fallback substitutions, then re-run lint.

- [ ] **Step 2: Run full lint**

```bash
cd frontend && npm run lint
```
Expected: `✔ No ESLint warnings or errors` (or 0 errors if warnings exist from pre-existing code).

- [ ] **Step 3: Run production build**

```bash
cd frontend && npm run build
```
Expected: Build completes successfully. No new TypeScript errors or warnings introduced by this work. If there are pre-existing warnings, they should match what existed before this feature branch.

If build fails with a TypeScript error in the new files, read the error carefully:
- `Type error: Property 'X' does not exist on type 'Y'` → check the interface definitions in the component and fix the mismatched property name.
- `Cannot find module '@/components/landing/...'` → verify the file exists at the exact path and the `tsconfig.json` has `"@/*": ["./src/*"]` or equivalent alias configured (check `frontend/tsconfig.json`).

- [ ] **Step 4: Visual spot-check (dev server)**

```bash
cd frontend && npm run dev
```
Open `http://localhost:3000` and verify:
1. Hero shows new subtitle text and trust line below CTAs
2. Hero right column shows `MockupPrecio` (not the old BI panel)
3. Product demo section tabs say "Precio de mercado", "Score de oportunidad", "Matching semántico"
4. Each tab shows the corresponding new mockup
5. Mockups auto-rotate through examples (wait 5-6 seconds)
6. Hover over a mockup → rotation pauses
7. Click a dot → jumps to that example
8. Benefits section shows 3 new BI bullets + 3 new Compliance bullets in correct order
9. No layout breakage on mobile viewport (320px–768px)

- [ ] **Step 5: Commit final**

```bash
git add frontend/app/page.tsx  # if any minor fixes from visual check
git commit -m "chore: verified build, lint, and visual review for landing mockups redesign"
```

---

## Self-review checklist

After all 9 tasks, verify against spec §12 (acceptance criteria):

- [ ] AC1: `MockupBIPanel`, `MockupDashboard`, `MockupPostulaciones` deleted; `MockupPrecio`, `MockupScore`, `MockupMatching` in place
- [ ] AC2: MockupPrecio rotates 6 examples (5s), MockupScore rotates 3 (6s), MockupMatching rotates 4 (5s)
- [ ] AC3: Hero subtitle updated + trust line present
- [ ] AC4: 6 bullets match spec §9 (DollarSign/Target/Sparkles BI; Bell/CheckCircle2/FileClock Compliance in that order)
- [ ] AC5: Copy uses Chilean "tú" — search for "sabés", "podés", "cancelás", "tenés" in `page.tsx` and the 3 new components — should return 0 hits
- [ ] AC6: `prefers-reduced-motion` respected — hook disables autoplay when `reducedMotion` is true
- [ ] AC7: Mobile no autoplay (hook detects `hover: none`), arrows visible on mobile
- [ ] AC8: Dots are focusable (have `role="tab"` and `aria-label`), keyboard-navigable with focus-visible ring
- [ ] AC9: `npm run build` passes, `npm run lint` passes
