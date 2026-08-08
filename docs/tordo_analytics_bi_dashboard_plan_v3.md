> 🟡 **Histórico (2026-03).** Es el plan del que salió el módulo de BI, no una
> descripción de cómo quedó. Lo construido está en `CLAUDE.md` §BI.
> Ver [`README.md`](README.md) para el mapa de la documentación.

# TORDO — Dashboard BI & Analytics v3.0
*Marzo 2026 · Confidencial*

> **Estructura de este documento:**
> **PARTE A — Spec de producto:** qué construir, por qué, y cómo debe comportarse.
> **PARTE B — Prompt ejecutable para Claude Code:** cómo implementarlo, en qué orden, con qué restricciones.
>
> Claude Code debe leer ambas partes antes de escribir código. La Parte B sin la Parte A produce trabajo incorrecto.

---

# PARTE A — Especificación de producto

---

## A.1 Contexto del sistema existente

Este documento es un plan de **extensión**, no de construcción desde cero. Antes de cualquier implementación, Claude Code debe explorar el codebase y mapear lo que ya existe.

### Lo que ya está construido (no reescribir)

| Componente | Estado |
|---|---|
| Dashboard con 4 KPI cards + Recharts | ✅ Funcional |
| Conexión a `getDashboardStats`, `getBIOportunidades`, `getBITendencia` | ✅ Conectada |
| `BIPanelSection` en detalle de licitación | ✅ Funcional |
| Panel de benchmarking de precios en detalle de OC | ✅ Funcional |
| Estado hábil, documentos, checklist, calendario | ✅ Funcional |
| Alertas 48h/24h (Celery Beat) | ✅ Funcional |
| Onboarding 6 pasos | ✅ Funcional |

**Regla invariable:** antes de crear un componente, verificar si ya existe. Si existe, extender; no duplicar.

---

## A.2 Principios de diseño

### Las cuatro preguntas que el dashboard responde (en orden)

1. **¿Esta oportunidad vale la pena?**
2. **¿A qué precio debería ofertar?**
3. **¿Quién compite y qué tan duro es el campo?**
4. **¿Qué tan confiable es este análisis?** ← nuevo en v3

La cuarta pregunta no es decorativa. Si el usuario no sabe si puede confiar en los datos, las primeras tres no sirven de nada. La confianza del análisis es un componente de primer nivel, no un tooltip escondido.

### Reglas de UX
- Una pantalla = una decisión.
- Cada gráfico termina en una acción (postular / guardar / descartar / ajustar precio).
- Por defecto: resumen ejecutivo. En modo avanzado: desglose.
- No usar charts decorativos.
- Todo chart importante enlaza al listado filtrado.
- No usar "probabilidad de ganar" si el modelo no está calibrado. El lenguaje correcto es **score**, **fit**, **zona ganadora**. Llamarlo probabilidad sin calibración compra deuda de credibilidad.

---

## A.3 El score de oportunidad: descomposición obligatoria

El score **no puede ser una caja negra**. Debe descomponerse en 4 drivers explícitos para que el usuario entienda por qué una oportunidad rankea donde rankea.

### Los 4 drivers del score

| Driver | Qué mide | Fuente de dato |
|---|---|---|
| **Fit** | Similitud textual + categoría CPV + historial de la empresa | TF-IDF matching (`/bi/matching`) |
| **Atractividad de precio** | El precio estimado cae dentro del percentil ganador histórico | Benchmarking de precios (`/bi/precio`) |
| **Intensidad competitiva** | Número esperado de competidores + concentración (HHI / top-3 share) | Análisis de competidores (`/bi/competidores`) |
| **Urgencia / Timing** | Días al cierre + calce con estacionalidad histórica del organismo | Deadline + estacionalidad (`/bi/estacionalidad`) |

### Cómo mostrar el score

```
Score total: 7.8 / 10

[Fit          ████████░░  78%]
[Precio       ██████████  95%]  ← en zona ganadora
[Competencia  ███████░░░  65%]  ← competencia media
[Timing       ██████░░░░  52%]  ← sin urgencia inmediata

"Rankea alto porque el precio cae en el percentil ganador y el
organismo repite patrón de compra. Competencia esperada: media."
```

El texto de 1 línea al pie es **obligatorio**. No opcional. Sin él, el score es un número con pretensión.

### Plantilla de texto explicativo

