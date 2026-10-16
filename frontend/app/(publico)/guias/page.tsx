import type { Metadata } from 'next';
import Link from 'next/link';

import { CabeceraFicha } from '@/components/publico/Piezas';
import { leerGuias, rutaGuia } from '@/lib/guias';
import { fechaCorta } from '@/lib/publico';

export const metadata: Metadata = {
  title: 'Guías',
  description:
    'Cómo leer una banda de precio, un comprador o la concentración de un mercado, y de dónde salen los datos de compras públicas.',
  alternates: { canonical: '/guias' },
};

/** `/guias` — el índice de las guías. Estático: se genera en el build. */
export default function PaginaGuias() {
  const guias = leerGuias();
  return (
    <article className="max-w-3xl">
      <CabeceraFicha
        tipo="Guías"
        titulo="Cómo leer los datos de compras públicas"
        subtitulo="Qué significa cada cifra, de dónde sale y dónde están sus límites."
      />
      <ul className="space-y-3">
        {guias.map((g) => (
          <li key={g.slug}>
            <Link
              href={rutaGuia(g.slug)}
              className="group block rounded-xl border border-border bg-surface px-5 py-4 transition-shadow hover:shadow-md"
            >
              <h2 className="font-display text-base text-text group-hover:text-primary">
                {g.titulo}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{g.descripcion}</p>
              <p className="mt-2 text-xs text-subtle">Actualizada el {fechaCorta(g.actualizado)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
