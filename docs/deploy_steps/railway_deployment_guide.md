> 🟡 **Histórico** desde el pivote público (2026-10-11). Describe el despliegue del SaaS
> —`SECRET_KEY`, Google, Stripe, MercadoPago, almacenamiento de documentos, Celery— que ya no
> existe. La guía nueva (Vercel + Railway con dos cron, `MCP_HOSTS_PERMITIDOS`, latidos) llega
> en el paso 12 de `docs/PIVOTE_PUBLICO_2026-10.md`. **No configures nada siguiendo esto.**

# TORDO — Railway Deployment Guide

## Current state

You have 4 services running on Railway:
- **PostgreSQL** (plugin)
- **Redis** (plugin)
- **Frontend** (Next.js)
- **Backend** (FastAPI)

## What's missing

| Service | Why needed | Priority |
|---------|-----------|----------|
| **Celery Worker** | Processes background tasks: ETL fetches, alert matching, estado habil checks | Critical |
| **Celery Beat** | Schedules the 7 periodic tasks (hourly ETL, daily reminders, etc.) | Critical |
| **S3-compatible storage** | Document upload/download (Cloudflare R2 or AWS S3) | When `FEATURE_DOCUMENTOS=true` |
| **Alembic migrations** | DB schema must be up to date | One-time + on each deploy |

Flower (Celery monitoring UI) is optional for production. Skip it unless you need to debug task execution.

---

## Architecture diagram

```
                        +-----------------+
                        |   tordo.cl      |
                        |  (Custom Domain)|
                        +--------+--------+
                                 |
                    +------------+-------------+
                    |                          |
          +---------v---------+    +-----------v----------+
          |     Frontend      |    |       Backend        |
          |   (Next.js 14)    |    |   (FastAPI/uvicorn)  |
          |   Port 3000       |    |     Port 8000        |
          +-------------------+    +---+------+-------+---+
                                       |      |       |
                              +--------+  +---+---+   +----------+
                              |           |       |              |
                   +----------v--+  +-----v---+ +-v-----------+ |
                   |  PostgreSQL |  |  Redis  | | Celery      | |
                   |    (15)     |  |  (7)    | | Worker (x1) | |
                   |  Plugin     |  | Plugin  | | Same image  | |
                   +-------------+  +---------+ | as Backend  | |
                                                +------+------+ |
                                                       |        |
                                                +------v------+ |
                                                | Celery Beat | |
                                                | Same image  | |
                                                | as Backend  | |
                                                +-------------+ |
                                                                |
                                               +----------------v--+
                                               | Cloudflare R2 /   |
                                               | AWS S3 (external) |
                                               +-------------------+
```

**Railway project services (6 total):**

| # | Service name | Type | Source |
|---|-------------|------|--------|
| 1 | `postgres` | Plugin | Railway PostgreSQL |
| 2 | `redis` | Plugin | Railway Redis |
| 3 | `frontend` | Deploy | GitHub → `frontend/Dockerfile` |
| 4 | `backend` | Deploy | GitHub → `backend/Dockerfile` |
| 5 | `celery-worker` | Deploy | GitHub → `backend/Dockerfile` (custom start command) |
| 6 | `celery-beat` | Deploy | GitHub → `backend/Dockerfile` (custom start command) |

---

## Step-by-step setup

### 1. Add Celery Worker service

In Railway dashboard → your project → **+ New** → **GitHub Repo** → select the same repo.

**Settings:**
- **Root directory:** `backend`
- **Builder:** Dockerfile
- **Start command override:**
  ```
  celery -A app.celery_app worker --loglevel=info --concurrency=2
  ```
  (Use concurrency=2 for Railway Hobby; increase on Pro plan)

**Environment variables** — copy ALL from your backend service, plus ensure these are set:
```
DATABASE_URL=${{postgres.DATABASE_URL}}
REDIS_URL=${{redis.REDIS_URL}}
ETL_WORKSPACE=/app
ANALYTICS_DATA_PATH=etl/data/analytics
MERCADO_PUBLICO_TICKET=F8537A18-6766-4DEF-9E59-426B4FEE2844
```

Use Railway's **variable references** (`${{service.VAR}}`) to share Postgres/Redis URLs from the plugins. This keeps credentials in sync automatically.

**Networking:** No public domain needed — workers don't serve HTTP.

---

### 2. Add Celery Beat service

Same process: **+ New** → **GitHub Repo** → same repo.

**Settings:**
- **Root directory:** `backend`
- **Builder:** Dockerfile
- **Start command override:**
  ```
  celery -A app.celery_app beat --loglevel=info
  ```

**Environment variables:** Same as Celery Worker (copy from backend).

**Networking:** No public domain needed.

> **Important:** Only run ONE instance of Beat. Never scale Beat beyond 1 replica — duplicate schedulers cause duplicate task execution.

---

### 3. Run database migrations

Option A — **Railway CLI** (recommended):
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link to your project
railway login
railway link