El texto se genera en frontend combinando los valores de los 4 drivers:

```
"Rankea [alto/medio/bajo] porque
 [precio cae en percentil ganador / precio está por encima del rango histórico],
 [el organismo repite patrón de compra / el organismo es volátil],
 y la competencia esperada es [alta/media/baja]."
```

Si hay datos insuficientes en algún driver, la frase lo indica: *"Score calculado con datos parciales — ver confianza."*

---

## A.4 Confianza del dato: primer ciudadano, no empty state

La confianza del análisis debe ser **visible siempre**, no solo cuando hay un error. Es diferente a un empty state (ausencia de datos) — es una calidad del dato presente.

### Niveles de confianza

| Nivel | Criterio | Badge | Comportamiento |
|---|---|---|---|
| **Alta** | N ≥ 20 OC en la combinación organismo-categoría | 🟢 `Confianza alta · N=47` | Mostrar todos los percentiles |
| **Media** | 5 ≤ N < 20 | 🟡 `Confianza media · N=11` | Mostrar p25/p50/p75, no p10/p90 |
| **Baja** | N < 5 | 🔴 `Datos insuficientes · N=3` | Mostrar solo mediana con advertencia |
| **Sin datos** | N = 0 | ⚫ `Sin historial` | Empty state completo |

### Dónde aparece la confianza

- **Price band chart**: badge sobre el gráfico, siempre visible
- **Score de oportunidad**: leyenda debajo del score total
- **Competitor ranking**: footer de la tabla ("basado en N licitaciones similares")
- **Buyer profile**: header del panel ("perfil basado en N órdenes de compra")
- **Texto explicativo del score**: si hay driver con confianza baja, la frase lo menciona

### `last_updated`: frescura del dato

Cada panel BI debe mostrar cuándo se calculó el dato. El BIService tiene caché de 24h — el usuario debe verlo.

```
Precio recomendado                [🟢 Confianza alta · N=47]
CLP 3.4M – 4.1M
                     Actualizado hace 3 horas · datos al 28/03/2026
```

Si el pipeline tiene más de 48h de rezago, mostrar badge amarillo: `⚠️ Datos desactualizados`.

---

## A.5 Comparación usuario vs. mercado

Disponible solo si el usuario tiene historial de adjudicaciones propias (RUT procesado con OC ganadas). No es feature principal — vive en panel avanzado desplegable.

### Qué muestra

Barras comparativas para el rubro del usuario:

| Métrica | Mi empresa | Mercado (mediana) |
|---|---|---|
| Precio típico de oferta | CLP 3.8M | CLP 3.2M |
| Win rate estimado | — (sin historial) | 34% en este rubro |
| Frecuencia de postulación | 3/mes | — |

Si no hay historial propio: *"Cuando ganes licitaciones, aquí verás cómo te posicionas frente al mercado."*

**No llamar esto "win rate" si no hay adjudicaciones propias registradas.** Es la misma regla de lenguaje que §A.2: no prometer métricas que el modelo no puede entregar.

---

## A.6 Gating por plan

| Feature | Plan mínimo | Comportamiento si plan menor |
|---|---|---|
| Price band básico (rango sin percentiles) | PYME · USD 25 | Mostrar card bloqueada con CTA upgrade |
| Price band con percentiles completos | Pro · USD 55 | Blur sobre p10/p90 + CTA |
| BI competidores + matching semántico | Pro · USD 55 | Panel con blur + CTA upgrade |
| Score de oportunidad completo (4 drivers) | Pro · USD 55 | Mostrar solo badge alto/medio/bajo, sin desglose |
| Historial > 1 año | Pro · USD 55 | Truncar a 12 meses + indicar límite |
| Comparación usuario vs. mercado | Pro · USD 55 | Ocultar panel completamente |
| Exportación | Pro · USD 55 | Botón deshabilitado con tooltip |

---

## A.7 Empty states — especificación completa

| Situación | Qué mostrar |
|---|---|
| Usuario nuevo sin RUT | Skeleton + CTA "Completa tu perfil" → onboarding |
| RUT sin historial de adjudicaciones propias | "Aún no tienes adjudicaciones en ChileCompra para este RUT. Cuando las haya, aparecerán aquí." |
| Rubro con N < 5 OC históricos | Badge 🔴 + "Datos insuficientes para este rubro" + precio orientativo con advertencia |
| Sin licitaciones que hagan match | "No encontramos licitaciones activas para tu perfil esta semana. Revisa tus alertas." + CTA |
| Error de API / timeout | Ícono error + "Reintentar" + timestamp del último dato en caché |
| Plan Básico viendo feature Pro | Card blur suave + "Disponible en plan Pro" + botón "Ver planes" |
| Pipeline BI rezagado > 48h | Banner amarillo en home: "⚠️ Los datos de BI pueden estar desactualizados. Última sincronización: hace X horas." |

