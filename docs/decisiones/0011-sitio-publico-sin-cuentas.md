# 0011 — TORDO pasa a ser un sitio público y gratuito, sin cuentas ni cobros

**Estado**: Aceptada · **Fecha**: 2026-10-11 · **Implementada**: pasos 3–11 del pivote (octubre de 2026)
**Supersede** a [0002](0002-suscripcion-por-empresa.md), [0005](0005-pasarela-local-v1.md) y
[0008](0008-mercadopago-como-pasarela.md). **Modifica** a [0004](0004-llm-solo-mcp.md).

El detalle —las 20 decisiones, la arquitectura, los costos y el orden de los pasos— está en
[`../PIVOTE_PUBLICO_2026-10.md`](../PIVOTE_PUBLICO_2026-10.md). Este ADR sólo deja escrito
qué se decidió y qué haría falta para volver atrás.

## Contexto

- **Nunca hubo un usuario pagando.** La producción estaba pausada: el cambio no renunciaba a
  un ingreso real, sino a uno esperado.
- Mantener el SaaS costaba del orden de **US$20–27 al mes** (Postgres, API, Celery, Redis,
  Flower, frontend en Railway). Un sitio público sin cuentas cabe en **US$4–6**, casi todo
  dentro de lo que incluye el plan Hobby de Railway (spec §5.1). Era el objetivo: el uso medido
  el 2026-10-15 proyecta ~US$10–11 (`docs/DESPLIEGUE.md` §13.2).
- La mitad del producto —la inteligencia de mercado sobre datos públicos— vale para
  cualquiera. La otra mitad —cumplimiento, postulaciones, encaje con un perfil— sólo tiene
  sentido para una empresa identificada.

## Decisión

TORDO deja de ser un SaaS B2B y pasa a ser un **sitio público y gratuito**:

- **Sin cuentas.** Sin usuarios, empresas, roles, sesiones, claves de API ni planes. Los
  favoritos y las búsquedas guardadas viven en el navegador; cada búsqueda tiene su RSS.
- **Sin cobros.** Se financia con **donaciones** (enlaces, sin integración). **Sin
  publicidad**: en Vercel Hobby los anuncios son uso comercial y obligarían a pagar el
  plan Pro (spec §4.1).
- **API de lectura y MCP abiertos**, sin clave, con un límite por IP.
- Se **retira** todo lo que dependía de saber quién era el usuario: alertas, informe
  semanal, cumplimiento, postulaciones, vigilancia de precios, encaje personalizado.
- Se conserva el código anterior en la etiqueta `saas-v1` y **se borra de `main`**.

## Consecuencias

- **0002 (suscripción por empresa), 0005 (pasarela local en v1) y 0008 (MercadoPago como
  pasarela) quedan sin objeto**: no hay suscripciones ni pagos. Sus tablas, el puerto de
  facturación y los adaptadores se borraron (`3d73beca994e_retirar_cuentas`).
- **0004 (LLM sólo vía MCP) sigue vigente, con un cambio**: el MCP era «cobrado dentro del
  plan» y exigía clave; ahora es **anónimo**, con la protección contra DNS rebinding
  encendida y el mismo límite por IP que la API. Siguen las cuatro herramientas de grano
  grueso, que acotan la carga de un cliente anónimo.
- 0001 (sólo Chile), 0003 (nombre), 0006 (analytics en Postgres), 0007, 0009 y 0010 no
  cambian.
- **Sin cuentas no hay datos de una empresa que aislar**: desaparecen los tests de tenancy y
  las dependencias por empresa. Un endpoint que dependa de quién llama exige reabrir esta
  decisión (CLAUDE.md, «Sin cuentas»).
- **Lo público obliga a proteger a terceros**: los proveedores que son personas naturales
  se enmascaran en todos los canales (spec §8, D12).
- El costo deja de crecer con usuarios y pasa a crecer con el **tráfico anónimo**: lo
  acotan el límite por IP, el CDN de Vercel y el tope de filas de los CSV.

## Qué la reabriría

- **Una empresa dispuesta a pagar** por algo que exija saber quién es (alertas
  personalizadas, encaje con su perfil, seguimiento de postulaciones). Volver a cuentas es
  volver a todo lo que se borró: tenancy, cuotas, cobro, y un entorno de staging.
- **Que las donaciones no cubran los costos** durante varios meses. La primera palanca es
  el costo (spec §5.1), no la publicidad: anuncios implica Vercel Pro.
- **Que las alertas resulten imprescindibles.** El RSS es la apuesta de v1; si la
  analítica web muestra demanda, v2 añade un resumen por correo con enlace mágico, **sin
  contraseñas** (spec §7.1) — eso no reabre este ADR, pero una cuenta con contraseña sí.
