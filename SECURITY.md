# Seguridad

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usa el reporte privado de GitHub:
<https://github.com/cris-middleton/tordo/security/advisories/new>

Si no puedes usarlo, escribe a **hola@tordo.cl** con «Seguridad» en el asunto.

Incluye, si puedes: la URL o el endpoint afectado, los pasos para reproducirlo y qué podría
hacer alguien que lo aprovechara. Responderé en cuanto pueda; es un proyecto personal mantenido
por una sola persona, así que no hay un plazo garantizado, pero un reporte de seguridad pasa
delante de todo lo demás.

## Qué cubre

- El sitio `tordo.cl`, la API pública `api.tordo.cl/api/v1/*` y el servidor MCP `api.tordo.cl/mcp/`.
- El código de este repositorio (frontend, backend, ETL).

## Qué no cubre

- Los datos de Mercado Público en sí: los publica ChileCompra. Un error en un dato de origen se
  reporta a ChileCompra.
- Ataques de denegación de servicio por volumen: la API tiene un límite por IP documentado en
  `/abierto` y no se considera vulnerabilidad superarlo.

## Lo que el sitio no guarda

No hay cuentas, contraseñas, sesiones ni cookies propias. Lo que el sitio trata está en
<https://tordo.cl/privacidad>.

## Historia del repositorio

La historia se reescribió antes de publicarla para quitar archivos de configuración local y
datos que no debían publicarse. Las credenciales que llegaron a estar versionadas se revocaron
o ya no dan acceso a nada.
