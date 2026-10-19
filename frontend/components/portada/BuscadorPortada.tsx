import Link from 'next/link';
import { Search } from 'lucide-react';

import {
  EJEMPLOS_BUSQUEDA,
  MAXIMO_CARACTERES_BUSCAR,
  MINIMO_LETRAS_BUSCAR,
  PARAMETRO_BUSCAR,
  rutaBuscar,
} from '@/lib/buscar';
import { PLACEHOLDER_BUSCADOR, SUBTITULO_PORTADA } from '@/lib/portada';

/**
 * Lo primero de la portada (spec del rediseño §6.3, principio 1, e
 * IDENTIDAD_Y_PORTADA §3.1): la pregunta, qué hace la búsqueda y el buscador.
 * **Un `<form>` GET a `/buscar`, sin JavaScript**: funciona antes de hidratar
 * —y sin hidratar— y deja la portada como componente de servidor.
 *
 * El `<h1>` ES la etiqueta del campo: un lector de pantalla anuncia la pregunta
 * al entrar en él, sin un `<label>` oculto que repita el titular. Sin clase de
 * peso: la regla de los titulares (`h1, h2 { font-display }`) ya lo pone en 800.
 * El `h1` mide 36 px en móvil y 56 desde `lg` (spec PORTADA_V7 §4) y va en dos
 * líneas, «¿Qué le vendes / al Estado?»: el ancho de la columna lo parte y
 * `text-balance` deja las dos líneas parejas (`e2e/portada.spec.ts` lo mide).
 * El campo no repite los ejemplos (`PLACEHOLDER_BUSCADOR`): ya están debajo. El
 * botón va en `dato` con `text-onDato` encima, nunca `text-white` sobre un token;
 * el foco, el de la regla global `:focus-visible`.
 * Los límites del campo son los de `lib/buscar.ts` (los mismos que `/buscar`).
 *
 * Los ejemplos son `<Link>` por defecto, sin `prefetch`: con `loading.tsx` ausente
 * no ejecutan `/buscar`, y forzarlo costaría una búsqueda por ejemplo en cada vista.
 */
export function BuscadorPortada() {
  return (
    <div>
      <h1 className="text-balance text-[36px] leading-[1.05] tracking-tight text-text lg:text-[56px]">
        <label htmlFor="buscar-portada">¿Qué le vendes al Estado?</label>
      </h1>
      <p className="mt-4 max-w-[40ch] text-lg leading-relaxed text-muted">{SUBTITULO_PORTADA}</p>

      <form method="get" action="/buscar" role="search" className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input
          id="buscar-portada"
          name={PARAMETRO_BUSCAR}
          type="search"
          required
          minLength={MINIMO_LETRAS_BUSCAR}
          maxLength={MAXIMO_CARACTERES_BUSCAR}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={PLACEHOLDER_BUSCADOR}
          className="input-field py-3 text-base sm:flex-1"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-dato px-6 py-3 text-base font-semibold text-onDato shadow-sm transition-colors hover:bg-dato/90"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Buscar
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2 text-sm">
        <span className="text-muted">Por ejemplo:</span>
        <ul aria-label="Ejemplos de búsqueda" className="flex flex-wrap gap-x-3 gap-y-2">
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
