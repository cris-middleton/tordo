> 🟡 **Histórico** desde el pivote público (2026-10-11). Describe el despliegue del SaaS
> —`SECRET_KEY`, Google, Stripe, MercadoPago, almacenamiento de documentos, Celery— que ya no
> existe. La guía nueva (Vercel + Railway con dos cron, `MCP_HOSTS_PERMITIDOS`, latidos) llega
> en el paso 12 de `docs/PIVOTE_PUBLICO_2026-10.md`. **No configures nada siguiendo esto.**

# Tareas Manuales — Lo que debes hacer TÚ
## (Cosas que la IA no puede hacer por ti)

Este documento lista las acciones que requieren acceso a cuentas externas, decisiones de negocio
o validación en el mundo real. Organizado por el momento en que debes completarlas.

---

## Antes de empezar (Semana 0 — junto con Fase 0)

### 1. Endpoint de Estado Hábil — ✅ contrastado en vivo el 2026-09-24 (y no da el estado)

**Contrastado con una llamada real** a
`GET https://api.mercadopublico.cl/servicios/v1/Publico/Empresas/BuscarProveedor?rutempresaproveedor={RUT}&ticket=…`:

| Caso | Respuesta |
|---|---|
| RUT inscrito, **con puntos** (`76.286.670-6`) | `200 {"Cantidad":1, "listaEmpresas":[{"CodigoEmpresa":"141927","NombreEmpresa":"PRONOMED SPA"}]}` |
| El mismo RUT **sin puntos** (`76286670-6`) | `500 {"Codigo":10200,"Mensaje":"No hay resultados de empresas."}` |
| RUT no inscrito | `500 {"Codigo":10200, …}` |
| Ticket inválido | `203 Ticket no válido` |

La búsqueda es exacta: el `CodigoEmpresa` de Pronomed (141927) es el mismo
`CodigoProveedor` que traen sus órdenes de compra. Un RUT de relleno como
`11.111.111-1` devuelve **11** empresas —gente inscrita con ese RUT—, así que
`inscrito` significa «el registro devuelve algo para este RUT», no más.

**Conclusión: la API pública no dice si una empresa está hábil.** Sólo si figura en
el Registro de Proveedores. La habilidad la ve únicamente el proveedor, en la
sección «Habilidad» de su ficha. El código se ajustó a lo que sí se puede afirmar:
`inscrito` / `no_encontrado` (migración `91d4eefa77c9`), RUT con puntos, y el 500
con `Codigo 10200` interpretado como «no inscrito» en vez de error.

Descartado antes, y sigue descartado: el CSV masivo (no existe) y
`datos-abiertos.chilecompra.cl/organismos-proveedores/{RUT}` (devuelve el HTML de
un SPA con 200 para cualquier RUT).

**Pendiente, y no es de código:** si algún día hace falta el estado hábil de verdad,
la única vía conocida es que el propio proveedor lo informe. No hay fuente pública.

---

### 2. Ticket de API de Mercado Público — ⚠️ PENDIENTE, y bloquea la ingesta

**El `.env` de este entorno tiene `MERCADO_PUBLICO_TICKET=your-ticket-here`**, que
es el marcador de posición de `.env.example`. Es decir: **nada ha hablado nunca con
la API real.**

Los nombres correctos son estos — este documento traía
`MERCADOPUBLICO_API_TICKET`, que **no lo lee ningún código**:

```
MERCADO_PUBLICO_TICKET=   # API clásica: licitaciones, órdenes de compra, y (§1) estado hábil
COMPRA_AGIL_TICKET=       # API v2. Si se deja vacío, cae al de arriba
```

Se solicita en `https://www.mercadopublico.cl` → Portal de APIs, con una cuenta
registrada.

**Son dos APIs distintas, y conviene saberlo antes de pedirlo:**

| | clásica | Compra Ágil |
|---|---|---|
| host | `api.mercadopublico.cl` | `api2.mercadopublico.cl` |
| ticket | parámetro de la URL | **cabecera `ticket`** |
| sin ticket | responde `203` | responde `401` |
| cuota | — | **diaria**; al agotarla `429` y **no se restablece hasta el día siguiente** |

**✅ Contrastado en vivo el 2026-09-24** (con el ticket de `.env`), y la primera
pasada real ingirió 327 Compras Ágiles. Lo que enseñó:

- **`tamano_pagina` va de 10 a 50, pero con 50 responde 504** («Endpoint request
  timed out»). Con 25, no. El cliente usa 25.
- **Una ventana de 24 h devuelve `total_resultados = 10000` exacto**: un tope del
  buscador, no el total. La sincronización diaria era incompleta sin avisar. El
  cliente consulta en tramos de una hora; la pasada horaria mira 2 h.
