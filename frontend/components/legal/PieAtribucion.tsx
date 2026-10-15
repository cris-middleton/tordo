import Link from 'next/link';

import { DESCARGO_CHILECOMPRA, FUENTE_DATOS } from '@/lib/atribucion';

/**
 * La cita de la fuente y los enlaces legales, en cada página del sitio.
 *
 * La pone UNA vez el pie del sitio (`components/cascara/PieSitio.tsx`), que la
 * cáscara única monta alrededor de toda página desde `app/layout.tsx`. Ningún
 * otro fichero la pinta: un pie duplicado repetiría la cita, y una página con
 * marco propio podría perderla en un rediseño — `__tests__/legal-enlazado.test.tsx`
 * vigila las dos cosas.
 *
 * La frase de la fuente es una CONDICIÓN de uso de los datos (ver
 * `docs/DECLARACION_USO_DATOS.md`), no un adorno: «datos de fuentes públicas»
 * no la cumple.
 */
export function PieAtribucion({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 text-center ${className}`}>
      <p className="text-[11px] text-subtle">{FUENTE_DATOS}.</p>
      <p className="max-w-2xl text-[11px] text-subtle">{DESCARGO_CHILECOMPRA}</p>
      <nav aria-label="Documentos legales" className="flex gap-x-4 text-[11px] text-subtle">
        <Link href="/terminos" className="transition-colors hover:text-primary">
          Términos de uso
        </Link>
        <Link href="/privacidad" className="transition-colors hover:text-primary">
          Privacidad
        </Link>
      </nav>
      {/* Fuera de la navegación legal: no son documentos. Discretos a propósito. */}
      <div className="flex gap-x-4 text-[11px] text-subtle">
        <Link href="/apoyar" className="transition-colors hover:text-primary">
          Apoyar el sitio
        </Link>
        <Link href="/apoyar#costos" className="transition-colors hover:text-primary">
          Cuánto cuesta
        </Link>
      </div>
    </div>
  );
}
