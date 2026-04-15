# Landing Mockups Redesign — Design Spec

**Fecha:** 2026-04-15
**Alcance:** Rediseño focalizado del landing (`frontend/app/page.tsx`) para transmitir con claridad las 3 ventajas competitivas centrales de TORDO.

---

## 1. Objetivo

Rediseñar los 3 mockups visuales del landing y la copy que los acompaña para que **cada mockup demuestre inequívocamente una ventaja competitiva concreta**, reemplazando los mockups actuales (BI Panel, Dashboard, Postulaciones) por mockups enfocados en las 3 ventajas centrales: **precio justo**, **score de oportunidad** y **matching semántico**.

Adicionalmente: ajustes menores al hero y reescritura de los bullets de "Beneficios" para alinear el mensaje con esas 3 ventajas, más la incorporación honesta de WhatsApp como canal de alertas (plus, no core).

## 2. Contexto — Por qué

El landing actual tiene problemas de transmisión de valor:

1. **Los mockups muestran UI genérica**, no insights concretos. El usuario PYME ve tablas y gráficos sin entender qué gana usando TORDO.
2. **La copy de los bullets de beneficios mezcla features** (precio, competidores, score) sin priorizar lo diferenciador.
3. **WhatsApp no se menciona** (es un plus real del producto).
4. **El mensaje no está calibrado al chileno cercano** — el landing actual suena a "SaaS B2B neutro", no a "herramienta hecha para dueños PYME chilenos".

## 3. No-goals (scope boundaries)

Fuera de este rediseño:
- "Cómo funciona" (sección se mantiene tal cual)
- Precios / planes (se mantiene)
- FAQ (se mantiene)
- Footer (se mantiene)
- Logo / header nav / estructura visual general del hero
- Componente `RotatingRubro` del hero (se mantiene)
- Mapa de competidores como feature de producto — sigue existiendo en `/dashboard/bi`, solo se saca del landing
- Data real vía API (fase posterior; ahora hardcoded realista)

## 4. Audiencia objetivo

Dueño de PYME chilena, 35-55 años, toma decisiones de postulación solo (sin equipo de analistas), visita el landing en desktop principalmente pero también en móvil. Jerga técnica baja. Espera lenguaje cercano, chileno, sin inglés innecesario.

## 5. Las 3 ventajas competitivas priorizadas

Estas 3 se eligieron como las más diferenciadoras vs usar ChileCompra directo o herramientas competidoras:

- **A — Precio justo:** "Sabes a cuánto se ha adjudicado este producto históricamente"
- **B — Score de oportunidad:** "Sabes si vale la pena postular antes de gastar horas"
- **C — Matching semántico:** "Encuentras licitaciones que calzan con lo que vendes aunque usen palabras distintas"

Todo el landing debe reforzar A/B/C en 3 momentos (hero → mockups → bullets). Cualquier otra feature de TORDO se menciona en compliance o queda para descubrir dentro del producto.

## 6. Hero — Ajustes mínimos

Se mantiene el logo, el headline rotativo con `RotatingRubro`, los CTAs principales, y la estructura visual.

**Cambios:**

**a) Subtítulo más específico** (reemplaza el actual):

> "Sabes a qué precio cotizar, cuáles licitaciones valen la pena postular y qué nuevas calzan con lo que vende tu empresa — sin adivinar."

Los 3 verbos ("sabes" / "valen la pena" / "calzan") mapean directo a A/B/C. Chileno tú neutro, sin voseo.

**b) Línea de confianza debajo del CTA:**

> "Datos públicos de ChileCompra · Sin tarjeta · Cancelas cuando quieras"

Baja la fricción del "¿me van a cobrar?" antes de clickear. Tipografía fina, gris.

## 7. Mockups — Rediseño completo

Se reemplazan los 3 mockups actuales (`MockupBIPanel`, `MockupDashboard`, `MockupPostulaciones`) por 3 nuevos, cada uno dedicado a una ventaja.

