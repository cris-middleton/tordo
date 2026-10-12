# Decisiones de arquitectura (ADR)

Un archivo por decisión que sea **cara de revertir**: stack, modelo de datos, límites del
producto, proveedores. Las decisiones reversibles en una tarde no necesitan ADR.

Formato: `NNNN-titulo-en-kebab.md`. Nunca se editan una vez aceptados — si una decisión
cambia, se escribe un ADR nuevo que **supersede** al anterior y se anota en el viejo.

| # | Decisión | Estado | Fecha |
|---|----------|--------|-------|
| [0001](0001-solo-chile.md) | Sólo Chile, sin abstracción multi-país | Aceptada | 2026-08-05 |
| [0002](0002-suscripcion-por-empresa.md) | La suscripción pertenece a la empresa, no al usuario | Supersedida por 0011 | 2026-08-05 |
| [0003](0003-nombre-tordo.md) | El producto se llama TORDO | Aceptada | 2026-08-05 |
| [0004](0004-llm-solo-mcp.md) | LLM acotado a un servidor MCP sobre la base histórica | Aceptada, modificada por 0011 | 2026-08-05 |
| [0005](0005-pasarela-local-v1.md) | Pasarela de pago local en v1 | Supersedida por 0011 | 2026-08-05 |
| [0006](0006-analytics-en-postgres.md) | Analytics servido desde Postgres, no desde parquet en proceso | Propuesta | 2026-08-05 |
| [0007](0007-no-migrar-a-supabase.md) | No migrar a Supabase; se mantiene la arquitectura actual | Aceptada | 2026-08-05 |
| [0008](0008-mercadopago-como-pasarela.md) | MercadoPago como pasarela principal, y sólo una para empezar | Supersedida por 0011 | 2026-08-06 |
| [0009](0009-api-versionada-y-sin-envelope.md) | API versionada en la URL y respuestas sin envelope | Aceptada | 2026-08-08 |
| [0010](0010-extraccion-de-bases-con-llm.md) | Extracción de bases con LLM: aplazada por falta de fuente | Aceptada | 2026-08-08 |
| [0011](0011-sitio-publico-sin-cuentas.md) | Sitio público y gratuito, sin cuentas ni cobros | Aceptada | 2026-10-11 |
