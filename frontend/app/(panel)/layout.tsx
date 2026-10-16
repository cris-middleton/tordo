import { Contenedor } from '@/components/cascara/Contenedor';

/**
 * El grupo `(panel)` no aparece en la URL: agrupa las pantallas interactivas
 * (`/licitaciones`, `/compra-agil`, `/mercado`, `/guardados`). Hasta el
 * lanzamiento colgaban de `/dashboard/*`, que redirige aquí con 308
 * (`next.config.js`).
 *
 * La cabecera y el pie los pone la cáscara única del layout raíz; aquí sólo el
 * contenedor único (spec PORTADA_V7 §4): el mismo ancho, borde y tope que las
 * páginas públicas.
 *
 * Sin guarda de sesión: desde el pivote a sitio público no hay cuentas, y el
 * catálogo y la analítica los ve cualquiera.
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <Contenedor pagina>{children}</Contenedor>;
}
