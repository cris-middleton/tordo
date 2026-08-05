# BI Panel v2 — Narrativa, Personalización y Herramientas

**Date**: 2026-04-17
**Status**: Draft — awaiting user review
**Scope**: Panel BI (`frontend/app/dashboard/bi/`) + `BICard` de tender detail + pequeñas adiciones backend
**Relación con el plan anterior**: Extiende `2026-04-12-bi-panel-redesign.md` (v1 ~90% implementado). No sustituye v1; se construye sobre él.

---

## Contexto

La v1 entregó el rediseño estructural: 5 secciones narrativas (§1–§5), filter bar sticky, etiquetas des-jergonizadas, row-expand en oportunidades. Una auditoría posterior detectó cinco gaps de alto impacto que v1 no abordaba:

1. **Sin narrativa** — el panel es un catálogo de widgets, no cuenta una historia.
2. **Silos** — las 5 secciones no cross-referencian (seleccionar un organismo en §1 no impacta §3/§4/§5).
3. **Paywall duro** — plan básico ve blur sin contexto; cero sensación de valor antes de pagar.
4. **Sin personalización** — el panel habla del mercado, nunca del usuario. Dos PYMES distintas ven exactamente lo mismo.
5. **Jerga residual y bugs** — dropdowns muestran códigos numéricos (`7485`), tooltip sigue mencionando "HHI", tabla de descuentos usa P10/P50/P90.

v2 cierra estos gaps en 5 fases entregables independientemente, más 3 apuestas arriesgadas (opt-in).

---

## Principios de diseño

1. **El panel tiene una opinión.** Cuenta una historia; no lista widgets.
2. **Cada dato tiene un "so what".** Referencia al negocio del usuario.
3. **Cero jerga estadística en UI.** Tooltips en español plano. Nunca "HHI", "CAGR", "P50".
4. **Coherencia cross-section.** El estado (rubro, organismo focuseado) se propaga.
5. **Paywall demuestra valor.** No es una pared — es una demo.
6. **Exportabilidad nativa.** El insight debe salir de la app (copy, link, PNG).

---

## Fase 0 — Fixes críticos y limpieza (bloqueante)

Pre-requisito para el resto: arreglar los defectos de v1 que ensucian cualquier narrativa encima.

### 0.1 Dropdowns muestran nombres, no códigos

**Problema.** `CompetenciaSection.tsx:91-99` y `EstacionalidadSection.tsx:97-105` renderean `<option value={o}>{o}</option>` — donde `o` es el código numérico (`7485`). El plan v1 dijo "dropdown populated from oportunidades results"; esto es un bug.

**Cambio.**
- `page.tsx` deriva `topOrganismosConNombres: { codigo: string; nombre: string }[]` a partir de `oportunidades.slice(0,5)` (ya tienen `NombreOrganismo`).
- Pasa esa estructura a `CompetenciaSection` y `EstacionalidadSection` en lugar de `string[]`.
- Dropdown render: `<option value={o.codigo}>{o.nombre}</option>` con `title` para hover completo si trunca.

**Fallback.** Si `NombreOrganismo` está vacío, mostrar el código como hoy.

### 0.2 Remover jerga residual

**Problema.** Sobrevive jerga en tooltips/copy:
- `CompetenciaSection.tsx:107-112` — tooltip dice "El HHI (índice Herfindahl-Hirschman)..."
- `CompradoresSection.tsx:50-74` — tabla con columnas P10 / P50 / P90

**Cambio.**
- Tooltip de concentración pasa a: _"Fragmentado = muchos proveedores compiten. Concentrado = pocos dominan el mercado."_ Sin mencionar el índice.
- Tabla de descuentos: se elimina de §4 y se reubica en Herramientas Avanzadas (Fase 3) con formato narrativo: _"Con 3 oferentes el descuento típico es 8%. Con 5+ oferentes sube a 12%."_

### 0.3 `topOrganismos` selector libre

