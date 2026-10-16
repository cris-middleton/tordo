import Link from 'next/link';
import { Search } from 'lucide-react';

import {
  EJEMPLOS_BUSQUEDA,
  MAXIMO_CARACTERES_BUSCAR,
  MINIMO_LETRAS_BUSCAR,
  PARAMETRO_BUSCAR,
  rutaBuscar,
} from '@/lib/buscar';

/**
 * Lo primero de la portada (spec del rediseño §6.3, principio 1): la pregunta y
 * el buscador. **Un `<form>` GET a `/buscar`, sin JavaScript**: funciona antes de
 * hidratar —y sin hidratar— y deja la portada como componente de servidor.
 *
 * El `<h1>` ES la etiqueta del campo: un lector de pantalla anuncia la pregunta
 * al entrar en él, sin un `<label>` oculto que repita el titular. Los límites
 * del campo son los de `lib/buscar.ts` (los mismos que `/buscar`); qué hacer con
 * un término raro es trabajo de esa página.
 *
 * Los ejemplos son `<Link>` por defecto, sin `prefetch`: con `loading.tsx` ausente
 * no ejecutan `/buscar`, y forzarlo costaría una búsqueda por ejemplo en cada vista.
 */
export function BuscadorPortada() {
  return (
    <div>
      <h1 className="text-3xl leading-tight text-text sm:text-4xl">
        <label htmlFor="buscar-portada">¿Qué le vendes al Estado?</label>
      </h1>

      <form method="get" action="/buscar" role="search" className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input
          id="buscar-portada"
          name={PARAMETRO_BUSCAR}
          type="search"
          required
          minLength={MINIMO_LETRAS_BUSCAR}
          maxLength={MAXIMO_CARACTERES_BUSCAR}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Ej.: resma de papel carta, guantes de nitrilo, tóner"
          className="input-field py-3 text-base sm:flex-1"
        />
        <button type="submit" className="btn-accent px-6 py-3 text-base">
          <Search className="h-4 w-4" aria-hidden="true" />
          Buscar
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="text-muted">Por ejemplo:</span>
        <ul aria-label="Ejemplos de búsqueda" className="flex flex-wrap gap-x-3 gap-y-1">
          {EJEMPLOS_BUSQUEDA.map((ejemplo) => (
            <li key={ejemplo}>
              <Link href={rutaBuscar(ejemplo)} className="enlace">
                {ejemplo}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
