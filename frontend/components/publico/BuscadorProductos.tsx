'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

import { useValorRetardado } from '@/hooks/useValorRetardado';
import {
  PARAMETRO_BUSQUEDA_PRODUCTOS,
  entero,
  nombreProducto,
  rutaBusquedaProductos,
  rutaProducto,
} from '@/lib/publico';
import {
  MAXIMO_BUSQUEDA_PRODUCTOS,
  MINIMO_BUSQUEDA_PRODUCTOS,
  useBuscarProductosPublicos,
} from '@/lib/queries';

/**
 * El buscador de `/productos`. Es como se llega a la ficha de un producto que
 * no está en el sitemap (pocas compras o precio muy disperso): la página existe
 * con `noindex`, y sin esto sólo se llegaría con la URL exacta.
 *
 * El enlace usa el `slug` que manda el backend; aquí no se slugifica nada.
 *
 * **El término vive en la URL** (`/productos?q=resma`, `rutaBusquedaProductos`).
 * Se lee UNA vez al montar, con `useSearchParams` en un inicializador perezoso,
 * y se escribe con `replaceState` — el patrón de `/mercado`, `/licitaciones` y
 * `/compra-agil`. Antes vivía sólo en `useState`: una búsqueda no se podía
 * enlazar ni compartir.
 *
 * `useSearchParams` exige una frontera de `Suspense`, o el build falla al
 * prerenderizar `/productos`. Va aquí y no en la página para que la página siga
 * siendo un componente de servidor estático: leer `searchParams` en ella la
 * volvería dinámica en cada petición. Hasta que hidrata se ve el campo vacío.
 */
export function BuscadorProductos() {
  return (
    <Suspense fallback={<Campo texto="" />}>
      <Buscador />
    </Suspense>
  );
}

function Campo({ texto, alCambiar }: { texto: string; alCambiar?: (valor: string) => void }) {
  return (
    <>
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
          onChange={(e) => alCambiar?.(e.target.value)}
          readOnly={!alCambiar}
          maxLength={MAXIMO_BUSQUEDA_PRODUCTOS}
          placeholder="Ej.: guante de nitrilo, resma carta, toner"
          autoComplete="off"
          className="input-field w-full pl-9"
        />
      </div>
    </>
  );
}

function Buscador() {
  const urlInicial = useSearchParams();
  // Un enlace compartido puede traer un término más largo que el del backend
  // (un 422 que se leería como caída): se trunca al tope, como haría el campo.
  const [texto, setTexto] = useState(() =>
    (urlInicial.get(PARAMETRO_BUSQUEDA_PRODUCTOS) ?? '').slice(0, MAXIMO_BUSQUEDA_PRODUCTOS),
  );
  // `useValorRetardado` publica el valor inicial sin esperar: la búsqueda que
  // llega en la URL se pide en el primer render.
  const retardado = useValorRetardado(texto, 300);
  const termino = retardado.trim();
  const consulta = useBuscarProductosPublicos(retardado);
  const buscable = termino.length >= MINIMO_BUSQUEDA_PRODUCTOS;
  const resultados = buscable ? (consulta.data ?? []) : [];

  // Con el término YA retardado —no con cada tecla— y sólo si se busca: la URL
  // es la búsqueda que se hizo. No toca estado de React: escribe fuera.
  // `replaceState` para no llenar el historial.
  const destino = rutaBusquedaProductos(buscable ? termino : '');
  useEffect(() => {
    window.history.replaceState({}, '', destino);
  }, [destino]);

  return (
    <div>
      <Campo texto={texto} alCambiar={setTexto} />

      <div className="mt-4" aria-live="polite">
        {!buscable ? (
          <p className="text-sm text-subtle">Escribe al menos tres letras.</p>
        ) : consulta.isError ? (
          <p className="text-sm text-subtle">No pudimos buscar ahora. Prueba de nuevo en un momento.</p>
        ) : consulta.isPending ? (
          <p className="text-sm text-subtle">Buscando…</p>
        ) : resultados.length === 0 ? (
          <div className="space-y-1 text-sm text-subtle">
            <p>Ningún producto coincide con «{termino}».</p>
            <p>Las palabras de menos de tres letras y los números no cuentan en la búsqueda.</p>
          </div>
        ) : (
          <ul aria-label="Productos encontrados" className="divide-y divide-border rounded-xl border border-border bg-surface">
            {resultados.map((p) => (
              <li key={p.slug}>
                <Link
                  href={rutaProducto(p.slug)}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-surface-elevated"
                >
                  <span className="min-w-0 truncate font-medium text-primary">{nombreProducto(p)}</span>
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