---

## A.8 Mapa de páginas y componentes

**Leyenda:** ✅ existe, extender | 🔨 construir nuevo | 🔒 gated por plan Pro

### HOME ✅ → extender

| Componente | Estado | Notas |
|---|---|---|
| 4 KPI cards | ✅ mejorar | Añadir: estado hábil + score de mejor oportunidad |
| Top 3 oportunidades | 🔨 nuevo | Score + precio estimado + deadline + CTA |
| Mini sparkline de tendencia de precios | 🔨 nuevo | LineChart pequeño, últimos 6 meses. **No heatmap** — demasiado complejo para home |
| Mini barras de actividad mensual | 🔨 nuevo | BarChart con N oportunidades por mes. Más comprensible que heatmap para usuario básico |
| Banner de frescura de datos | 🔨 nuevo | Solo visible si pipeline > 48h rezagado |

### DETALLE DE OPORTUNIDAD / LICITACIÓN ✅ → extender BIPanelSection

| Componente | Estado | Notas |
|---|---|---|
| Score card con 4 drivers | 🔨 nuevo 🔒 | Número grande + barras de drivers + texto explicativo |
| Price band percentílico | 🔨 nuevo 🔒 | ComposedChart con p10/p25/p50/p75/p90 + badge confianza |
| Competidores probables | 🔨 nuevo 🔒 | Tabla rankeada con share % + N base |
| Buyer profile | 🔨 nuevo 🔒 | KPI cards del organismo + badge confianza |
| Timeline de hitos | 🔨 nuevo | Horizontal: apertura → preguntas → cierre → adjudicación |
| Checklist de preparación | ✅ reutilizar | Ya existe — conectar desde este panel |
| Botones acción | 🔨 nuevo | Postular / Guardar / Descartar |

### LISTADO OC / LIC ✅ → extender

| Componente | Estado | Notas |
|---|---|---|
| Columnas adicionales | 🔨 añadir | Score (badge), precio estimado, fit %, N competidores, deadline countdown, acciones rápidas |
| Layout 3 columnas | 🔨 nuevo | Filtros \| Lista \| Panel contextual del item seleccionado |
| Panel lateral contextual | 🔨 nuevo | Al hacer click en una fila: benchmark + similares + buyer + deadline + checklist |

### MERCADO ← v1, no implementar ahora

### COMPETIDORES ← v1, no implementar ahora

---

## A.9 Interacciones bidireccionales entre gráficos y listado

**Desde un gráfico hacia el listado:**
- Click en rango de precio → filtra OC/LIC dentro del band
- Click en competidor → lista oportunidades donde aparece ese proveedor
- Click en mes/bar → lista oportunidades de ese período
- Click en buyer → lista todo lo de ese organismo

**Desde el listado hacia los gráficos:**
- Hover en fila → resaltar rango de precio, competidores y fit en el panel lateral
- Click en fila → abrir panel lateral con: benchmark + similares + buyer profile + deadline + checklist

**Layout operativo (vista listado):**
```
[Filtros · ~240px] | [Listado OC/LIC priorizado · flex-1] | [Panel contextual · ~360px]
```

Responsive: en mobile, las 3 columnas se vuelven tabs → Filtros | Lista | Detalle.

---

## A.10 Lo que NO implementar como pantalla principal (nunca)

1. **Cluster scatter plot** como protagonista — abstracto para el dueño de PYME
2. **Network graph grande** — zoológico visual
3. **Muchos radars** — lucen bien, explican poco
4. **Heatmap de estacionalidad en home** — reservar para deep dive en página Mercado (v1)
5. **"Probabilidad de ganar"** sin modelo calibrado — usar score / fit / zona ganadora
6. **Win-zone map** (densidad 2D) — solo en v2 y solo en modo avanzado
7. **20 tarjetas KPI** — ruido con maquillaje

---

## A.11 Priorización de visualizaciones por nivel de usuario