**Problema.** `page.tsx:67-70` hace `new Set(oportunidades.slice(0,5).map(...)).slice(0,3)` — rígido. Si el usuario quiere analizar un organismo que quedó en posición 6, no puede.

**Cambio.** Subir el `limit` de la fetch inicial de oportunidades de 20 a 50 (costo marginal sobre el mismo parquet). Derivar `topOrganismos` como el conjunto completo de organismos únicos en esos 50. El dropdown de §3/§5 queda como un combo searchable que:
- Por default muestra los top 3 (pinneados arriba)
- Acepta búsqueda libre sobre los ~30-50 organismos con datos en el rubro
- Si el organismo no aparece en oportunidades (score < 4), se descarta — no es un rubro relevante para ese comprador

Si más adelante se necesita universo completo (no ligado a oportunidades), evaluar un endpoint lightweight `/api/bi/organismos?rubro=X` que retorne solo `{codigo, nombre}`. No prioritario para Fase 0.

### 0.4 Cache compartido de `/comprador/{id}`

**Problema.** §1 row-expand, §4 cards, y eventualmente §5 pueden pedir `/comprador/{id}` con el mismo organismo. Sin cache, son 3 requests al backend.

**Cambio.** Nuevo hook `hooks/useCompradorCache.ts`:

```ts
// Map<organismo_id, Promise<CompradorResult>>
export function useCompradorCache() {
  const cacheRef = useRef<Map<string, Promise<CompradorResult>>>(new Map());
  const get = (id: string) => {
    if (!cacheRef.current.has(id)) {
      cacheRef.current.set(id, apiClient.getBIComprador(id));
    }
    return cacheRef.current.get(id)!;
  };
  return { get };
}
```

Se provee vía React Context en `page.tsx`. §1, §4 y §5 lo consumen.

### 0.5 Removals

- **Auto-load en row expand de §1** (`OportunidadesSection.tsx:55`): cambia a lazy — un botón explícito "Ver perfil del comprador" dentro de la row expandida.
- **BarChart horizontal de §2 con 12 rubros cuando hay rubro filtrado** (`TendenciasSection.tsx:85-117`): cuando `selectedRubro` está set, mostrar solo una card grande del trend del rubro seleccionado + 3 badges de emergentes. El chart completo de 12 barras solo se muestra sin filtro.

### Acceptance criteria Fase 0

- [ ] Dropdowns §3/§5 muestran nombres humanos
- [ ] `/comprador/{id}` se pide una sola vez por sesión por organismo
- [ ] Ningún tooltip menciona HHI, CAGR, P10, P50, P90
- [ ] Tabla de descuentos no aparece en §4 (se mueve a Fase 3)
- [ ] Row expand de §1 no dispara request automático

---

## Fase 1 — Capa narrativa

El panel empieza a tener opinión.

### 1.1 Resumen de mercado (3 frases arriba de todo)

**Qué.** Nueva card arriba de §1 que sintetiza el mercado en 3 frases auto-generadas. Ejemplo:

> _"El mercado de **Equipos médicos** movió **CLP 14.200 millones** el último año entre **47 organismos**._
> _Está **creciendo 12% anual**, pero la competencia también: de 22 a 34 proveedores activos en 3 años._
> _El comprador más activo es **Hospital Sótero del Río**, que paga en promedio en **38 días** (bueno para el sector)."_

**Componente.** `frontend/app/dashboard/bi/components/MarketSummaryCard.tsx`

**Endpoint backend NUEVO.**

```
GET /api/bi/resumen?rubro={rubro}

Response:
{
  "disponible": true,
  "rubro": "Equipos médicos",
  "monto_anual_clp": 14200000000,
  "n_organismos": 47,
  "cagr_pct": 12.4,
  "n_proveedores_actual": 34,
  "n_proveedores_hace_3_anios": 22,
  "top_comprador": {
    "codigo": "7485",
    "nombre": "Hospital Sótero del Río",
    "pago_mediana_dias": 38,
    "clasificacion_pago": "bueno"  // bueno | medio | lento
  },
  // Campos adicionales para teasers de paywall (1.2)
  "teaser_competencia": {
    "lider_nombre": "MedSuministros SpA",
    "lider_share_pct": 22.3,
    "tipo_mercado": "fragmentado"  // concentrado | moderado | fragmentado
  },
  "teaser_estacionalidad": {
    "mes_pico_mayor": "Mayo",
    "consistencia_avg_pct": 72
  }
}
```

