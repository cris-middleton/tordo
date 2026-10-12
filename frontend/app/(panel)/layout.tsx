import Layout from '@/components/Layout';

/**
 * El grupo `(panel)` no aparece en la URL: agrupa las pantallas que llevan la
 * barra lateral (`/licitaciones`, `/compra-agil`, `/mercado`, `/guardados`).
 * Hasta el lanzamiento colgaban de `/dashboard/*`, que redirige aquí con 308
 * (`next.config.js`).
 *
 * Sin guarda de sesión: desde el pivote a sitio público no hay cuentas, y el
 * catálogo y la analítica los ve cualquiera.
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}
