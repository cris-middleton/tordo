import { Cabecera } from './Cabecera';
import { PieSitio } from './PieSitio';

/**
 * La cáscara única del sitio (spec del rediseño §6.1–§6.2): cabecera, el ÚNICO
 * `<main>` y el pie, alrededor de toda página. La monta `app/layout.tsx`; nada
 * más pinta cabecera, pie ni `<main>` (`__tests__/legal-enlazado.test.tsx`).
 *
 * Antes había dos cáscaras —barra lateral en el panel, cabecera arriba en lo
 * público—, y pasar de una a otra se sentía como entrar a una zona de miembros.
 */
export function Cascara({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary"
      >
        Saltar al contenido
      </a>
      <Cabecera />
      {/* tabIndex={-1} + sin contorno: el salto al contenido le da foco por programa, no es un control. */}
      <main id="contenido" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <PieSitio />
    </>
  );
}
