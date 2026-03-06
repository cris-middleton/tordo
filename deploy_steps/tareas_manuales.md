# Tareas Manuales — Lo que debes hacer TÚ
## (Cosas que la IA no puede hacer por ti)

Este documento lista las acciones que requieren acceso a cuentas externas, decisiones de negocio
o validación en el mundo real. Organizado por el momento en que debes completarlas.

---

## Antes de empezar (Semana 0 — junto con Fase 0)

### 1. Validar Endpoint de Estado Hábil — CRÍTICO (VALIDADO ✅)
**Estado: COMPLETADO** — Se confirmó que el endpoint per-RUT es la única fuente confiable.

~~No existe CSV masivo de estado hábil~~ — Ver resultado de validación:

**Endpoint funcional**:
```
GET https://datos-abiertos.chilecompra.cl/organismos-proveedores/{RUT}
Ejemplo: https://datos-abiertos.chilecompra.cl/organismos-proveedores/96.895.110-6
```

Respuestas confirmadas:
- **200 OK**: Proveedor existe (hábil o inhábil)
  - Campo `Proveedor.Estado` contiene el estado
- **404 u otro error**: Proveedor no existe

**Acción para Fase 1**: Usar solo el endpoint per-RUT. No hay fallback a CSV. 
El código está simplificado en la SPEC.md sección 7.2.

---

### 2. Usar ticket de API de Mercado Público (YA DISPONIBLE)
✅ **El ticket de API pública ya está en `.env.example`**:
```
MERCADOPUBLICO_API_TICKET=F8537A18-6766-4DEF-9E59-426B4FEE2844
```

Es el ticket demo público de ChileCompra. Para producción, opcionalmente:
- Solicitar un ticket oficial en: `https://www.mercadopublico.cl` → Portal de APIs
- Pero el ticket demo es válido para development y MVP

---

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
