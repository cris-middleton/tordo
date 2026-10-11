# Frontend - Tordo

Next.js 16 (App Router) + TypeScript + Tailwind + Recharts. Sitio público: no hay
cuentas, ni inicio de sesión, ni planes. Las reglas de trabajo están en el
`CLAUDE.md` de la raíz del repositorio (sección «Frontend»).

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
│   ├── dashboard/
│   │   ├── tenders/     # Catálogo y detalle de licitaciones
│   │   └── bi/          # Inteligencia de mercado
│   ├── layout.tsx
│   └── page.tsx         # Portada (server component; la interactividad, en LandingClient)
├── components/          # Componentes propios (Layout, gráficos, landing…)
├── lib/                 # api.ts (cliente), queries.ts (TanStack Query), ayudantes
├── __tests__/           # Vitest
└── e2e/                 # Playwright
```

## Páginas

- `/` — portada
- `/dashboard/tenders` — búsqueda de licitaciones (`/dashboard` redirige aquí)
- `/dashboard/tenders/[codigo]` — detalle de una licitación con su análisis de mercado
- `/dashboard/bi` — inteligencia de mercado por rubro