### Básico (plan Básico / PYME)
- Score de oportunidad (alto / medio / bajo — sin desglose)
- Precio sugerido (rango textual, sin chart percentílico completo)
- Competencia esperada (número + etiqueta)
- Deadline countdown
- Acción recomendada

### Intermedio (plan PYME con BI básico activo)
- Price band chart (p25/p50/p75)
- Buyer profile básico (KPI cards)
- Top competidores (lista simple)
- Mini sparkline de tendencia

### Avanzado (plan Pro)
- Price band completo (p10/p25/p50/p75/p90 + outliers)
- Score con descomposición de 4 drivers + texto explicativo
- Heatmap proveedor × organismo
- Comparación usuario vs. mercado (si hay historial)
- Licitaciones similares (cluster list)
- Filtros avanzados + exportación

---

# PARTE B — Implementación para Claude Code

---

## B.1 Contexto del proyecto

**Stack:**
- Frontend: Next.js + App Router + Tailwind CSS + Recharts (ya instalado)
- Backend: FastAPI + BIService (16 endpoints)
- Patrón de fetching: `useState` + `useEffect` (no React Query todavía — dejar TODO comments)
- Charts: **Recharts para todo el MVP** — no añadir D3, Nivo, Victory ni otras librerías

**Reglas de implementación:**
1. Antes de crear cualquier componente, leer el codebase y verificar si ya existe.
2. Si existe, extender. No duplicar.
3. Dejar `// TODO: migrar a React Query` en cada hook de fetching nuevo.
4. Nunca usar "probabilidad de ganar" — usar score / fit / zona ganadora.
5. Cada componente nuevo implementa su propio empty state (ver A.7) y badge de confianza (ver A.4) donde corresponda.

---

## B.2 Orden de implementación (MVP)

```
1. Explorar codebase existente
2. Home: Top 3 oportunidades + mini sparkline + mini barras de actividad
3. Detalle de oportunidad: ScoreCard con 4 drivers + PriceBandChart + CompetitorsList + BuyerProfile
4. Listado OC/LIC: columnas adicionales + layout 3 columnas + panel lateral
5. Componentes transversales: DataFreshnessBar + ConfidenceBadge (reutilizables)
6. Gating por plan en todos los features Pro
7. QA: empty states, confianza, frescura, responsive
```

---

## B.3 Componentes nuevos a crear

### `<ConfidenceBadge />` — componente transversal reutilizable

Prop `n: number` → renderiza badge con color semántico y texto.

```tsx
// Lógica de confianza
const getConfidence = (n: number) => {
  if (n >= 20) return { level: 'alta',    color: 'green',  label: `Confianza alta · N=${n}` }
  if (n >= 5)  return { level: 'media',   color: 'yellow', label: `Confianza media · N=${n}` }
  if (n >= 1)  return { level: 'baja',    color: 'red',    label: `Datos insuficientes · N=${n}` }
  return          { level: 'sin_datos', color: 'gray',   label: 'Sin historial' }
}
```

Usar en: PriceBandChart, ScoreCard, CompetitorsList, BuyerProfile.

---

### `<DataFreshnessBar />` — banner de frescura de datos

Muestra `last_updated` del endpoint BI. Si el dato tiene > 48h, mostrar banner amarillo en home.

```tsx
// Dato esperado de cualquier endpoint BI
{ data: {...}, last_updated: "2026-03-28T14:30:00Z", cache_ttl_hours: 24 }
```

---

### `<OpportunityScoreCard />` — tarjeta principal de decisión

Props: `score, fit, precio_driver, competencia_driver, timing_driver, n_base, last_updated, plan`

Estructura visual:
```
┌─────────────────────────────────────────────────────┐
│  Score de oportunidad              [🟡 Confianza media · N=11]  │
│                                                     │
│           7.8 / 10                                  │
│                                                     │
│  Fit          ████████░░  78%                       │
│  Precio       ██████████  95%  ← en zona ganadora   │
│  Competencia  ███████░░░  65%                       │
│  Timing       ██████░░░░  52%                       │
│                                                     │
│  "Rankea alto porque el precio cae en zona          │
│   ganadora y el organismo repite patrón."           │
│                                         [Solo Pro 🔒] │
│         Actualizado hace 3h                         │
└─────────────────────────────────────────────────────┘
```

**Si plan < Pro:** mostrar solo el badge alto/medio/bajo y el CTA upgrade, sin desglose de drivers.

