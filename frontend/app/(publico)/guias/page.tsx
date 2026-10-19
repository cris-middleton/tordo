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

/**
 * `/guias` — el índice de las guías, en la misma lista que las notas: título,
 * descripción y fecha, con filetes y sin tarjetas. Estático: se genera en el build.
 */
export default function PaginaGuias() {
  const guias = leerGuias();
  return (
    <article className="lectura max-w-3xl">
      <CabeceraFicha
        titulo="Cómo leer los datos de compras públicas"
        subtitulo="Qué significa cada cifra, de dónde sale y dónde están sus límites."
      />
      <ul className="max-w-[58ch] divide-y divide-border border-y border-border">
        {guias.map((g) => (
          <li key={g.slug} className="py-6">
            <h2 className="font-sans text-lg font-semibold leading-snug">
              <Link href={rutaGuia(g.slug)} className="text-text hover:text-primary">
                {g.titulo}
              </Link>
            </h2>
            <p className="mt-2 text-muted">{g.descripcion}</p>
            <p className="mt-2 text-sm text-subtle">
              Actualizada el <span className="cifra">{fechaCorta(g.actualizado)}</span>
            </p>
          </li>
        ))}
      </ul>
    </article>
  );
}