Implementación en `bi_service.py`: combina `sector_dashboard.parquet` + `trend_by_market.parquet` + `buyer_scores.parquet`. Cache 24h como los otros BI endpoints.

**Template engine en frontend.** Plantillas con slots y variantes seleccionadas por umbrales:

```ts
const CRECIMIENTO_VARIANTS = {
  alto: 'Está creciendo **{cagr}% anual**, pero la competencia también',
  estable: 'Se mantiene estable con variaciones bajo el 5% anual',
  decreciente: 'Se está contrayendo **{cagr}% anual** — cuidado con presión de precios',
};
```

Cero LLM. Plantillas versionadas en `frontend/app/dashboard/bi/narrative/templates.ts`.

**Manejo de datos faltantes.** Si cualquier slot falla, se omite la frase correspondiente (puede quedar en 1 o 2 frases).

### 1.2 Paywall inteligente (teaser narrativo antes del blur)

**Problema.** `PlanGate.tsx` actual aplica blur sobre todo el children — pero los children siguen ejecutándose. Usuario básico ve una mancha Y consume su quota diaria (3 BI queries/día) en endpoints que no puede ver.

**Cambio conceptual.** Cuando `locked == true`, PlanGate NO renderiza los children — los reemplaza por un mockup estático decorativo (chart SVG hardcoded o skeleton) + un preview textual real computado con datos livianos.

```tsx
<PlanGate
  locked={!paid}
  label="Análisis de competencia — plan PYME o superior"
  preview={
    <p className="text-sm text-text">
      En este mercado compites contra <b>47 proveedores</b>.
      El líder captura el <b>22%</b>. Mercado <b>fragmentado</b> —
      hay espacio para nuevos entrantes.
    </p>
  }
  placeholder={<CompetenciaSkeletonSVG />}
>
  <CompetenciaSection ... />  {/* NO se monta cuando locked */}
</PlanGate>
```

**Fuente de datos del preview.** Los datos del teaser vienen del endpoint `/api/bi/resumen` (1.1) o del `/oportunidades` que ya se carga en mount — todos datos "light" que no queman quota adicional. Específicamente:
- §3 Competencia: `n_proveedores_actual` (ya en `resumen`), `hhi_tipo` (derivable de `resumen`), `lider_nombre` y `lider_share_pct` (ambos agregados nuevos al endpoint `resumen`)
- §4 Compradores: `top_comprador` ya viene en `resumen` — reusar
- §5 Estacionalidad: `mes_pico_mayor` y `consistencia_avg` — agregar al `resumen` como campos opcionales

**Cambio backend adicional en `/api/bi/resumen`.** Ampliar response con los campos de teaser para §3, §4, §5 (ver contrato completo más abajo).

**Beneficios.**
- Plan básico no gasta quota en endpoints detrás del paywall
- Preview es real (no mock), basado en una única llamada eficiente
- Sin riesgo de leak en devtools

**Trade-off.** El mockup visual detrás del blur pierde el "aspecto de dato real" — se reemplaza con un skeleton SVG. A cambio, gana honestidad y no gasta recursos.

### 1.3 Pulso del sector (usa `/sector` existente)

**Qué.** Componente `SectorOverview.tsx` que muestra los 6 sectores principales (Salud, Municipalidades, Educación, etc.) con monto total y posición del rubro del usuario dentro.

**Ubicación.** No permanente. Se muestra arriba de §1 solo la primera visita del día, como banner colapsable "Ver mapa completo de sectores →". Cerrable. LocalStorage recuerda dismiss.

**Endpoint.** `/api/bi/sector` (ya existe).

**Acceptance criteria Fase 1**