- **Cada detalle tarda hasta ~30 s.** La pasada limita cuántos pide y cuánto tiempo.
- Las horas vienen marcadas con `Z` pero son de Chile (cierres a las «10:00Z»).
- Las regiones llegan con espacios de relleno (`'Región del Biobío '`).
- **El detalle (`/v2/compra-agil/{codigo}`) trae mucho más que el listado**:
  descripción, `productos_solicitados` con código UNSPSC, `id_orden_compra` y
  **`proveedores_cotizando`: cada cotización con proveedor, RUT, si es empresa de
  menor tamaño, precio neto y total por producto, y cuál fue seleccionada.** Es
  decir, las ofertas PERDEDORAS con su precio — algo que las órdenes de compra no
  muestran nunca. Hoy se usan la descripción y los ítems; las cotizaciones son la
  materia prima de una inteligencia de precios propia de Compra Ágil.

**Pendiente, y no es de código:** pedir un ticket propio (el de `.env` es el de
demostración de Mercado Público, compartido y con 429 frecuentes) y medir la
cuota diaria real antes de subir el ritmo de detalles.

---

### 2b. El modelo TF-IDF tiene que llegar a la API y al worker — ⚠️ PENDIENTE (decisión)

Todo lo semántico —encaje en la ficha, orden por relevancia, «Oportunidades para
ti»— lee tres archivos que produce el ETL (`tfidf_model.joblib`,
`tfidf_provider_vectors.npz`, `tfidf_provider_index.parquet`) desde
`ANALYTICS_DATA_PATH`. **Son archivos en el disco del ETL.** En el compose ahora se
comparten por volumen (API de sólo lectura, worker en `/workspace`), pero en Railway
API, worker y ETL son servicios separados y **no comparten disco**: sin decidir cómo
llegan, el encaje responde «Modelo TF-IDF no entrenado» y el panel no muestra
oportunidades — sin error visible (el widget se oculta).

Opciones: (a) subirlos al mismo bucket R2 de los documentos al terminar el ETL y
que API/worker los descarguen al arrancar; (b) guardarlos en Postgres como el resto
de analytics (ADR 0006); (c) un volumen de Railway montado en los tres servicios, si
el plan lo permite. (a) es la más barata de construir. Encontrado en la revisión del
2026-09-25: además, el worker del compose no declaraba `FEATURE_TFIDF` y el valor por
defecto es `false`, así que el job de las 06:00 no hacía nada.

### 3. Iniciar proceso de WhatsApp Business API (WABA) con Twilio
**Hacer esto el primer día — toma 4 a 8 semanas.**

1. Ir a `https://console.twilio.com`
2. Crear cuenta si no tienes
3. En el dashboard: Messaging → WhatsApp → Business API
4. Seguir el proceso de verificación de Meta (necesitas:
   - Número de teléfono de empresa (no personal)
   - Página de Facebook Business verificada
   - Descripción del uso del servicio)
5. Guardar en `.env` cuando sea aprobado:
   ```
   TWILIO_ACCOUNT_SID=ACxxx
   TWILIO_AUTH_TOKEN=xxx
   TWILIO_WHATSAPP_FROM=whatsapp:+56XXXXXXXXX
   ```

> Mientras esperas la aprobación, el producto funciona 100% con solo email.

---

## Antes de la Fase 1 (Semana 2)

### 4. Configurar Google Cloud Console (para OAuth)
1. Ir a `https://console.cloud.google.com`
2. Crear proyecto "LicitaFácil"
3. Habilitar "Google+ API" o "Google Identity"
4. En Credenciales → Crear credencial → OAuth 2.0 Client IDs
5. Tipo de aplicación: Web
6. URIs de redirección autorizados:
   - `http://localhost:8000/auth/google/callback` (desarrollo)
   - `https://tudominio.cl/auth/google/callback` (producción)
7. Guardar en `.env`:
   ```
   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxx
   ```

---

## Antes de la Fase 5a (Semana 8)

### 5. Crear cuenta en Stripe y configurar productos

1. Ir a `https://dashboard.stripe.com` → Crear cuenta
2. Completar el perfil de negocio (nombre, RUT, cuenta bancaria chilena)
3. Ir a Productos → Crear 4 productos:

   | Nombre | Precio | Intervalo |
   |--------|--------|-----------|
   | Básico | Gratis | — |
   | PYME   | USD 25 | mes |
   | Pro    | USD 55 | mes |
   | Contador | USD 95 | mes |

4. Copiar el Price ID de cada uno (formato: `price_xxx`)
5. Guardar en `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_xxx     (test primero, luego sk_live_xxx)
   STRIPE_WEBHOOK_SECRET=whsec_xxx   (obtener con Stripe CLI: stripe listen)
   STRIPE_PRICE_PYME=price_xxx
   STRIPE_PRICE_PRO=price_xxx
   STRIPE_PRICE_CONTADOR=price_xxx
   ```

