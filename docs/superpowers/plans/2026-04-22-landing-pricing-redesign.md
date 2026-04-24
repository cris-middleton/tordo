# Landing + Pricing Redesign (Plan A — Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce text density in the TORDO landing and collapse pricing from 4 tiers to 2 (Free + Pro with monthly/annual toggle), plus unify CTA copy around "Probar Pro 14 días". Frontend-only.

**Architecture:** All changes are scoped to a single file, `frontend/app/page.tsx`, which is a client-component landing page in Next.js 14 App Router. A single new `useState` hook (`billingPeriod: 'monthly' | 'annual'`) powers the pricing toggle. No routing, state-management, API, or backend changes in this plan — the trial backend lives in a follow-up plan.

**Tech Stack:** Next.js 14 (App Router), React client components, TypeScript, Tailwind CSS, `lucide-react` icons.

**Spec:** `docs/superpowers/specs/2026-04-22-landing-pricing-redesign-design.md`

---

## File Structure

**Modified files:**
- `frontend/app/page.tsx` — landing page, ~660 lines, single-file monolith containing nav, hero, benefits, product demo, how-it-works, data trust, pricing, FAQ, final CTA, footer, sticky mobile CTA.

No new files. No component extraction — `page.tsx` is already structured as a single client component and the pricing change is small enough that extracting `PricingSection.tsx` would be churn without payoff.

## Testing Strategy

This codebase has no frontend test suite (per `CLAUDE.md`). Verification is:
1. **TypeScript/ESLint:** `cd frontend && npm run lint` must pass after each task.
2. **Build:** `cd frontend && npm run build` must succeed before commit on tasks that change interactive state (Task 7).
3. **Visual QA:** `cd frontend && npm run dev`, visit `http://localhost:3000`, verify the changed section renders and looks right at desktop (≥1024px) and mobile (375px, via browser devtools).

Each task ends with lint + visual QA + commit.

## Task Order Rationale

Tasks 1–6 are pure text swaps inside existing JSX — low-risk, each independently committable. Task 7 is the largest structural change (pricing rebuild with new state) and goes last so rebasing is painless if any earlier task needs tweaking.

---

### Task 1: Update CTA vocabulary across nav, hero, sticky, final CTA

**Files:**
- Modify: `frontend/app/page.tsx`

All "Prueba gratis" / "Crear cuenta gratis" CTAs outside the pricing section become "Probar Pro 14 días". Keeps existing layout and styles.

- [ ] **Step 1: Update desktop navbar CTA label**

Find:
```tsx
<Link href="/register" className="hidden sm:inline-flex rounded-lg bg-[#0EAD69] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#09895B] hover:shadow-md">
  Prueba gratis
</Link>
```

Replace the text `Prueba gratis` with `Probar Pro 14 días`.

- [ ] **Step 2: Update mobile menu CTA label**

Find:
```tsx
<Link href="/register" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center justify-center rounded-lg bg-[#0EAD69] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[#09895B]">
  Prueba gratis
</Link>
```

Replace the text `Prueba gratis` with `Probar Pro 14 días`.

- [ ] **Step 3: Update hero primary CTA label**

Find:
```tsx
<Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl">
  Prueba gratis — sin tarjeta
  <ArrowRight className="h-4 w-4" />
</Link>
```

Replace the text `Prueba gratis — sin tarjeta` with `Probar Pro 14 días`.

- [ ] **Step 4: Update final CTA section button label**

Find:
```tsx
<Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-[#0EAD69] px-8 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-[#09895B] hover:shadow-xl">
  Crear cuenta gratis
  <ArrowRight className="h-4 w-4" />
</Link>
```

Replace the text `Crear cuenta gratis` with `Probar Pro 14 días`.

- [ ] **Step 5: Update sticky mobile CTA label**

Find:
```tsx
<Link href="/register" className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0EAD69] px-6 py-3 text-sm font-bold text-white transition-all hover:bg-[#09895B]">
  Prueba gratis
  <ArrowRight className="h-4 w-4" />
</Link>
```

Replace the text `Prueba gratis` with `Probar Pro 14 días`.

- [ ] **Step 6: Lint and visual QA**

Run: `cd frontend && npm run lint`
Expected: pass.