**Generación del texto explicativo (frontend):**
```tsx
const buildExplanation = (drivers: ScoreDrivers, confidence: string): string => {
  const parts = []
  if (drivers.precio >= 0.8) parts.push("el precio cae en zona ganadora")
  else if (drivers.precio < 0.5) parts.push("el precio está por encima del rango histórico")
  if (drivers.competencia >= 0.7) parts.push("la competencia esperada es baja")
  else if (drivers.competencia < 0.4) parts.push("la competencia es alta en este segmento")
  if (drivers.fit >= 0.8) parts.push("el organismo repite patrón de compra")
  if (confidence === 'baja') return `Score calculado con datos parciales — ver confianza. ${parts.join(', ')}.`
  return `Rankea alto porque ${parts.join(' y ')}.`
}
```

---

### `<PriceBandChart />` — visualización central del precio

Recharts `ComposedChart`:

```tsx
// Estructura de datos esperada desde /bi/precio (ver Anexo B.6)
{
  p10: 2100000, p25: 2500000, p50: 3200000,
  p75: 3900000, p90: 4500000,
  n_observaciones: 47,
  organismo: "Hospital Regional Araucanía",
  categoria: "Equipos médicos",
  last_updated: "2026-03-28T14:30:00Z"
}
```

Capas del chart (todas en Recharts):
- `<Area>` para banda p25–p75 (relleno verde suave, opacidad 0.3)
- `<Area>` para banda p10–p90 (relleno gris, opacidad 0.15)
- `<Line>` para mediana (línea sólida, color principal)
- `<ReferenceLine>` para precio recomendado del usuario (si lo ingresó)
- `<ReferenceLine>` para precio adjudicado anterior (si existe en datos)

Encima del chart: `<ConfidenceBadge n={n_observaciones} />`
Debajo del chart: `Actualizado {formatRelativeTime(last_updated)}`

**Si N < 5:** mostrar solo la mediana con badge rojo. No mostrar bandas que darían falsa precisión.

**Interacción:** click en cualquier banda → dispara evento que filtra el listado de OC/LIC.

---

### `<CompetitorsList />` — tabla de competidores rankeada

```tsx
// Datos esperados desde /bi/competidores
{
  competidores: [
    { nombre: "Proveedor X", share: 0.45, n_adjudicaciones: 21, es_incumbente: true },
    { nombre: "Proveedor Y", share: 0.20, n_adjudicaciones: 9, es_incumbente: false },
  ],
  n_base: 47,
  last_updated: "..."
}
```

Footer: `<ConfidenceBadge n={n_base} />` + `Actualizado {relativeTime}`

**Si es_incumbente: true** → mostrar badge "Incumbente frecuente" en rojo suave.

---

### `<BuyerProfilePanel />` — perfil del organismo

KPI cards del organismo con `<ConfidenceBadge />`:

```
Gasto anual          Frecuencia/mes       Proveedores distintos   Concentración
CLP 1.2B             4.2 OC/mes           31 proveedores          Top-3: 67%
[N=142 · 🟢 Alta]   [N=142 · 🟢 Alta]   [N=142 · 🟢 Alta]      [N=142 · 🟢 Alta]
```

Mini sparkline de actividad mensual (últimos 12 meses).
Mini heatmap de estacionalidad (Tailwind Grid, no Recharts — más simple): columnas = meses, intensidad = color.

---

### `<TopOpportunities />` — componente home (Top 3)

3 cards horizontales. Cada card:
- Título de la licitación (truncado a 60 chars)
- Score badge (color semántico)
- Precio estimado (rango CLP formateado)
- Deadline countdown ("Cierra en 3 días")
- Organismo
- CTA "Ver detalle →"

---

### `<MiniTrendChart />` — mini sparkline en home

Recharts `LineChart` pequeño (altura 60px). Muestra mediana de precios del rubro del usuario en los últimos 6 meses. Sin ejes visibles — solo la curva y los valores de inicio/fin.

---

### `<MiniActivityBars />` — mini barras de actividad en home

Recharts `BarChart` pequeño (altura 60px). Muestra N oportunidades activas por mes, últimos 6 meses. **No usar heatmap en home** — barras simples son más comprensibles para usuario básico.

---

## B.4 Modificaciones a componentes existentes

