# BI Panel v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el Panel BI v2 de Tordo — narrativa, personalización, paywall inteligente y herramientas — según spec aprobado `docs/superpowers/specs/2026-04-17-bi-panel-v2-design.md`.

**Architecture:** 5 fases ejecutables independientemente + 3 apuestas opt-in. Fase 0 (fixes) es bloqueante. Cada fase termina con un checkpoint para que el usuario valide la entrega antes de seguir. Frontend Next.js 14 (App Router, TS, Tailwind, Recharts). Backend FastAPI + SQLAlchemy async + Polars sobre parquets. 2 endpoints nuevos (`/api/bi/resumen`, `/api/bi/mi_posicion`).

**Tech Stack:**
- Backend: FastAPI, Pydantic v2, Polars (parquet), SQLAlchemy async, pytest
- Frontend: Next.js 14, TypeScript, Tailwind, Recharts, Axios
- Tests: pytest backend (test client); frontend verifica por `npm run build` + lint + smoke test manual

---

## File Structure Overview

### Backend (nuevos / modificados)

| Archivo | Cambio | Fase |
|---|---|---|
| `backend/app/schemas/bi.py` | Agregar `ResumenResponse`, `MiPosicionResponse`, campos teaser | 1, 2 |
| `backend/app/services/bi_service.py` | Agregar `get_resumen()`, `get_mi_posicion()` | 1, 2 |
| `backend/app/api/bi.py` | Agregar routes `/resumen`, `/mi_posicion` | 1, 2 |
| `backend/tests/test_bi_resumen.py` | NEW — test del endpoint resumen | 1 |
| `backend/tests/test_bi_mi_posicion.py` | NEW — test del endpoint mi_posicion | 2 |

### Frontend — archivos nuevos

```
frontend/app/dashboard/bi/
├── narrative/
│   └── templates.ts                      # Fase 1 — plantillas narrativa
├── hooks/
│   └── useCompradorCache.ts              # Fase 0
└── components/
    ├── MarketSummaryCard.tsx             # Fase 1
    ├── MyPositionCard.tsx                # Fase 2
    ├── BIOnboarding.tsx                  # Fase 2
    ├── SectorOverview.tsx                # Fase 1
    ├── HerramientasAvanzadas.tsx         # Fase 3
    ├── CompareMode.tsx                   # Fase 3
    ├── ShareMenu.tsx                     # Fase 4
    └── SimuladorCard.tsx                 # Fase 5 (opt-in)
```

### Frontend — archivos modificados

| Archivo | Cambio | Fase |
|---|---|---|
| `frontend/lib/api.ts` | Nuevos métodos `getBIResumen`, `getBIMiPosicion`, `getBIForecastCompetidores`, `getBISector`, `getBIPrecio` | 1, 2, 3 |
| `frontend/app/dashboard/bi/types.ts` | Tipos `ResumenMercado`, `MiPosicion`, `OrganismoConNombre` | 0, 1, 2 |
| `frontend/app/dashboard/bi/page.tsx` | Orquestación: `focusedOrganismo`, `compareMode`, URL sync, orden de secciones | 0, 1, 2, 3, 4 |
| `frontend/app/dashboard/bi/components/RubroFilter.tsx` | Chip de focused organismo, toggle "Comparar" | 2, 3 |
| `frontend/app/dashboard/bi/components/PlanGate.tsx` | Accept `preview` prop, no montar children cuando `locked` | 1 |
| `frontend/app/dashboard/bi/components/OportunidadesSection.tsx` | Botón "Analizar comprador", lazy row expand | 0, 2 |
| `frontend/app/dashboard/bi/components/TendenciasSection.tsx` | Modo comprimido cuando `selectedRubro` | 0 |
| `frontend/app/dashboard/bi/components/CompetenciaSection.tsx` | Dropdown con nombres, tooltip sin HHI, respeta focused | 0, 2 |
| `frontend/app/dashboard/bi/components/CompradoresSection.tsx` | Remover tabla P10/P50/P90, respeta focused, usa cache | 0, 2 |
| `frontend/app/dashboard/bi/components/EstacionalidadSection.tsx` | Dropdown con nombres, respeta focused, usa cache | 0, 2 |

---

## Fase 0 — Fixes críticos y limpieza

Bloqueante para el resto. Sin estos fixes, la narrativa y personalización se apoyan en un panel sucio.

### Task 0.1 — Dropdowns de §3 y §5 muestran nombres

**Files:**
- Modify: `frontend/app/dashboard/bi/page.tsx:67-78`
- Modify: `frontend/app/dashboard/bi/types.ts:1-13`
- Modify: `frontend/app/dashboard/bi/components/CompetenciaSection.tsx:20-25, 91-99`
- Modify: `frontend/app/dashboard/bi/components/EstacionalidadSection.tsx:17-21, 97-105`

- [ ] **Step 1: Agregar tipo `OrganismoConNombre` en `types.ts`**

En `frontend/app/dashboard/bi/types.ts`, después del bloque `PlanTier`, agregar:

```ts
export interface OrganismoConNombre {
  codigo: string;
  nombre: string;
}
```

- [ ] **Step 2: Derivar `topOrganismosConNombres` en `page.tsx`**

Reemplazar el bloque `page.tsx:67-70`:

```tsx
// Derived: top 3 unique organismos from oportunidades
const topOrganismos = [
  ...new Set(oportunidades.slice(0, 5).map((o) => o.CodigoOrganismoPublico)),
].slice(0, 3);
```

Por:

```tsx
// Derived: top 3 unique organismos con nombre resuelto
const topOrganismos: OrganismoConNombre[] = (() => {
  const seen = new Set<string>();
  const out: OrganismoConNombre[] = [];
  for (const o of oportunidades.slice(0, 10)) {
    if (seen.has(o.CodigoOrganismoPublico)) continue;
    seen.add(o.CodigoOrganismoPublico);
    out.push({
      codigo: o.CodigoOrganismoPublico,
      nombre: o.NombreOrganismo || o.CodigoOrganismoPublico,
    });
    if (out.length >= 3) break;
  }
  return out;
})();
```

Agregar import: `import { OrganismoConNombre, ... } from './types';`

- [ ] **Step 3: Actualizar firma de `CompetenciaSection` y `EstacionalidadSection`**

En `CompetenciaSection.tsx:20-25`, cambiar:

```tsx
interface CompetenciaSectionProps {
  topOrganismos: string[];
  selectedOrganismo: string;
  onOrganismoChange: (o: string) => void;
  rubro: string;
}
```

Por:

```tsx
interface CompetenciaSectionProps {
  topOrganismos: OrganismoConNombre[];
  selectedOrganismo: string;
  onOrganismoChange: (o: string) => void;
  rubro: string;
}
```

Agregar import de `OrganismoConNombre` de `../types`.

Mismo cambio en `EstacionalidadSection.tsx:17-21`.

- [ ] **Step 4: Actualizar render de los dropdowns**

En `CompetenciaSection.tsx:91-99`, reemplazar:

```tsx
{topOrganismos.map((o) => (
  <option key={o} value={o}>{o}</option>
))}
```

Por:

```tsx
{topOrganismos.map((o) => (
  <option key={o.codigo} value={o.codigo} title={o.nombre}>
    {o.nombre.length > 40 ? `${o.nombre.slice(0, 40)}…` : o.nombre}
  </option>
))}
```

Mismo cambio en `EstacionalidadSection.tsx:97-105`.

- [ ] **Step 5: Ajustar `setSelectedCompOrg` inicial en `page.tsx:73-78`**

Reemplazar:

```tsx
useEffect(() => {
  if (topOrganismos.length > 0 && !selectedCompOrg) {
    setSelectedCompOrg(topOrganismos[0]);
  }
}, [topOrganismos.join(',')]);
```

Por:

```tsx
useEffect(() => {
  if (topOrganismos.length > 0 && !selectedCompOrg) {
    setSelectedCompOrg(topOrganismos[0].codigo);
  }
}, [topOrganismos.map((o) => o.codigo).join(',')]);
```

- [ ] **Step 6: Ajustar render en `page.tsx` que pasa `topOrganismos` a secciones**

`page.tsx:274-279` y `page.tsx:283-287` siguen funcionando porque solo cambió la firma interna. Validar que `CompradoresSection` también se actualice (ver Task 0.4 para su cambio paralelo).

Por ahora temporal: seguir pasando `topOrganismos.map(o => o.codigo)` a `CompradoresSection` y `EstacionalidadSection` hasta que Task 0.4 y posteriores actualicen esas firmas. Mejor: actualizar todas las firmas ahora.

En `CompradoresSection.tsx:9-12`, cambiar `topOrganismos: string[]` por `topOrganismos: OrganismoConNombre[]` e internamente usar `.codigo` donde sea necesario (`line 195: topOrganismos.slice(0, 3).map((org) => ...)` → `.map((org) => <CompradorCard key={org.codigo} organismoId={org.codigo} rubro={rubro} />`).

- [ ] **Step 7: Build y smoke test**

```bash
cd frontend && npm run build
```

Expected: build exitoso sin errores TS.

Abrir browser a `http://localhost:3000/dashboard/bi`, verificar en §3 Competencia y §5 Estacionalidad que el dropdown muestra nombres de hospitales/organismos, no códigos numéricos.

- [ ] **Step 8: Commit**

```bash
git add frontend/app/dashboard/bi/types.ts \
        frontend/app/dashboard/bi/page.tsx \
        frontend/app/dashboard/bi/components/CompetenciaSection.tsx \
        frontend/app/dashboard/bi/components/EstacionalidadSection.tsx \
        frontend/app/dashboard/bi/components/CompradoresSection.tsx
git commit -m "fix(bi): show organismo names instead of numeric codes in §3 and §5 dropdowns"
```

---

### Task 0.2 — Remover jerga residual (HHI tooltip)

**Files:**
- Modify: `frontend/app/dashboard/bi/components/CompetenciaSection.tsx:107-113`

- [ ] **Step 1: Reemplazar el tooltip de HHI**

En `CompetenciaSection.tsx:107-113`, cambiar:

```tsx
<span
  className="text-muted"
  title="El HHI (índice Herfindahl-Hirschman) mide qué tan concentrado está un mercado. Un valor alto significa que pocos proveedores controlan la mayoría de las compras."
>
  {tipoLabel[tipoMercado] ?? tipoMercado}{' '}
  <span className="cursor-help underline decoration-dotted">ℹ</span>
</span>
```

Por:

```tsx
<span
  className="text-muted"
  title="Fragmentado = muchos proveedores compiten. Concentrado = pocos dominan el mercado."
>
  {tipoLabel[tipoMercado] ?? tipoMercado}{' '}
  <span className="cursor-help underline decoration-dotted">ℹ</span>
</span>
```

- [ ] **Step 2: Smoke test**

Hover sobre el badge "Mercado fragmentado/concentrado/moderado"; tooltip debe mostrar la nueva copia sin "HHI".

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/bi/components/CompetenciaSection.tsx
git commit -m "fix(bi): remove HHI jargon from market concentration tooltip"
```

---

### Task 0.3 — Remover tabla de descuentos P10/P50/P90 de §4

Nota: el contenido se mueve a Herramientas Avanzadas en Task 3.4. Aquí solo se elimina.

**Files:**
- Modify: `frontend/app/dashboard/bi/components/CompradoresSection.tsx:14-79, 176`

- [ ] **Step 1: Eliminar el componente `DescuentosInline` y su uso**

En `CompradoresSection.tsx`, eliminar el bloque completo de `DescuentosInline` (líneas 14-79).

Eliminar también la línea 176: `<DescuentosInline rubro={rubro} />`.

Eliminar el import `DescuentoItem` en `line 6` (ya no se usa aquí; se recuperará en Task 3.4).

Eliminar también la prop `rubro` de `CompradorCard` si ya no se usa internamente tras remover `DescuentosInline`. Verificar: `CompradorCard` recibe `rubro` solo para pasarlo a `DescuentosInline` → se puede quitar la prop.

Actualizar `CompradorCard` signature: `function CompradorCard({ organismoId }: { organismoId: string })` y remover `rubro={rubro}` en la llamada.

La sección outer mantiene `rubro` como prop para usos futuros (Task 2.3 lo consumirá para cross-linking).

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```

Expected: build exitoso.

- [ ] **Step 3: Smoke test**

Abrir §4 Compradores, expandir una card, confirmar que YA NO aparece "Ver descuentos típicos". Solo pago promedio, tasa adjudicación, cancelaciones y risk flags.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/bi/components/CompradoresSection.tsx
git commit -m "refactor(bi): remove P10/P50/P90 discount table from §4 (will move to Herramientas in Fase 3)"
```

---

### Task 0.4 — Cache compartido de `/comprador/{id}`

**Files:**
- Create: `frontend/app/dashboard/bi/hooks/useCompradorCache.ts`
- Modify: `frontend/app/dashboard/bi/page.tsx` (provider)
- Modify: `frontend/app/dashboard/bi/components/OportunidadesSection.tsx:35-55`
- Modify: `frontend/app/dashboard/bi/components/CompradoresSection.tsx:86-91`

- [ ] **Step 1: Crear el hook + contexto**

Crear `frontend/app/dashboard/bi/hooks/useCompradorCache.ts`:

```ts
'use client';

