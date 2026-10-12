# 0008 — MercadoPago como pasarela principal, y sólo una para empezar

> **Supersedido** por [0011](0011-sitio-publico-sin-cuentas.md) (2026-10-11): sin cuentas ni cobros, esta decisión quedó sin objeto.

**Estado**: Aceptada · **Fecha**: 2026-08-06
**Supersede parcialmente** a [0005](0005-pasarela-local-v1.md), que dejaba abierta la elección.

## Contexto

El ICP son PYMES chilenas a USD 25–55/mes: un segmento que paga con tarjetas
locales, débito Redcompra o transferencia. Stripe solo no alcanza (ADR 0005).

Se evaluaron cuatro alternativas y una estrategia de dos pasarelas en paralelo:
principal para tarjetas y suscripciones (MercadoPago o Transbank Oneclick), y
secundaria para efectivo y transferencia (Khipu o Flow).

## Decisión

**MercadoPago como única pasarela para empezar.** La segunda vía (transferencia)
se añade sólo con evidencia de que se están perdiendo altas por no tenerla.

## Por qué MercadoPago y no Transbank Oneclick

Por una razón que decide sola: **MercadoPago cobra por sí mismo; Oneclick no.**

MercadoPago Chile tiene suscripciones nativas vía `preapproval_plan` y
`preapproval`, con `frequency`, `frequency_type`, `billing_day` y `repetitions`,
más webhooks de cobro recurrente. El mapeo con lo que ya hace el adaptador de
Stripe es casi 1:1.

Oneclick tokeniza la tarjeta y te deja cobrar cuando quieras: la recurrencia la
construyes tú. Eso no es "otro adaptador", es hacerse dueño de la máquina de
estados de reintentos, tarjeta vencida, cobro rechazado, gracia y suspensión —
justo el trabajo que Stripe y MercadoPago ya resolvieron.

Transbank gana en **confianza**: "Webpay" es el modelo mental por defecto de una
PYME chilena, y MercadoPago arrastra imagen de billetera. Si el ICP fueran
empresas grandes pesaría más; para PYMES que ya compran online no compensa
construir la recurrencia a mano.

## Por qué NO dos pasarelas en paralelo desde el día uno

La intuición de captar a quien no usa tarjeta es correcta: en Chile la
transferencia es un medio de pago de primera clase. Pero el costo no es 2×.

**Khipu y la transferencia de Flow no pueden auto-renovar.** No les falta un
endpoint: nadie puede debitar una cuenta bancaria sin que el titular entre a
autorizarlo cada vez. Eso implica un **ciclo de vida distinto**, no un adaptador
distinto:

```
tarjeta:        cobro automático → listo
transferencia:  emitir cobro → notificar → esperar → gracia → suspender
```

La segunda línea es una máquina de estados nueva, con correos, plazos y
reconciliación. El puerto ya lo anticipa con `soporta_suscripcion_recurrente`,
pero anticiparlo no lo construye.

### Cuando toque, la transferencia se vende como plan ANUAL prepagado

Convierte un problema sin solución (recurrencia sin tarjeta) en uno resuelto: un
pago al año y un recordatorio por correo antes del vencimiento. Sin dunning, sin
gracia, sin reintentos. De paso mejora caja y churn.

Con ese encuadre **Khipu encaja mejor que Flow** para ese rol: va directo al
banco, sin capa intermedia.

## Flow, descartado como opción principal

Flow es un agregador (envuelve WebPay, Servipag, Khipu y otros), así que en
teoría cubriría los dos roles con una integración. Se descarta porque se paga
comisión sobre comisión y aleja del riel. Queda como plan B si MercadoPago no
cierra por contrato.

## Consecuencias

### En el modelo — hay que hacerlo antes, no después

El modelo tiene los identificadores con nombre de proveedor:
`stripe_customer_id` y `stripe_subscription_id`, con 12 referencias en el código.
Con dos pasarelas activas una empresa necesita registrar **cuál** tiene su
suscripción:

```
stripe_customer_id      → billing_customer_id
stripe_subscription_id  → billing_subscription_id
                        + billing_provider
```

Barato ahora, caro con clientes pagando. El puerto (`app/domain/billing.py`) ya
está; esto es lo que le falta al modelo para que "más de un proveedor" sea real
y no teórico.

### En el plan

1. Migración de las tres columnas. **No depende de qué pasarela se elija**, así
   que va primero.
2. Adaptador de MercadoPago sobre el puerto existente.
3. Medir abandono en el checkout antes de construir la segunda vía.

## Estado de la implementación

Hecho: migración de las tres columnas, adaptador
(`app/infra/billing/mercadopago_adapter.py`) contra la API REST vía httpx, y
`BILLING_PROVIDER=mercadopago` por defecto. 28 tests sin red ni credenciales.

Stripe **se conserva**, y no por nostalgia: un puerto con una sola
implementación no demuestra nada. Son las dos juntas las que obligaron a que las
diferencias estuvieran declaradas en vez de supuestas.

### Tres diferencias con Stripe que el puerto no podía esconder

1. **El webhook no trae el recurso, sólo su id.** Stripe manda el objeto
   completo firmado; MercadoPago manda `{"type", "data": {"id"}}` y hay que ir a
   buscarlo. Eso convirtió `interpretar_webhook` de criptografía pura en una
   llamada de red, y obligó a sacarla del bucle de eventos con
   `asyncio.to_thread` — junto con `iniciar_pago`, que ya lo bloqueaba con
   Stripe sin que se notara.

2. **No hay objeto cliente en el flujo de suscripción.** El pagador se
   identifica por correo; `payer_id` sólo existe una vez autorizada. Por eso
   `iniciar_pago` recibe ahora `email_contacto`: deducirlo de
   `billing_customer_id` funcionaba en la primera suscripción y fallaba al
   resuscribirse, porque para entonces esa columna ya tiene el payer_id
   numérico. Se detectó escribiendo el adaptador, no en producción.

3. **No hay portal hospedado.** Es exactamente la capacidad que el puerto ya
   modelaba. `/api/billing/portal` responde 501, y `/api/billing/status` expone
   `tiene_portal_de_gestion` para que el frontend no muestre un botón que sólo
   puede fallar.

Lo que resultó **mejor** que Stripe: `external_reference` viaja en la suscripción
y vuelve en cada consulta, así que el `empresa_id` se recupera en todos los
eventos y no sólo en el primero.

### Pendiente antes de cobrar de verdad

- Crear los planes en MercadoPago (`POST /preapproval_plan`) y configurar sus ids.
- Registrar la URL de notificación apuntando a `POST /api/webhooks/stripe` (la
  ruta conserva ese sufijo por compatibilidad; sirve para cualquier pasarela).
- Probar el flujo completo con credenciales de prueba. **Nada de esto está
  verificado contra la API real**: los tests sustituyen `httpx.request`, así que
  cubren la lógica del adaptador, no que los campos coincidan con los que
  MercadoPago espera hoy.

## Lo que sigue sin decidirse

Las **comisiones** de MercadoPago Chile y sus condiciones de liberación de fondos
hay que cotizarlas: cambian y dependen del rubro y del volumen. No es un dato que
se pueda fijar desde el código, y afecta al precio de los planes.

## Cuándo revisar esto

- Si el abandono en el checkout resulta alto y atribuible a "no tengo tarjeta".
- Si aparece un cliente grande que exige Webpay por política interna.
- Si las comisiones de MercadoPago resultan peores que ir directo a Transbank.