### Home (dashboard principal)
1. Extender las 4 KPI cards existentes: añadir "Estado hábil" y "Mejor oportunidad (score)".
2. Agregar `<TopOpportunities />` debajo de las KPI cards.
3. Agregar `<MiniTrendChart />` y `<MiniActivityBars />` en fila de 2 columnas.
4. Agregar `<DataFreshnessBar />` como primer elemento del layout (solo visible si pipeline > 48h rezagado).

### BIPanelSection (detalle de licitación)
1. Insertar `<OpportunityScoreCard />` como primer componente, antes del contenido existente.
2. Reemplazar el benchmarking de precios existente con `<PriceBandChart />` (más completo).
3. Agregar `<CompetitorsList />` y `<BuyerProfilePanel />` como nuevas secciones.
4. Agregar `<OpportunityTimeline />` (horizontal, hitos de la licitación).
5. Conectar el checklist existente desde este panel (no duplicar — enlazar).

### Listado OC/LIC
1. Añadir columnas: Score (badge), Precio estimado, Fit %, N competidores, Deadline countdown, Acciones (postular / guardar / descartar).
2. Implementar layout 3 columnas: Filtros | Lista | Panel contextual.
3. Al hacer click en una fila, mostrar `<BIPanelSection />` en el panel derecho (si ya está implementado en modal, adaptarlo a panel lateral).

---

## B.5 QA checklist antes de considerar MVP completo

- [ ] Todos los componentes nuevos tienen empty state implementado (ver A.7)
- [ ] `<ConfidenceBadge />` aparece en: PriceBandChart, ScoreCard, CompetitorsList, BuyerProfile
- [ ] `<DataFreshnessBar />` funciona con datos reales del endpoint
- [ ] Plan gating implementado en: ScoreCard (drivers), PriceBandChart (p10/p90), CompetitorsList, historial > 1 año
- [ ] No se usa el texto "probabilidad de ganar" en ningún lugar del UI
- [ ] Texto explicativo del score se genera correctamente para los 4 driver states
- [ ] Responsive: layout 3 columnas colapsa a tabs en mobile
- [ ] No se agregaron librerías de charts nuevas (verificar `package.json`)
- [ ] `// TODO: migrar a React Query` en cada hook de fetching nuevo
- [ ] `<PriceBandChart />` muestra solo mediana (sin bandas) cuando N < 5
- [ ] `<OpportunityScoreCard />` muestra solo badge sin desglose para plan Basic/PYME

---

## B.6 Anexo — Contrato de datos por visualización

Esta tabla define los **campos mínimos requeridos** de cada endpoint para cada visualización. Claude Code debe verificar que los endpoints reales retornan estos campos; si no, extender el endpoint o ajustar la visualización.

> ⚠️ Los nombres de endpoints son orientativos. Usar los nombres reales que encuentres en el codebase.

### `/bi/precio` → PriceBandChart + ScoreCard (driver precio)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `p10`, `p25`, `p50`, `p75`, `p90` | float | ✅ | En CLP |
| `n_observaciones` | int | ✅ | Para ConfidenceBadge |
| `organismo` | string | ✅ | |
| `categoria` | string | ✅ | |
| `last_updated` | ISO datetime | ✅ | Para DataFreshnessBar |
| `precio_adjudicado_anterior` | float | opcional | Si existe, ReferenceLine en chart |

### `/bi/competidores` → CompetitorsList + ScoreCard (driver competencia)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `competidores[].nombre` | string | ✅ | |
| `competidores[].share` | float (0-1) | ✅ | % de adjudicaciones |
| `competidores[].n_adjudicaciones` | int | ✅ | |
| `competidores[].es_incumbente` | bool | ✅ | Badge "Incumbente" |
| `n_base` | int | ✅ | Para ConfidenceBadge |
| `intensidad` | enum: alta/media/baja | ✅ | Para driver intensidad en ScoreCard |
| `last_updated` | ISO datetime | ✅ | |

### `/bi/oportunidades` → TopOpportunities + Listado + ScoreCard

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | string | ✅ | ID de la licitación |
| `titulo` | string | ✅ | |
| `organismo` | string | ✅ | |
| `score_total` | float (0-10) | ✅ | |
| `score_fit` | float (0-1) | ✅ | Driver fit |
| `score_precio` | float (0-1) | ✅ | Driver precio |
| `score_competencia` | float (0-1) | ✅ | Driver competencia (invertido: 1 = baja competencia = mejor) |
| `score_timing` | float (0-1) | ✅ | Driver timing |
| `precio_estimado_min`, `precio_estimado_max` | float | ✅ | Rango en CLP |
| `n_competidores_esperados` | int | ✅ | |
| `deadline` | ISO datetime | ✅ | |
| `n_base_score` | int | ✅ | Para ConfidenceBadge del score |
| `last_updated` | ISO datetime | ✅ | |