- [ ] `MarketSummaryCard` aparece arriba de §1 cuando hay rubro seleccionado
- [ ] Plantillas de narrativa cubren 3 casos (crecimiento alto/estable/decreciente) por slot
- [ ] `PlanGate` acepta prop `preview` y la renderiza sin blur sobre los children borrosos
- [ ] `/api/bi/resumen` implementado con cache 24h
- [ ] Banner `SectorOverview` respeta dismiss en localStorage

---

## Fase 2 — Personalización

El panel pasa de hablar del mercado a hablar del usuario.

### 2.1 "Tu posición en este mercado"

**Qué.** Nueva card junto a `MarketSummaryCard` (grid 2 columnas en desktop) que muestra la posición de la empresa del usuario en el rubro seleccionado.

```
┌────────────────────────────────────────────────┐
│ TU POSICIÓN                                    │
│                                                │
│ 📊 Participación: 0.8% · puesto 24 de 47       │
│ 🏛  Vendes a 3 organismos (mercado: 6 en       │
│    promedio)                                   │
│ ⚠  68% de tus OC dependen de un solo comprador │
│    → Alerta de concentración                   │
│                                                │
│ [Ver detalle →]                                │
└────────────────────────────────────────────────┘
```

**Componente.** `frontend/app/dashboard/bi/components/MyPositionCard.tsx`

**Endpoint backend NUEVO.**

```
GET /api/bi/mi_posicion?empresa_id={uuid}&rubro={rubro}

Response:
{
  "disponible": true,
  "tiene_historial": true,  // false si el RUT no matchea con CodigoProveedor
  "participacion_pct": 0.8,
  "rank": 24,
  "total_proveedores": 47,
  "n_organismos_atendidos": 3,
  "n_organismos_promedio_sector": 6,
  "diversificacion_pct": 32,  // 100 - concentración en top organismo
  "alerta_dependencia": true,
  "top_organismo_empresa": {
    "nombre": "Hospital Padre Hurtado",
    "porcentaje_oc": 68
  }
}
```

Implementación (detalle a confirmar con ETL owner): combina `provider_diversification.parquet` (ya usado por `/diversificacion`) con agregaciones sobre `competitor_analysis.parquet` — el parquet que ya alimenta `/competidores` — filtrando por `RubroN2 == rubro` y ordenando proveedores por `monto_total` para calcular `rank` y `participacion_pct`. Matching: `empresas.rut` debe normalizarse al formato de `CodigoProveedor` del parquet antes de la búsqueda.

**Estado vacío.** Si `tiene_historial == false`:

```
┌────────────────────────────────────────────────┐
│ TU POSICIÓN                                    │
│                                                │
│ Aún no tienes historial de ventas a            │
│ Mercado Público en este rubro.                 │
│                                                │
│ Esta card cobrará vida cuando completes        │
│ tu primera orden de compra.                    │
└────────────────────────────────────────────────┘
```

**Plan gating (decisión tomada).** `MyPositionCard` queda detrás del paywall — solo PYME+.

Para plan básico se renderiza un **teaser textual** con 2 de las métricas más punzantes:

```
┌────────────────────────────────────────────────┐
│ TU POSICIÓN                                    │
│                                                │
│ Tu participación en este mercado: 0.8%         │
│ Tu dependencia en un solo comprador: 68%       │
│                                                │
│ 🔓 Ver tu ranking completo, diversificación    │
│    y alertas de concentración                  │
│    [Desbloquear con plan PYME →]               │
└────────────────────────────────────────────────┘
```

Usa el mismo patrón `PlanGate` con `preview` que el resto de secciones gated (ver 1.2). Los 2 datos del teaser vienen de la misma respuesta de `/api/bi/mi_posicion` — el plan básico SÍ gatilla ese endpoint (consume 1 de sus 3 queries diarias), pero solo ve el subset "teaser" de la respuesta. Alternativa más conservadora: agregar al endpoint un parámetro `?lite=true` que devuelva solo esos 2 campos sin contar contra la quota.