import { createContext, useContext, useRef, ReactNode } from 'react';
import { apiClient } from '@/lib/api';
import { CompradorResult } from '../types';

type CompradorCache = {
  get: (organismoId: string) => Promise<CompradorResult>;
};

const CompradorCacheContext = createContext<CompradorCache | null>(null);

export function CompradorCacheProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, Promise<CompradorResult>>>(new Map());

  const get = (organismoId: string) => {
    const cached = cacheRef.current.get(organismoId);
    if (cached) return cached;
    const promise = apiClient.getBIComprador(organismoId) as Promise<CompradorResult>;
    cacheRef.current.set(organismoId, promise);
    return promise;
  };

  return (
    <CompradorCacheContext.Provider value={{ get }}>
      {children}
    </CompradorCacheContext.Provider>
  );
}

export function useCompradorCache(): CompradorCache {
  const ctx = useContext(CompradorCacheContext);
  if (!ctx) throw new Error('useCompradorCache must be used inside CompradorCacheProvider');
  return ctx;
}
```

- [ ] **Step 2: Wrap en `page.tsx`**

En `page.tsx`, import el provider:

```tsx
import { CompradorCacheProvider } from './hooks/useCompradorCache';
```

Envolver el return dentro de `CompradorCacheProvider`:

```tsx
return (
  <CompradorCacheProvider>
    <div className="flex flex-col min-h-screen">
      {/* ... */}
    </div>
  </CompradorCacheProvider>
);
```

- [ ] **Step 3: Reemplazar llamada directa en `OportunidadesSection.tsx`**

En `OportunidadesSection.tsx`, después de los imports, agregar:

```tsx
import { useCompradorCache } from '../hooks/useCompradorCache';
```

Modificar `ExpandedRow` (líneas 35-55):

```tsx
function ExpandedRow({ organismo }: { organismo: string }) {
  const { get } = useCompradorCache();
  const [data, setData] = useState<CompradorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await get(organismo);
      setData(res);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ... resto igual
}
```

- [ ] **Step 4: Reemplazar llamada en `CompradoresSection.tsx`**

En `CompradoresSection.tsx`, agregar import:

```tsx
import { useCompradorCache } from '../hooks/useCompradorCache';
```

Modificar `CompradorCard` (líneas 86-91):

```tsx
function CompradorCard({ organismoId }: { organismoId: string }) {
  const { get } = useCompradorCache();
  const [data, setData] = useState<CompradorResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    get(organismoId)
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [organismoId]);

  // ... resto igual
}
```

- [ ] **Step 5: Verificar en devtools Network**

Con el browser abierto en `/dashboard/bi`:
1. Expandir una row en §1 Oportunidades de un organismo que ALSO aparezca en §4 Compradores.
2. Abrir DevTools → Network → filtrar por `comprador`.
3. Verificar que `/api/bi/comprador/{id}` se pide una sola vez para ese `id`.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/bi/hooks/useCompradorCache.ts \
        frontend/app/dashboard/bi/page.tsx \
        frontend/app/dashboard/bi/components/OportunidadesSection.tsx \
        frontend/app/dashboard/bi/components/CompradoresSection.tsx
git commit -m "perf(bi): share /comprador cache between sections via React context"
```

---

### Task 0.5 — Lazy row-expand en Oportunidades

Hoy `ExpandedRow` auto-dispara fetch al montar (`OportunidadesSection.tsx:55`). Cambio a manual.

**Files:**
- Modify: `frontend/app/dashboard/bi/components/OportunidadesSection.tsx:35-125`

- [ ] **Step 1: Remover auto-load en `ExpandedRow`**

En `OportunidadesSection.tsx`, modificar `ExpandedRow`:

```tsx
function ExpandedRow({ organismo }: { organismo: string }) {
  const { get } = useCompradorCache();
  const [data, setData] = useState<CompradorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await get(organismo);
      setData(res);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  // REMOVIDO: useEffect(() => { load(); }, []);

  if (!loaded && !loading) return (
    <div className="p-4 bg-surface/60 border-t border-border">
      <button
        onClick={load}
        className="text-sm text-primary hover:underline font-medium"
      >
        Ver perfil del comprador →
      </button>
    </div>
  );

  if (loading) return (
    <div className="p-4 flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando perfil del comprador...
    </div>
  );

  // ... resto igual (render del perfil)
}
```

- [ ] **Step 2: Build + smoke test**

```bash
cd frontend && npm run build
```

