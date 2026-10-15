# AGENTS.md

**La referencia completa es [`CLAUDE.md`](./CLAUDE.md). Léelo antes de tocar código.**
Este archivo existe para las herramientas que leen `AGENTS.md` en vez de `CLAUDE.md`, y
repite sólo lo que no se puede ignorar.

## Qué es esto

TORDO — sitio público, sin cuentas, de inteligencia sobre Mercado Público. FastAPI + PostgreSQL +
Next.js + un pipeline ETL/analytics en Polars. Monorepo: `backend/`, `frontend/`,
`etl/`, `infra/`.

## Reglas que no se saltan

1. **Sin cuentas.** Desde el pivote público (`docs/PIVOTE_PUBLICO_2026-10.md`) no hay
   usuarios, empresas, sesiones ni claves de API. No reintroduzcas un endpoint que dependa
   de quién llama sin rehacer antes esa decisión.
2. **Migraciones.** Siempre `make migrate-create MSG="..."`. **Nunca `alembic revision`.**
   Ver `.claude/skills/migracion-alembic/SKILL.md`.
3. **Secretos.** Ningún `.env` al repo — hay un hook que lo bloquea. Si una credencial llega
   a un commit, hay que rotarla.
4. **Pre-commit.** Nunca `git commit --no-verify`. Si un hook falla, arregla la causa.
   Los hooks son por clone (los worktrees comparten el .git): `make hooks`.
5. **Imports a nivel de módulo.** Nada de imports dentro de funciones (ya causó un bug real
   en los webhooks de cobro, hoy retirados).
6. **Schemas Pydantic** sólo en `backend/app/schemas/`.
7. **Ramas.** **Toda feature va en un worktree**, nunca ramificando en el checkout
   principal: `make worktree NOMBRE=mi-feature` (crea la rama, copia el `.env` y
   sincroniza dependencias). Luego PR a `main` → CI en verde → merge →
   `make worktree-clean NOMBRE=mi-feature`.
   **No hay rama `staging` ni entorno de staging**: es deliberado (proyecto de un solo
   desarrollador). No inventes ese flujo.
8. **Scoring.** Cualquier cambio a un modelo pasa por `etl/analytics/evaluation/`.

## Comandos

```bash
make setup      # deps + hooks
make lint       # idéntico a CI
make test       # backend + ETL
make help       # el resto
```

Python se maneja con `uv` y un único `pyproject.toml` en la raíz. **No hay `requirements.txt`.**
Desde `backend/` o `etl/`: `uv run --project .. <cmd>`.

## Antes de proponer un cambio estructural

Lee `docs/ARQUITECTURA_REVISION_2026-08.md`. Tiene la deuda conocida y el plan por fases.
No refuerces los patrones listados ahí como deuda: si necesitas apoyarte en uno, la señal es
arreglar la causa.

## Proyecto personal: ninguna skill que toque sistemas externos

Es un proyecto personal. **No invoques** las skills de plugins de usuario que apunten a
tenants, Notion, Sentry o proyectos de nube de terceros: modificarían infraestructura ajena.
Sí son utilizables las genéricas (`grill-me`, `handoff`, `feature`, `demo-video`). La lista
concreta vive en `CLAUDE.local.md` (gitignoreado).