Run: `cd frontend && npm run dev` in a second terminal, visit `http://localhost:3000`. Verify all five CTAs read "Probar Pro 14 días" on desktop and mobile breakpoints.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "landing: unify primary CTA vocabulary to 'Probar Pro 14 días'"
```

---

### Task 2: Trim hero — remove redundant paragraph and stats

**Files:**
- Modify: `frontend/app/page.tsx` (hero section)

Hero currently shows a primary subhead, a secondary gray paragraph duplicating FAQ #2, a trust line, and a 3-stat grid. The stats reappear in the "Data Trust" section below — duplicate content. The secondary paragraph dilutes the primary message.

- [ ] **Step 1: Remove the secondary gray paragraph in the hero**

Find:
```tsx
<p className="mb-8 max-w-lg text-sm text-white/40 leading-relaxed">
  No importa el tamaño de tu empresa ni tu experiencia en licitaciones. TORDO te ayuda a entender cada oportunidad y mejorar tus probabilidades.
</p>
```

Delete this block entirely.

- [ ] **Step 2: Shorten the trust line below the hero CTAs**

Find:
```tsx
<p className="text-xs text-white/35 mb-6">
  Datos públicos de ChileCompra · Sin tarjeta · Cancelas cuando quieras
</p>
```

Replace the inner text with:
```
Sin tarjeta · Cancela cuando quieras
```

Result:
```tsx
<p className="text-xs text-white/35 mb-6">
  Sin tarjeta · Cancela cuando quieras
</p>
```

- [ ] **Step 3: Remove the 3-stat grid in the hero**

Find:
```tsx
{/* Stats */}
<div className="grid grid-cols-3 gap-6 sm:gap-10">
  {[
    { value: '$17.6B USD', label: 'en compras públicas (2024)' },
    { value: '110.000+', label: 'proveedores en el mercado' },
    { value: '+3.2M', label: 'transacciones analizadas' },
  ].map((item) => (
    <div key={item.value}>
      <p className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{item.value}</p>
      <p className="mt-0.5 text-xs sm:text-sm text-white/45">{item.label}</p>
    </div>
  ))}
</div>
```

Delete this block entirely (including the `{/* Stats */}` comment).

- [ ] **Step 4: Lint and visual QA**

Run: `cd frontend && npm run lint`
Expected: pass.

Visit `http://localhost:3000`. Verify hero is noticeably tighter: only H1 with rotating rubro, single subhead paragraph, CTA row, and the short trust line. No stats, no gray paragraph. Mockup on the right unchanged.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "landing: trim hero - drop duplicated stats and secondary paragraph"
```

---

### Task 3: Replace benefits section subhead

**Files:**
- Modify: `frontend/app/page.tsx` (benefits section `#beneficios`)

Current subhead is a two-sentence paragraph about the full product. Replace with a single warmer line focused on the BI differentiator (the part of the product that is fully built).

- [ ] **Step 1: Replace the benefits subhead**

Find:
```tsx
<p className="mt-4 max-w-2xl mx-auto text-[#64748B] leading-relaxed">
  Antes de invertir tiempo en una licitación, TORDO te muestra si tu precio es competitivo y qué tan confiable es el comprador. Cuando postulas, te asegura que no te descarten antes de ser evaluado.
</p>
```

Replace the inner text with:
```
Te mostramos si tu precio es competitivo y qué tan confiable es el comprador — antes de que inviertas tiempo postulando.
```

Result:
```tsx
<p className="mt-4 max-w-2xl mx-auto text-[#64748B] leading-relaxed">
  Te mostramos si tu precio es competitivo y qué tan confiable es el comprador — antes de que inviertas tiempo postulando.
</p>
```

- [ ] **Step 2: Lint and visual QA**

Run: `cd frontend && npm run lint`

Visit `http://localhost:3000#beneficios`. Verify the subhead is a single line (may wrap to two on mobile), reads smoothly, and the two-column grid below it is untouched.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "landing: tighten benefits subhead, focus on BI value"
```

---

### Task 4: Shorten how-it-works step descriptions

**Files:**
- Modify: `frontend/app/page.tsx` (how-it-works section `#como-funciona`)

Current step 01 description has a parenthetical about ChileCompra registration that is already addressed in the (soon-to-be-fused) FAQ item. Steps 02 and 03 are fine but can be one sentence each.

- [ ] **Step 1: Replace the steps array inline**

Find:
```tsx
{[
  { step: '01', title: 'Registra tu empresa', desc: 'Ingresa tu RUT y rubros. TORDO verifica tu estado hábil automáticamente. (Necesitas estar registrado como proveedor en ChileCompra.)' },
  { step: '02', title: 'Explora oportunidades', desc: 'Encuentra las licitaciones que calzan con tu perfil, cada una con su score de oportunidad.' },
  { step: '03', title: 'Postula informado', desc: 'Revisa precios históricos, competidores, y prepara tu documentación con el checklist.' },
].map((s) => (
```

