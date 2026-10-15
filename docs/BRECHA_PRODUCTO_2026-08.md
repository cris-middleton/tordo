> 🟡 **Histórico (2026-08-07).** Es la foto que ordenó las prioridades de F6.
> **F6 ya está cerrada**, así que varias brechas que nombra están cubiertas —
> el estado actual está en `ARQUITECTURA_REVISION_2026-08.md`.

# Brecha entre el producto construido y el producto prometido

**TORDO · revisión del 2026-08-07**

> **Qué es este documento.** Una lectura del código completo contrastada con
> `tordo_plan_saas.md` (retirado del repositorio en el rediseño 7), que es el documento que más se parece al producto final. No es un
> plan de arquitectura —eso vive en `ARQUITECTURA_REVISION_2026-08.md`, que sigue vigente—
> sino la lista de lo que falta para que el producto **valga lo que el plan dice que vale**,
> ordenada por lo que bloquea salir a promocionar.
>
> **Método.** Todo lo que se afirma aquí está verificado contra el código o contra los datos,
> y lleva la evidencia al lado. Donde hay opinión, está marcada como debate.
>
> **Reparto con el otro agente.** Hay otra sesión ejecutando F1–F6 del plan de arquitectura, y
> avanzó mientras se escribía esto: el PR #45 cerró la migración a TanStack Query y el #46 movió
> la sesión a cookies `httpOnly` con proxy en Next, con lo que **se acabó el cierre de sesión a
> los 30 minutos**. Este documento **no toca esa lista**: lo que queda ahí —Google sin refresco,
> primitivas accesibles, Playwright, versionado `/api/v1`, UI de invitación— es trabajo de
> plataforma que este documento da por hecho. Lo de aquí es la capa de **producto**: dato,
> cierre de ciclo, monetización y confianza.

---

## 0. Veredicto en una página

**La ingeniería va por delante del producto.** El backend tiene 88 endpoints en 14 routers,
28 tablas, 21 migraciones con `alembic check` bloqueante, tenancy verificada por test
estructural, golden master de BI en CI, cobro tras un puerto con dos adaptadores y un
sistema de diseño con contraste AA verificado sobre 166 pares. Eso es más disciplina de la
que tiene la mayoría de los SaaS con clientes pagando.

**Lo que falta no es software: es el dato, el cierre del ciclo y el precio.**

Tres frases resumen la brecha:

1. **El corpus tiene tres meses de profundidad, no años.** El plan vende "millones de
   registros desde 2010 — difícil de replicar". Lo que hay son `2026-1`, `2026-2` y `2026-3`.
   El volumen por mes es real y grande (144.076 órdenes de compra únicas sólo en marzo, 22.542
   proveedores, 1.134 organismos), pero la **profundidad temporal** es lo que sostiene la mitad
   del catálogo de BI — y sin ella tres módulos devuelven cero filas y el nivel de precio más
   valioso queda con muestra mediana de 8 observaciones.
2. **El producto observa, pero no aprende.** Nadie le devuelve al usuario el resultado de las
   licitaciones que siguió. El dato existe —el ZIP masivo de licitaciones trae
   `RutProveedor`, `MontoLineaAdjudica` y `Oferta seleccionada`— pero no hay ningún job que lo
   junte con las postulaciones del usuario. Es el activo más barato que hay sobre la mesa y el
   que convierte a TORDO de "herramienta de consulta" en "sistema que mejora con el uso".
3. **El precio actual está por debajo del umbral que el propio plan declara no viable.**
   CLP 11.900/mes ≈ USD 12,4. El plan fija como target mínimo ARPU USD 25 con CAC ≤ USD 300 →
   LTV/CAC 2,1x. Con USD 12,4 y ese mismo CAC sale **1,03x**, que es el escenario Lean que el
   plan mismo descarta. Y de paso queda *por debajo* del plan de USD 15 con el que el plan
   teme que LicitaLab lo borre.

Además hay tres cosas rotas que un usuario encuentra el primer día: `/api/bi/mi_posicion`
responde 500 siempre, el monitor de estado hábil nunca se ejecuta, y no existe recuperación de
contraseña.

**Recomendación de fondo:** antes de promocionar, gastar ~3 semanas en *profundidad de dato +
cierre de ciclo + los cuatro arreglos que se ven*, y subir el precio. El producto no necesita
más features; necesita que las que tiene tengan qué decir.

---

## 1. Hechos del plan que ya no son ciertos

La §12 del plan ("Estado de Implementación") tiene doce afirmaciones desactualizadas. La tabla
es la corrección; el plan se actualiza en el mismo movimiento que este documento.

