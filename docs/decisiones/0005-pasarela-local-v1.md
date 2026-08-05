# 0005 — Pasarela de pago local en v1

**Estado**: Aceptada · **Fecha**: 2026-08-05

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
