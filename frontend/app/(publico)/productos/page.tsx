import type { Metadata } from 'next';

import Link from 'next/link';

import { BuscadorProductos } from '@/components/publico/BuscadorProductos';
import { CabeceraFicha, Seccion } from '@/components/publico/Piezas';
import { PRODUCTOS_ESCALERA } from '@/lib/escaleraPrecios';
import { MESES_PRECIOS } from '@/lib/periodo';
import { rutaBusquedaProductos, tituloDeBanda } from '@/lib/publico';

/**
 * `/productos` — buscar el precio de referencia de un producto.
 *
 * Una cáscara de servidor (título y metadatos, indexable) con el buscador en
 * el cliente. Es la puerta a las fichas que no están en el sitemap.
 *
 * Una búsqueda es una URL: `/productos?q=resma` abre con los resultados
 * (`rutaBusquedaProductos`). La lee el buscador en el cliente, no esta página:
 * leer `searchParams` aquí la volvería dinámica. El `canonical` sigue siendo
 * `/productos`, así que las búsquedas no compiten con ella en el buscador.
 */
export const metadata: Metadata = {
  title: 'Cuánto paga el Estado, producto por producto',
  description: `Busca un producto y mira a qué precio lo compró el Estado de Chile en los últimos ${MESES_PRECIOS} meses, y quién lo compra. Con datos de ChileCompra.`,
  alternates: { canonical: '/productos' },
};

/**
 * Mientras no hay búsqueda, seis búsquedas para empezar: las cosas de la escalera
 * de la portada (`PRODUCTOS_ESCALERA`). **Enlazan a su búsqueda, no a su ficha**: una
 * ficha que deja de ser indexable (o que no existe, como en el fixture del E2E) sería
 * un enlace roto escrito a mano, y la búsqueda siempre responde. Sin cifras: la
 * página no pide nada al backend por mostrarlos.
 */
function FichasParaEmpezar() {
  return (
    <Seccion titulo="Lo que compra todo el Estado">
      <ul aria-label="Búsquedas para empezar" className="divide-y divide-border border-y border-border text-sm">
        {PRODUCTOS_ESCALERA.map((p) => (
          <li key={p.slug}>
            <Link
              href={rutaBusquedaProductos(p.nombre.replace(/\s*\(.*\)$/, ''))}
              prefetch={false}
              className="flex items-baseline justify-between gap-3 py-3 hover:text-accent"
            >
              <span className="font-medium text-primary">{p.nombre}</span>
              <span className="shrink-0 text-muted">{tituloDeBanda(p.unidad).toLowerCase()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

export default function PaginaProductos() {
  return (
    <article className="max-w-3xl">
      <CabeceraFicha
        titulo="¿Cuánto paga el Estado por…?"
        subtitulo={`Escríbelo como lo pediría un comprador. Cada ficha dice a qué precio se compró en los últimos ${MESES_PRECIOS} meses y quién lo compra.`}
      />
      <BuscadorProductos inicio={<FichasParaEmpezar />} />
    </article>
  );
}