Precedente: Ahrefs y Similarweb usan exactamente este patrón — "tu posición" es el principal convertidor free→paid en herramientas de inteligencia.

### 2.2 Cross-linking con `focusedOrganismo`

**Qué.** Seleccionar un organismo en §1 lo "fija" en §3, §4 y §5.

**State.** Nuevo en `page.tsx`:

```ts
const [focusedOrganismo, setFocusedOrganismo] = useState<
  { codigo: string; nombre: string } | null
>(null);
```

**Trigger.** Botón dentro de la row expandida de §1:

```
[Analizar este comprador en todo el panel →]
```

Click → `setFocusedOrganismo({ codigo, nombre })` → scroll hacia §3.

**Propagación.**
- `RubroFilter` renderiza chip adicional: _"Enfocando: **Hospital Padre Hurtado** [×]"_
- §3 Competencia recibe `focusedOrganismo.codigo`; si no-null, lo usa en lugar del dropdown local
- §4 Compradores filtra a solo esa card (en lugar de top 3)
- §5 Estacionalidad setea `selectedOrg = focusedOrganismo.codigo`

**Desfijar.** Click en [×] del chip → `setFocusedOrganismo(null)`. Las secciones vuelven al comportamiento multi-organismo.

**Deep-linking.** URL sync: `?focus={codigo}` (ver Fase 4).

### 2.3 Onboarding BI

**Qué.** Componente que reemplaza el loader + empty state cuando el usuario llega por primera vez sin rubros configurados.

**Trigger.** `!perfil?.rubros_usados?.length && !empresa?.rubros_cpv?.length`

**Componente.** `frontend/app/dashboard/bi/components/BIOnboarding.tsx`

```
┌─ Primera vez aquí ──────────────────────────────┐
│ 🎯                                              │
│                                                 │
│ Para mostrarte el mercado que te interesa,     │
│ dinos a qué se dedica tu empresa.               │
│                                                 │
│ ✓ Selecciona 2-3 rubros                         │
│ ✓ Verás oportunidades, competencia y            │
│   compradores ajustados a ti                    │
│                                                 │
│ [Seleccionar mis rubros →]                      │
│ [Explorar sin configurar]                       │
└─────────────────────────────────────────────────┘
```

"Seleccionar mis rubros" abre el modal existente de `RubroFilter`.
"Explorar sin configurar" selecciona el rubro con mayor volumen histórico en `/api/bi/rubros` (primer elemento — ya ordenado por frecuencia).

**Acceptance criteria Fase 2**

- [ ] `MyPositionCard` renderiza junto a `MarketSummaryCard` cuando empresa tiene RUT
- [ ] Endpoint `/api/bi/mi_posicion` con matching RUT→CodigoProveedor y fallback limpio
- [ ] Cross-linking funcional: click en row de §1 → §3/§4/§5 enfocadas en ese organismo
- [ ] Chip en filter bar con opción de desfijar
- [ ] `BIOnboarding` aparece solo para usuarios sin rubros configurados

---

## Fase 3 — Herramientas

### 3.1 "Herramientas avanzadas" colapsible al pie

**Qué.** Nueva sección colapsada al final del panel con tres herramientas. Cumple la promesa del plan v1 que no se implementó.

**Componente.** `frontend/app/dashboard/bi/components/HerramientasAvanzadas.tsx`

**Contenido.**

1. **Buscador semántico de competidores**
   - Input: texto libre ("respiradores mecánicos", "uniformes hospitalarios")
   - Usa `/api/bi/matching` (existente)
   - Output: tabla top 20 proveedores con N° de OC y monto histórico

2. **Calculadora de precio histórico**
   - Input: código ONU + (opcional) organismo + (opcional) unidad de medida
   - Usa `/api/bi/precio/{codigo_producto}` (existente)
   - Output: _"Este producto ha tenido precios entre **CLP 45.000** (P10) y **CLP 180.000** (P90), con mediana de **CLP 92.000**."_ (formato narrativo, sin mostrar nomenclatura "P10/P90")

