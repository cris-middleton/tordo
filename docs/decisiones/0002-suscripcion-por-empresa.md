# 0002 — La suscripción pertenece a la empresa, no al usuario

**Estado**: Aceptada · **Fecha**: 2026-08-05 · **Implementada**: 2026-08-06 (F3)

## Contexto
`plan_tier`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id` y los
campos de trial cuelgan hoy de `models/user.py`. Con eso, tres personas de la misma PYME
necesitan tres planes. `models/organization.py` **no** es un inquilino — es
`BuyerOrganization`, el organismo comprador.

## Decisión
La suscripción pertenece a la **empresa**, con planes diferenciados por capacidades. Los
usuarios son asientos.

## Consecuencias
- Es la pieza más grande de F3.
- Mover los campos de facturación de `User` a la entidad de cuenta/empresa, con migración de
  los usuarios existentes a su empresa `owner`.
- `require_plan` y `check_bi_quota_dep` (`core/plan_limits.py`) pasan a resolver contra la
  empresa activa, no contra el usuario.
- Las cuotas de BI y de alertas se contabilizan por empresa en Redis, no por `user_id`.
- Hay que definir el límite de asientos por plan.
- Los webhooks de Stripe cambian de sujeto: el `customer` mapea a una empresa.

## Cómo quedó implementada

Migración `4829d50c138a`: los campos se mueven a `empresas` con backfill desde el
usuario **owner** de cada una (el más antiguo si hay varios). Un usuario sin
empresa pierde el plan, que es correcto: sin empresa no hay nada que facturar.

**El trial pasó a arrancar al crear la empresa**, no al registrarse el usuario
(`app/api/empresas.py::aplicar_trial_inicial`). Antes se fijaba en el registro,
cuando todavía no existía ninguna empresa a la que asociarlo.

### Qué empresa gobierna una petición

`app/api/deps.py::resolver_empresa_facturable`, en este orden:

1. La que nombre la petición (`empresa_id`), previa verificación de membresía.
2. Si no la nombra y el usuario pertenece a **una sola**, esa. Es el caso normal.
3. Si pertenece a **varias**, `400` pidiendo que la indique. Elegir una en
   silencio le facturaría cuotas a la equivocada.
4. Si no pertenece a ninguna, `403`.

Un header `X-Empresa-Id` con la empresa activa encajaría entre (1) y (2) sin
cambiar nada; el frontend ya mantiene ese concepto en `lib/empresaActive.ts`.

### Alcance

- Cuotas de BI en Redis: la clave pasa de `bi_queries:{user_id}` a
  `bi_queries:{empresa_id}`.
- `require_plan` y `check_bi_quota_dep` resuelven contra la empresa.
- El customer de Stripe representa a la empresa (metadata `empresa_id`); el
  correo del usuario que hace el checkout va sólo como contacto.
- Los webhooks buscan la empresa por `stripe_customer_id`. **Antes buscaban un
  usuario**, lo que con varios asientos habría aplicado el cobro a quien hizo el
  checkout en vez de a la cuenta.
- Los recordatorios de trial se envían al owner de la empresa.

### Pendiente

El límite de alertas activas sale del plan de la empresa, pero el conteo sigue
siendo por usuario porque `AlertPreference` no tiene `empresa_id`. Con varios
asientos, el límite se multiplica de hecho. Convertirlo en un entitlement de la
cuenta exige darle `empresa_id` a esa tabla: decisión de producto pendiente.
