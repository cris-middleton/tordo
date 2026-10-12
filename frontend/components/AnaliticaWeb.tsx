/**
 * Vercel Web Analytics, **sin dependencia**: el script oficial que Vercel sirve
 * en el propio dominio (`/_vercel/insights/script.js`). `@vercel/analytics` no
 * hace más que inyectar esa misma etiqueta, y una librería por una línea es una
 * dependencia más que auditar (`make audit`).
 *
 * **Sólo cuando se construye o se sirve en Vercel** (`VERCEL=1`, que pone la
 * plataforma). Fuera de Vercel la ruta no existe: en local, en CI y en el E2E
 * la etiqueta sería un 404 en cada página.
 *
 * Sin cookies y sin identificar a nadie a lo largo del tiempo: es lo que dice
 * la política de privacidad (§4), que ya lo declara. Componente de servidor:
 * `VERCEL` no lleva prefijo `NEXT_PUBLIC_` y no tiene por qué llegar al bundle.
 */

export const SCRIPT_ANALITICA_WEB = '/_vercel/insights/script.js';

export function enVercel(entorno: Record<string, string | undefined> = process.env): boolean {
  return entorno.VERCEL === '1';
}

export function AnaliticaWeb() {
  if (!enVercel()) return null;
  return <script defer src={SCRIPT_ANALITICA_WEB} />;
}