3. **Bandas de descuento**
   - Input: tipo licitación + rubro + rango oferentes
   - Usa `/api/bi/descuento` (existente)
   - Output: _"Con 3 oferentes el descuento típico es **8%**. Con 5+ oferentes sube a **12%**."_

4. **Pronóstico de competencia** (para una licitación hipotética)
   - Input: tipo L1/LE/LP + rubro + organismo
   - Usa `/api/bi/forecast_competidores` (existente)
   - Output: _"Este tipo de licitación en este organismo suele atraer **6 a 10 competidores** (confianza alta, 34 casos históricos)."_

**UX.** Tabs horizontales dentro del colapsible. Estado por default: colapsado. Animación pulse sutil la primera visita para indicar existencia.

### 3.2 Comparador de rubros lado a lado

**Qué.** Modo "Comparar" activado desde el filter bar. Selecciona 2 rubros y el panel muestra §1 + §2 + §4 en 2 columnas.

**Toggle en `RubroFilter.tsx`.** Botón "Comparar 2 rubros" (solo desktop ≥1024px).

**Componente.** `frontend/app/dashboard/bi/components/CompareMode.tsx` — wrapper que renderiza dos instancias de las secciones con rubros distintos.

**Secciones incluidas.**
- §1 Oportunidades (versión compacta: solo KPIs + top 5)
- §2 Tendencias (solo el trend del rubro, no el chart completo)
- §4 Compradores (solo top 1, no top 3)

**Secciones excluidas en modo compare.** §3 Competencia y §5 Estacionalidad (requieren organismo focuseado, no aplica a comparación de mercado).

**Móvil.** Toggle oculto en `< 1024px`. Fallback: mensaje "Disponible solo en desktop".

### 3.3 Pulso del sector (ya cubierto en Fase 1.3)

Ver Fase 1.3.

**Acceptance criteria Fase 3**

- [ ] `HerramientasAvanzadas` colapsible al pie con 4 herramientas funcionales
- [ ] Modo Comparar disponible con toggle; renderiza 2 columnas responsivas
- [ ] Sin cambios backend en esta fase (todos los endpoints ya existen)

---

## Fase 4 — Compartibilidad

### 4.1 Menú "Compartir" por sección

**Componente.** `frontend/app/dashboard/bi/components/ShareMenu.tsx`

**Ubicación.** Icono `⋯` en el header de cada section card.

**Acciones.**

1. **Copiar resumen (clipboard)**
   - Texto plano: titular + 2-3 métricas clave de la sección
   - Ejemplo: _"Panel BI Tordo — Equipos médicos: 47 oportunidades, score top 7.2, crecimiento +12% anual. Top comprador: Hospital Sótero del Río (38 días de pago promedio). Ver en Tordo → {URL}"_

2. **Descargar PNG**
   - `html2canvas` sobre el DOM de la section
   - Nombre: `tordo-bi-{seccion}-{rubro}-{fecha}.png`

3. **Copiar link**
   - URL con estado: `?rubro=X&focus=Y&compare=Z`
   - Permite al receptor abrir el panel exactamente igual

**URL sync en `page.tsx`.**

```ts
useEffect(() => {
  const params = new URLSearchParams();
  if (selectedRubro) params.set('rubro', selectedRubro);
  if (focusedOrganismo) params.set('focus', focusedOrganismo.codigo);
  if (compareRubro) params.set('compare', compareRubro);
  window.history.replaceState({}, '', `?${params.toString()}`);
}, [selectedRubro, focusedOrganismo, compareRubro]);

// En mount, parsear y setear el estado inicial
```

**Acceptance criteria Fase 4**

- [ ] `ShareMenu` disponible en todas las section cards
- [ ] URL del panel refleja el estado; abrir un link restaura exactamente la vista
- [ ] PNG se descarga con nombre descriptivo

---

## Fase 5 — Apuestas arriesgadas (opt-in, tratadas como v2.1+)

Estas NO son entregables obligatorios. Se marcan como opciones speculativas; cada una es un sprint por sí misma y podría justificar su propio spec.