### `/bi/comprador` → BuyerProfilePanel

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `organismo_id` | string | ✅ | |
| `organismo_nombre` | string | ✅ | |
| `gasto_anual_clp` | float | ✅ | |
| `oc_por_mes` | float | ✅ | Frecuencia media |
| `n_proveedores_distintos` | int | ✅ | |
| `top3_share` | float (0-1) | ✅ | Concentración HHI aproximado |
| `actividad_mensual` | array[{mes, n_oc}] | ✅ | 12 meses para sparkline |
| `n_base` | int | ✅ | Para ConfidenceBadge |
| `last_updated` | ISO datetime | ✅ | |

### `/bi/estacionalidad` → MiniActivityBars (home) + heatmap (v1)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `distribucion_mensual` | array[{mes: int, n_oc: int, monto_mediana: float}] | ✅ | 12 entradas |
| `rubro` | string | ✅ | |
| `n_base` | int | ✅ | |
| `last_updated` | ISO datetime | ✅ | |

### `/bi/tendencia` → MiniTrendChart (home)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `tendencia_mensual` | array[{mes: string, precio_mediana: float}] | ✅ | Últimos 6–12 meses |
| `rubro` | string | ✅ | |
| `last_updated` | ISO datetime | ✅ | |

---

## B.7 Prompt de arranque para Claude Code

> **Copia este bloque completo como primer mensaje antes de comenzar la implementación.**

---

Eres el implementador del dashboard BI de TORDO. Este es un proyecto de **extensión** — el frontend ya tiene un dashboard funcional con Recharts, 4 KPI cards y conexión a endpoints BI. Tu trabajo es extenderlo, no reescribirlo.

**Antes de escribir código:**
1. Lee el documento completo (Partes A y B).
2. Explora el codebase existente: identifica los componentes del dashboard, los hooks de fetching y los endpoints conectados.
3. Mapea qué ya existe antes de crear nada nuevo.

**Orden de implementación:**
1. Componentes transversales reutilizables: `<ConfidenceBadge />` y `<DataFreshnessBar />`
2. Home: extender KPI cards + agregar `<TopOpportunities />` + `<MiniTrendChart />` + `<MiniActivityBars />`
3. Detalle de oportunidad: extender `BIPanelSection` con `<OpportunityScoreCard />` + `<PriceBandChart />` + `<CompetitorsList />` + `<BuyerProfilePanel />`
4. Listado: columnas adicionales + layout 3 columnas + panel lateral contextual
5. Gating por plan + empty states + QA checklist completo

**Stack obligatorio:**
- Recharts para todos los charts — no añadir D3, Nivo, Victory u otras librerías
- Tailwind para layout y estilos
- useState/useEffect para fetching — dejar `// TODO: migrar a React Query` en cada hook nuevo
- No usar "probabilidad de ganar" en ningún lugar del UI — usar score / fit / zona ganadora

**Restricciones críticas:**
- `<ConfidenceBadge />` debe aparecer en todo componente que muestre datos históricos
- `<OpportunityScoreCard />` muestra desglose de 4 drivers solo en plan Pro
- `<PriceBandChart />` muestra solo mediana (sin bandas) cuando N < 5
- Cada componente nuevo tiene su propio empty state implementado
- Verificar el contrato de datos del Anexo B.6 contra los endpoints reales — si un campo no existe, avisar antes de asumir

El resultado es un sistema de decisiones para el dueño de PYME, no un tablero decorativo.

---

*TORDO · Plan Analytics & BI Dashboard v3.0 · Marzo 2026 · Confidencial*
*Revisión v3.0: incorpora confianza del dato como primer ciudadano, descomposición de score en 4 drivers, texto explicativo obligatorio por oportunidad, frescura del dato visible, comparación usuario vs. mercado, separación Parte A / Parte B, mini heatmap reemplazado por barras en home, lenguaje de score calibrado (sin "probabilidad de ganar"), contrato de datos por visualización.*
