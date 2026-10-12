import Link from 'next/link';

import { DESCARGO_CHILECOMPRA, FUENTE_DATOS } from '@/lib/atribucion';

/**
 * La cita de la fuente y los enlaces legales, en cada página del sitio.
 *
 * Va en tres sitios y no en el layout raíz: la landing tiene su propio pie, el
 * panel tiene una barra lateral fija que taparía un pie de ancho completo, y
 * los documentos legales su propio marco. Lo que no puede pasar es que alguno
 * lo pierda en un rediseño — `__tests__/legal-enlazado.test.tsx` renderiza los
 * tres y busca la frase.
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
    </div>
  );
}