Replace with:
```tsx
{[
  { step: '01', title: 'Registra tu empresa', desc: 'Ingresa tu RUT y rubros. Verificamos tu estado hábil automáticamente.' },
  { step: '02', title: 'Explora oportunidades', desc: 'Encuentra licitaciones que calzan con tu perfil, cada una con su score de oportunidad.' },
  { step: '03', title: 'Postula informado', desc: 'Revisa precios históricos, competidores y prepara tu documentación con el checklist.' },
].map((s) => (
```

(Changes: step 01 drops the parenthetical and shortens "TORDO verifica" → "Verificamos"; step 02 drops "las" and simplifies; step 03 drops the Oxford comma for consistency with step 02.)

- [ ] **Step 2: Lint and visual QA**

Run: `cd frontend && npm run lint`

Visit `http://localhost:3000#como-funciona`. Verify all three steps fit on fewer lines and read cleanly.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "landing: shorten how-it-works step descriptions"
```

---

### Task 5: Reduce FAQ from 6 → 4

**Files:**
- Modify: `frontend/app/page.tsx` (FAQs `const faqs`)

Fuse "¿Necesito estar registrado en ChileCompra?" + "¿Qué es el 'estado hábil'?" into one. Remove "¿Puedo cancelar cuando quiera?" — already implied by pricing subtext.

- [ ] **Step 1: Replace the entire faqs array**

Find (full current array):
```tsx
const faqs = [
  {
    question: '¿Necesito estar registrado en ChileCompra?',
    answer:
      'Sí. Para postular a licitaciones en Mercado Público necesitas estar inscrito como proveedor en el Registro de Proveedores de ChileCompra. TORDO no reemplaza ese registro — te ayuda a usar mejor la información disponible una vez que ya eres proveedor.',
  },
  {
    question: '¿Necesito experiencia en licitaciones?',
    answer:
      'No. TORDO está diseñado para que cualquier empresa pueda entender una licitación y evaluar si le conviene postular, sin conocimiento previo del proceso.',
  },
  {
    question: '¿Qué es el "estado hábil"?',
    answer:
      'Para postular en Mercado Público tu empresa debe estar "hábil" en ChileCompra. Si pierdes la habilitación, quedas fuera. TORDO revisa tu estado diariamente y te avisa si algo cambia.',
  },
  {
    question: '¿De dónde vienen los datos?',
    answer:
      'De los archivos públicos de órdenes de compra que publica ChileCompra. Son datos oficiales, gratuitos y verificables. Procesamos millones de transacciones para calcular rangos de precio por producto y comprador.',
  },
  {
    question: '¿En qué se diferencia de otras herramientas?',
    answer:
      'La mayoría de las herramientas están diseñadas para equipos grandes con analistas dedicados. TORDO está pensado para el dueño de PYME que toma decisiones solo: simplifica la información para que entiendas rápido si conviene postular.',
  },
  {
    question: '¿Puedo cancelar cuando quiera?',
    answer:
      'Sí. Sin penalidades, sin preguntas. Tu plan sigue activo hasta el fin del período.',
  },
];
```

Replace with:
```tsx
const faqs = [
  {
    question: '¿Necesito algo de ChileCompra antes de usar TORDO?',
    answer:
      'Sí. Para postular en Mercado Público tu empresa debe estar inscrita como proveedor en ChileCompra y mantener el "estado hábil" al día. TORDO no reemplaza ese registro — te ayuda a usar mejor la información una vez que ya eres proveedor, y revisa tu estado hábil diariamente para avisarte si algo cambia.',
  },
  {
    question: '¿Necesito experiencia en licitaciones?',
    answer:
      'No. TORDO está diseñado para que cualquier empresa pueda entender una licitación y evaluar si le conviene postular, sin conocimiento previo del proceso.',
  },
  {
    question: '¿De dónde vienen los datos?',
    answer:
      'De los archivos públicos de órdenes de compra que publica ChileCompra. Son datos oficiales, gratuitos y verificables. Procesamos millones de transacciones para calcular rangos de precio por producto y comprador.',
  },
  {
    question: '¿En qué se diferencia de otras herramientas?',
    answer:
      'La mayoría de las herramientas están diseñadas para equipos grandes con analistas dedicados. TORDO está pensado para el dueño de PYME que toma decisiones solo: simplifica la información para que entiendas rápido si conviene postular.',
  },
];
```

- [ ] **Step 2: Lint and visual QA**

Run: `cd frontend && npm run lint`

Visit `http://localhost:3000#faq`. Verify 4 accordion rows exist. Open each to confirm answers render correctly. The ChileCompra + estado hábil answer should read as one cohesive paragraph.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "landing: fuse ChileCompra+estado hábil FAQs, drop cancel FAQ"
```

---

### Task 6: Shorten final CTA subtitle

**Files:**
- Modify: `frontend/app/page.tsx` (final CTA section `#contacto`)