**Cada mockup:**
- Rota automáticamente entre múltiples ejemplos calibrados a rangos reales de Mercado Público (data hardcoded).
- Mantiene el chrome de navegador (`BrowserChrome`) para consistencia visual.
- Tiene jerarquía visual clara: un elemento hero (tamaño XL, color primary) + contexto (tamaño S muted) + insight de cierre (boxed/destacado).

### 7.1 Mockup 1 — Precio justo

**Headline:** *"Cotiza con datos, no con suerte"*

**Bajada:** *"Te mostramos el histórico de adjudicaciones de los productos que vendes: mediana, rango y ganadores de los últimos 24 meses."*

**6 ejemplos rotativos** (5s cada uno):

| # | Producto | Mediana | Rango |
|---|---|---|---|
| 1 | Servicio aseo terminal recinto salud | $2.8M / mes | $2.1M–$3.6M |
| 2 | Notebook corporativo Intel i5 | $680.000 / u | $580K–$820K |
| 3 | Resma papel carta 75g | $2.450 / u | $2.100–$2.900 |
| 4 | Uniforme escolar kit básico | $18.000 / kit | $15K–$22K |
| 5 | Reparación de veredas municipales | $12M / proyecto | $9M–$16M |
| 6 | Suministro alimentación JUNAEB | $1.850 / ración | $1.650–$2.200 |

