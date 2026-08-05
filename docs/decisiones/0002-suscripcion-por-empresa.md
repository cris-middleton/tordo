# 0002 — La suscripción pertenece a la empresa, no al usuario

**Estado**: Aceptada · **Fecha**: 2026-08-05

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
