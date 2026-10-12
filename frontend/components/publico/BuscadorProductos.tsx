'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search } from 'lucide-react';

import { useValorRetardado } from '@/hooks/useValorRetardado';
import { entero, rutaProducto } from '@/lib/publico';
import { MINIMO_BUSQUEDA_PRODUCTOS, useBuscarProductosPublicos } from '@/lib/queries';

/**
 * El buscador de `/productos`. Es como se llega a la ficha de un producto que
 * no está en el sitemap (pocas compras o precio muy disperso): la página existe
 * con `noindex`, y sin esto sólo se llegaría con la URL exacta.
 *
 * El enlace usa el `slug` que manda el backend; aquí no se slugifica nada.
 */
export function BuscadorProductos() {
  const [texto, setTexto] = useState('');
  const retardado = useValorRetardado(texto, 300);
  const consulta = useBuscarProductosPublicos(retardado);
  const buscable = retardado.trim().length >= MINIMO_BUSQUEDA_PRODUCTOS;
  const resultados = buscable ? (consulta.data ?? []) : [];

  return (
    <div>
      <label htmlFor="buscar-producto" className="sr-only">
        Buscar un producto
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
        <input
          id="buscar-producto"
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej.: guante de nitrilo, resma carta, toner"
          autoComplete="off"
          className="input-field w-full pl-9"
        />
      </div>

      <div className="mt-4" aria-live="polite">
        {!buscable ? (
          <p className="text-sm text-subtle">Escribe al menos dos letras.</p>
        ) : consulta.isError ? (
          <p className="text-sm text-subtle">No pudimos buscar ahora. Prueba de nuevo en un momento.</p>
        ) : consulta.isPending ? (
          <p className="text-sm text-subtle">Buscando…</p>
        ) : resultados.length === 0 ? (
          <p className="text-sm text-subtle">Ningún producto coincide con «{retardado.trim()}».</p>
        ) : (
          <ul aria-label="Productos encontrados" className="divide-y divide-border rounded-xl border border-border bg-surface">
            {resultados.map((p) => (
              <li key={p.slug}>
                <Link
                  href={rutaProducto(p.slug)}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-background"
                >
                  <span className="min-w-0 truncate font-medium text-primary">{p.firma}</span>
                  <span className="cifra shrink-0 text-xs text-muted">
                    {entero(p.n)} compras{p.indexable ? '' : ' · orientativo'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
