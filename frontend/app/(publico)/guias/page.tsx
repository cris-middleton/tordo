import type { Metadata } from 'next';
import Link from 'next/link';

import { CabeceraFicha } from '@/components/publico/Piezas';
import { leerGuias, rutaGuia, ultimaActualizacion } from '@/lib/guias';
import { fechaCorta } from '@/lib/publico';

export const metadata: Metadata = {
  title: 'Guías',
  description:
    'Cómo leer el precio de un producto, a un comprador o la concentración de un mercado, y de dónde salen los datos de compras públicas.',
  alternates: { canonical: '/guias' },
};

/**
 * `/guias` — el índice de las guías, en la misma lista que las notas: título y
 * descripción, con filetes y sin tarjetas. Estático: se genera en el build.
 *
 * **En orden de lectura** (`ORDEN_GUIAS`), no por título: primero de dónde salen
 * los datos y cómo compra el Estado. **La fecha va una vez**, la de la última
 * revisada: repetida en cada guía era la misma línea gris ocho veces.
 */
export default function PaginaGuias() {
  const guias = leerGuias();
  const ultima = ultimaActualizacion(guias);
  return (
    <article className="lectura max-w-3xl">
      <CabeceraFicha
        titulo="Cómo leer los datos de compras públicas"
        subtitulo="Qué significa cada cifra del sitio y lo que no alcanza a decir."
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
          </li>
        ))}
      </ul>
      {ultima && (
        <p className="mt-4 text-sm text-subtle">
          La última revisión es del <time dateTime={ultima} className="cifra">{fechaCorta(ultima)}</time>.
        </p>
      )}
    </article>
  );
}
