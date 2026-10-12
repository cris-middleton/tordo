# 0005 — Pasarela de pago local en v1

> **Supersedido** por [0011](0011-sitio-publico-sin-cuentas.md) (2026-10-11): sin cuentas ni cobros, esta decisión quedó sin objeto.

**Estado**: Aceptada · **Fecha**: 2026-08-05 · **Puerto implementado**: 2026-08-06 (F3)

## Contexto
Sólo hay Stripe implementado. El ICP son PYMES chilenas a USD 25–55/mes, un segmento que
paga con tarjetas locales, débito Redcompra o transferencia.

## Decisión
La pasarela local entra en **v1**, no en v2.

## Consecuencias
- El puerto `BillingProvider` en `app/domain/` con Stripe como adaptador en `app/infra/` se
  implementa en F3, no queda documentado para después.
- El adaptador local (Transbank WebPay / Flow / Khipu) entra en el mismo bloque de trabajo.
- `services/stripe_service.py` deja de invocarse directo desde `api/billing.py`.
- Existe un precedente de diseño en `~/github/payment-gateway` (Transbank, Santander, Banco
  de Chile BDP, Servipag). **Verificar la titularidad antes de reutilizar código**: es un
  repo de trabajo. Si no es reutilizable, copiar el diseño de la interfaz.

## Estado de la implementación (2026-08-06)

El **puerto está hecho**; falta elegir e implementar la pasarela local.

- `app/domain/billing.py` — `ProveedorDePago`, con `SesionDePago`,
  `EventoDeSuscripcion` y `ErrorDeCobro`.
- `app/infra/billing/stripe_adapter.py` — Stripe como un adaptador más.
- `app/infra/billing/__init__.py` — selección por `BILLING_PROVIDER`.
- `api/billing.py` y `api/webhooks.py` ya **no saben de Stripe**. Añadir una
  pasarela es escribir un adaptador y registrarlo.
- 14 tests, sin red ni claves. Incluyen un proveedor falso que implementa el
  puerto: si esos tests pasan, el producto no depende de Stripe.

### Dos diferencias reales que el puerto declara en vez de esconder

El puerto expone dos capacidades porque las pasarelas **no** son intercambiables:

- **`soporta_suscripcion_recurrente`** — Stripe cobra solo cada periodo.
  Transbank WebPay es de pago único: para cobrar mensual hay que inscribir la
  tarjeta (Oneclick) o cobrar desde un job propio en cada periodo. Un puerto que
  lo ocultara haría que las suscripciones dejaran de renovarse en silencio.
- **`tiene_portal_de_gestion`** — Stripe hospeda el portal donde el cliente
  cambia de plan o cancela. Las locales no, así que esa UI hay que construirla.
  `/api/billing/portal` ya devuelve 501 con un mensaje claro cuando el proveedor
  no tiene portal, en vez de fallar de forma opaca.

### Lo que falta decidir

**Qué pasarela**: Transbank WebPay, Flow o Khipu. Es una decisión de negocio
(comisiones, medios de pago aceptados, requisitos de contrato) que no se puede
tomar desde el código. Con cualquiera de las tres, si no soporta recurrencia hay
que añadir:

1. Un job de renovación mensual (Celery beat ya está).
2. UI propia de cambio de plan y cancelación.
3. Manejo de tarjeta vencida / cobro rechazado.

Existe un precedente de diseño en `~/github/payment-gateway` (Transbank WebPay,
Santander, Banco de Chile BDP, Servipag). **Verificar la titularidad antes de
reutilizar código**: es un repo de trabajo.