# Run migration against production DB
railway run -s backend alembic upgrade head
```

Option B — Add a **release command** to the backend service in Railway:
- Go to backend service → Settings → Deploy → **Custom Start Command**
- Use:
  ```
  alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
  ```
  This runs migrations on every deploy before starting the server.

---

### 4. Configure environment variables on Backend

Ensure these are set on the **backend** service (some may already be configured):

```
# Database (use Railway reference)
DATABASE_URL=${{postgres.DATABASE_URL}}

# Redis (use Railway reference)
REDIS_URL=${{redis.REDIS_URL}}

# Security — CHANGE THIS
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS — include both bare and www domain
CORS_ORIGINS=https://tordo.cl,https://www.tordo.cl,http://localhost:3000

# Storage (use "local" until you configure S3/R2)
STORAGE_BACKEND=local
LOCAL_STORAGE_PATH=/tmp/tordo_docs

# API
MERCADO_PUBLICO_TICKET=F8537A18-6766-4DEF-9E59-426B4FEE2844

# Feature flags
FEATURE_ANALYTICS=false
FEATURE_BILLING=false
FEATURE_ESTADO_HABIL=true
FEATURE_DOCUMENTOS=true
FEATURE_CHECKLIST=true
FEATURE_TFIDF=false
FEATURE_WHATSAPP=false
```

---

### 5. Configure environment variables on Frontend

```
NEXT_PUBLIC_API_URL=https://<your-backend-railway-domain>
```

If using a custom domain for the backend API (e.g., `api.tordo.cl`):
```
NEXT_PUBLIC_API_URL=https://api.tordo.cl
```

---

### 6. Set up object storage (when needed)

Railway doesn't provide S3-compatible storage. Use an external provider:

**Cloudflare R2 (recommended — no egress fees):**
1. Cloudflare Dashboard → R2 → Create bucket `tordo-docs`
2. R2 → Manage R2 API Tokens → Create API Token
3. Add to backend + celery-worker + celery-beat env vars:
   ```
   STORAGE_BACKEND=s3
   AWS_ACCESS_KEY_ID=<R2 access key>
   AWS_SECRET_ACCESS_KEY=<R2 secret key>
   AWS_BUCKET=tordo-docs
   AWS_REGION=auto
   S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
   S3_ENDPOINT_URL_PUBLIC=https://<your-r2-public-domain>
   ```

> Until you configure this, `STORAGE_BACKEND=local` works, but uploaded files are lost on every deploy (Railway containers are ephemeral).

---

## Why `www.tordo.cl` doesn't work

You have the bare domain `tordo.cl` configured, but `www.tordo.cl` is a separate DNS record that also needs setup. Two things are missing:

### A) DNS record for `www`

In your DNS provider (NIC.cl, Cloudflare, or wherever you manage `tordo.cl`):

| Type | Name | Value |
|------|------|-------|
| `CNAME` | `www` | `<your-frontend-railway-domain>.up.railway.app` |

The bare domain `tordo.cl` likely has an `A` record or `CNAME` already pointing to Railway. Add this additional `CNAME` for the `www` subdomain.

### B) Add `www.tordo.cl` as custom domain in Railway

1. Railway dashboard → Frontend service → Settings → **Networking** → **Custom Domain**
2. Add `www.tordo.cl` (in addition to the existing `tordo.cl`)
3. Railway will provision an SSL certificate automatically

### C) Redirect one to the other (recommended)

Best practice: pick one as canonical and redirect the other. Most modern sites use the bare domain and redirect `www` to it.

**Option 1 — Railway handles both:** Just add both domains in Railway. Both will work independently and serve the same app.

**Option 2 — DNS redirect (if your DNS supports it):** In Cloudflare, create a Page Rule:
- Match: `www.tordo.cl/*`
- Setting: Forwarding URL (301) → `https://tordo.cl/$1`

### D) Update CORS

After adding `www.tordo.cl`, update the backend `CORS_ORIGINS` to include it:
```
CORS_ORIGINS=https://tordo.cl,https://www.tordo.cl
```

---

## Deployment checklist

- [x] PostgreSQL running (Railway plugin)
- [x] Redis running (Railway plugin)
- [x] Frontend deployed (Next.js)
- [x] Backend deployed (FastAPI)
- [ ] Celery Worker service added (same Docker image as backend, different start command)
- [ ] Celery Beat service added (same Docker image as backend, different start command)
- [ ] `alembic upgrade head` run against production DB
- [ ] `SECRET_KEY` changed from default
- [ ] `CORS_ORIGINS` includes `https://tordo.cl,https://www.tordo.cl`
- [ ] `www.tordo.cl` DNS CNAME record added
- [ ] `www.tordo.cl` added as custom domain in Railway frontend service
- [ ] Object storage configured (Cloudflare R2 or AWS S3) — when `FEATURE_DOCUMENTOS=true`
- [ ] All 3 backend-image services (backend, celery-worker, celery-beat) share the same env vars for DB, Redis, and storage
