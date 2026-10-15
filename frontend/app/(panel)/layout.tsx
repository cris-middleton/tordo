/**
 * El grupo `(panel)` no aparece en la URL: agrupa las pantallas interactivas
 * (`/licitaciones`, `/compra-agil`, `/mercado`, `/guardados`). Hasta el
 * lanzamiento colgaban de `/dashboard/*`, que redirige aquí con 308
 * (`next.config.js`).
 *
 * La cabecera y el pie los pone la cáscara única del layout raíz; aquí sólo el
 * ancho y el margen. `max-w-6xl` (1152 px) es, a 1440 px, casi el ancho que
 * dejaba la barra lateral (1120 px de contenido): las pantallas se diseñaron
 * para él.
 *
 * Sin guarda de sesión: desde el pivote a sitio público no hay cuentas, y el
 * catálogo y la analítica los ve cualquiera.
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {children}
    </div>
  );
}