- [ ] **Step 1: Replace the final CTA subtitle**

Find:
```tsx
<p className="mb-8 text-white/65 leading-relaxed">
  Cuenta gratis en 2 minutos. Sin tarjeta de crédito. No necesitas experiencia previa en licitaciones.
</p>
```

Replace the inner text with:
```
Cuenta gratis en 2 minutos. Sin tarjeta.
```

Result:
```tsx
<p className="mb-8 text-white/65 leading-relaxed">
  Cuenta gratis en 2 minutos. Sin tarjeta.
</p>
```

- [ ] **Step 2: Lint and visual QA**

Run: `cd frontend && npm run lint`

Scroll to the bottom `#contacto` section. Verify H2 and button are unchanged (button already updated in Task 1) and subtitle is the short version.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "landing: shorten final CTA subtitle"
```

---

### Task 7: Rebuild pricing section (2 tiers + monthly/annual toggle + Enterprise link)

**Files:**
- Modify: `frontend/app/page.tsx` — replace the `plans` constant and the entire pricing grid markup, and add a `billingPeriod` state hook.

This is the largest task. It (a) shrinks the grid from 4 cards to 2, (b) adds a client-side monthly/annual toggle on the Pro card only, (c) demotes Enterprise to a single link under the grid, (d) aligns CTAs with the new trial vocabulary.

- [ ] **Step 1: Replace the `plans` constant with two plan objects**

Find the existing `plans` constant (the 4-element array starting with `const plans = [` and ending with `];` after the Enterprise entry).

Replace it with:
```tsx
const FREE_PLAN = {
  name: 'Free',
  description: 'Para explorar sin compromiso',
  features: [
    'Exploración de licitaciones',
    '3 alertas al mes',
    'Monitor de estado hábil',
    'Sin tarjeta de crédito',
  ],
  cta: 'Crear cuenta gratis',
  href: '/register',
};

const PRO_PLAN = {
  name: 'Pro',
  description: 'Inteligencia completa para ganar más',
  monthly: { price: '$11.900', period: '/mes', note: '' },
  annual: { price: '$9.900', period: '/mes', note: 'Facturado anual · ahorras 2 meses' },
  features: [
    'Alertas ilimitadas',
    'Benchmarks de precio por producto',
    'Análisis de competidores',
    'Score de oportunidad',
    'Matching semántico',
    'Checklist por tipo de licitación',
    'Alertas de vencimiento de documentos',
  ],
  cta: 'Probar 14 días gratis',
  href: '/register',
};
```

- [ ] **Step 2: Add the billingPeriod state hook inside the `Home` component**

Find the block of `useState` declarations at the top of `Home`:
```tsx
export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('precio');
  const [userClicked, setUserClicked] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