| El plan dice | Verificado en el código |
|---|---|
| "BI Service (16 endpoints)" | **22 endpoints** en `app/api/bi.py`, sobre 21 rutas |
| "13 routers, 60+ endpoints" | **14 routers, 88 endpoints** |
| "PostgreSQL, 15+ tablas, 8 migraciones" | **28 tablas, 21 migraciones** |
| "Polars + Parquet · BIService con cache 24h" | **Ya no.** F2 movió analytics a Postgres (`analytics.*`, 23 tablas materializadas). La caché y el volumen `:ro` se eliminaron |
| "Stripe billing ✅ Completo · falta Transbank" | El adaptador principal es **MercadoPago** (ADR 0008); Stripe quedó como segundo adaptador tras el puerto `ProveedorDePago`. Transbank se descartó |
| "Tests — no hay test suite. 5–8 días" | **176 tests backend, 57 ETL, 8 frontend**, más golden master de BI y tests estructurales de tenancy y de contrato de plan |
| "CI/CD — no hay GitHub Actions. 2 días" | **Seis jobs corriendo** en cada PR: lint, migraciones, backend, ETL, frontend, build de imágenes |
| "Sentry / monitoring — sin error tracking" | Sentry backend + Celery, logging JSON con `request_id`. **Falta sólo el frontend** |
| "React Query — frontend usa useState/useEffect. 3 días" | **Migración terminada** (PR #45). `react-hooks/set-state-in-effect` está en `error` |
| "Onboarding ✅ 6 pasos con BI real en paso 4" | **3 pasos**, y ninguno muestra BI. El paso 2 crea una alerta |
| "Estado hábil ✅ Completo · cada 6h" | El job corre, pero **siempre hace `skip`**: depende de un CSV que no existe y cuya URL está vacía (§2.3) |
| "Pipeline genera 722K price bands, 97K perfiles TF-IDF" | **14.920 price bands** + 39.073 bandas por producto; **10.840 perfiles TF-IDF** |

Dos números del plan que tampoco cuadran con los datos: §4.2 dice que el archivo de marzo 2026
tiene "16.838 registros" — el parquet consolidado de ese mes tiene **144.076 órdenes de compra
únicas**. La distribución sectorial del plan probablemente salió de una muestra parcial. Es una
buena noticia (el mercado es 8x más grande de lo que el plan asumió) pero conviene recontarla
antes de usarla en material comercial.

---

## 2. Siete hallazgos que cambian la conversación

### 2.1 El corpus tiene tres meses de profundidad — y eso vacía la mitad del BI

```
etl/data/consolidated/oc/   2026-1.parquet  2026-2.parquet  2026-3.parquet
etl/data/consolidated/lic/  2026-1.parquet  2026-2.parquet  2026-3.parquet
```

Descargados el 5 de agosto, y el último período es marzo. El job semanal
(`run_bulk_semanal`) llama a `descargar_datos_masivos.py --desde M-2 --hasta M`: refresca los
tres meses más recientes y **nunca va hacia atrás**. La profundidad histórica sólo crece un mes
por mes desde que el job empezó a correr — y no hay ningún backfill.

Lo que eso produce, medido sobre los parquets de salida:

| Tabla de analytics | Filas | Por qué |
|---|---|---|
| `trend_by_market` | **0** | `trend_analysis.py:139` filtra `n_anios >= 2` |
| `trend_by_sector` | **0** | idem |
| `emerging_markets` | **0** | idem — CAGR necesita años |
| `seasonality_predictions` | **8** | de 15.656 patrones detectados |
| `competitor_forecast_l3` | **3** | sin historia no hay forecast |
| `sector_dashboard` | **8** | |

`/api/bi/tendencia` está construido, tiene su schema, su gating, su test y su panel en el
frontend — y devuelve vacío por diseño. Lo mismo la estacionalidad, que es literalmente uno de
los cuatro ejemplos con los que el plan vende el diferenciador ("esta municipalidad compra TI
cada abril y octubre"). Con enero–marzo eso no se puede afirmar.

Y en lo que sí funciona, la profundidad cambia la **calidad de la respuesta**, no sólo la
cobertura. Las bandas de precio caen en cascada L1→L2→L3, y L1 —producto + organismo
específico, que es exactamente la pregunta que el producto promete responder— tiene esto:

| Nivel | Muestra mediana | % con n ≥ 10 |
|---|---|---|
| **L1** — producto + este organismo | **8** | **39 %** |
| L2 — producto + sector | 19 | 100 % |
| L3 — producto (global) | 40 | 100 % |

En seis de cada diez consultas, la respuesta precisa no tiene muestra suficiente y el sistema
cae al nivel genérico. Doce meses multiplican esa muestra por cuatro; treinta y seis, por doce.

**Es la acción de mayor palanca del proyecto y es un día de trabajo:**

```bash
uv run --project .. python etl/scripts/descargar_datos_masivos.py \
    --tipo ambos --desde 2023-1 --hasta 2026-3
uv run --project .. python -m etl.analytics.run_all
uv run --project .. python -m analytics.materialize
```

Costo: ~3,5 GB de parquets consolidados y unos cientos de MB en el esquema `analytics` de
Postgres. Beneficio: tres módulos dejan de estar vacíos, la estacionalidad pasa a ser
afirmable, y la banda de precio precisa deja de ser minoritaria. **Nada de lo que se construya
después rinde tanto por el esfuerzo.**

> Falta además decidir el ritmo de crecimiento: hoy el batch semanal refresca 3 meses. Con 36
> meses en la base, conviene separar "refrescar lo reciente" (semanal, 3 meses) de "recalcular
> el histórico" (mensual, todo), porque `run_all` sobre tres años no es un trabajo de minutos.

### 2.2 `/api/bi/mi_posicion` responde 500 en todas las llamadas

```python
# app/api/bi.py:704 y :711
if not empresa or not empresa.rut:
    ...
return bi_service.get_mi_posicion(empresa.rut, rubro)
```

El modelo `Empresa` no tiene el atributo `rut` — la columna se llama `rut_empresa`. Verificado:

```
AttributeError: 'Empresa' object has no attribute 'rut'
```

Es visible para el usuario: `app/dashboard/bi/page.tsx:86` llama a `useMiPosicion(...)` en cada
carga con un rubro seleccionado. El panel "Mi posición" —el único sitio donde el usuario se ve
**a sí mismo** dentro de los datos, y por tanto el de mayor valor emocional de toda la
pantalla— está caído desde siempre.

Se escapó porque `test_bi_mi_posicion.py` sólo prueba el servicio (`_normalize_rut`, casos sin
RUT, casos sin tablas) y **nunca llama al endpoint**. Es el mismo patrón que el test estructural
de tenancy fue creado para evitar, aplicado a un sitio donde no llegaba.

**Arreglo:** una línea, más un test que pegue al endpoint por HTTP. Y vale la pena revisar si
hay más desalineaciones modelo↔router del mismo tipo.

### 2.3 El monitor de estado hábil nunca se ejecuta

```python
# app/services/estado_habil_service.py:140
csv_url = settings.estado_habil_csv_url
if not csv_url:
    logger.warning("ESTADO_HABIL_CSV_URL not configured — skipping check")
    return {"skipped": True, "reason": "csv_url_not_configured"}
```

`ESTADO_HABIL_CSV_URL` está vacía en `config.py` y en `.env.example`. El job de Celery corre
cada 6 horas y hace `skip`. Cada empresa se queda en `estado_habil = "desconocido"`, que es lo
que el dashboard muestra.

Pero el problema no es configurar la variable: **el enfoque implementado contradice la propia
validación del proyecto**. `docs/deploy_steps/tareas_manuales.md` dice, marcado como VALIDADO:

> ~~No existe CSV masivo de estado hábil~~ … **Acción para Fase 1**: usar sólo el endpoint
> per-RUT `https://datos-abiertos.chilecompra.cl/organismos-proveedores/{RUT}`. No hay fallback
> a CSV.

Se implementó el CSV de todas formas, con un tope de seguridad de 50 MB, un `DictReader` que
adivina el nombre de la columna entre varios patrones y una descarga completa **por cada
chequeo** para buscar N RUTs. Aunque el CSV existiera, la forma correcta es O(empresas), no
O(mercado).

**Arreglo:** reescribir el servicio contra el endpoint per-RUT, con caché por RUT y respeto al
rate limit. Es un día. Y es uno de los cinco dolores del plan (§2.1, dolor 5) y una de las
cuatro filas de la tabla comparativa contra LicitaLab — hoy es una fila vacía.

### 2.4 El resultado de la licitación nunca vuelve al usuario

`LicitacionDetalle` tiene los campos correctos: `fecha_adjudicacion`, `monto_adjudicado`,
`proveedor_adjudicado`. `etl/utils/change_detection.py` sabe generar el evento
("Licitación adjudicada el …"). `run_etl_actualizar_detalles_licitaciones()` existe en
`etl/main.py`. El flag `--actualizar-detalles` existe.

**Y ningún job de Celery lo llama.** El `beat_schedule` tiene once entradas; la horaria corre
`--only-extraer-nuevos`, que captura el detalle **una vez**, mientras la licitación está
abierta. Después, nada la vuelve a mirar. El estado de adjudicación no se ingiere jamás.

Consecuencias en cadena:

- `Postulacion.estado` admite `adjudicada` / `no_adjudicada`, y
  `dashboard_home_service.compose_pipeline` calcula una **tasa de adjudicación** con ellos —
  pero sólo si el usuario los marca a mano. Nadie lo hace.
- La "Score de postulación (win/loss)" que el plan pone en v2 no necesita construirse: necesita
  **conectarse**.
- El ZIP masivo de licitaciones ya trae `RutProveedor`, `NombreProveedor`,
  `MontoLineaAdjudica`, `Oferta seleccionada`, `NumeroOferentes` y `FechaAdjudicacion`
  (`etl/analytics/config.py:LIC_COLS_CORE`). El dato está descargado. Sólo hay que cruzarlo con
  las postulaciones por `CodigoExterno`.

Esto es el §5.1 de este documento y, en mi opinión, la mejora individual más valiosa que se
puede hacer.

### 2.5 No hay recuperación de contraseña ni verificación de correo

`app/api/auth.py` expone: `register`, `login`, `refresh`, `logout`, `me`, `google`,
`google/callback`, `change-password`. **No hay `forgot-password` ni `reset-password`.** Un
usuario que olvida su contraseña no tiene camino de vuelta: hay que tocarle la base a mano.

`User.is_verified` existe y **nada lo pone en `True`**. Cualquiera se registra con un correo que
no controla, y el sistema le manda alertas a esa dirección.

Es un bloqueante de lanzamiento en cualquier SaaS, y es medio día de trabajo. Que no esté
después de 21 migraciones es señal de que la lista de pendientes se armó desde la arquitectura
y no desde el recorrido del usuario.

### 2.6 El correo —la superficie más vista del producto— está en inglés

```python
# app/core/email.py:94
subject = f"New Alert: {alert_title}"
...
<div class="header">   <h2>New Alert</h2>
.header { background-color: #4CAF50; }
```

Producto **sólo español, sólo Chile**, con "alertas semanales por email" como mecanismo
declarado de retención (§9.2 del plan), y la plantilla dice *"Hello, You have a new alert"* con
el verde de Material Design hardcodeado — justo lo que `CLAUDE.md` prohíbe en el frontend
("nunca hardcodear un color") y que aquí nadie vigila porque está fuera de React.

Además **no hay orquestador de notificaciones**: `AlertEngine.send_notifications` llama a cada
canal en secuencia dentro de un `try/except` que sólo loguea. Si SMTP falla, el usuario no se
entera y no hay reintento. El plan lo listaba como "NotificationService unificado — 2 días" y
sigue abierto.

**Arreglo:** plantillas en español con los tokens de marca (el `radar_service` ya tiene
`render_radar_email_html`, sirve de base), un `NotificationService` con reintento y registro de
entrega, y un remitente propio con SPF/DKIM. Dos o tres días, y es la cara del producto.

### 2.7 Cero telemetría de producto

No hay PostHog, ni Mixpanel, ni GA, ni nada. Búsqueda exhaustiva sobre `frontend/` y
`backend/`: sin resultados.

Se puede saber si el servidor falló (Sentry) pero no si alguien **usó** el producto. Al salir a
promocionar, las preguntas que deciden todo son: cuántos completan el onboarding, cuántos
consultan una banda de precio en la primera sesión, qué panel de BI se abre y cuál no, y en qué
día del trial de 14 se cae la gente. Ninguna se puede responder hoy.

Sin esto, el hito 3 del plan ("beta cerrada: 3/5 empresas activas después de 30 días") no es
medible más que preguntando.

### 2.8 Lo que se vende como Pro no está cerrado con llave

`tests/test_contrato_bi.py` declara la protección de los 22 endpoints de BI. El reparto real:

- **16 endpoints**: sólo `cuota` — cualquier plan entra, contra el contador diario de Redis.
- **1 endpoint** (`/licitacion-match`): `plan_pro`.
- 2: acceso por empresa. 3: sólo sesión.

Y `PLAN_QUOTAS` da al plan Free **3 consultas de BI por día** = ~90 al mes.

El ICP primario del plan es la "PYME core: 1–15 licitaciones/mes". **Ese perfil cabe entero
dentro del plan gratuito.** Mientras tanto `/api/billing/plans` vende como Pro "Benchmarks de
precio por producto", "Análisis de competidores" y "Score de oportunidad" — que en el código
están disponibles en Free.

Hay además dos incoherencias menores en la misma tabla: Free se anuncia con "3 alertas al mes"
y `PLAN_QUOTAS` aplica **5 alertas activas**; y `PLAN_QUOTAS` define los tiers `pyme` y
`enterprise` que **no se pueden comprar** en ninguna parte (aunque `enterprise` sí tiene
variables de entorno de pasarela).

Esto es la mitad del problema de monetización. La otra mitad es el precio, y va en §6.

---

## 3. Lo que falta, por pilar del producto

### Pilar A — Inteligencia pre-postulación

| Falta | Estado real | Impacto |
|---|---|---|
| Profundidad histórica ≥ 24 meses | 3 meses (§2.1) | **Crítico** — vacía tendencia, estacionalidad y emergentes |
| Resultado de adjudicación por licitación | Nunca se re-extrae (§2.4) | **Crítico** — sin ciclo de aprendizaje |
| Precio recomendado (no sólo banda) | Sólo percentiles | Alto — el salto de dato a decisión |
| Frescura y cobertura del dato en pantalla | No existe `DataFreshnessBar` | Alto — sin ella, un dato de marzo parece de hoy |
| Compra Ágil y Convenio Marco como oportunidades | Sólo aparecen en tablas de referencia y en el % de Trato Directo | Alto — volumen de mercado invisible |
| Alertas de cambio de precio | No existe | Medio — el dato ya está |
| Mi posición en el rubro | **Roto** (§2.2) | Medio |

### Pilar B — Compliance operativo

| Falta | Estado real | Impacto |
|---|---|---|
| Estado hábil funcionando | Nunca corre (§2.3) | **Crítico** — es una de las 4 filas del comparativo |
| Checklist derivado de las bases reales | Plantillas estáticas por tipo (GENERICO/L1/LE/LP/LQ/CO/E2) | Alto — es el módulo más flojo y el que el ADR 0004 señala |
| Recordatorio de plazo | ✅ funciona (48 h / 24 h, job diario 09:00) | — |
| Vencimiento de documentos | ✅ funciona (job diario 09:30) | — |
| Vínculo documento ↔ ítem de checklist | ✅ existe | — |

### Pilar C — Superficie comercial

| Falta | Estado real |
|---|---|
| Páginas legales (términos, privacidad, tratamiento de datos Ley 19.628) | **No existen.** No se puede cobrar sin ellas |
| Recuperación de contraseña / verificación de correo | **No existen** (§2.5) |
| `sitemap.ts` / `robots.ts` | No existen (sí hay `og.png`, favicons y `site.webmanifest`) |
| Contenido SEO / blog | No existe. El plan lo pone como canal principal (CAC USD 50–100) |
| Informe sectorial descargable como lead magnet | No existe. El plan lo llama "el lead magnet principal" |
| Página de precios propia (fuera del ancla `#precios`) | No existe |
| Telemetría de producto | No existe (§2.7) |
| Correos en español y de marca | No (§2.6) |

### Pilar D — Operación y confianza

| Falta | Estado real |
|---|---|
| Despliegue | **Nada desplegado.** Hay `docker-compose` y guía de Railway; no hay entorno vivo |
| Sentry en el frontend | Pendiente (único punto abierto de F1) |
| Playwright / E2E | Pendiente (F5). 8 tests de frontend, ninguno de flujo |
| Backoffice mínimo de soporte | No existe. Para atender a un cliente hay que entrar a `psql` |
| Backups verificados | No hay política ni restore probado |
| `/docs` y `/redoc` públicos | Expuestos sin condición en producción — decisión pendiente |

---

## 4. Mejoras sustanciales y necesarias

**Bloquean salir a promocionar.** Orden de ejecución, con estimación para un desarrollador con
agentes.

| # | Qué | Por qué bloquea | Días |
|---|---|---|---|
| 1 | **Backfill de 24–36 meses** + separar refresco semanal de recálculo mensual | Sin esto, tres paneles muestran vacío y el 61 % de las bandas precisas caen al genérico. Es la demo | 1–2 |
| 2 | **Cerrar el ciclo de adjudicación**: job `--only-actualizar` + cruce del ZIP LIC con `postulaciones` | Es el diferenciador que ningún competidor tiene y el dato ya está descargado | 3–4 |
| 3 | **Arreglar `mi_posicion`** + test por HTTP del endpoint | Error 500 visible en la pantalla principal de BI | 0,5 |
| 4 | **Estado hábil por endpoint per-RUT** | Feature anunciado que no funciona | 1 |
| 5 | **Recuperar contraseña + verificar correo** | Bloqueante de cualquier SaaS | 1 |
| 6 | **Correos en español, con marca, y `NotificationService` con reintento** | Es la superficie más vista y hoy dice "Hello" en verde Material | 2–3 |
| 7 | **Barra de frescura y cobertura del dato** (`DataFreshnessBar` del plan de BI) | Un dato de marzo mostrado sin fecha destruye la confianza cuando el usuario lo cruza con Mercado Público | 1 |
| 8 | **Páginas legales + política de datos** | No se puede cobrar sin ellas en Chile | 1 |
| 9 | **Telemetría de producto** (PostHog self-host o cloud) | Sin ella la beta cerrada no es medible | 1 |
| 10 | **Desplegar** (Railway) con Sentry de frontend y backups probados | Obvio, pero sigue pendiente | 2–3 |
| 11 | **Cerrar el gating y ajustar el precio** (§6) | El ICP cabe entero en el plan gratuito | 1–2 |

**Total: ~16–20 días.** Es lo que separa "producto construido" de "producto que se puede
mostrar sin pedir disculpas".

---

## 5. Mejoras a considerar fuertemente

**No bloquean, pero son lo que convierte un MVP en un producto potente.** Ordenadas por
relación valor/esfuerzo.

### 5.1 Cerrar el ciclo del resultado — el activo más barato sobre la mesa

Hoy TORDO es un sistema de consulta: le preguntas y te responde. Con el resultado de
adjudicación conectado pasa a ser un sistema que **acumula**:

- *"Seguiste 14 licitaciones este trimestre. Se adjudicaron 9. En 6 de ellas el ganador ofertó
  bajo el p25 de la banda que te mostramos."*
- *"Perdiste 3 veces contra el mismo proveedor en Salud Araucanía. Su oferta mediana está 12 %
  bajo la tuya."*
- *"Tu tasa de adjudicación en licitaciones donde el score de oportunidad era ≥ 7 es 41 %.
  Donde era ≤ 4, 6 %."* ← esto valida el score con los datos del propio cliente.

Nada de eso exige que el usuario registre nada: el cruce es por `CodigoExterno` contra el ZIP
que ya se descarga. **Y es lo único que un competidor no puede copiar comprando el mismo dato
público**, porque depende del historial de uso.

También cierra el bucle de calidad del propio producto: es la única forma de saber si el
`opportunity_scorer` funciona. Hoy corre el harness de evaluación
(`etl/analytics/evaluation/`) contra datos históricos, que es lo correcto, pero no contra
decisiones reales de clientes.

**Esfuerzo:** 3–4 días. **Prerequisito:** #1 y #2 de la tabla anterior.

### 5.2 De banda de precio a precio recomendado

La promesa literal del plan es *"¿pongo $3.8M o $4.2M en esta oferta?"*. Lo que el producto
entrega es p10/p25/p50/p75/p90 y una etiqueta de confianza. El usuario tiene que hacer la
inferencia.

Lo que falta es un objeto de decisión: **precio sugerido con rango de seguridad, y la razón**.
Los ingredientes ya están, cada uno en su módulo:

- `product_price_bands_L1/L2/L3` — la distribución.
- `discount_by_context` — cuánto se descuenta el estimado en este contexto.
- `competitors_by_market` + `competitor_forecast_*` — cuántos y quiénes van a competir.
- `buyer_scores` — cómo evalúa este comprador.

Juntarlos en una recomendación —*"sugerimos $3,85M: es el p40 de 34 compras de este organismo,
con 3 competidores esperados y un comprador que adjudica al menor precio en el 78 % de los
casos"*— es un módulo de agregación, no un modelo nuevo. Y **es exactamente lo que separa a
TORDO del BI de LicitaLab**, que el plan describe como "orientado al análisis general, no a la
decisión táctica".

Regla: pasa por `etl/analytics/evaluation/` antes de salir, como cualquier scorer.

**Esfuerzo:** 4–6 días. Depende de #1 (profundidad) para que la recomendación no sea humo.

### 5.3 El checklist real, extraído de las bases

El ADR 0004 y la §14 de la revisión de arquitectura ya llegaron a esta conclusión y la
suscribo entera: **el único uso de LLM con valor claro aquí es extraer estructura de las bases
de licitación**, no conversar sobre datos que ya se consultan bien.

El módulo de compliance es el más flojo del producto —plantillas estáticas por tipo— y es la
mitad de la propuesta de valor ("que no te rechacen por forma"). Las bases traen lo único que
no se puede derivar de OC/LIC: documentos exigidos, criterios de evaluación con ponderaciones,
garantías y causales de rechazo.

La economía es la parte que suele decidirse mal, y el ADR ya la tiene bien: **es costo por
documento, no por consulta**. Se procesa una vez por licitación, se cachea, y se amortiza entre
todos los suscriptores que la miren.

Lo pondría **después** de §5.1 y §5.2, por una razón: convierte el módulo más débil en el más
fuerte, pero §5.1 convierte el producto entero en otra categoría.

**Esfuerzo:** 6–10 días, y es el primer costo variable real del producto.

### 5.4 Compra Ágil y Convenio Marco

El plan mismo dice que Compra Ágil es el 38,1 % de las órdenes de compra —"canal masivo
subutilizado"— y el producto no muestra ni una. `licitaciones.json` de la API no las entrega, y
el ETL no ingiere ninguna otra fuente de oportunidades.

Para el ICP —PYME chica, ticket bajo, ciclo corto— **Compra Ágil es probablemente más relevante
que las licitaciones grandes**: menos requisitos formales, adjudicación en días. Es un segmento
entero al que el producto hoy no le habla.

Está en F6.2 del plan de arquitectura, y depende de `tipo_convocatoria` (movido de F4 a F6.2 a
propósito, para no fijar el enum antes de ver los datos). Coordinar con el agente de fases.

**Esfuerzo:** 5–8 días, incluido el modelo de datos.

### 5.5 Alertas de cambio — el producto que trabaja mientras no lo miras

Hoy todas las alertas son sobre *oportunidades nuevas*. Con la profundidad histórica cargada,
el dato soporta alertas sobre *cambios*, que es lo que hace volver a la app:

- "El precio mediano de <producto> en tu rubro bajó 14 % este trimestre."
- "<Organismo>, que te compraba 3 veces al año, no publica hace 8 meses."
- "Un competidor nuevo entró a tu rubro y ya lleva 6 adjudicaciones."
- "Se abrió la ventana de preparación de <organismo>: históricamente publica en 3 semanas."
  (`window_classified` ya tiene 22.615 filas.)

El motor de alertas ya es idempotente y multicanal. Lo que falta es el **disparador**: comparar
la materialización de esta semana contra la anterior. Está listado como F6.3.

**Esfuerzo:** 3–5 días. **Prerequisito:** #1.

### 5.6 El informe sectorial mensual — retención y adquisición con el mismo objeto

El plan lo nombra dos veces: como lead magnet principal del GTM (§9.1) y como mecanismo de
retención (§9.2). No existe.

Y es el mismo artefacto para las dos cosas: un PDF por rubro/región con precios, compradores
activos, concentración y estacionalidad. Público y recortado sirve de imán de leads sin
competencia de SEO; completo y personalizado por email cada mes es la razón de renovar.
`sector_dashboard`, `region_dashboard` y `sector_region_matrix` ya existen — hoy con 8, 32 y
238 filas porque falta profundidad.

**Esfuerzo:** 4–6 días. **Prerequisito:** #1.

### 5.7 Frescura y cobertura como ciudadano de primera

Va en la tabla de bloqueantes (#7) pero merece el argumento: el plan de dashboard BI
(`tordo_analytics_bi_dashboard_plan_v3.md` §A.4) especifica `DataFreshnessBar` y trata la
confianza como "primer ciudadano, no empty state". `ConfidenceBadge` se construyó;
`DataFreshnessBar` no.

Importa más de lo que parece en un producto de datos públicos: el usuario **puede verificar**.
Va a Mercado Público, ve una compra de julio que TORDO no tiene, y a partir de ahí no cree
ningún número más. Decir "datos al 31 de marzo de 2026 · 1.134 organismos · 22.542 proveedores"
convierte una debilidad en una demostración de rigor.

---

## 6. Debate: los planes y el precio

Esto es opinión, y va argumentada.

### 6.1 El precio actual está bajo el umbral que el propio plan declara no viable

| | Plan §7 | Código |
|---|---|---|
| Planes vendidos | 4: Básico / PYME 25 / Pro 55 / Gremio 150+ (USD) | **2: Free / Pro CLP 11.900** (anual CLP 9.900 mensualizado) |
| ARPU objetivo | USD 25 | **≈ USD 12,4** |

El plan fija el umbral con claridad: *"El escenario Lean (LTV/CAC 0,8x) no es viable. Target
mínimo: 300 clientes · USD 25/mes · CAC ≤ USD 300 · churn ≤ 4 %"*. Con ARPU 25 y churn 4 %, el
LTV es USD 625 y LTV/CAC = 2,1x.

Con el precio actual: LTV = 12,4 / 0,04 = **USD 310**. Con el mismo CAC de 300 → **1,03x**. Es
el escenario que el plan descarta explícitamente.

Sólo hay dos salidas y conviene elegir una a conciencia:

- **Bajar el CAC a ≤ USD 150** — posible sólo con adquisición 100 % orgánica (SEO, gremios,
  boca a boca), sin nada pagado ni llamadas de venta. Es lento y contradice "salir a
  promocionar".
- **Subir el ARPU.** Es la palanca inmediata y no cuesta adquisición.

Hay un segundo argumento, y es del propio plan: §1.3 advierte que *"'extremadamente barato'
como moat principal"* no sobrevive, porque *"LicitaLab lanza un plan a USD 15 con
infraestructura ya pagada y borra la propuesta"*. **CLP 11.900 ya está por debajo de esos
USD 15.** El producto está posicionado exactamente dentro de la trampa que el plan describe.

Para calibrar: LicitaLab parte en 2 UF/mes ≈ CLP 78.000. TORDO Pro está a **1/7 de ese
precio**. Ese descuento no comunica "más simple y más enfocado" — comunica "es otra cosa, más
chica".

### 6.2 El plan gratuito canibaliza al de pago

Ya desarrollado en §2.8: 16 de los 22 endpoints de BI sólo tienen cuota, y Free trae 3
consultas al día ≈ 90 al mes. El ICP primario postula entre 1 y 15 veces al mes. **Cabe
entero.** Y lo que la página de planes vende como Pro (benchmarks, competidores, score) está
disponible en Free.

Que el trial inverso de 14 días dé acceso `pro` completo está muy bien y hay que conservarlo.
El problema no es el trial: es qué queda después.

### 6.3 "Gremio" no es un plan, es un canal

El plan lo lista como SKU de USD 150+ con "whitelabel ligero". Un gremio no quiere una cuenta:
quiere **darle un beneficio a sus socios**. Cobrarle una suscripción por algo que él regala es
pedirle que actúe como revendedor sin margen.

La forma que funciona es un acuerdo de canal: código de descuento para socios + informe
sectorial mensual con la marca del gremio + un tablero agregado del sector para su directiva.
El ingreso viene de las suscripciones de los socios, no del gremio. **Sacarlo de la tabla de
precios y ponerlo en la de canales.**

Lo mismo con el *"fee de USD 50 por postulación completada"* del plan: penaliza exactamente el
comportamiento que se quiere fomentar, y además TORDO no puede observar el envío en Mercado
Público, así que dependería de que el usuario lo declare. **Descartarlo.**

### 6.4 Propuesta concreta

Mantener la simplicidad de dos SKU de pago —no cuatro— pero corregir dónde están puestos. Lo
que falta hoy no es un plan más barato: es que **quien valora mucho el producto no tenga forma
de pagar más**.

| Plan | Precio | Asientos | Qué incluye |
|---|---|---|---|
| **Free** | CLP 0 | 1 | Descubrimiento, calendario, 3 alertas activas, estado hábil, **3 consultas de BI al mes** (no al día) y una banda de precio completa como muestra |
| **Pro** | **CLP 29.900**/mes · CLP 24.900 anual | 3 | Todo el BI sin límite, matching semántico, score de oportunidad, checklist, documentos, alertas ilimitadas, recordatorios |
| **Equipo** | **CLP 69.900**/mes · CLP 59.900 anual | 10 | + claves de API, informe sectorial mensual del rubro, exportación, soporte con nombre |

Racional, punto por punto:

- **Free baja de 3/día a 3/mes.** Su trabajo es demostrar que el dato existe, no servir al ICP.
  La conversión sigue viniendo del trial de 14 días con `pro` completo, que es la palanca buena.
- **Pro a CLP 29.900** ≈ USD 31. Por encima del ARPU objetivo del plan, **1/3 de LicitaLab** —
  suficiente distancia para que el precio sea un argumento sin ser el único— y fuera del rango
  donde un plan defensivo de USD 15 lo borra.
- **Equipo** captura el segmento "PYMES analíticas" (USD 55 en el plan) y a las empresas
  socias de gremios. Sube ARPU sin costo de adquisición: son clientes que ya están dentro.
- Con la mezcla 70/30 entre Pro y Equipo, el ARPU sale ≈ USD 43 → LTV USD 1.075 → **LTV/CAC
  3,6x** con CAC 300. Eso sí financia promoción pagada.
- **Limpiar los tiers muertos**: `pyme` y `enterprise` viven en `PLAN_QUOTAS` y no se pueden
  comprar. O se venden o se borran; un tier que el código aplica y nadie puede adquirir es una
  trampa esperando.
- **Cuadrar copy y código**: Free dice "3 alertas al mes" y aplica 5 activas.

**Contraargumento honesto, porque existe:** sin clientes pagando todavía, subir el precio antes
de validar es apostar. La mitigación es que **el precio de lanzamiento se puede bajar y no se
puede subir** — a los primeros 20 clientes se les da precio fundador vitalicio (CLP 14.900) por
escrito, lo que da el mismo efecto de captación que el precio bajo sin fijar el techo del
producto para siempre.

---

## 7. Dos decisiones más que conviene revisar

### 7.1 WhatsApp

Está construido (Twilio, endpoint de prueba, sandbox), apagado por flag, y el proceso de
verificación WABA con Meta toma 4–8 semanas según el propio `tareas_manuales.md`.

Si va a estar en el material de promoción, **el trámite hay que iniciarlo ahora**, porque es el
único elemento del roadmap con un plazo externo que no se puede comprimir. Si no, sacarlo de la
comunicación y dejarlo como mejora posterior — pero decidirlo, no dejarlo en el limbo del flag.

### 7.2 El MCP en pausa — de acuerdo, con un matiz

La decisión de pausar el MCP (ADR 0004, 2026-08-07) me parece correcta y por la razón
correcta: es un canal, no una capacidad, y alcanza sólo a quien ya paga un cliente MCP.

El matiz: las **claves de API ya están construidas** y son prerequisito de la API pública, que
sí es una capacidad vendible y es la que habilita el segmento integración/ERP que Falconsoft
usa como ángulo. Lo que falta ahí no es el MCP: es **documentación, versionado y límites por
clave**. Eso encaja en el plan Equipo de §6.4 y es mucho más barato que el MCP.

---

## 8. Lo que NO hay que construir

Explícito, para que nadie lo reabra:

- **PWA / app móvil.** El plan la pone en v3. Sigue siendo correcta esa posición: el trabajo de
  preparar una oferta es de escritorio. Responsive basta.
- **Chat con LLM sobre los datos.** Ya descartado en la §14 de la revisión de arquitectura y lo
  reafirmo: los 22 endpoints responden esas preguntas de forma determinista, más rápida y más
  barata. Un chat encima sería una interfaz peor a datos que ya se consultan bien.
- **Multi-país.** ADR 0001. Cerrado.
- **Transbank.** ADR 0008 eligió MercadoPago. El plan todavía lo lista en v2; sacarlo.
- **Rama y entorno de staging.** `CLAUDE.md` explica por qué, y la razón sigue siendo válida
  hasta el primer cliente pagando.

---

## 9. Secuencia recomendada

Tres bloques, en orden. El bloque 1 no se puede paralelizar con el 2 porque el 2 depende del
dato del 1.

```
BLOQUE 1 · Que lo construido tenga qué decir          ~1 semana
  1. Backfill 24–36 meses + separar refresco de recálculo
  2. Arreglar mi_posicion (+ test por HTTP)
  3. Estado hábil por endpoint per-RUT
  4. Barra de frescura y cobertura

BLOQUE 2 · Que el producto aprenda y se pueda cobrar  ~2 semanas
  5. Cerrar el ciclo de adjudicación (job + cruce + pantalla)
  6. Recuperar contraseña + verificar correo
  7. Correos en español con marca + NotificationService con reintento
  8. Ajustar planes, precio y gating (§6.4)
  9. Legales + telemetría

BLOQUE 3 · Desplegar y medir                          ~1 semana
 10. Railway, Sentry de frontend, backups probados
 11. Beta cerrada con 5 empresas — ahora sí medible

DESPUÉS, por valor decreciente:
 · Precio recomendado (§5.2)
 · Informe sectorial (§5.6)
 · Alertas de cambio (§5.5)
 · Compra Ágil (§5.4)
 · Extracción de bases con LLM (§5.3)
```

**Cuatro semanas hasta poder promocionar sin pedir disculpas.** El grueso no es código nuevo:
es dato, cierre de ciclo y precio.

---

## 10. Cambios aplicados al plan

`tordo_plan_saas.md` se actualiza en el mismo movimiento que este documento:

- **§7.1** — la tabla de planes pasa a reflejar lo que el código vende hoy, con la propuesta de
  §6.4 marcada como decisión pendiente y el fee por postulación descartado.
- **§7.2** — los unit economics se recalculan con el ARPU real y se explicita el umbral.
- **§12.1** — corregidas las doce afirmaciones de la §1 de este documento.
- **§12.2** — la lista de pendientes se reescribe: lo que estaba (tests, CI, Sentry, React
  Query) sale; lo que falta de verdad entra.
- **§13** — los próximos hitos se reordenan según la §9 de aquí.

Lo que **no** se toca del plan: el análisis competitivo (§1), la propuesta de valor (§2), el
diferenciador (§3), las fuentes de datos (§4) y el mercado (§5) siguen siendo correctos y son
lo mejor que tiene el documento.

---

## 11. ¿Se puede construir todo esto sólo con este documento?

**No, y conviene decir dónde exactamente**, para que nadie abra una rama creyendo que tiene la
especificación en la mano y descubra a mitad de camino que le falta una decisión.

Este documento es un **diagnóstico con prioridades**, no una especificación de implementación.
Los ítems se reparten en tres grupos.

### 11.1 Listos para ejecutar tal cual — no falta nada

Aquí el documento alcanza: el qué, el porqué, el archivo y la evidencia ya están arriba.

| Ítem | Lo que falta es sólo escribirlo |
|---|---|
| **Backfill 24–36 meses** (§2.1) | El comando está literalmente en §2.1. Única decisión abierta: hasta qué año, y es una línea |
| **Arreglar `mi_posicion`** (§2.2) | `empresa.rut` → `empresa.rut_empresa` en `app/api/bi.py:704` y `:711`, más un test que pegue al endpoint por HTTP |
| **Separar refresco semanal de recálculo mensual** (§2.1) | Dos entradas de `beat_schedule` en vez de una |
| **Job de actualización de detalles** (§2.4, primera mitad) | `run_etl_actualizar_detalles_licitaciones()` ya existe; falta la entrada de Celery y decidir la cadencia |
| **Páginas legales** (§3, pilar C) | Contenido legal, no técnico. Requiere revisión de un abogado, no diseño |
| **Recuperar contraseña + verificar correo** (§2.5) | Patrón estándar: token de un solo uso, TTL, invalidación. Encaja en `refresh_tokens` |
| **Barra de frescura y cobertura** (§5.7) | Ya especificada en `tordo_analytics_bi_dashboard_plan_v3.md` §A.4 como `DataFreshnessBar` |
| **`sitemap.ts` / `robots.ts`** | Mecánico |

### 11.2 Necesitan **una decisión tuya** antes de empezar

El trabajo técnico está claro; lo que falta es que alguien elija. Son preguntas de una
respuesta, no de un documento.

| Ítem | La decisión que falta |
|---|---|
| **Precio, planes y gating** (§6.4) | ¿Se adopta la propuesta de tres planes? ¿Qué precio? ¿Se borran los tiers `pyme`/`enterprise` o se venden? ¿Precio fundador, a cuántos y por cuánto tiempo? **Nada de esto lo decide el código** — y hay que decidirlo antes, porque cambiar de tier a clientes ya cobrando es caro |
| **Estado hábil** (§2.3) | Confirmar que el endpoint per-RUT sigue vivo y ver su rate limit real antes de reescribir. La validación es de hace meses |
| **Telemetría** (§2.7) | Qué herramienta (PostHog cloud vs. self-host vs. otra) y qué se registra, con la Ley 19.628 en mente. Elegida la herramienta, la instalación es de horas |
| **Correos** (§2.6) | Qué remitente y qué proveedor (SMTP propio, SES, Resend…). Hace falta dominio con SPF/DKIM antes de escribir plantillas |
| **WhatsApp** (§7.1) | Va o no va al material de lanzamiento. Si va, iniciar hoy el trámite WABA porque son 4–8 semanas |
| **Cadencia de recálculo** con 36 meses en la base | `run_all` sobre tres años no es un trabajo de minutos: hay que medirlo y decidir ventana |

### 11.3 Necesitan **especificación propia** antes de código

Aquí el documento sólo justifica *por qué* vale la pena. El *cómo* no cabe y no se debe
improvisar. Cada uno merece su ADR o su plan corto, y para los medianos o grandes la regla del
repo es `grill-me` primero.

| Ítem | Qué hay que especificar antes |
|---|---|
| **Cruce de adjudicación ↔ postulaciones** (§5.1) | Cómo se casa `CodigoExterno` cuando el ZIP trae varias líneas por licitación; qué pasa con adjudicaciones parciales y desiertas; dónde vive el resultado (¿columnas en `postulaciones`? ¿tabla nueva?); qué se muestra y dónde. **Es la mejora más valiosa del documento y la que más fácil sale mal** |
| **Precio recomendado** (§5.2) | Es un scorer nuevo: hay que definir la fórmula, y `CLAUDE.md` exige pasarlo por `etl/analytics/evaluation/` con walk-forward antes de tocarlo. Sin eso es una opinión con decimales |
| **Extracción de bases con LLM** (§5.3) | ADR completo: modelo, esquema de salida, caché por licitación, costo por documento, qué pasa cuando la extracción falla o miente, y cómo se comunica al usuario que un ítem del checklist es inferido y no verificado |
| **Compra Ágil y Convenio Marco** (§5.4) | Investigación de fuente primero — `licitaciones.json` no las entrega. Después modelo de datos (`tipo_convocatoria`, F6.2) y qué significa "postular" en cada canal |
| **Alertas de cambio** (§5.5) | Qué se compara contra qué (hay que conservar la materialización anterior), qué umbral hace ruido y qué umbral hace valor, y cómo se evita que un rebuild del pipeline dispare mil alertas falsas |
| **Informe sectorial** (§5.6) | Qué va en la versión pública y qué en la de pago; generación (¿PDF? ¿página?); cadencia; y cómo se corta por rubro sin filtrar el activo entero |
| **Backoffice de soporte** (§3, pilar D) | Alcance y control de acceso. Un backoffice mal hecho es la peor superficie de seguridad de un SaaS |

### 11.4 En resumen

**El Bloque 1 y casi todo el Bloque 2 de §9 se pueden empezar hoy** con este documento como
única entrada — que es justamente el trabajo que desbloquea salir a promocionar. Las dos
excepciones dentro de esos bloques son el **cruce de adjudicación** (§11.3) y el **precio**
(§11.2), y las dos son deliberadamente lo primero que hay que resolver.

Todo lo de §5.2 en adelante —precio recomendado, LLM sobre bases, Compra Ágil, alertas de
cambio, informe sectorial— **es material para su propio documento**, y ese es el momento
correcto de escribirlo: cuando el dato tenga profundidad y haya usuarios reales diciendo qué
les sirve.

---

*Revisión de brecha producto ↔ plan · 2026-08-07 · complementa
`ARQUITECTURA_REVISION_2026-08.md`, no lo reemplaza*