6. Instalar Stripe CLI para pruebas locales de webhooks:
   ```bash
   # macOS: brew install stripe/stripe-cli/stripe
   # Windows: descargar de https://github.com/stripe/stripe-cli/releases
   stripe login
   stripe listen --forward-to localhost:8000/api/billing/webhook
   ```
   El comando `stripe listen` genera el `STRIPE_WEBHOOK_SECRET` para desarrollo.

---

### 6. Configurar AWS S3 (o Cloudflare R2) para producción

**Para producción** (MinIO es solo para desarrollo local):

**Opción A — AWS S3**:
1. Crear cuenta en `https://aws.amazon.com`
2. IAM → Crear usuario `licitafacil-s3` con política `AmazonS3FullAccess` (o política más restrictiva al bucket)
3. S3 → Crear bucket `licitafacil-documentos` en `us-east-1` (o región más cercana)
4. Desactivar "Block all public access" (los documentos son privados, acceso vía presigned URLs)
5. Guardar en `.env` de producción:
   ```
   AWS_ACCESS_KEY_ID=AKIAxxx
   AWS_SECRET_ACCESS_KEY=xxx
   AWS_REGION=us-east-1
   S3_BUCKET=licitafacil-documentos
   # Dejar S3_ENDPOINT_URL vacío (no usar MinIO en producción)
   ```

**Opción B — Cloudflare R2** (más barato, sin costos de egress):
1. `https://dash.cloudflare.com` → R2
2. Crear bucket `licitafacil-documentos`
3. R2 es compatible con la API de S3 (boto3 funciona con `endpoint_url`)

---

## Durante el desarrollo

### 7. Contenido de plantillas_checklist (Fase 3)
El LLM puede crear los ítems base del checklist, pero los ítems exactos y obligatorios
para cada tipo de licitación en Chile deben ser revisados por alguien con experiencia real.

**Opciones**:
- Revisar las bases técnicas de 3-5 licitaciones reales en `www.mercadopublico.cl`
- Consultar con un analista de licitaciones freelance (1-2 horas de trabajo)
- Usar el concierge MVP (ofrecer el servicio manualmente) para descubrir qué documentos piden realmente

El LLM creará un seed con ítems aproximados. Tú debes validarlos y corregirlos antes de que usuarios reales usen el checklist.

---

## Antes de ir a producción

### 8. Configurar dominio y SSL
- Apuntar `licitafacil.cl` (o el dominio elegido) al servidor
- Configurar SSL (Let's Encrypt si es autogestionado, automático en Vercel/Railway/Render)
- Actualizar `CORS_ORIGINS` en `.env` de producción

### 9. Pasar de Stripe test a Stripe live
- En Stripe Dashboard: activar modo live
- Reemplazar `sk_test_xxx` por `sk_live_xxx`
- Reemplazar `STRIPE_WEBHOOK_SECRET` con el de producción
- Crear un nuevo webhook endpoint en Stripe Dashboard apuntando al dominio de producción

### 10. Configurar backup de base de datos
- En Supabase Pro: verificar que los backups diarios están activos
- Descargar un backup manualmente y verificar que se puede restaurar

### 11. Configurar Sentry para monitoreo de errores
1. Crear proyecto en `https://sentry.io` (free tier)
2. Copiar DSN del proyecto
3. En backend: `pip install sentry-sdk` + configurar en `main.py`
4. En frontend: `npm install @sentry/nextjs` + configurar
5. Guardar `SENTRY_DSN=xxx` en `.env` de producción

---

## Resumen de cuentas necesarias

| Servicio | URL | Cuándo necesitas | Costo estimado |
|---------|-----|-----------------|----------------|
| ChileCompra API ticket | mercadopublico.cl | Semana 0 | Gratis |
| Twilio (WhatsApp WABA) | console.twilio.com | Semana 0 (iniciar proceso) | ~USD 10/mes |
| Google Cloud Console | console.cloud.google.com | Semana 0–2 | Gratis |
| Stripe | dashboard.stripe.com | Semana 8 | % por transacción |
| AWS S3 o Cloudflare R2 | aws.amazon.com / dash.cloudflare.com | Antes de producción | ~USD 5/mes |
| Supabase | supabase.com | Ya deberías tenerlo | USD 0–25/mes |
| Sentry | sentry.io | Antes de producción | USD 0 (free tier) |
| Dominio .cl | nic.cl o similar | Antes de producción | ~CLP 15.000/año |

---

*Este documento se elimina junto con la carpeta `deploy_steps` al finalizar el desarrollo.*
