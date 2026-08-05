# 0007 — No migrar a Supabase; la arquitectura actual se mantiene

**Estado**: Aceptada · **Fecha**: 2026-08-05

## Contexto

Se evaluó por segunda vez si convenía mudarse a Supabase, con foco en el área de
usuarios, perfiles y administración, que es donde más plausiblemente ganaría.

El stack actual (FastAPI + SQLAlchemy 2.0 async + PostgreSQL + Celery + Next.js) es el
mismo que corre en los cuatro backends de producción de `~/github`. Los dos problemas de
fondo de TORDO no son de stack:

- **De dónde se sirve el BI** — parquets en disco cacheados en el proceso de la API
  (ADR [0006](0006-analytics-en-postgres.md), en curso).
- **Cómo se garantiza el aislamiento entre empresas** — hoy por repetición de un chequeo
  manual en cada endpoint (F3).

Ninguno se arregla cambiando de proveedor.

## Decisión

**No se migra a Supabase.** Se mantiene la arquitectura actual y se cubren los huecos
concretos con trabajo acotado.

## Los dos argumentos a favor, y por qué no alcanzan

### 1. Row-Level Security

Es el argumento bueno: RLS convertiría la multi-tenancy de "ojalá nadie olvide el chequeo"
en una garantía de la base de datos.

**Pero RLS es PostgreSQL, no Supabase.** Está disponible hoy en Railway:
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` más `SET LOCAL app.empresa_id` desde una
dependencia de FastAPI da exactamente la misma garantía sin cambiar de proveedor.
Entra en F3.

### 2. Los flujos de cuenta ya construidos

También es un argumento real, porque aquí falta ese trabajo (ver abajo). Pero el costo de
la migración es concreto:

- `users.id` es `Integer`; `auth.users.id` de Supabase es UUID. Migrar obliga a tocar tres
  claves foráneas con datos: `alerts.user_id`, `alert_preferences.user_id`,
  `empresas_usuario.user_id`.
- El JWT pasa de HS256 propio a RS256 de Supabase: cambia `core/security.py`, el frontend
  y el flujo de OAuth con Google que ya funciona.
- El ETL escribe millones de filas por `COPY`; el pooler de Supabase complica ese patrón.
- No se elimina ninguna pieza: siguen Alembic, SQLAlchemy, Celery y el ETL. Se suma un
  proveedor sin quitar otro.

Supabase gana cuando se parte de cero. Este proyecto no parte de cero.

## Lo que sí falta en usuarios / perfiles / admin

El **modelo de datos está bien**: `User` ↔ `Empresa` M2M vía `EmpresaUsuario` con rol,
`UniqueConstraint` y `CheckConstraint` sobre los roles. Lo que falta no es arquitectura,
son piezas que no existen:

| Falta | Evidencia | Gravedad |
|---|---|---|
| Recuperación de contraseña | Cero referencias a `forgot-password` / `reset-password`. `core/email.py` sólo tiene `send_email` y `send_alert_email` | **Crítica** — quien olvida su clave no tiene salida |
| Verificación de email | `is_verified` existe en el modelo, sin flujo que lo escriba | Alta |
| Refresh token | No existe; `refreshUser()` del frontend sólo reconsulta `/api/auth/me` | Alta — cierre de sesión duro cada 30 min |
| Panel de administración | 4 endpoints con `is_superuser`, sin UI | Media — hoy se administra con `psql` |
| Suscripción colgando de `User` | Ver ADR [0002](0002-suscripcion-por-empresa.md) | Alta — va en F3 |

**Nota**: la revisión inicial afirmó que faltaba la UI de gestión de miembros. Es falso —
`frontend/app/dashboard/empresa/page.tsx` añade y elimina miembros, muestra el rol y
controla permisos con `canManage`. Era un pendiente obsoleto heredado del CLAUDE.md
anterior.

## Consecuencias

Se hace, en vez de migrar:

- Reset de contraseña y verificación de email (~1 día; el SMTP ya está en `core/email.py`).
- Refresh token con rotación (~medio día).
- RLS de PostgreSQL para el aislamiento entre empresas, en F3.
- Un panel de administración mínimo, cuando haga falta operar sin `psql`.

Se conserva `auth_provider` / `external_sub` como puerta de salida (ver la revisión §6.1):
si algún día se vende SSO a un gremio, migrar a Auth0 o a Supabase será una migración de
datos, no una reescritura.

## Cuándo revisar esto

- Si un cliente exige SSO/SAML.
- Si el equipo crece y mantener los flujos de cuenta propios pasa a ser un costo real.
- Si aparece un requisito de realtime que hoy no existe.