### 5.1 Radar semanal

**Qué.** Email/WhatsApp todos los lunes 9am con _"3 movimientos en tu rubro esta semana"_:
- Nueva licitación de alto score
- Cambio en buyer score de un comprador frecuente
- Competidor nuevo detectado

**Infra requerida.**
- Cron job (Celery beat) — lunes 9am America/Santiago
- Endpoint `/api/bi/radar_semanal?empresa_id=X` — devuelve los 3 movimientos
- Integrar con `NotificationService` existente (email + WhatsApp)

**Cambios.** Backend significativo (detección de "nuevos movimientos" requiere snapshotting). Out of scope para v2 inicial.

### 5.2 Modo jefe — reporte PDF

**Qué.** Botón "Generar reporte" → PDF de 2-3 páginas personalizable:

- Header: nombre del usuario + rubro + rango temporal
- Página 1: `MarketSummaryCard` + `MyPositionCard`
- Página 2: §1 top 5 oportunidades + §4 top 1 comprador con detalle
- Footer: fuente ("Datos abiertos ChileCompra, procesados por Tordo")

**Infra requerida.**
- Endpoint `POST /api/bi/reporte` → worker Celery renderiza HTML + Puppeteer → S3 presigned URL
- Nueva dependencia: Puppeteer o Playwright (~200MB de image)

**Trade-off.** Alto valor comercial (lead magnet + razón de upgrade), pero requiere infra nueva. Dejar para v2.1.

### 5.3 Simulador pre-bid

**Qué.** Widget independiente donde el usuario selecciona Tipo (L1/LE/LP) + Rubro + Organismo y recibe un output narrativo:

> _"Si postulas a una Licitación Pública de Equipos médicos en Hospital Padre Hurtado, esperas:_
> _— **6 a 10 competidores** (confianza alta, 34 casos históricos)_
> _— **Descuento mediano 8%** cuando hay 3-5 oferentes_
> _— **Pago en ~42 días** (buyer score: verde)_
> _— **Ventana de preparación típica: 12 días**"_

**Componente.** `SimuladorCard.tsx` — podría vivir en "Herramientas avanzadas" como 5ª herramienta o como sección independiente.

**Backend.** Orquesta `/forecast_competidores` + `/descuento` + `/comprador` + `/ventana`. Podría ser un endpoint único `/api/bi/simular?tipo=X&rubro=Y&organismo=Z` que los combine, o composición client-side.

**Trade-off.** Alta densidad de valor (responde la pregunta más cara: _"¿vale la pena postular?"_), pero requiere lógica de fallback ordenada si alguno de los 4 endpoints no tiene datos para la combinación.

---

## Resumen de cambios backend

| Cambio | Fase | Prioridad |
|---|---|---|
| `GET /api/bi/resumen?rubro=X` — agrega métricas para narrativa | 1.1 | Alta |
| `GET /api/bi/mi_posicion?empresa_id=X&rubro=Y` — posición empresa | 2.1 | Alta |
| `GET /api/bi/radar_semanal?empresa_id=X` | 5.1 | Opt-in |
| `POST /api/bi/reporte` — PDF | 5.2 | Opt-in |
| (Opcional) `GET /api/bi/simular?tipo&rubro&organismo` | 5.3 | Opt-in |

**Endpoints existentes que se empiezan a usar en v2:** `/sector`, `/forecast_competidores`, `/diversificacion`, `/precio`, `/matching`.

---

## Estructura de archivos frontend resultante