**Elementos visuales del mockup (ejemplo #1 para referencia):**

- Header: nombre del producto
- Mediana en tamaño XL con badge de tendencia al lado: *"↑ 3% vs hace 12 meses"*
- Barra visual del rango con 4 marcas: Mín / Mediana / Cotización ejemplo / Máx
- Callout destacado (caja con borde suave, bg diferenciado):
  > 💡 *"Tu cotización de $3.2M está sobre 3 de cada 4 adjudicaciones. Si bajas a $2.9M, te acercas al precio que suele ganar."*
- Tabla compacta: 3 adjudicaciones recientes (comprador · fecha · monto · ganador)
- Footer con insight del comprador (muted, pequeño):
  > 📌 *"Este comprador adjudica típicamente en el rango medio. Puedes ganar sin ofrecer el precio más bajo."*

**Jerarquía visual:** Mediana (XL) > Callout simulador (M destacado) > Barra y labels (S) > Tabla y footer (XS muted).

**Nota sobre data:** los montos y rangos son estimativos realistas. Durante implementación se recomienda correr un script ad-hoc contra los Parquets de `etl/data/analytics/` para calibrar los rangos finales (no bloqueante para el primer release, pero evita prometer cifras que se vean ridículas).

### 7.2 Mockup 2 — Score de oportunidad

**Headline:** *"Postula donde tienes chance real"*

**Bajada:** *"Creamos un score que combina precio, similitud de rubro y tu historial de ventas, para que priorices lo que realmente te conviene."*

**3 ejemplos rotativos** (6s cada uno — más denso, necesita más tiempo de lectura):

| # | Licitación | Comprador | Score | Verdict |
|---|---|---|---|---|
| 1 | Suministro aseo terminal | Hospital San Juan de Dios | **82** | Postula ya |
| 2 | Resmas papel y toners | Municipalidad de La Florida | **58** | Evaluar |
| 3 | Reparación de veredas | SERVIU Región del Maule | **24** | Prioridad baja |

**Elementos visuales del mockup:**

- Header: título de licitación
- Meta-info: comprador · monto estimado · "Cierra en X días"
- Score XL (color según umbral: ≥70 verde, 40–69 amarillo, <40 rojo) con verdict tag al lado
- **Desglose en 4 barras**, cada una con label + barra de progreso + puntaje /10:
  - *Rango de precio saludable*
  - *Calce con tu rubro*
  - *Calidad del comprador*
  - *Plazo de preparación*
- Insight de cierre personalizado (💡), rota con cada ejemplo:
  - Ejemplo 1: *"Ganaste 2 licitaciones similares en los últimos 12 meses."*
  - Ejemplo 2: *"Este comprador adjudicó 4 contratos similares en el último año."*
  - Ejemplo 3: *"Solo 1 de cada 3 licitaciones de este tipo se adjudican."*

**Thresholds de color del score:**
- `>= 70`: verde (hero TORDO green, `#0EAD69` o equivalente)
- `40-69`: amarillo (el mismo amarillo usado en status badges)
- `< 40`: rojo suave (no alarmante)

**Jerarquía visual:** Score XL > Verdict tag M > Barras del desglose S > Meta-info e insight XS.

### 7.3 Mockup 3 — Matching semántico

**Headline:** *"Deja de perder licitaciones por una palabra"*

**Bajada:** *"Si un hospital quiere comprar 'aseo terminal' y tú vendes 'limpieza hospitalaria', igual te la mostramos — junto a todas sus variantes."*

**4 ejemplos rotativos** (5s cada uno):

| # | Tu rubro | Variantes encontradas (muestra en tarjetas) |
|---|---|---|
| 1 | Limpieza hospitalaria | Aseo terminal recinto salud (96%) · Sanitización áreas UCI (89%) · Desinfección clínica ambulatoria (82%) |
| 2 | Computadores corporativos | Notebook 14'' Intel i5 (94%) · Laptop ejecutivo empresarial (87%) · Equipo portátil usuarios funcionarios (78%) |
| 3 | Papelería oficina | Resmas papel 75g (92%) · Insumos escritorio administrativo (84%) · Suministros oficina ministerio (76%) |
| 4 | Construcción vial menor | Reparación veredas comuna (91%) · Bacheo calles urbanas (85%) · Reposición aceras peatonales (80%) |

**Elementos visuales del mockup:**

- "Barra de búsqueda" en la parte superior mostrando el rubro del usuario (con icono 🔍)
- Subtítulo: *"N licitaciones que calzan con lo que vendes:"*
- 3 tarjetas de resultado, cada una con:
  - Título de la licitación (en rubro variante)
  - Meta-info: comprador · monto · "Cierra en X días"
  - Badge de % de calce en la esquina superior derecha (color escalado: 90%+ verde fuerte, 80-89% verde medio, 70-79% verde suave)
- Insight de cierre 💡, rota con cada ejemplo:
  - *"Con una búsqueda por palabras exactas, habrías visto 1 de estas 3 licitaciones."*
  - *"Con una búsqueda por 'computadores', te habrías perdido el 67% de estas."*
  - *"Solo la primera aparecería si buscas 'resmas'. Las otras 2 pasan desapercibidas."*
  - *"Buscando 'veredas' te pierdes 'bacheo' y 'aceras' — 2 de 3 oportunidades."*

**Jerarquía visual:** Rubro (barra de búsqueda) M destacado > Tarjetas S con % grande > Insight de cierre S destacado.

## 8. Animación e interacción

Comportamiento unificado para los 3 mockups (con velocidades ligeramente distintas):

**Desktop:**

- Rotación automática con `setInterval`:
  - Mockup 1: 5000ms
  - Mockup 2: 6000ms (más denso)
  - Mockup 3: 5000ms
- **Pausa al hover:** cuando el cursor está sobre el mockup, el timer se detiene. Al salir, se reinicia el timer (próxima rotación arranca desde cero, no continúa el timer anterior).
- **Activación por viewport:** cada mockup comienza su rotación cuando entra al viewport (IntersectionObserver, threshold ~0.3).
- **Indicadores (dots):** puntitos debajo de cada mockup (1 por ejemplo). El activo marcado en el verde TORDO.
- **Click manual en un dot:** salta al ejemplo correspondiente y reinicia el timer.
- **Transición:** fade corto (300ms) entre ejemplos. No sliding, no animaciones complejas.
- **Primer frame:** siempre arranca en ejemplo #1.

**Mobile (< 768px):**

- **Sin autoplay.** Los mockups muestran por defecto el ejemplo #1.
- **Swipe horizontal** entre ejemplos (implementar con hook touch o biblioteca ligera tipo `framer-motion` si ya está instalada, si no, CSS scroll-snap).
- **Dots visibles** para indicar cantidad de ejemplos.
- **Alternativa accesible:** si swipe es muy técnico de implementar confiable, usar flechitas pequeñas `<` `>` a los costados.
- **Performance:** no cargar librería pesada solo para esto. Si hay que elegir entre swipe o flechas, priorizar flechas (más simples y universales).

## 9. Bullets de "Beneficios" — Reescritura

### 9.1 Sección BI (alineada con A/B/C)

Reemplaza los 3 bullets actuales:

- **DollarSign** — *Precio de mercado* · "Mediana y rango de adjudicación de los productos que vendes."
- **Target** — *Score de oportunidad* · "Qué licitaciones valen tu tiempo, ordenadas."
- **Sparkles** (o Search/Zap) — *Matching semántico* · "Detectamos licitaciones afines aunque usen otras palabras."

"Mapa de competidores" se saca del landing (sigue existiendo en `/dashboard/bi`).

### 9.2 Sección Compliance (reordenada + WhatsApp integrado)

Reemplaza los 3 bullets actuales:

- **Bell** — *Alertas cuando aparece algo que te conviene* (CORE, ahora primero)
  *"Te avisamos por correo o WhatsApp cuando hay nuevas licitaciones u órdenes de compra que hacen match con tu perfil, y también 48h y 24h antes del cierre."*

- **CheckCircle2** — *Papeles al día sin adivinar*
  *"Plantilla de documentos según el tipo de licitación (L1, LE, LP). Así no revisas Bases de 40 páginas para saber qué declaraciones pedir."*

- **FileClock** (ícono nuevo — reemplaza ShieldCheck) — *No pierdas postulaciones por un documento vencido*
  *"Te avisamos cuando un certificado, garantía o boleta está próximo a vencer. Renuevas a tiempo y no te descartan por papel caducado."*

**Por qué se saca ShieldCheck/Monitor estado hábil:** ChileCompra ya notifica antes de quedar inhábil, así que TORDO vendería un feature que no diferencia. Se mantiene en el backend como "extra silencioso" (sigue existiendo el `estado_habil_service`), solo se saca del pitch de landing.

**Nota sobre el checklist:** la copy dice "plantilla según el tipo de licitación (L1/LE/LP)", que es honesto — TORDO provee plantillas estándar por tipo, no parseo de Bases individuales (eso requeriría trabajo adicional en PDF parsing que hoy no está implementado). La CLAUDE.md actual advierte: *"PlantillaChecklist seed data: Template records for L1/LE/LP checklist items may not be seeded"*. La implementación del plan debe incluir la carga de esas plantillas seed si aún no existen, o ajustar copy si se decide descopear.

## 10. Copy — Reglas de estilo

Todo el copy del landing debe respetar:

1. **Chileno tú neutro** — nunca voseo argentino. "Sabes" no "sabés". "Puedes" no "podés". "Cancelas" no "cancelás".
2. **Sin jerga técnica sin traducir** — "percentil 75" → "3 de cada 4". "P50" → "mediana". "NDCG@10" nunca aparece. "TF-IDF" solo internamente, no en landing.
3. **Factual sin inventar causas** — si la data dice "comprador adjudica al rango medio", decir eso. No decir "prefiere calidad" (no sabemos por qué).
4. **Positivo y accionable** — "Puedes ganar sin ofrecer el precio más bajo" > "No pierdes si no eres el más barato".
5. **Verbos en 2ª persona** — "cotizas", "postulas", "ganas". Nunca pasivo corporativo ("las cotizaciones son optimizadas").
6. **Ejemplos concretos > conceptos abstractos** — "Si el hospital lo llama 'aseo terminal' y tú 'limpieza hospitalaria'" > "flexibilidad en búsqueda".
7. **Sin inglés innecesario** — "match" es OK por uso colloquial; "score" es OK; "KPI", "pipeline", "stack" no aparecen.

## 11. Accesibilidad y responsive

- **Contraste:** todos los textos deben cumplir WCAG AA (4.5:1 para texto normal, 3:1 para large).
- **Keyboard nav:** los dots de rotación deben ser focusables y operables con Enter/Space.
- **Screen readers:** cada mockup debe tener `aria-label` descriptivo (ej: "Ejemplo rotativo de análisis de precio: aseo hospitalario"). Los cambios de ejemplo deben anunciarse con `aria-live="polite"`.
- **Reduced motion:** si `prefers-reduced-motion: reduce`, deshabilitar la rotación automática (el usuario rota manualmente con dots).
- **Mobile breakpoints:** alineado con el breakpoint actual del landing (Tailwind `md:` = 768px).

## 12. Criterios de aceptación

1. Los 3 mockups actuales (`MockupBIPanel`, `MockupDashboard`, `MockupPostulaciones`) quedan reemplazados por 3 nuevos (`MockupPrecio`, `MockupScore`, `MockupMatching`).
2. Cada mockup nuevo rota entre sus ejemplos definidos (6 / 3 / 4) con las velocidades y comportamientos especificados.
3. El hero tiene el nuevo subtítulo y la línea de confianza debajo del CTA.
4. Los 6 bullets de beneficios (3 BI + 3 Compliance) corresponden a los textos y orden definidos en §9.
5. Todo el copy respeta las 7 reglas de estilo de §10 (revisable visualmente antes de merge).
6. El mockup respeta `prefers-reduced-motion` (sin autoplay en esos casos).
7. Mobile: los mockups son navegables sin autoplay (swipe o flechas).
8. Accesibilidad: los dots son focusables por teclado.
9. `npm run build` pasa sin warnings nuevos. `npm run lint` sin errores.

## 13. Trabajo manual / no incluido en código

1. **Calibrar cifras reales** antes del deploy: correr un script contra los Parquets de `etl/data/analytics/` para verificar que las medianas y rangos de los 6 ejemplos del Mockup 1 son consistentes con la data real. No bloqueante para primer release si las cifras están dentro de rangos plausibles.
2. **Sed data para PlantillaChecklist L1/LE/LP** (si no existe aún): cargar las plantillas de documentos por tipo, para que el bullet del checklist no mienta.
3. **Iconografía:** confirmar que `FileClock` existe en `lucide-react` (debería, pero verificar); alternativamente usar `Clock` o `Calendar`. Confirmar que `Sparkles` o el ícono elegido para "Matching semántico" tenga suficiente peso visual.

---

## Arquitectura técnica resumida

```
frontend/app/page.tsx (archivo ÚNICO, 804 líneas actuales → ~900 estimadas)

CAMBIOS:
├─ Hero section: subtítulo + línea de confianza (líneas ~380-440)
├─ Mockups section: reemplazo completo de 3 componentes internos
│  ├─ MockupBIPanel (líneas 197-240) → MockupPrecio (nuevo)
│  ├─ MockupDashboard (líneas 242-280) → MockupScore (nuevo)
│  └─ MockupPostulaciones (líneas 282-~340) → MockupMatching (nuevo)
├─ Hook nuevo: useRotatingExample<T>(examples, intervalMs, active)
│  (pausa-on-hover, IntersectionObserver, respeta reduced-motion)
├─ Data arrays: 3 constantes de ejemplos (PRECIO_EXAMPLES, SCORE_EXAMPLES, MATCHING_EXAMPLES)
└─ Benefits section: reescritura de 6 bullets (líneas ~505-545)

NO CAMBIAN:
- Nav, footer, CTAs, pricing, FAQ, RotatingRubro, BrowserChrome
- Ningún archivo fuera de frontend/app/page.tsx
  (salvo tal vez un componente nuevo en frontend/components/ si el hook o
   los mockups crecen demasiado — decisión del plan de implementación)
```

**Decisión de modularización:** si `page.tsx` pasa de ~900 líneas con los nuevos mockups, extraer los 3 mockups a `frontend/components/landing/MockupPrecio.tsx`, `MockupScore.tsx`, `MockupMatching.tsx` + el hook `useRotatingExample.ts`. La decisión final la toma el plan de implementación basándose en tamaño real post-edición.
