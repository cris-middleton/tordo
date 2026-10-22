# Frontend - Tordo

Next.js 16 (App Router) + TypeScript + Tailwind + Recharts. Sitio público: no hay
cuentas, ni inicio de sesión, ni planes. Las reglas de trabajo están en el
`frontend/CLAUDE.md`, que complementa al `CLAUDE.md` de la raíz del repositorio.

## Desarrollo

```bash
npm install
API_URL=http://localhost:8000 npm run dev
```

`API_URL` es una variable de **servidor**: el navegador habla sólo con
`/api/proxy`, y es el servidor de Next quien reenvía al backend. No uses el
prefijo `NEXT_PUBLIC_` para ella — se inlinearía en el bundle.

## Verificación

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

Las pruebas de extremo a extremo se corren desde la raíz con `make e2e`.

## Estructura

```
frontend/
├── app/
│   ├── api/proxy/       # Reenvío al backend (sin sesión, sigue redirecciones)
│   ├── (panel)/         # Pantallas interactivas: sólo el ancho (no aparece en la URL)
│   │   ├── compra-agil/ # Lo mejor de hoy en Compra Ágil
│   │   ├── licitaciones/ # Catálogo y detalle de licitaciones
│   │   ├── mercado/     # Mercados por rubro
│   │   └── guardados/   # Lo guardado en el navegador
│   ├── layout.tsx
│   └── page.tsx         # Portada: el buscador, las cifras y «Lo mejor de hoy» (server component)
├── components/          # Componentes propios (cascara/: cabecera y pie únicos; gráficos, portada…)
├── lib/                 # api.ts (cliente), queries.ts (TanStack Query), ayudantes
├── __tests__/           # Vitest
└── e2e/                 # Playwright
```

## Páginas

- `/` — portada: el buscador «¿Qué le vendes al Estado?», las cifras y «Lo mejor de hoy»
- `/acerca` — qué es, de dónde salen los datos, cómo se financia y preguntas frecuentes
- `/licitaciones` — búsqueda de licitaciones (`/dashboard/*` redirige con 308 a estas rutas)
- `/licitaciones/[codigo]` — detalle de una licitación con su análisis de mercado
- `/mercado` — mercados por rubro