```
frontend/app/dashboard/bi/
├── page.tsx                              # orquesta estado + URL sync (cambio)
├── types.ts                              # (extender)
├── narrative/
│   └── templates.ts                      # NEW — plantillas de resumen narrativo
├── hooks/
│   └── useCompradorCache.ts              # NEW — cache compartido
└── components/
    ├── RubroFilter.tsx                   # (cambio: chip de focused organismo, toggle compare)
    ├── PlanGate.tsx                      # (refactor: prop `preview`)
    ├── MarketSummaryCard.tsx             # NEW (Fase 1.1)
    ├── MyPositionCard.tsx                # NEW (Fase 2.1)
    ├── BIOnboarding.tsx                  # NEW (Fase 2.3)
    ├── SectorOverview.tsx                # NEW (Fase 1.3)
    ├── HerramientasAvanzadas.tsx         # NEW (Fase 3.1)
    ├── CompareMode.tsx                   # NEW (Fase 3.2)
    ├── ShareMenu.tsx                     # NEW (Fase 4.1)
    ├── OportunidadesSection.tsx          # (cambio: botón "Analizar comprador", lazy expand)
    ├── TendenciasSection.tsx             # (cambio: modo comprimido cuando hay rubro)
    ├── CompetenciaSection.tsx            # (cambio: dropdown con nombres, tooltip sin HHI)
    ├── CompradoresSection.tsx            # (cambio: remover tabla P10/P50/P90, focused)
    ├── EstacionalidadSection.tsx         # (cambio: dropdown con nombres, focused)
    └── (Fase 5.3, opcional) SimuladorCard.tsx
```

---

## Roadmap sugerido

| Fase | Entregables | Esfuerzo estimado | Requiere backend |
|---|---|---|---|
| 0 | Fixes críticos + limpieza | 2-3 días | No |
| 1 | Narrativa (`MarketSummaryCard`, paywall inteligente, `SectorOverview`) | 3-5 días | Sí (1 endpoint) |
| 2 | Personalización (`MyPositionCard`, cross-linking, `BIOnboarding`) | 1-2 semanas | Sí (1 endpoint) |
| 3 | Herramientas (colapsible, comparador) | 1 semana | No |
| 4 | Compartibilidad (menu, URL sync) | 2-3 días | No |
| 5 | Apuestas arriesgadas | Cada una ~sprint independiente | Sí |

**Recomendación de orden de ejecución:**
1. Fase 0 primero (destrabó todo lo demás).
2. Fase 1 en paralelo con Fase 2.1 (mientras backend construye los dos endpoints, frontend cablea cross-linking de 2.2 y onboarding de 2.3).
3. Fase 3 y 4 son independientes; pueden entrar en cualquier orden después.
4. Fase 5 se evalúa tras ver métricas de Fases 1–4 (qué engagement generan las nuevas features determina si el ROI de las apuestas vale).

---

## Qué queda explícitamente fuera

- **LLM-generated narrative.** La narrativa de 1.1 es por plantillas con slots. No hay llamadas a modelos generativos. Razón: costo, latencia, consistencia.
- **Multi-idioma.** Spanish-only, alineado con el alcance del producto.
- **Exportar a Excel.** Copy/PNG/link cubren los casos prácticos del comercial. XLSX agrega complejidad sin impacto claro.
- **Colaboración en vivo** (compartir pantalla, comentarios por sección). Fuera del alcance de un panel de BI; es un producto aparte.
- **Mobile-first del Panel BI.** Desktop-first está en CLAUDE.md; v2 mantiene esa decisión. Móvil tiene degradación aceptable (modo comparar oculto, tablas con scroll horizontal).

---

## Notas de riesgo

- **Matching RUT → CodigoProveedor (2.1).** Si la empresa nunca registró su RUT o el CodigoProveedor del parquet usa un formato distinto, `MyPositionCard` cae al estado vacío. Verificar durante implementación que el formato RUT coincida.
- **Template narrativo (1.1) rígido.** Si los datos salen de rangos esperados (ej: cagr de -400% por dato sucio), las frases pueden sonar raras. Mitigar con clamping + filtros de outlier en el endpoint.
- **PNG screenshots (4.1).** `html2canvas` es conocido por renderar mal en ciertos estados CSS (sticky, backdrop-filter). Dedicar testing.
- **Paywall "leak" de datos (1.2).** El payload completo llega al cliente aunque esté con blur — técnicamente un usuario avanzado lo puede leer en devtools. Datos son públicos (ChileCompra abierto), pero documentar como decisión consciente.
