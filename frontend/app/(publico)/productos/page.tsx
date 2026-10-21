import type { Metadata } from 'next';

import { BuscadorProductos } from '@/components/publico/BuscadorProductos';
import { CabeceraFicha } from '@/components/publico/Piezas';
import { MESES_PRECIOS } from '@/lib/periodo';

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

export default function PaginaProductos() {
  return (
    <article className="max-w-3xl">
      <CabeceraFicha
        titulo="¿Cuánto paga el Estado por…?"
        subtitulo={`Escríbelo como lo pediría un comprador. Cada ficha dice a qué precio se compró en los últimos ${MESES_PRECIOS} meses y quién lo compra.`}
      />
      <BuscadorProductos />
    </article>
  );
}
