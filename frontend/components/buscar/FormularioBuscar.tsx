import { Search } from 'lucide-react';

import {
  EJEMPLOS_BUSQUEDA,
  MAXIMO_CARACTERES_BUSCAR,
  MINIMO_LETRAS_BUSCAR,
  PARAMETRO_BUSCAR,
} from '@/lib/buscar';

const PLACEHOLDER = `Ej.: ${EJEMPLOS_BUSQUEDA.slice(0, 3).join(', ')}`;

/**
 * El buscador de `/buscar` (y, en PR 6, el de la portada): un
 * `<form method="get">` que **funciona sin JavaScript** y deja la búsqueda en
 * la URL. Componente de servidor.
 *
 * `key={termino}` en el campo: entre dos búsquedas por `<Link>` (un ejemplo)
 * la página no se desmonta, y un `defaultValue` se quedaría con el término
 * anterior. Con la clave, el campo se rehace con el nuevo.
 */
export function FormularioBuscar({ termino }: { termino: string }) {
  return (
    <form role="search" method="get" action="/buscar" className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="buscar-q" className="sr-only">
        Qué le vendes al Estado
      </label>
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
        <input
          key={termino}
          id="buscar-q"
          name={PARAMETRO_BUSCAR}
          type="search"
          defaultValue={termino}
          required
          minLength={MINIMO_LETRAS_BUSCAR}
          maxLength={MAXIMO_CARACTERES_BUSCAR}
          placeholder={PLACEHOLDER}
          autoComplete="off"
          className="input-field w-full pl-9"
        />
      </div>
      <button type="submit" className="btn-accent px-5 py-2.5">
        Buscar
      </button>
    </form>
  );
}