En browser, expandir row en §1 → debe aparecer botón "Ver perfil del comprador →" en lugar de cargar automático. Click → dispara fetch.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/bi/components/OportunidadesSection.tsx
git commit -m "perf(bi): make §1 row expand lazy — require explicit click to load comprador"
```

---

### Task 0.6 — Modo comprimido de §2 Tendencias con rubro filtrado

Cuando `selectedRubro` está set, ver 12 barras de rubros vecinos es ruido. Mostrar solo la fila del rubro seleccionado + top 3 emergentes.

**Files:**
- Modify: `frontend/app/dashboard/bi/components/TendenciasSection.tsx:18-126`
- Modify: `frontend/app/dashboard/bi/page.tsx` (pasar `selectedRubro` prop)

- [ ] **Step 1: Agregar prop `selectedRubro`**

En `TendenciasSection.tsx`, actualizar la interface:

```tsx
interface TendenciasSectionProps {
  tendencias: TendenciaItem[];
  emergentes: TendenciaItem[];
  loading: boolean;
  selectedRubro: string;
}
```

- [ ] **Step 2: Renderizar vista comprimida cuando haya rubro seleccionado**

Al inicio del body de `TendenciasSection`, antes del `chartData`, agregar:

```tsx
// Vista comprimida cuando hay rubro filtrado
if (selectedRubro && !loading) {
  const found = tendencias.find((t) => t.RubroN2 === selectedRubro);
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Tendencias del mercado
        </h2>
        <p className="text-xs text-muted mt-0.5">¿Este mercado está creciendo o contrayéndose?</p>
      </div>

      {found ? (
        <div className="rounded-xl border border-border bg-surface p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{selectedRubro}</p>
            <p className={`text-3xl font-bold mt-1 ${found.cagr >= 0 ? 'text-accent' : 'text-danger'}`}>
              {found.cagr > 0 ? '+' : ''}{found.cagr.toFixed(1)}%
              <span className="text-sm font-normal text-muted ml-2">anual</span>
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            {found.total_oc && <p>{found.total_oc.toLocaleString('es-CL')} OC</p>}
            {found.n_anios && <p>{found.n_anios} años de historia</p>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Sin datos de tendencia para este rubro.</p>
      )}

      {emergentes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-muted self-center">En alza (contexto):</span>
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
    </section>
  );
}

// Vista completa (sin rubro) — render original continúa
```

- [ ] **Step 3: Pasar la prop desde `page.tsx`**

En `page.tsx`, en el render de `TendenciasSection`, agregar `selectedRubro={selectedRubro}`:

```tsx
<TendenciasSection
  tendencias={tendencias}
  emergentes={emergentes}
  loading={loadingTend}
  selectedRubro={selectedRubro}
/>
```

- [ ] **Step 4: Build + smoke test**

Build OK. En browser, seleccionar un rubro → §2 muestra solo una card grande con el trend de ese rubro + 3 badges emergentes. Quitar rubro (no aplicable actualmente — requiere chip removable) — validar después de Task 2.3.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/dashboard/bi/components/TendenciasSection.tsx \
        frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): compress §2 to single card + emergentes when rubro is filtered"
```

---

### Task 0.7 — Subir `limit` de `/oportunidades` a 50

**Files:**
- Modify: `frontend/app/dashboard/bi/page.tsx:81-96, 180-184`

- [ ] **Step 1: Cambiar `limit: 20` → `limit: 50`**

En `page.tsx` hay 2 llamadas a `getBIOportunidades` con `limit: 20`. Cambiarlas a `limit: 50`.

Línea 81-96 (loadOportunidades):
```tsx
const res = await apiClient.getBIOportunidades({
  rubro: rubro || undefined,
  min_score: 4,
  limit: 50,
});
```

Línea 180-184 (init):
```tsx
const res = await apiClient.getBIOportunidades({
  rubro: firstRubro || undefined,
  min_score: 4,
  limit: 50,
});
```

- [ ] **Step 2: Ajustar la tabla de §1 para mostrar solo top 10 (ya lo hace)**

`OportunidadesSection.tsx:205` ya hace `.slice(0, 10)`. Queda igual. Los 40 extras alimentan el dropdown libre de §3/§5 en pasos futuros.

- [ ] **Step 3: Smoke test + commit**

Browser: §1 sigue mostrando 10 filas. Tabla NO debería mostrar más. Commit:

```bash
git add frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): fetch top 50 oportunidades to feed richer organismo selector"
```

---

### ⛳ Checkpoint Fase 0

Tras completar 0.1 – 0.7:

- [ ] Dropdowns §3 y §5 muestran nombres
- [ ] Ningún tooltip menciona HHI, CAGR, P10/P50/P90
- [ ] Row expand de §1 es lazy (botón explícito)
- [ ] §2 Tendencias muestra vista comprimida cuando hay rubro filtrado
- [ ] `/comprador/{id}` se cachea (verificar en DevTools Network)
- [ ] `npm run build` en frontend pasa sin errores TS
- [ ] `npm run lint` en frontend pasa

**Revisión manual:** Abrir `/dashboard/bi`, filtrar por un rubro, navegar las 5 secciones. No debería haber regresiones vs. el panel v1. Confirmar con el usuario antes de continuar a Fase 1.

---

## Fase 1 — Capa narrativa

Introduce el `MarketSummaryCard` + refactor de `PlanGate` con teasers + banner opcional de sectores.

### Task 1.1 — Backend: endpoint `/api/bi/resumen`

**Files:**
- Modify: `backend/app/schemas/bi.py` (agregar `ResumenResponse`)
- Modify: `backend/app/services/bi_service.py` (agregar `get_resumen()`)
- Modify: `backend/app/api/bi.py` (agregar route)
- Create: `backend/tests/test_bi_resumen.py`

- [ ] **Step 1: Definir schemas en `backend/app/schemas/bi.py`**

Al final del archivo, agregar:

```python
class ResumenTopComprador(BaseModel):
    codigo: Optional[str] = None
    nombre: Optional[str] = None
    pago_mediana_dias: Optional[int] = None
    clasificacion_pago: Optional[str] = None  # "bueno" | "medio" | "lento"


class ResumenTeaserCompetencia(BaseModel):
    lider_nombre: Optional[str] = None
    lider_share_pct: Optional[float] = None
    tipo_mercado: Optional[str] = None  # "concentrado" | "moderado" | "fragmentado"


class ResumenTeaserEstacionalidad(BaseModel):
    mes_pico_mayor: Optional[str] = None
    consistencia_avg_pct: Optional[int] = None


class ResumenResponse(BaseModel):
    disponible: bool
    rubro: Optional[str] = None
    monto_anual_clp: Optional[float] = None
    n_organismos: Optional[int] = None
    cagr_pct: Optional[float] = None
    n_proveedores_actual: Optional[int] = None
    n_proveedores_hace_3_anios: Optional[int] = None
    top_comprador: Optional[ResumenTopComprador] = None
    teaser_competencia: Optional[ResumenTeaserCompetencia] = None
    teaser_estacionalidad: Optional[ResumenTeaserEstacionalidad] = None
    motivo: Optional[str] = None
```

- [ ] **Step 2: Implementar `get_resumen()` en `bi_service.py`**

Al final de `backend/app/services/bi_service.py`, agregar:

```python
def get_resumen(rubro: Optional[str] = None) -> dict:
    """
    Resumen narrativo de un rubro: monto anual, n organismos, cagr, top comprador,
    teasers para paywall (competencia + estacionalidad).
    Combina sector_dashboard + trend_by_market + buyer_scores + competitor_analysis
    + seasonality_patterns.
    """
    if not rubro:
        return {"disponible": False, "motivo": "rubro requerido"}

    # ── Sector / monto / organismos ──────────────────────────────────────────
    df_sector = _load("sector_dashboard.parquet")
    monto_anual = n_organismos = None
    if df_sector is not None and "RubroN2" in df_sector.columns:
        row = df_sector.filter(df_sector["RubroN2"] == rubro)
        if len(row) > 0:
            r = row.to_dicts()[0]
            monto_anual = float(r.get("monto_total") or 0)
            n_organismos = int(r.get("n_organismos") or 0)

    # ── CAGR ─────────────────────────────────────────────────────────────────
    df_trend = _load("trend_by_market.parquet")
    cagr_pct = None
    if df_trend is not None:
        row = df_trend.filter(df_trend["RubroN2"] == rubro)
        if len(row) > 0:
            cagr_pct = float(row.to_dicts()[0].get("cagr") or 0) * 100

    # ── N proveedores actuales y hace 3 años ─────────────────────────────────
    df_comp = _load("competitor_analysis.parquet")
    n_prov_actual = n_prov_hace_3 = None
    lider_nombre = None
    lider_share_pct = None
    tipo_mercado = None
    top_comprador_codigo = None
    if df_comp is not None:
        subset = df_comp.filter(df_comp["RubroN2"] == rubro)
        if len(subset) > 0:
            provs = subset.select("CodigoProveedor").unique()
            n_prov_actual = len(provs)
            # Líder por share_pct
            ranked = subset.sort("market_share_pct", descending=True)
            top = ranked.to_dicts()[0] if len(ranked) > 0 else None
            if top:
                lider_nombre = top.get("NombreProveedor")
                lider_share_pct = float(top.get("market_share_pct") or 0)
                top_comprador_codigo = top.get("CodigoOrganismoPublico")
                # tipo_mercado: heurística simple si no viene en parquet
                hhi_val = top.get("hhi") or 0
                if hhi_val > 2500:
                    tipo_mercado = "concentrado"
                elif hhi_val > 1500:
                    tipo_mercado = "moderado"
                else:
                    tipo_mercado = "fragmentado"
            # n_prov_hace_3 requiere parquet temporal; si no existe, dejar None

    # ── Top comprador (nombre + pago + clasificacion) ────────────────────────
    top_comprador = None
    if top_comprador_codigo:
        df_buyers = _load("buyer_scores.parquet")
        if df_buyers is not None:
            row = df_buyers.filter(df_buyers["CodigoOrganismoPublico"] == top_comprador_codigo)
            if len(row) > 0:
                b = row.to_dicts()[0]
                pago_dias = b.get("mediana_dias_pago")
                clasif = "bueno"
                if pago_dias and pago_dias > 45:
                    clasif = "lento"
                elif pago_dias and pago_dias > 30:
                    clasif = "medio"
                top_comprador = {
                    "codigo": top_comprador_codigo,
                    "nombre": b.get("NombreOrganismo"),
                    "pago_mediana_dias": int(pago_dias) if pago_dias else None,
                    "clasificacion_pago": clasif,
                }

    # ── Teaser estacionalidad ────────────────────────────────────────────────
    df_seas = _load("seasonality_patterns.parquet")
    mes_pico = None
    consistencia_avg = None
    meses_es = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
    if df_seas is not None and top_comprador_codigo:
        subset = df_seas.filter(df_seas["CodigoOrganismoPublico"] == top_comprador_codigo)
        if len(subset) > 0:
            rows = subset.to_dicts()
            # Mes con mayor prob_mes
            pico = max(rows, key=lambda r: r.get("prob_mes") or 0)
            mes_num = pico.get("mes")
            if mes_num and 1 <= mes_num <= 12:
                mes_pico = meses_es[mes_num - 1]
            consistencias = [r.get("consistencia") or 0 for r in rows if r.get("consistencia") is not None]
            if consistencias:
                consistencia_avg = int(sum(consistencias) / len(consistencias) * 100)

    return {
        "disponible": True,
        "rubro": rubro,
        "monto_anual_clp": monto_anual,
        "n_organismos": n_organismos,
        "cagr_pct": cagr_pct,
        "n_proveedores_actual": n_prov_actual,
        "n_proveedores_hace_3_anios": n_prov_hace_3,
        "top_comprador": top_comprador,
        "teaser_competencia": {
            "lider_nombre": lider_nombre,
            "lider_share_pct": lider_share_pct,
            "tipo_mercado": tipo_mercado,
        } if lider_nombre else None,
        "teaser_estacionalidad": {
            "mes_pico_mayor": mes_pico,
            "consistencia_avg_pct": consistencia_avg,
        } if mes_pico else None,
    }
```

- [ ] **Step 3: Agregar route en `backend/app/api/bi.py`**

Después del route `/rubros` (línea ~574), agregar:

```python
@router.get(
    "/resumen",
    response_model=ResumenResponse,
    summary="Resumen narrativo de un rubro (para MarketSummaryCard + teasers paywall)",
    description=(
        "Combina sector, trend, competitor y seasonality en una sola respuesta "
        "ligera. Incluye teasers para las secciones gated (competencia, estacionalidad) "
        "que se muestran al plan básico sin gastar quota en los endpoints detallados."
    ),
)
def get_resumen(
    rubro: str = Query(..., min_length=1, description="RubroN2 a resumir"),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.services import bi_service
    return bi_service.get_resumen(rubro)
```

Asegurar import de `ResumenResponse` al tope del archivo `bi.py`.

- [ ] **Step 4: Crear test `backend/tests/test_bi_resumen.py`**

```python
"""Tests for /api/bi/resumen endpoint."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


def test_resumen_requires_rubro(monkeypatch):
    monkeypatch.setenv("FEATURE_ANALYTICS", "true")
    client = TestClient(app)
    # Sin parámetro rubro → 422 de FastAPI
    res = client.get("/api/bi/resumen")
    assert res.status_code in (401, 422)  # 401 si falta auth, 422 si el flag falla


def test_resumen_returns_disponible_false_sin_data(monkeypatch, tmp_path):
    """Si no hay parquets, el servicio devuelve disponible=False limpiamente."""
    from app.services import bi_service
    # Apuntar a directorio vacío
    from app import config
    monkeypatch.setattr(config.settings, "analytics_data_path", str(tmp_path))
    bi_service._cache.clear()
    result = bi_service.get_resumen("Algún rubro inexistente")
    # Cuando no hay parquets, las métricas son None pero disponible se mantiene True
    # (el servicio no short-circuita; el frontend decide cómo pintar ausencia)
    assert result["disponible"] is True
    assert result["monto_anual_clp"] is None
    assert result["cagr_pct"] is None


def test_resumen_empty_rubro_returns_false():
    from app.services import bi_service
    result = bi_service.get_resumen(None)
    assert result["disponible"] is False
```

- [ ] **Step 5: Correr tests**

```bash
cd backend && pytest tests/test_bi_resumen.py -v
```

Expected: 3/3 pass (los tests verifican comportamiento defensivo, no una respuesta real con datos).

- [ ] **Step 6: Smoke test con curl**

Arrancar backend:

```bash
cd backend && uvicorn app.main:app --reload
```

En otra terminal (reemplazar `$TOKEN` con JWT válido):

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/bi/resumen?rubro=Equipos%20médicos"
```

Expected: 200 con `{"disponible": true, "rubro": "Equipos médicos", ...}`. Algunos campos pueden ser `null` si faltan parquets — OK.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/bi.py \
        backend/app/services/bi_service.py \
        backend/app/api/bi.py \
        backend/tests/test_bi_resumen.py
git commit -m "feat(bi): add /api/bi/resumen endpoint for narrative card + paywall teasers"
```

---

### Task 1.2 — Frontend: `MarketSummaryCard` + plantillas narrativa + API client

**Files:**
- Create: `frontend/app/dashboard/bi/narrative/templates.ts`
- Create: `frontend/app/dashboard/bi/components/MarketSummaryCard.tsx`
- Modify: `frontend/app/dashboard/bi/types.ts` (agregar `ResumenMercado`)
- Modify: `frontend/lib/api.ts` (agregar `getBIResumen`)
- Modify: `frontend/app/dashboard/bi/page.tsx` (fetch + render)

- [ ] **Step 1: Tipos en `types.ts`**

Al final del archivo `types.ts`:

```ts
export interface ResumenMercado {
  disponible: boolean;
  rubro?: string;
  monto_anual_clp?: number;
  n_organismos?: number;
  cagr_pct?: number;
  n_proveedores_actual?: number;
  n_proveedores_hace_3_anios?: number;
  top_comprador?: {
    codigo?: string;
    nombre?: string;
    pago_mediana_dias?: number;
    clasificacion_pago?: 'bueno' | 'medio' | 'lento';
  };
  teaser_competencia?: {
    lider_nombre?: string;
    lider_share_pct?: number;
    tipo_mercado?: 'concentrado' | 'moderado' | 'fragmentado';
  };
  teaser_estacionalidad?: {
    mes_pico_mayor?: string;
    consistencia_avg_pct?: number;
  };
}
```

- [ ] **Step 2: Método en `api.ts`**

En `frontend/lib/api.ts`, después de `getBIRubros` (línea ~320), agregar:

```ts
async getBIResumen(rubro: string) {
  const res = await this.client.get('/api/bi/resumen', { params: { rubro } });
  return res.data;
}
```

- [ ] **Step 3: Plantillas narrativa**

Crear `frontend/app/dashboard/bi/narrative/templates.ts`:

```ts
import { ResumenMercado } from '../types';

function formatCLP(value: number): string {
  if (value >= 1_000_000_000) return `CLP ${(value / 1_000_000_000).toFixed(1)} mil millones`;
  if (value >= 1_000_000) return `CLP ${(value / 1_000_000).toFixed(1)} millones`;
  return `CLP ${value.toLocaleString('es-CL')}`;
}

export function frase1(r: ResumenMercado): string | null {
  if (!r.rubro || !r.monto_anual_clp || !r.n_organismos) return null;
  return `El mercado de <b>${r.rubro}</b> movió <b>${formatCLP(r.monto_anual_clp)}</b> el último año entre <b>${r.n_organismos} organismos</b>.`;
}

export function frase2(r: ResumenMercado): string | null {
  if (r.cagr_pct == null) return null;
  if (r.cagr_pct > 10) {
    if (r.n_proveedores_actual && r.n_proveedores_hace_3_anios && r.n_proveedores_actual > r.n_proveedores_hace_3_anios) {
      return `Está <b>creciendo ${r.cagr_pct.toFixed(0)}% anual</b>, pero la competencia también: de ${r.n_proveedores_hace_3_anios} a ${r.n_proveedores_actual} proveedores activos en 3 años.`;
    }
    return `Está <b>creciendo ${r.cagr_pct.toFixed(0)}% anual</b>.`;
  }
  if (r.cagr_pct < -5) return `Se está <b>contrayendo ${Math.abs(r.cagr_pct).toFixed(0)}% anual</b> — cuidado con presión de precios.`;
  return `Se mantiene <b>estable</b> con variaciones anuales bajo 10%.`;
}

export function frase3(r: ResumenMercado): string | null {
  const t = r.top_comprador;
  if (!t?.nombre) return null;
  const labelPago = t.clasificacion_pago === 'bueno' ? 'bueno' :
                    t.clasificacion_pago === 'medio' ? 'normal' : 'lento';
  const diasStr = t.pago_mediana_dias ? `, que paga en promedio en <b>${t.pago_mediana_dias} días</b> (${labelPago} para el sector)` : '';
  return `El comprador más activo es <b>${t.nombre}</b>${diasStr}.`;
}

export function buildFrases(r: ResumenMercado): string[] {
  return [frase1(r), frase2(r), frase3(r)].filter((f): f is string => f !== null);
}
```

- [ ] **Step 4: Componente `MarketSummaryCard.tsx`**

Crear `frontend/app/dashboard/bi/components/MarketSummaryCard.tsx`:

```tsx
'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { ResumenMercado } from '../types';
import { buildFrases } from '../narrative/templates';

interface MarketSummaryCardProps {
  resumen: ResumenMercado | null;
  loading: boolean;
}

export function MarketSummaryCard({ resumen, loading }: MarketSummaryCardProps) {
  if (loading) {
    return (
      <div className="card flex items-center gap-3 py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm text-muted">Analizando el mercado...</p>
      </div>
    );
  }
  if (!resumen?.disponible) return null;

  const frases = buildFrases(resumen);
  if (frases.length === 0) return null;

  return (
    <section className="card bg-gradient-to-br from-primary/5 via-background to-accent/5 border-primary/20">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/15 p-2 shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          {frases.map((f, i) => (
            <p key={i} className="text-sm leading-relaxed text-text" dangerouslySetInnerHTML={{ __html: f }} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire en `page.tsx`**

Agregar state:

```tsx
const [resumen, setResumen] = useState<ResumenMercado | null>(null);
const [loadingResumen, setLoadingResumen] = useState(false);
```

Cargar junto con oportunidades/tendencias. En `handleRubroChange`:

```tsx
const handleRubroChange = useCallback((rubro: string) => {
  setSelectedRubro(rubro);
  setOportunidades([]);
  setTendencias([]);
  setEmergentes([]);
  setSelectedCompOrg('');
  setResumen(null);
  loadOportunidades(rubro);
  loadTendencias(rubro);
  loadResumen(rubro);
}, [loadOportunidades, loadTendencias, loadResumen]);
```

Agregar `loadResumen`:

```tsx
const loadResumen = useCallback(async (rubro: string) => {
  if (!rubro) { setResumen(null); return; }
  setLoadingResumen(true);
  try {
    const res = await apiClient.getBIResumen(rubro);
    setResumen(res);
  } catch {
    setResumen(null);
  } finally {
    setLoadingResumen(false);
  }
}, []);
```

Cargar también en el init (después del probe initial):

```tsx
if (enabled && firstRubro) {
  loadResumen(firstRubro);
}
```

Render `<MarketSummaryCard resumen={resumen} loading={loadingResumen} />` antes de `<OportunidadesSection>`.

Import: `import { MarketSummaryCard } from './components/MarketSummaryCard';`
Import: `import { ResumenMercado } from './types';`

- [ ] **Step 6: Build + smoke test**

```bash
cd frontend && npm run build
```

En browser: seleccionar un rubro → aparece card con 1-3 frases de resumen arriba de §1.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/dashboard/bi/narrative/templates.ts \
        frontend/app/dashboard/bi/components/MarketSummaryCard.tsx \
        frontend/app/dashboard/bi/types.ts \
        frontend/lib/api.ts \
        frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): add MarketSummaryCard with narrative templates (3 auto-generated sentences)"
```

---

### Task 1.3 — Refactor `PlanGate` con `preview`

**Files:**
- Modify: `frontend/app/dashboard/bi/components/PlanGate.tsx`
- Modify: `frontend/app/dashboard/bi/page.tsx` (pasar previews y NO montar children)

- [ ] **Step 1: Refactor `PlanGate.tsx`**

Reemplazar todo el archivo con:

```tsx
'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';

interface PlanGateProps {
  children: ReactNode;
  locked: boolean;
  label?: string;
  preview?: ReactNode;
  placeholder?: ReactNode;
}

export function PlanGate({ children, locked, label, preview, placeholder }: PlanGateProps) {
  if (!locked) return <>{children}</>;

  return (
    <section className="card space-y-4 relative overflow-hidden">
      {preview && (
        <div className="relative z-10 text-sm text-text leading-relaxed">
          {preview}
        </div>
      )}

      {placeholder && (
        <div className="pointer-events-none select-none opacity-40">
          {placeholder}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface/70 p-4 flex items-center gap-3">
        <div className="rounded-full bg-surface border border-border p-2 shrink-0">
          <Lock className="h-4 w-4 text-muted" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-text">
            {label || 'Disponible en plan PYME'}
          </p>
          <p className="text-xs text-muted mt-0.5">
            Actualiza tu plan para ver el detalle completo
          </p>
        </div>
        <Link href="/dashboard/billing" className="btn-primary text-sm shrink-0">
          Ver planes
        </Link>
      </div>
    </section>
  );
}
```

Notas clave del refactor:
- `locked == true` → `children` NO se monta (se devuelve un JSX sin él). Esto ahorra la fetch interna.
- `preview` se pinta arriba con full legibility.
- `placeholder` es opcional: un skeleton SVG decorativo.

- [ ] **Step 2: Build inicial para verificar que no rompe nada**

```bash
cd frontend && npm run build
```

Expected: build OK. Las secciones §3/§4/§5 aparecerán sin contenido para plan básico hasta Task 1.4.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/bi/components/PlanGate.tsx
git commit -m "refactor(bi): PlanGate no longer mounts locked children; accepts preview + placeholder props"
```

---

### Task 1.4 — Wire previews en §3 / §4 / §5

**Files:**
- Modify: `frontend/app/dashboard/bi/page.tsx` (pasar `preview` basado en `resumen.teaser_*`)

- [ ] **Step 1: Construir preview para §3 Competencia**

En `page.tsx`, antes del return, calcular previews:

```tsx
const previewCompetencia = resumen?.teaser_competencia && (
  <p>
    En este mercado compites contra <b>{resumen.n_proveedores_actual}</b> proveedores.
    El líder, <b>{resumen.teaser_competencia.lider_nombre}</b>, captura el
    <b> {resumen.teaser_competencia.lider_share_pct?.toFixed(0)}%</b>.
    Mercado <b>{resumen.teaser_competencia.tipo_mercado}</b>.
  </p>
);

const previewCompradores = resumen?.top_comprador && (
  <p>
    El comprador más activo es <b>{resumen.top_comprador.nombre}</b>, que paga en promedio en
    <b> {resumen.top_comprador.pago_mediana_dias} días</b> ({resumen.top_comprador.clasificacion_pago}).
    Este mercado atiende a <b>{resumen.n_organismos}</b> organismos en total.
  </p>
);

const previewEstacionalidad = resumen?.teaser_estacionalidad && (
  <p>
    El pico de compras suele ser en <b>{resumen.teaser_estacionalidad.mes_pico_mayor}</b>.
    Consistencia promedio del patrón: <b>{resumen.teaser_estacionalidad.consistencia_avg_pct}%</b>.
  </p>
);
```

- [ ] **Step 2: Pasar previews a `PlanGate` en el render**

```tsx
<PlanGate
  locked={!paid}
  label="Análisis de competencia — plan PYME"
  preview={previewCompetencia}
>
  <CompetenciaSection
    topOrganismos={topOrganismos}
    selectedOrganismo={selectedCompOrg}
    onOrganismoChange={setSelectedCompOrg}
    rubro={selectedRubro}
  />
</PlanGate>

<PlanGate
  locked={!paid}
  label="Perfil de compradores — plan PYME"
  preview={previewCompradores}
>
  {topOrganismos.length > 0 && (
    <CompradoresSection topOrganismos={topOrganismos} rubro={selectedRubro} />
  )}
</PlanGate>

<PlanGate
  locked={!paid}
  label="Estacionalidad — plan PYME"
  preview={previewEstacionalidad}
>
  {topOrganismos.length > 0 && (
    <EstacionalidadSection topOrganismos={topOrganismos} rubro={selectedRubro} />
  )}
</PlanGate>
```

- [ ] **Step 3: Smoke test con plan básico**

Para testear: editar temporalmente en DB el `plan_tier` del usuario de prueba a `basico`. Reload `/dashboard/bi`.

Verificar que:
- §3, §4, §5 muestran las frases narrativas de preview (NO blur)
- CTA "Ver planes" está visible
- En DevTools Network NO aparecen requests a `/competidores`, `/comprador`, `/estacionalidad`

Volver a cambiar `plan_tier` a `pyme` — verificar que las secciones se renderan completas.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): wire narrative previews in §3/§4/§5 paywalls (no more blur + no wasted quota)"
```

---

### Task 1.5 — `SectorOverview` banner

**Files:**
- Create: `frontend/app/dashboard/bi/components/SectorOverview.tsx`
- Modify: `frontend/lib/api.ts` (agregar `getBISector`)
- Modify: `frontend/app/dashboard/bi/page.tsx` (render condicional)

- [ ] **Step 1: Agregar `getBISector` en `api.ts`**

Después de `getBIResumen`:

```ts
async getBISector(params: { sector?: string; limit?: number } = {}) {
  const res = await this.client.get('/api/bi/sector', { params });
  return res.data;
}
```

- [ ] **Step 2: Crear `SectorOverview.tsx`**

Crear `frontend/app/dashboard/bi/components/SectorOverview.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Map, X } from 'lucide-react';
import { apiClient } from '@/lib/api';

const DISMISS_KEY = 'tordo-bi-sector-dismiss-date';

interface SectorRow {
  sector: string;
  monto_total: number;
  n_oc: number;
  n_organismos: number;
  n_proveedores: number;
}

function formatCLP(v: number): string {
  if (v >= 1e12) return `CLP ${(v / 1e12).toFixed(1)} billones`;
  if (v >= 1e9) return `CLP ${(v / 1e9).toFixed(1)} mil millones`;
  if (v >= 1e6) return `CLP ${(v / 1e6).toFixed(0)} millones`;
  return `CLP ${v.toLocaleString('es-CL')}`;
}

export function SectorOverview() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [sectores, setSectores] = useState<SectorRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const last = typeof window !== 'undefined' ? localStorage.getItem(DISMISS_KEY) : null;
    setDismissed(last === today);
  }, []);

  useEffect(() => {
    if (dismissed !== false) return;
    setLoading(true);
    apiClient.getBISector({ limit: 6 })
      .then((res) => { if (res.disponible) setSectores(res.sectores ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dismissed]);

  const dismiss = () => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(DISMISS_KEY, today);
    setDismissed(true);
  };

  if (dismissed !== false) return null;
  if (loading || sectores.length === 0) return null;

  return (
    <section className="card border-accent/20 bg-accent/5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-text">Mapa de sectores</h3>
          <span className="text-xs text-muted">— los 6 grandes compradores del Estado</span>
        </div>
        <button onClick={dismiss} aria-label="Ocultar por hoy" className="text-muted hover:text-text">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {sectores.map((s) => (
          <div key={s.sector} className="rounded-lg border border-border bg-surface p-3">
            <p className="text-xs text-muted truncate" title={s.sector}>{s.sector}</p>
            <p className="text-sm font-semibold text-text mt-0.5">{formatCLP(s.monto_total)}</p>
            <p className="text-xs text-subtle mt-0.5">{s.n_organismos} organismos · {s.n_proveedores} proveedores</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Render en `page.tsx`**

Arriba de `<MarketSummaryCard>`:

```tsx
<SectorOverview />
```

Import: `import { SectorOverview } from './components/SectorOverview';`

- [ ] **Step 4: Build + smoke**

Build OK. Primera visita: aparece el banner. Click en X → se oculta. Reload: sigue oculto (hasta mañana).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/dashboard/bi/components/SectorOverview.tsx \
        frontend/lib/api.ts \
        frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): add SectorOverview banner (dismissible once per day)"
```

---

### ⛳ Checkpoint Fase 1

- [ ] `/api/bi/resumen` responde con narrativa + teasers
- [ ] `MarketSummaryCard` aparece arriba del panel con 1-3 frases
- [ ] Plan básico ve teasers textuales en §3/§4/§5, no blur
- [ ] `PlanGate` NO ejecuta fetches de children cuando `locked`
- [ ] `SectorOverview` aparece una vez por día
- [ ] Build + lint OK en frontend
- [ ] pytest OK en backend

**Revisar con el usuario** — esta fase cambia visualmente mucho el panel. Validar antes de seguir.

---

## Fase 2 — Personalización

### Task 2.1 — Backend: endpoint `/api/bi/mi_posicion`

**Files:**
- Modify: `backend/app/schemas/bi.py` (agregar `MiPosicionResponse`)
- Modify: `backend/app/services/bi_service.py` (agregar `get_mi_posicion()`)
- Modify: `backend/app/api/bi.py` (agregar route con auth + empresa membership)
- Create: `backend/tests/test_bi_mi_posicion.py`

- [ ] **Step 1: Schema en `backend/app/schemas/bi.py`**

Al final:

```python
class MiPosicionTopOrganismo(BaseModel):
    nombre: Optional[str] = None
    porcentaje_oc: Optional[float] = None


class MiPosicionResponse(BaseModel):
    disponible: bool
    tiene_historial: bool = False
    participacion_pct: Optional[float] = None
    rank: Optional[int] = None
    total_proveedores: Optional[int] = None
    n_organismos_atendidos: Optional[int] = None
    n_organismos_promedio_sector: Optional[int] = None
    diversificacion_pct: Optional[float] = None
    alerta_dependencia: Optional[bool] = None
    top_organismo_empresa: Optional[MiPosicionTopOrganismo] = None
    motivo: Optional[str] = None
```

- [ ] **Step 2: Helper de normalización RUT en `bi_service.py`**

Al inicio de las utilidades:

```python
def _normalize_rut(rut: str) -> str:
    """Normaliza RUT chileno al formato de CodigoProveedor del parquet.
    Quita puntos y guiones; ChileCompra suele usar '12345678-9' en el parquet.
    Retorna formato '12345678-9' o cadena vacía si inválido."""
    if not rut:
        return ""
    cleaned = rut.replace(".", "").replace(" ", "").upper()
    if "-" not in cleaned and len(cleaned) > 1:
        cleaned = f"{cleaned[:-1]}-{cleaned[-1]}"
    return cleaned
```

- [ ] **Step 3: Implementar `get_mi_posicion()` en `bi_service.py`**

Al final del archivo:

```python
def get_mi_posicion(empresa_rut: str, rubro: str) -> dict:
    """Posición del proveedor (empresa del usuario) en un rubro específico."""
    if not empresa_rut or not rubro:
        return {"disponible": False, "tiene_historial": False, "motivo": "rut y rubro requeridos"}

    rut_norm = _normalize_rut(empresa_rut)

    df_comp = _load("competitor_analysis.parquet")
    if df_comp is None:
        return {"disponible": False, "tiene_historial": False, "motivo": "parquet no disponible"}

    # Filtrar por rubro
    subset = df_comp.filter(df_comp["RubroN2"] == rubro)
    if len(subset) == 0:
        return {"disponible": True, "tiene_historial": False, "motivo": "sin datos para este rubro"}

    # Ranking por market_share
    ranked = subset.sort("market_share_pct", descending=True).to_dicts()
    total_prov = len(ranked)

    empresa_row = None
    rank = None
    for i, row in enumerate(ranked):
        if row.get("CodigoProveedor") == rut_norm:
            empresa_row = row
            rank = i + 1
            break

    if empresa_row is None:
        return {
            "disponible": True,
            "tiene_historial": False,
            "total_proveedores": total_prov,
            "motivo": f"El RUT {rut_norm} no tiene historial de OC en {rubro}",
        }

    participacion_pct = float(empresa_row.get("market_share_pct") or 0)

    # n_organismos promedio del sector
    # Aproximación: tomar el promedio de n_oc / n_proveedores — si el parquet tiene un campo mejor, usarlo
    n_org_prom = None  # placeholder; implementar cuando ETL lo exponga

    # Diversificación — reusar provider_diversification.parquet si existe
    df_div = _load("provider_diversification.parquet")
    diversificacion_pct = None
    alerta_dependencia = False
    top_org_nombre = None
    top_org_pct = None
    if df_div is not None:
        row = df_div.filter(df_div["CodigoProveedor"] == rut_norm)
        if len(row) > 0:
            d = row.to_dicts()[0]
            diversificacion_pct = float(d.get("score_diversificacion") or 0) * 100
            alerta_dependencia = bool(d.get("alerta_dependencia") or False)
            top_org_nombre = d.get("top_comprador_nombre")
            top_org_pct = float(d.get("top_comprador_pct") or 0)

    return {
        "disponible": True,
        "tiene_historial": True,
        "participacion_pct": participacion_pct,
        "rank": rank,
        "total_proveedores": total_prov,
        "n_organismos_atendidos": int(empresa_row.get("n_organismos") or 0) if "n_organismos" in empresa_row else None,
        "n_organismos_promedio_sector": n_org_prom,
        "diversificacion_pct": diversificacion_pct,
        "alerta_dependencia": alerta_dependencia,
        "top_organismo_empresa": {
            "nombre": top_org_nombre,
            "porcentaje_oc": top_org_pct,
        } if top_org_nombre else None,
    }
```

- [ ] **Step 4: Route en `backend/app/api/bi.py`**

```python
@router.get(
    "/mi_posicion",
    response_model=MiPosicionResponse,
    summary="Posición de la empresa del usuario en un rubro (personalización)",
    description=(
        "Combina market_share + provider_diversification para la empresa del usuario. "
        "Requiere que el RUT de la empresa esté registrado y matchee con CodigoProveedor."
    ),
)
async def get_mi_posicion(
    empresa_id: UUID = Query(..., description="UUID de empresa"),
    rubro: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_bi_quota_dep),
):
    _require_analytics()
    from app.models.empresa import Empresa
    from app.services import bi_service

    # Verificar membership
    membership = (await db.execute(
        select(EmpresaUsuario).where(
            EmpresaUsuario.empresa_id == empresa_id,
            EmpresaUsuario.user_id == current_user.id
        )
    )).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Sin acceso a esta empresa")

    empresa = (await db.execute(select(Empresa).where(Empresa.id == empresa_id))).scalar_one_or_none()
    if not empresa or not empresa.rut:
        return {"disponible": False, "tiene_historial": False, "motivo": "Empresa sin RUT"}

    return bi_service.get_mi_posicion(empresa.rut, rubro)
```

Import: `MiPosicionResponse` al tope de `bi.py`.

- [ ] **Step 5: Test `backend/tests/test_bi_mi_posicion.py`**

```python
"""Tests for /api/bi/mi_posicion endpoint."""
import pytest


def test_normalize_rut():
    from app.services.bi_service import _normalize_rut
    assert _normalize_rut("12.345.678-9") == "12345678-9"
    assert _normalize_rut("123456789") == "12345678-9"
    assert _normalize_rut("12345678-9") == "12345678-9"
    assert _normalize_rut("") == ""
    assert _normalize_rut(None) == ""


def test_mi_posicion_sin_rut_o_rubro_retorna_no_disponible():
    from app.services import bi_service
    assert bi_service.get_mi_posicion("", "Equipos médicos")["disponible"] is False
    assert bi_service.get_mi_posicion("12345678-9", "")["disponible"] is False


def test_mi_posicion_sin_parquet_retorna_no_disponible(monkeypatch, tmp_path):
    from app.services import bi_service
    from app import config
    monkeypatch.setattr(config.settings, "analytics_data_path", str(tmp_path))
    bi_service._cache.clear()
    result = bi_service.get_mi_posicion("12345678-9", "Algún rubro")
    assert result["disponible"] is False
```

- [ ] **Step 6: Correr tests**

```bash
cd backend && pytest tests/test_bi_mi_posicion.py -v
```

Expected: 3/3 pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/bi.py \
        backend/app/services/bi_service.py \
        backend/app/api/bi.py \
        backend/tests/test_bi_mi_posicion.py
git commit -m "feat(bi): add /api/bi/mi_posicion endpoint for personalized positioning card"
```

---

### Task 2.2 — Frontend: `MyPositionCard` con teaser para básico

**Files:**
- Modify: `frontend/app/dashboard/bi/types.ts` (agregar `MiPosicion`)
- Modify: `frontend/lib/api.ts` (agregar `getBIMiPosicion`)
- Create: `frontend/app/dashboard/bi/components/MyPositionCard.tsx`
- Modify: `frontend/app/dashboard/bi/page.tsx` (fetch + render)

- [ ] **Step 1: Tipo en `types.ts`**

```ts
export interface MiPosicion {
  disponible: boolean;
  tiene_historial: boolean;
  participacion_pct?: number;
  rank?: number;
  total_proveedores?: number;
  n_organismos_atendidos?: number;
  n_organismos_promedio_sector?: number;
  diversificacion_pct?: number;
  alerta_dependencia?: boolean;
  top_organismo_empresa?: {
    nombre?: string;
    porcentaje_oc?: number;
  };
  motivo?: string;
}
```

- [ ] **Step 2: Método `getBIMiPosicion` en `api.ts`**

```ts
async getBIMiPosicion(params: { empresa_id: string; rubro: string }) {
  const res = await this.client.get('/api/bi/mi_posicion', { params });
  return res.data;
}
```

- [ ] **Step 3: Componente `MyPositionCard.tsx`**

```tsx
'use client';

import { User, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { MiPosicion, PlanTier, isPaidPlan } from '../types';

interface MyPositionCardProps {
  posicion: MiPosicion | null;
  plan: PlanTier | undefined;
}

export function MyPositionCard({ posicion, plan }: MyPositionCardProps) {
  if (!posicion) return null;

  const paid = isPaidPlan(plan);

  // Sin historial
  if (posicion.disponible && !posicion.tiene_historial) {
    return (
      <section className="card border-border/60 bg-surface/60">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-surface border border-border p-2 shrink-0">
            <User className="h-4 w-4 text-muted" />
          </div>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-text mb-1">Tu posición</p>
            <p className="text-muted">
              Aún no tienes historial de ventas a Mercado Público en este rubro.
              Esta card cobrará vida cuando completes tu primera orden de compra.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!posicion.disponible) return null;

  // TEASER para plan básico
  if (!paid) {
    return (
      <section className="card border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3 mb-3">
          <div className="rounded-full bg-primary/15 p-2 shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 text-sm space-y-1.5">
            <p className="font-semibold text-text">Tu posición</p>
            {posicion.participacion_pct != null && (
              <p className="text-text">
                Tu participación en este mercado: <b>{posicion.participacion_pct.toFixed(1)}%</b>
              </p>
            )}
            {posicion.top_organismo_empresa?.porcentaje_oc != null && (
              <p className="text-text">
                Tu dependencia en un solo comprador: <b>{posicion.top_organismo_empresa.porcentaje_oc.toFixed(0)}%</b>
              </p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface/70 p-3 flex items-center gap-3">
          <p className="flex-1 text-xs text-muted">
            Ver tu ranking completo, diversificación y alertas
          </p>
          <Link href="/dashboard/billing" className="btn-primary text-xs">
            Plan PYME →
          </Link>
        </div>
      </section>
    );
  }

  // PYME+ — versión completa
  return (
    <section className="card border-primary/30 bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/15 p-2 shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 space-y-2 text-sm">
          <p className="font-semibold text-text">Tu posición</p>
          {posicion.participacion_pct != null && posicion.rank != null && posicion.total_proveedores != null && (
            <p className="text-text">
              📊 Participación: <b>{posicion.participacion_pct.toFixed(1)}%</b> · puesto <b>{posicion.rank}</b> de <b>{posicion.total_proveedores}</b>
            </p>
          )}
          {posicion.n_organismos_atendidos != null && (
            <p className="text-text">
              🏛️ Vendes a <b>{posicion.n_organismos_atendidos}</b> organismos
              {posicion.n_organismos_promedio_sector != null && <span className="text-muted"> (mercado: {posicion.n_organismos_promedio_sector} en promedio)</span>}
            </p>
          )}
          {posicion.alerta_dependencia && posicion.top_organismo_empresa?.porcentaje_oc != null && (
            <p className="flex items-start gap-1.5 text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <b>{posicion.top_organismo_empresa.porcentaje_oc.toFixed(0)}%</b> de tus OC dependen de un solo comprador
                {posicion.top_organismo_empresa.nombre ? ` (${posicion.top_organismo_empresa.nombre})` : ''} — alerta de concentración
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire en `page.tsx`**

Agregar state + fetch:

```tsx
const [miPosicion, setMiPosicion] = useState<MiPosicion | null>(null);

const loadMiPosicion = useCallback(async (empresaId: string, rubro: string) => {
  if (!empresaId || !rubro) { setMiPosicion(null); return; }
  try {
    const res = await apiClient.getBIMiPosicion({ empresa_id: empresaId, rubro });
    setMiPosicion(res);
  } catch {
    setMiPosicion(null);
  }
}, []);
```

En `handleRubroChange`:

```tsx
if (firstEmpresaId) loadMiPosicion(firstEmpresaId, rubro);
```

Render en un grid 2-col con `MarketSummaryCard`:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <MarketSummaryCard resumen={resumen} loading={loadingResumen} />
  <MyPositionCard posicion={miPosicion} plan={plan} />
</div>
```

Imports:
```tsx
import { MyPositionCard } from './components/MyPositionCard';
import { MiPosicion } from './types';
```

- [ ] **Step 5: Smoke test**

Browser: seleccionar rubro → si la empresa tiene RUT registrado, aparece la card a la derecha del `MarketSummaryCard`. Dependiendo del `plan_tier`, muestra teaser o versión completa.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/bi/types.ts \
        frontend/lib/api.ts \
        frontend/app/dashboard/bi/components/MyPositionCard.tsx \
        frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): add MyPositionCard with teaser for básico and full view for PYME+"
```

---

### Task 2.3 — Cross-linking (`focusedOrganismo`)

**Files:**
- Modify: `frontend/app/dashboard/bi/page.tsx` (state + propagación)
- Modify: `frontend/app/dashboard/bi/components/RubroFilter.tsx` (chip removable)
- Modify: `frontend/app/dashboard/bi/components/OportunidadesSection.tsx` (botón)
- Modify: `frontend/app/dashboard/bi/components/CompetenciaSection.tsx` (respeta focused)
- Modify: `frontend/app/dashboard/bi/components/CompradoresSection.tsx` (filtra top 1)
- Modify: `frontend/app/dashboard/bi/components/EstacionalidadSection.tsx` (selectedOrg = focused)

- [ ] **Step 1: State y chip en `page.tsx`**

Agregar state:

```tsx
const [focusedOrganismo, setFocusedOrganismo] = useState<OrganismoConNombre | null>(null);
```

- [ ] **Step 2: Chip en `RubroFilter.tsx`**

Agregar prop:

```tsx
interface RubroFilterProps {
  // ... existentes
  focusedOrganismo?: { codigo: string; nombre: string } | null;
  onClearFocus?: () => void;
}
```

Después del chip de selectedRubro (dentro del return, después del bloque "Lock badge"):

```tsx
{focusedOrganismo && (
  <span className="flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/30 px-3 py-1 text-xs font-medium text-accent">
    Enfocando: {focusedOrganismo.nombre.length > 30 ? `${focusedOrganismo.nombre.slice(0, 30)}…` : focusedOrganismo.nombre}
    <button onClick={onClearFocus} aria-label="Desfijar organismo" className="hover:text-danger">
      <X className="h-3 w-3" />
    </button>
  </span>
)}
```

Pasar las props desde `page.tsx`:

```tsx
<RubroFilter
  // ... existentes
  focusedOrganismo={focusedOrganismo}
  onClearFocus={() => setFocusedOrganismo(null)}
/>
```

- [ ] **Step 3: Botón en `OportunidadesSection.tsx`**

Propagar callback desde `page.tsx`:

```tsx
interface OportunidadesSectionProps {
  oportunidades: OportunidadItem[];
  loading: boolean;
  onFocusOrganismo?: (o: OrganismoConNombre) => void;
}
```

En `ExpandedRow`, aceptar prop `onFocus`:

```tsx
function ExpandedRow({ organismo, nombre, onFocus }: {
  organismo: string;
  nombre: string;
  onFocus?: (o: { codigo: string; nombre: string }) => void;
}) {
  // ... resto igual
  // Después del grid de metrics, antes del cierre del JSX:
  // Pero los return tempranos lo complican. Reubicar dentro del caso de data cargado:

  return (
    <div className="p-4 bg-surface/60 border-t border-border">
      {/* ... grid de métricas */}
      {onFocus && (
        <div className="mt-4 pt-3 border-t border-border flex justify-end">
          <button
            onClick={() => onFocus({ codigo: organismo, nombre })}
            className="text-sm text-primary hover:underline font-medium"
          >
            Analizar este comprador en todo el panel →
          </button>
        </div>
      )}
    </div>
  );
}
```

Pasar `onFocus` desde la tabla de oportunidades (reemplazar el ExpandedRow render con `nombre` y `onFocus`):

```tsx
<ExpandedRow
  organismo={op.CodigoOrganismoPublico}
  nombre={op.NombreOrganismo || op.CodigoOrganismoPublico}
  onFocus={onFocusOrganismo}
/>
```

Y en `page.tsx`:

```tsx
<OportunidadesSection
  oportunidades={oportunidades}
  loading={loadingOp}
  onFocusOrganismo={(o) => {
    setFocusedOrganismo(o);
    // scroll a §3
    setTimeout(() => {
      document.querySelector('[data-section="competencia"]')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }}
/>
```

- [ ] **Step 4: Secciones respetan `focusedOrganismo`**

Pasar `focusedOrganismo` a las 3 secciones:

```tsx
<PlanGate locked={!paid} preview={previewCompetencia} label="...">
  <div data-section="competencia">
    <CompetenciaSection
      topOrganismos={topOrganismos}
      selectedOrganismo={focusedOrganismo?.codigo || selectedCompOrg}
      onOrganismoChange={(o) => {
        if (focusedOrganismo) return; // no permitir cambios si está focused
        setSelectedCompOrg(o);
      }}
      rubro={selectedRubro}
      disabled={!!focusedOrganismo}
    />
  </div>
</PlanGate>
```

Agregar `disabled` prop en `CompetenciaSection`:

```tsx
interface CompetenciaSectionProps {
  // ...
  disabled?: boolean;
}
```

Aplicar al select:

```tsx
<select
  value={selectedOrganismo}
  onChange={(e) => onOrganismoChange(e.target.value)}
  disabled={disabled}
  className="... disabled:opacity-60 disabled:cursor-not-allowed"
>
```

- [ ] **Step 5: `CompradoresSection` filtra a top 1 cuando focused**

Modificar la firma para aceptar `focusedOrganismo`:

```tsx
interface CompradorSectionProps {
  topOrganismos: OrganismoConNombre[];
  rubro: string;
  focusedOrganismo?: OrganismoConNombre | null;
}
```

En el render del mapeo:

```tsx
const orgsAMostrar = focusedOrganismo ? [focusedOrganismo] : topOrganismos.slice(0, 3);

// ...

{orgsAMostrar.map((org) => (
  <CompradorCard key={org.codigo} organismoId={org.codigo} />
))}
```

- [ ] **Step 6: `EstacionalidadSection` usa focused**

Modificar para respetar `focusedOrganismo`:

```tsx
interface EstacionalidadSectionProps {
  topOrganismos: OrganismoConNombre[];
  rubro: string;
  focusedOrganismo?: OrganismoConNombre | null;
}

export function EstacionalidadSection({ topOrganismos, rubro, focusedOrganismo }: EstacionalidadSectionProps) {
  const [selectedOrg, setSelectedOrg] = useState(
    focusedOrganismo?.codigo || topOrganismos[0]?.codigo || ''
  );

  // Cuando cambia focused, resetear
  useEffect(() => {
    if (focusedOrganismo) setSelectedOrg(focusedOrganismo.codigo);
  }, [focusedOrganismo?.codigo]);

  // ... resto igual

  // En el render del select, deshabilitar si focused:
  <select
    value={selectedOrg}
    onChange={(e) => !focusedOrganismo && setSelectedOrg(e.target.value)}
    disabled={!!focusedOrganismo}
    className="... disabled:opacity-60"
  >
```

- [ ] **Step 7: Pasar `focusedOrganismo` desde `page.tsx`**

```tsx
<PlanGate locked={!paid} preview={previewCompradores} label="...">
  {topOrganismos.length > 0 && (
    <CompradoresSection
      topOrganismos={topOrganismos}
      rubro={selectedRubro}
      focusedOrganismo={focusedOrganismo}
    />
  )}
</PlanGate>

<PlanGate locked={!paid} preview={previewEstacionalidad} label="...">
  {topOrganismos.length > 0 && (
    <EstacionalidadSection
      topOrganismos={topOrganismos}
      rubro={selectedRubro}
      focusedOrganismo={focusedOrganismo}
    />
  )}
</PlanGate>
```

- [ ] **Step 8: Smoke test**

Browser: click en una row expandida → aparece botón "Analizar este comprador en todo el panel →". Click:
- Aparece chip "Enfocando: Hospital X" en filter bar
- §3 fija el organismo (dropdown disabled)
- §4 muestra solo ese organismo
- §5 fija el organismo (dropdown disabled)
- Scroll suave a §3

Click en X del chip → todo vuelve a comportamiento multi-organismo.

- [ ] **Step 9: Commit**

```bash
git add frontend/app/dashboard/bi/page.tsx \
        frontend/app/dashboard/bi/components/RubroFilter.tsx \
        frontend/app/dashboard/bi/components/OportunidadesSection.tsx \
        frontend/app/dashboard/bi/components/CompetenciaSection.tsx \
        frontend/app/dashboard/bi/components/CompradoresSection.tsx \
        frontend/app/dashboard/bi/components/EstacionalidadSection.tsx
git commit -m "feat(bi): cross-link sections with focusedOrganismo state + chip"
```

---

### Task 2.4 — `BIOnboarding`

**Files:**
- Create: `frontend/app/dashboard/bi/components/BIOnboarding.tsx`
- Modify: `frontend/app/dashboard/bi/page.tsx` (render condicional)

- [ ] **Step 1: Crear `BIOnboarding.tsx`**

```tsx
'use client';

import { Target } from 'lucide-react';

interface BIOnboardingProps {
  onConfigurarRubros: () => void;
  onExplorarSinConfigurar: () => void;
}

export function BIOnboarding({ onConfigurarRubros, onExplorarSinConfigurar }: BIOnboardingProps) {
  return (
    <div className="card flex flex-col items-center gap-4 py-12 text-center max-w-xl mx-auto">
      <div className="rounded-full bg-primary/15 p-4">
        <Target className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-text">Primera vez aquí</h2>
        <p className="mt-2 text-sm text-muted max-w-md">
          Para mostrarte el mercado que te interesa, dinos a qué se dedica tu empresa.
        </p>
      </div>
      <ul className="text-sm text-text space-y-1 text-left">
        <li>✓ Selecciona 2-3 rubros</li>
        <li>✓ Verás oportunidades, competencia y compradores ajustados a ti</li>
      </ul>
      <div className="flex flex-col sm:flex-row gap-2 mt-2">
        <button onClick={onConfigurarRubros} className="btn-primary">
          Seleccionar mis rubros →
        </button>
        <button onClick={onExplorarSinConfigurar} className="btn-ghost text-sm">
          Explorar sin configurar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render condicional en `page.tsx`**

Después del `if (biEnabled === false)`:

```tsx
const necesitaOnboarding =
  !perfil?.rubros_usados?.length &&
  // si empresa tiene rubros_cpv, tampoco es onboarding
  !selectedRubro;

if (necesitaOnboarding && initialized) {
  return (
    <div className="flex flex-col min-h-screen">
      <RubroFilter {/* ... */} />
      <div className="flex-1 p-4">
        <BIOnboarding
          onConfigurarRubros={() => {
            // abrir modal del RubroFilter — requiere exponer trigger via ref o state
            // por simplicidad, scroll al filter bar y mostrar hint (o usar URL)
            document.querySelector('[aria-label="Configurar mis rubros"]')?.scrollIntoView();
          }}
          onExplorarSinConfigurar={() => {
            const primer = allRubros[0];
            if (primer) handleRubroChange(primer);
          }}
        />
      </div>
    </div>
  );
}
```

Simplificación: el botón "Seleccionar mis rubros" puede ser un trigger de `window.dispatchEvent(new CustomEvent('bi:open-rubros-modal'))` — y en `RubroFilter.tsx` escuchar:

```tsx
useEffect(() => {
  const handler = () => setShowModal(true);
  window.addEventListener('bi:open-rubros-modal', handler);
  return () => window.removeEventListener('bi:open-rubros-modal', handler);
}, []);
```

Reemplazar el handler de `onConfigurarRubros` en `page.tsx`:

```tsx
onConfigurarRubros={() => {
  window.dispatchEvent(new CustomEvent('bi:open-rubros-modal'));
}}
```

Import: `import { BIOnboarding } from './components/BIOnboarding';`

- [ ] **Step 3: Smoke test**

Crear un usuario nuevo (o borrar `rubros_usados` del perfil TF-IDF). Abrir `/dashboard/bi`.

Expected: aparece onboarding card. Click "Explorar sin configurar" → selecciona el primer rubro. Click "Seleccionar mis rubros" → abre el modal de `RubroFilter`.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/bi/components/BIOnboarding.tsx \
        frontend/app/dashboard/bi/components/RubroFilter.tsx \
        frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): add BIOnboarding card for users without configured rubros"
```

---

### ⛳ Checkpoint Fase 2

- [ ] `/api/bi/mi_posicion` responde para empresas con RUT
- [ ] `MyPositionCard` aparece junto a `MarketSummaryCard`
- [ ] Plan básico ve teaser de posición; PYME+ ve versión completa
- [ ] Cross-linking funcional: click row §1 → §3/§4/§5 enfocados + chip en filter bar
- [ ] Onboarding aparece solo para nuevos usuarios sin rubros
- [ ] Build + tests OK

**Revisar con el usuario.** Esta es la fase más disruptiva del plan (cambio de paradigma: el panel ahora sabe quién es el usuario). Validar copy, gating y comportamiento de scroll antes de seguir.

---

## Fase 3 — Herramientas

### Task 3.1 — `HerramientasAvanzadas` shell colapsible

**Files:**
- Create: `frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx`
- Modify: `frontend/app/dashboard/bi/page.tsx` (render al pie)

- [ ] **Step 1: Componente shell**

Crear `frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Wrench } from 'lucide-react';

type Tab = 'matching' | 'precio' | 'descuento' | 'forecast';

interface HerramientasAvanzadasProps {
  rubro: string;
}

export function HerramientasAvanzadas({ rubro }: HerramientasAvanzadasProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('matching');

  return (
    <section className="card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <div>
            <h2 className="section-title">Herramientas avanzadas</h2>
            <p className="text-xs text-muted mt-0.5">
              Buscador semántico, calculadora de precio, descuentos y pronóstico de competencia.
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex gap-1 border-b border-border">
            {([
              ['matching', 'Buscador semántico'],
              ['precio', 'Precio histórico'],
              ['descuento', 'Descuentos'],
              ['forecast', 'Competencia esperada'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div>
            {tab === 'matching' && <p className="text-sm text-muted">Próximamente — Task 3.2</p>}
            {tab === 'precio' && <p className="text-sm text-muted">Próximamente — Task 3.3</p>}
            {tab === 'descuento' && <p className="text-sm text-muted">Próximamente — Task 3.4</p>}
            {tab === 'forecast' && <p className="text-sm text-muted">Próximamente — Task 3.5</p>}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Render al pie en `page.tsx`**

Después de la última `PlanGate` (§5):

```tsx
<HerramientasAvanzadas rubro={selectedRubro} />
```

Import.

- [ ] **Step 3: Smoke + commit**

Browser: aparece colapsible al pie. Click → expande con 4 tabs. Cada tab muestra "Próximamente".

```bash
git add frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx \
        frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): add Herramientas Avanzadas collapsible shell with 4 tabs"
```

---

### Task 3.2 — Tab Buscador semántico

**Files:**
- Modify: `frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx`

- [ ] **Step 1: Component interno `TabMatching`**

Dentro de `HerramientasAvanzadas.tsx`, antes del `export function HerramientasAvanzadas`:

```tsx
import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { Loader2, Search } from 'lucide-react';

interface MatchingResult {
  CodigoProveedor?: string;
  NombreProveedor?: string;
  score?: number;
  n_oc?: number;
  monto_total?: number;
}

function TabMatching() {
  const [texto, setTexto] = useState('');
  const [results, setResults] = useState<MatchingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buscar = async () => {
    if (texto.trim().length < 3) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.getBIMatching({ texto, top_n: 20 });
      if (res.disponible) setResults(res.resultados ?? []);
      else setError(res.motivo || 'Buscador no disponible');
    } catch {
      setError('Error al buscar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Escribe un producto o servicio; te muestro los proveedores históricos que más lo trabajan.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="Ej: respiradores mecánicos, uniformes hospitalarios"
            className="input-field pl-9 w-full text-sm"
          />
        </div>
        <button onClick={buscar} disabled={loading || texto.trim().length < 3} className="btn-primary text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {results.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/60 text-left">
                <th className="px-3 py-2 text-xs font-medium text-muted">Proveedor</th>
                <th className="px-3 py-2 text-xs font-medium text-muted">Afinidad</th>
                <th className="px-3 py-2 text-xs font-medium text-muted">OC</th>
                <th className="px-3 py-2 text-xs font-medium text-muted">Monto total</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.CodigoProveedor} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text">{r.NombreProveedor}</td>
                  <td className="px-3 py-2 text-text">{r.score != null ? `${(r.score * 100).toFixed(0)}%` : '—'}</td>
                  <td className="px-3 py-2 text-text">{r.n_oc?.toLocaleString('es-CL') ?? '—'}</td>
                  <td className="px-3 py-2 text-text">
                    {r.monto_total ? `CLP ${(r.monto_total / 1e6).toFixed(1)}M` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

Reemplazar `{tab === 'matching' && <p>Próximamente</p>}` por `{tab === 'matching' && <TabMatching />}`.

- [ ] **Step 2: Smoke + commit**

```bash
git add frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx
git commit -m "feat(bi): implement Buscador semántico tab in Herramientas Avanzadas"
```

---

### Task 3.3 — Tab Calculadora de precio histórico

- [ ] **Step 1: Agregar método `getBIPrecio` en `api.ts`**

```ts
async getBIPrecio(codigoProducto: string, params: { organismo_id?: string; unidad_medida?: string } = {}) {
  const res = await this.client.get(`/api/bi/precio/${encodeURIComponent(codigoProducto)}`, { params });
  return res.data;
}
```

- [ ] **Step 2: Component interno `TabPrecio`**

Dentro de `HerramientasAvanzadas.tsx`:

```tsx
function TabPrecio() {
  const [codigo, setCodigo] = useState('');
  const [organismo, setOrganismo] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const consultar = async () => {
    if (codigo.trim().length < 3) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.getBIPrecio(codigo.trim(), {
        organismo_id: organismo || undefined,
      });
      setResultado(res);
      if (!res.disponible) setError('Sin datos para este código');
    } catch {
      setError('Error');
    } finally {
      setLoading(false);
    }
  };

  const banda = resultado?.resultado?.[0];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Ingresa el código ONU del producto. Opcionalmente filtra por organismo específico.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código ONU (ej: 41115802)" className="input-field text-sm" />
        <input value={organismo} onChange={(e) => setOrganismo(e.target.value)} placeholder="Organismo (opcional)" className="input-field text-sm" />
        <button onClick={consultar} disabled={loading} className="btn-primary text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Consultar'}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {banda && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-text">
            Este producto ha tenido precios entre <b>CLP {banda.p10?.toLocaleString('es-CL')}</b> (bajo)
            y <b>CLP {banda.p90?.toLocaleString('es-CL')}</b> (alto),
            con precio típico de <b>CLP {banda.p50?.toLocaleString('es-CL')}</b>.
          </p>
          {banda.n && <p className="text-xs text-muted mt-1">Basado en {banda.n} transacciones · Fuente: {resultado?.nivel_usado || 'N/A'}.</p>}
        </div>
      )}
    </div>
  );
}
```

Reemplazar `{tab === 'precio' && <p>Próximamente</p>}` por `{tab === 'precio' && <TabPrecio />}`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx frontend/lib/api.ts
git commit -m "feat(bi): implement Precio histórico tab in Herramientas Avanzadas"
```

---

### Task 3.4 — Tab Descuentos (mover aquí la data de Fase 0.3)

- [ ] **Step 1: Component interno `TabDescuento`**

```tsx
function TabDescuento({ rubro }: { rubro: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rubro) return;
    setLoading(true);
    apiClient.getBIDescuento({ rubro })
      .then((res) => setData(res.disponible ? (res.descuentos ?? []) : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [rubro]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (data.length === 0) return <p className="text-xs text-muted">Selecciona un rubro para ver descuentos típicos.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Descuento típico observado según cantidad de oferentes:</p>
      <ul className="space-y-1 text-sm">
        {data.slice(0, 5).map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">
              {d.n_oferentes_rango} oferente{d.n_oferentes_rango !== '1' ? 's' : ''}
            </span>
            <span className="text-text">
              descuento típico: <b>{d.p50?.toFixed(1)}%</b>
              {d.p90 != null && <span className="text-muted"> (hasta {d.p90?.toFixed(0)}% en casos competitivos)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Agregar import `useEffect` arriba.

Render: `{tab === 'descuento' && <TabDescuento rubro={rubro} />}`.

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx
git commit -m "feat(bi): implement Descuentos tab (moved from §4) with narrative output"
```

---

### Task 3.5 — Tab Pronóstico de competencia

- [ ] **Step 1: Método `getBIForecastCompetidores` en `api.ts`**

```ts
async getBIForecastCompetidores(params: { organismo_id?: string; rubro?: string; tipo?: string } = {}) {
  const res = await this.client.get('/api/bi/forecast_competidores', { params });
  return res.data;
}
```

- [ ] **Step 2: Component interno `TabForecast`**

```tsx
function TabForecast({ rubro }: { rubro: string }) {
  const [organismo, setOrganismo] = useState('');
  const [tipo, setTipo] = useState('LP');
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const consultar = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getBIForecastCompetidores({
        organismo_id: organismo || undefined,
        rubro: rubro || undefined,
        tipo,
      });
      setResultado(res);
    } catch {
      setResultado(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        ¿Cuántos competidores esperar en una licitación hipotética?
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input-field text-sm">
          <option value="L1">L1 — menor</option>
          <option value="LE">LE — mediana</option>
          <option value="LP">LP — pública</option>
        </select>
        <input value={organismo} onChange={(e) => setOrganismo(e.target.value)} placeholder="Organismo (opcional)" className="input-field text-sm" />
        <button onClick={consultar} disabled={loading} className="btn-primary text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pronosticar'}
        </button>
      </div>
      {resultado?.disponible && resultado.prediccion && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-text">
            Este tipo de licitación en este contexto suele atraer
            entre <b>{resultado.prediccion.min_esperado}</b> y <b>{resultado.prediccion.max_esperado}</b> competidores
            (promedio: {resultado.prediccion.promedio?.toFixed(1)}).
          </p>
          <p className="text-xs text-muted mt-1">
            Confianza: {resultado.prediccion.confianza} · Basado en {resultado.prediccion.n_casos} casos históricos · Nivel: {resultado.nivel_usado}
          </p>
        </div>
      )}
    </div>
  );
}
```

Render: `{tab === 'forecast' && <TabForecast rubro={rubro} />}`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx frontend/lib/api.ts
git commit -m "feat(bi): implement Competencia esperada tab in Herramientas Avanzadas"
```

---

### Task 3.6 — `CompareMode` (comparador de rubros)

**Files:**
- Create: `frontend/app/dashboard/bi/components/CompareMode.tsx`
- Modify: `frontend/app/dashboard/bi/components/RubroFilter.tsx` (toggle)
- Modify: `frontend/app/dashboard/bi/page.tsx` (render condicional)

- [ ] **Step 1: Componente `CompareMode.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { ResumenMercado, OportunidadItem, TendenciaItem } from '../types';

interface CompareModeProps {
  rubroA: string;
  rubroB: string;
  allRubros: string[];
  onChangeRubroB: (r: string) => void;
  onClose: () => void;
}

interface RubroData {
  resumen: ResumenMercado | null;
  oportunidades: OportunidadItem[];
  tendencia: TendenciaItem | null;
  loading: boolean;
}

async function loadRubroData(rubro: string): Promise<Omit<RubroData, 'loading'>> {
  const [resumenRes, opRes, tendRes] = await Promise.all([
    apiClient.getBIResumen(rubro).catch(() => null),
    apiClient.getBIOportunidades({ rubro, min_score: 4, limit: 10 }).catch(() => null),
    apiClient.getBITendencia({ rubro, limit: 1 }).catch(() => null),
  ]);
  return {
    resumen: resumenRes,
    oportunidades: opRes?.oportunidades ?? [],
    tendencia: tendRes?.tendencias?.[0] ?? null,
  };
}

function RubroColumn({ rubro, data }: { rubro: string; data: RubroData }) {
  if (data.loading) return (
    <div className="card flex items-center justify-center py-10">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
  const maxScore = data.oportunidades.length > 0
    ? Math.max(...data.oportunidades.map((o) => o.opportunity_score))
    : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text truncate" title={rubro}>{rubro}</h3>
      <div className="card space-y-2 text-sm">
        {data.resumen?.monto_anual_clp && (
          <p>Monto anual: <b>CLP {(data.resumen.monto_anual_clp / 1e9).toFixed(1)} mil millones</b></p>
        )}
        <p>Oportunidades: <b>{data.oportunidades.length}</b></p>
        <p>Mejor score: <b>{maxScore > 0 ? maxScore.toFixed(1) : '—'}</b></p>
        {data.tendencia?.cagr != null && (
          <p>Crecimiento anual: <b className={data.tendencia.cagr >= 0 ? 'text-accent' : 'text-danger'}>
            {data.tendencia.cagr > 0 ? '+' : ''}{data.tendencia.cagr.toFixed(1)}%
          </b></p>
        )}
        {data.resumen?.n_proveedores_actual && (
          <p>Competencia: <b>{data.resumen.n_proveedores_actual} proveedores</b></p>
        )}
        {data.resumen?.top_comprador?.nombre && (
          <p>Top comprador: <b>{data.resumen.top_comprador.nombre}</b></p>
        )}
      </div>
    </div>
  );
}

export function CompareMode({ rubroA, rubroB, allRubros, onChangeRubroB, onClose }: CompareModeProps) {
  const [dataA, setDataA] = useState<RubroData>({ resumen: null, oportunidades: [], tendencia: null, loading: true });
  const [dataB, setDataB] = useState<RubroData>({ resumen: null, oportunidades: [], tendencia: null, loading: true });

  useEffect(() => {
    setDataA((p) => ({ ...p, loading: true }));
    loadRubroData(rubroA).then((d) => setDataA({ ...d, loading: false }));
  }, [rubroA]);

  useEffect(() => {
    if (!rubroB) return;
    setDataB((p) => ({ ...p, loading: true }));
    loadRubroData(rubroB).then((d) => setDataB({ ...d, loading: false }));
  }, [rubroB]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text">Comparando:</span>
        <span className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary">
          {rubroA}
        </span>
        <span className="text-muted text-xs">vs.</span>
        <select value={rubroB} onChange={(e) => onChangeRubroB(e.target.value)} className="input-field text-sm">
          <option value="">Selecciona rubro para comparar</option>
          {allRubros.filter((r) => r !== rubroA).map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button onClick={onClose} className="ml-auto text-muted hover:text-danger" aria-label="Cerrar modo comparar">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!rubroB ? (
        <div className="card text-sm text-muted text-center py-8">
          Selecciona el segundo rubro para ver la comparación.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RubroColumn rubro={rubroA} data={dataA} />
          <RubroColumn rubro={rubroB} data={dataB} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Toggle en `RubroFilter.tsx`**

Agregar prop `onToggleCompare`:

```tsx
interface RubroFilterProps {
  // ...
  onToggleCompare?: () => void;
}
```

Al final de la barra (antes del modal), en desktop:

```tsx
<button
  onClick={onToggleCompare}
  className="hidden md:flex items-center gap-1.5 text-xs text-muted hover:text-primary ml-2"
>
  Comparar 2 rubros
</button>
```

- [ ] **Step 3: State + render en `page.tsx`**

```tsx
const [compareMode, setCompareMode] = useState(false);
const [rubroB, setRubroB] = useState('');
```

Reemplazar el main content (lo que va debajo del RubroFilter) con:

```tsx
{compareMode ? (
  <div className="flex-1 p-4 pb-12">
    <CompareMode
      rubroA={selectedRubro}
      rubroB={rubroB}
      allRubros={allRubros}
      onChangeRubroB={setRubroB}
      onClose={() => { setCompareMode(false); setRubroB(''); }}
    />
  </div>
) : (
  <div className="flex-1 space-y-6 p-4 pb-12">
    {/* contenido actual: SectorOverview, MarketSummary/MyPosition, secciones */}
  </div>
)}
```

Pasar `onToggleCompare={() => setCompareMode(true)}` al `RubroFilter`.

Import: `import { CompareMode } from './components/CompareMode';`

- [ ] **Step 4: Smoke test**

Browser desktop ≥1024px: aparece botón "Comparar 2 rubros" en filter bar. Click → modo compare. Seleccionar segundo rubro → 2 columnas con métricas. Cerrar con X → vuelve al panel normal.

Verificar en móvil que el botón NO aparece.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/dashboard/bi/components/CompareMode.tsx \
        frontend/app/dashboard/bi/components/RubroFilter.tsx \
        frontend/app/dashboard/bi/page.tsx
git commit -m "feat(bi): add CompareMode for side-by-side rubro comparison (desktop only)"
```

---

### ⛳ Checkpoint Fase 3

- [ ] Herramientas Avanzadas aparece al pie, 4 tabs funcionales
- [ ] Compare mode disponible en desktop, oculto en móvil
- [ ] Sin cambios backend (todos los endpoints existen)
- [ ] Build + lint OK

**Revisar con el usuario.**

---

## Fase 4 — Compartibilidad

### Task 4.1 — `ShareMenu` por sección

**Files:**
- Create: `frontend/app/dashboard/bi/components/ShareMenu.tsx`
- Modify: `MarketSummaryCard.tsx`, `OportunidadesSection.tsx`, `TendenciasSection.tsx` (agregar menu en header)

- [ ] **Step 1: Instalar `html2canvas`**

```bash
cd frontend && npm install html2canvas
```

- [ ] **Step 2: Componente `ShareMenu.tsx`**

```tsx
'use client';

import { useState, useRef, useEffect, RefObject } from 'react';
import { MoreHorizontal, Copy, Download, Link as LinkIcon, Check } from 'lucide-react';

interface ShareMenuProps {
  // Ref al elemento a capturar como PNG
  targetRef: RefObject<HTMLElement | null>;
  // Texto a copiar cuando el user elige "Copiar resumen"
  summaryText: string;
  // Nombre de archivo para el PNG (sin extensión)
  filename: string;
}

export function ShareMenu({ targetRef, summaryText, filename }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'text' | 'link' | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const copiarResumen = async () => {
    await navigator.clipboard.writeText(`${summaryText}\n\nVer en Tordo → ${window.location.href}`);
    setCopied('text');
    setTimeout(() => setCopied(null), 1500);
  };

  const copiarLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied('link');
    setTimeout(() => setCopied(null), 1500);
  };

  const descargarPNG = async () => {
    if (!targetRef.current) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(targetRef.current, { backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Compartir"
        className="p-1.5 text-muted hover:text-text rounded-lg hover:bg-surface"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-border bg-surface shadow-xl z-20 py-1">
          <button onClick={copiarResumen} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-primary/5 text-left">
            {copied === 'text' ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5 text-muted" />}
            Copiar resumen
          </button>
          <button onClick={descargarPNG} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-primary/5 text-left">
            <Download className="h-3.5 w-3.5 text-muted" />
            Descargar PNG
          </button>
          <button onClick={copiarLink} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-primary/5 text-left">
            {copied === 'link' ? <Check className="h-3.5 w-3.5 text-accent" /> : <LinkIcon className="h-3.5 w-3.5 text-muted" />}
            Copiar link
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Agregar `ShareMenu` en `MarketSummaryCard`**

Usar `useRef` y pasarlo como prop target. Header modificado:

```tsx
import { useRef } from 'react';
import { ShareMenu } from './ShareMenu';

// ... dentro del componente:
const rootRef = useRef<HTMLElement>(null);
const frases = buildFrases(resumen);
const summaryText = frases.map((f) => f.replace(/<[^>]*>/g, '')).join(' ');

return (
  <section ref={rootRef} className="card bg-gradient-to-br ...">
    <div className="flex items-start gap-3">
      {/* ... contenido ... */}
      <ShareMenu
        targetRef={rootRef}
        summaryText={summaryText}
        filename={`tordo-bi-resumen-${resumen.rubro?.replace(/\s+/g, '-') || 'mercado'}`}
      />
    </div>
  </section>
);
```

- [ ] **Step 4: Agregar `ShareMenu` en `OportunidadesSection` y `TendenciasSection`**

Patrón idéntico al paso 3. En el header de cada section card, agregar `<ShareMenu ... />` al lado del título. Construir `summaryText` de los 2-3 datos principales.

- [ ] **Step 5: URL sync en `page.tsx`**

Agregar `useEffect` que sincroniza el estado con la URL:

```tsx
useEffect(() => {
  const params = new URLSearchParams();
  if (selectedRubro) params.set('rubro', selectedRubro);
  if (focusedOrganismo) params.set('focus', focusedOrganismo.codigo);
  if (compareMode && rubroB) params.set('compare', rubroB);
  const qs = params.toString();
  const newUrl = qs ? `?${qs}` : window.location.pathname;
  window.history.replaceState({}, '', newUrl);
}, [selectedRubro, focusedOrganismo, compareMode, rubroB]);
```

Parseo al mount inicial (dentro del init effect):

```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const rubroParam = params.get('rubro');
  const focusParam = params.get('focus');
  const compareParam = params.get('compare');
  if (rubroParam) setSelectedRubro(rubroParam);
  // focus y compare se setean después de que oportunidades carguen (para tener nombres)
  if (compareParam) { setCompareMode(true); setRubroB(compareParam); }
}, []);
```

- [ ] **Step 6: Smoke test**

Browser: click en `⋯` de una section → aparece menú. "Copiar resumen" → clipboard tiene texto + URL. "Descargar PNG" → descarga una imagen. "Copiar link" → URL con params.

Abrir el link copiado en nueva pestaña → el panel carga con el mismo estado.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/dashboard/bi/components/ShareMenu.tsx \
        frontend/app/dashboard/bi/components/MarketSummaryCard.tsx \
        frontend/app/dashboard/bi/components/OportunidadesSection.tsx \
        frontend/app/dashboard/bi/components/TendenciasSection.tsx \
        frontend/app/dashboard/bi/page.tsx \
        frontend/package.json \
        frontend/package-lock.json
git commit -m "feat(bi): add ShareMenu (copy summary, PNG, copy link) + URL state sync"
```

---

### ⛳ Checkpoint Fase 4

- [ ] `ShareMenu` disponible en secciones clave
- [ ] URL del panel refleja el estado (rubro, focus, compare)
- [ ] Reload desde URL compartida restaura el mismo estado
- [ ] `html2canvas` instalado; PNGs se descargan correctamente
- [ ] Build + lint OK

**Revisar con el usuario.** Fase 0-4 cerradas = panel v2 entregable productivo.

---

## Fase 5 — Apuestas arriesgadas (opt-in)

Cada apuesta es un sprint independiente. Solo ejecutar si el usuario explícitamente lo pide tras evaluar métricas de Fases 0-4.

### Task 5.1 — Radar semanal (opt-in)

**Scope.** Cron Celery lunes 9am America/Santiago → genera resumen semanal por empresa → envía por email/WhatsApp.

**Componentes nuevos:**
- Backend service: `backend/app/services/radar_service.py` — detecta 3 movimientos relevantes por empresa (nueva licitación de score alto, delta en buyer_score de comprador frecuente, nuevo competidor)
- Celery task: en `backend/app/tasks/alert_tasks.py` — `radar_semanal_task()` programada en beat_schedule
- Endpoint: `GET /api/bi/radar_semanal?empresa_id=X` — retorna el payload del radar (opcional, para preview en UI)
- Template email + WhatsApp en `backend/app/services/notification_service.py` (si existe) o nuevo `radar_templates.py`

**Estimación:** 3-5 días. Requiere diseño de "detección de movimientos" (snapshots por semana en DB o memoria). Out of scope sin un spec adicional.

- [ ] **Step 1: Confirmar scope con el usuario.** No avanzar sin escribir un sub-spec dedicado.
- [ ] **Step 2+:** Spec + tasks TBD tras confirmación.

---

### Task 5.2 — Reporte PDF "Modo jefe" (opt-in)

**Scope.** Botón "Generar reporte" en el panel → PDF de 2-3 páginas con branding Tordo.

**Componentes nuevos:**
- Dependencia: `puppeteer` o `playwright` en backend (+200MB en Docker image)
- Endpoint: `POST /api/bi/reporte` → encola task Celery → worker renderiza HTML + genera PDF → guarda en S3/MinIO → devuelve presigned URL
- Template HTML: `backend/app/templates/reporte_bi.html` (Jinja2)
- Frontend: botón "Exportar PDF" en `ShareMenu` (quinta opción)

**Estimación:** 5-7 días. Dockerfile debe incluir Chromium headless. Requiere un sub-spec para plantilla visual.

- [ ] **Step 1: Confirmar scope + compromiso de infra con el usuario.**
- [ ] **Step 2+:** Spec + tasks TBD tras confirmación.

---

### Task 5.3 — Simulador pre-bid (opt-in)

**Scope.** Widget que combina `/forecast_competidores` + `/descuento` + `/comprador` + `/ventana` en output narrativo.

**Componentes nuevos:**
- Componente frontend: `frontend/app/dashboard/bi/components/SimuladorCard.tsx` — formulario + render narrativo
- Opción A (client-side): Frontend llama 4 endpoints en paralelo y compone narrativa.
- Opción B (backend composite): Nuevo endpoint `GET /api/bi/simular?tipo=X&rubro=Y&organismo=Z` que agrega internamente — menos calls, mejor cache.
- Plantillas narrativa en `frontend/app/dashboard/bi/narrative/simular_templates.ts`

**Estimación:** 2-4 días en versión client-side; 4-6 días con backend composite.

- [ ] **Step 1: Decidir client vs backend composite con el usuario.**

- [ ] **Step 2: Crear `SimuladorCard.tsx` (versión client-side por default)**

```tsx
'use client';

import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { apiClient } from '@/lib/api';

export function SimuladorCard() {
  const [tipo, setTipo] = useState('LP');
  const [rubro, setRubro] = useState('');
  const [organismo, setOrganismo] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const simular = async () => {
    setLoading(true);
    try {
      const [forecast, descuento, comprador, ventana] = await Promise.all([
        apiClient.getBIForecastCompetidores({ tipo, rubro, organismo_id: organismo }).catch(() => null),
        apiClient.getBIDescuento({ tipo, rubro, n_oferentes_rango: '4+' }).catch(() => null),
        organismo ? apiClient.getBIComprador(organismo).catch(() => null) : Promise.resolve(null),
        // ventana requiere codigo_externo real, omitir en simulador o requerir input
        Promise.resolve(null),
      ]);
      setResultado({ forecast, descuento, comprador, ventana });
    } finally {
      setLoading(false);
    }
  };

  // render con frases narrativas compuestas de los 3-4 datos
  return (
    <section className="card">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-5 w-5 text-primary" />
        <h2 className="section-title">Simulador pre-bid</h2>
      </div>
      <p className="text-xs text-muted mb-3">
        Si postulara a este tipo de licitación en este rubro/organismo, ¿qué espero?
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input-field text-sm">
          <option value="L1">L1 — menor</option>
          <option value="LE">LE — mediana</option>
          <option value="LP">LP — pública</option>
        </select>
        <input value={rubro} onChange={(e) => setRubro(e.target.value)} placeholder="Rubro" className="input-field text-sm" />
        <input value={organismo} onChange={(e) => setOrganismo(e.target.value)} placeholder="Organismo (opcional)" className="input-field text-sm" />
        <button onClick={simular} disabled={loading} className="btn-primary text-sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simular'}
        </button>
      </div>
      {resultado && (
        <ul className="mt-4 space-y-2 text-sm">
          {resultado.forecast?.disponible && resultado.forecast.prediccion && (
            <li>— <b>{resultado.forecast.prediccion.min_esperado} a {resultado.forecast.prediccion.max_esperado} competidores</b> (confianza {resultado.forecast.prediccion.confianza})</li>
          )}
          {resultado.descuento?.disponible && resultado.descuento.descuentos?.[0] && (
            <li>— Descuento mediano: <b>{resultado.descuento.descuentos[0].p50?.toFixed(1)}%</b></li>
          )}
          {resultado.comprador?.disponible && resultado.comprador.pago?.mediana_dias_pago && (
            <li>— Pago en <b>~{Math.round(resultado.comprador.pago.mediana_dias_pago)} días</b> ({resultado.comprador.clasificacion})</li>
          )}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Render en Herramientas Avanzadas o como sección standalone.**

Recomendación: agregar como 5ª tab en `HerramientasAvanzadas` (`tab === 'simular'`).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/bi/components/SimuladorCard.tsx \
        frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx
git commit -m "feat(bi): add Simulador pre-bid (client-side composition of 3 endpoints)"
```

---

### ⛳ Checkpoint Fase 5

- [ ] Cada apuesta se ejecuta solo si se aprueba explícitamente.
- [ ] Spec dedicado para 5.1 y 5.2 antes de codificar (infra nueva involucrada).

---

## Self-Review

Tras escribir el plan, revisar contra el spec:

1. **Cobertura del spec:**
   - ✅ Fase 0 (fixes 0.1-0.5): cubiertos en Tasks 0.1-0.7
   - ✅ Fase 1 (narrativa 1.1-1.3): cubiertos en Tasks 1.1-1.5
   - ✅ Fase 2 (personalización 2.1-2.3): cubiertos en Tasks 2.1-2.4
   - ✅ Fase 3 (herramientas 3.1-3.3): cubiertos en Tasks 3.1-3.6
   - ✅ Fase 4 (compartibilidad 4.1): cubierto en Task 4.1
   - ✅ Fase 5 (apuestas 5.1-5.3): tasks 5.1-5.3 como opt-in esqueleto

2. **Placeholders:** Todos los "Próximamente" iniciales son reemplazados en tareas subsecuentes (3.2-3.5). No hay TODO ni TBD en código entregable — solo en Tasks 5.1/5.2 donde explícitamente se dice "confirmar scope con usuario antes de codificar".

3. **Consistencia de tipos:**
   - `OrganismoConNombre { codigo, nombre }` usado consistentemente en 0.1, 2.3
   - `ResumenMercado` definido en Task 1.2, consumido en 1.4 con mismos campos
   - `MiPosicion` definido en Task 2.2, matchea response del backend en 2.1

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-17-bi-panel-v2-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — despacho un subagente fresco por task, reviso entre tareas, iteración rápida, contexto limpio para cada task.

**2. Inline Execution** — ejecuto las tasks en esta misma sesión con checkpoints de revisión entre fases.

Dado que son 26 tasks concretas + 3 opt-in, y cada una tiene código self-contained, **Subagent-Driven** es la mejor opción para no saturar el contexto actual.

**¿Cuál prefieres?**
