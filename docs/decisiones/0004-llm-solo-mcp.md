# 0004 — LLM acotado a un servidor MCP sobre la base histórica

**Estado**: Aceptada · **Fecha**: 2026-08-05

## Contexto
`docs/SPEC.md` descartó los LLM por costo ("TF-IDF sobre historial OC, sin LLM"). LicitaLab
lanzó "LIA", que analiza las bases de licitación, y también un servidor MCP.

## Decisión
Se incorpora **un servidor MCP de sólo lectura sobre la base histórica**, simple, medido y
cobrado dentro del plan de quien lo consume. Para después de F2.

**No** se incorpora un chat conversacional sobre datos estructurados.

## Consecuencias
- Después de F2 el MCP es casi gratis: consulta las mismas tablas Postgres que sirve la API,
  y el medidor por plan ya existe (`check_bi_quota_dep` sobre Redis).
- Un chat encima de los datos estructurados sería una interfaz peor que los 22 endpoints de
  BI, que ya responden esas preguntas de forma determinista, más rápida y más barata.

## Pendiente de reevaluar
La **extracción estructurada sobre las bases de licitación** (PDF/DOC) quedó fuera, pero es
el único uso de LLM con valor claro: extrae documentos exigidos, criterios de evaluación,
garantías y causales de rechazo — lo único que no se puede derivar de los datos de OC/LIC, y
que alimentaría el checklist automáticamente en vez de con plantillas estáticas. La economía
es por documento (se cachea y se amortiza entre suscriptores), no por consulta de usuario.
**Reevaluar después de F3**, cuando el plan por empresa permita cobrarlo por capacidad.
Ver `docs/ARQUITECTURA_REVISION_2026-08.md` §14.