```

Add a new line immediately after `mobileMenuOpen`:
```tsx
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
```

- [ ] **Step 3: Replace the pricing grid markup**

Find the entire pricing section starting from:
```tsx
<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
  {plans.map((plan) => (
```

…and ending at the closing of that section's inner container (includes the trailing `<p className="mt-8 text-center text-sm text-[#94A3B8]">` note about the Free plan).

Replace everything from the opening `<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">` up to and including `</p>` of the trailing note with:

```tsx
<div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
  {/* Free card */}
  <div className="relative flex flex-col rounded-xl border border-[#E2E6EF] bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-[#0F2942]/25">
    <div className="mb-4">
      <h3 className="text-lg font-bold mb-1 text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{FREE_PLAN.name}</h3>
      <p className="text-xs text-[#64748B]">{FREE_PLAN.description}</p>
    </div>
    <div className="mb-1">
      <span className="font-bold text-3xl text-[#0D1B2A]" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>$0</span>
    </div>
    <div className="mb-4 h-4" />
    <ul className="mb-6 flex-1 space-y-2.5">
      {FREE_PLAN.features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 text-xs text-[#0EAD69]">&#10003;</span>
          <span className="text-[#64748B]">{f}</span>
        </li>
      ))}
    </ul>
    <Link
      href={FREE_PLAN.href}
      className="block rounded-lg py-2.5 text-center text-sm font-bold transition-all border border-[#0F2942] text-[#0F2942] hover:bg-[#0F2942] hover:text-white"
    >
      {FREE_PLAN.cta}
    </Link>
  </div>

  {/* Pro card */}
  <div className="relative flex flex-col rounded-xl border border-[#0F2942] bg-[#0F2942] p-6 text-white shadow-xl">
    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
      <span className="inline-flex items-center gap-1 rounded-full bg-[#0EAD69] px-3 py-1 text-[11px] font-bold text-white whitespace-nowrap">Más elegido</span>
    </div>

    <div className="mb-4">
      <h3 className="text-lg font-bold mb-1 text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>{PRO_PLAN.name}</h3>
      <p className="text-xs text-white/60">{PRO_PLAN.description}</p>
    </div>

    {/* Monthly / Annual toggle */}
    <div className="mb-4 inline-flex self-start rounded-lg bg-white/10 p-1 text-xs font-semibold">
      <button
        type="button"
        onClick={() => setBillingPeriod('monthly')}
        className={`rounded-md px-3 py-1.5 transition-all ${
          billingPeriod === 'monthly' ? 'bg-white text-[#0F2942]' : 'text-white/70 hover:text-white'
        }`}
      >
        Mensual
      </button>
      <button
        type="button"
        onClick={() => setBillingPeriod('annual')}
        className={`rounded-md px-3 py-1.5 transition-all ${
          billingPeriod === 'annual' ? 'bg-white text-[#0F2942]' : 'text-white/70 hover:text-white'
        }`}
      >
        Anual <span className="ml-1 text-[10px] text-[#0EAD69]">−17%</span>
      </button>
    </div>

    <div className="mb-1">
      <span className="font-bold text-3xl text-white" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
        {PRO_PLAN[billingPeriod].price}
      </span>
      <span className="text-sm text-white/60">{PRO_PLAN[billingPeriod].period}</span>
    </div>
    <p className="mb-4 text-xs text-white/50 min-h-[1rem]">
      {PRO_PLAN[billingPeriod].note}
    </p>

    <ul className="mb-6 flex-1 space-y-2.5">
      {PRO_PLAN.features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 text-xs text-[#0EAD69]">&#10003;</span>
          <span className="text-white/80">{f}</span>
        </li>
      ))}
    </ul>
    <Link
      href={PRO_PLAN.href}
      className="block rounded-lg py-2.5 text-center text-sm font-bold transition-all bg-[#0EAD69] text-white hover:bg-[#09895B]"
    >
      {PRO_PLAN.cta}
    </Link>
  </div>
</div>

<p className="mt-6 text-center text-sm text-[#64748B]">
  ¿Equipos o múltiples RUTs?{' '}
  <Link href="#contacto" className="font-semibold text-[#0F2942] hover:text-[#0EAD69] transition-colors">
    Hablemos →
  </Link>
</p>
```

- [ ] **Step 4: Build and lint**

Run: `cd frontend && npm run lint`
Expected: pass. No unused imports (we removed the `plans` array but not any import).

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Visual QA — desktop and mobile**

Run: `cd frontend && npm run dev` and visit `http://localhost:3000#precios`.

Desktop (≥1024px) checklist:
- Only 2 cards visible (Free on the left, Pro on the right, highlighted dark).
- "Más elegido" badge sits above the Pro card.
- Pro card shows a `Mensual | Anual −17%` toggle above the price.
- Default is Mensual → `$11.900 /mes`, no note line.
- Click Anual → price switches to `$9.900 /mes`, note reads `Facturado anual · ahorras 2 meses`.
- Click back to Mensual → price returns to `$11.900 /mes`, note is empty (the reserved `min-h-[1rem]` keeps layout stable — no vertical jump between states).
- Pro CTA reads `Probar 14 días gratis`, Free CTA reads `Crear cuenta gratis`.
- Enterprise line below the grid reads `¿Equipos o múltiples RUTs? Hablemos →` and scrolls to `#contacto` on click.

Mobile (375px via devtools):
- Cards stack vertically, Free on top, Pro below.
- Toggle is tappable and usable. Pro card badge still visible.
- No horizontal overflow.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "landing: pricing rebuild - 2 tiers + monthly/annual toggle"
```

---

## Post-Plan Verification

After all 7 tasks are complete:

- [ ] **Full-page QA pass at desktop, tablet, mobile.** Scroll top to bottom at each breakpoint, confirm no layout regressions in unrelated sections (product demo, data trust, footer).
- [ ] **Click every CTA.** All should land at `/register` or `#contacto` without errors.
- [ ] **Run the full build one more time** to catch any leftover issues:
  ```bash
  cd frontend && npm run build
  ```

The trial backend, trial badge in `Layout.tsx`, and email reminders are tracked in a follow-up plan (Plan B — Reverse Trial Backend). Merging Plan A before Plan B means the CTAs advertise a trial experience that isn't wired yet — ship them close together.
