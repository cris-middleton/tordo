import type { Metadata } from 'next';

import { BuscadorProductos } from '@/components/publico/BuscadorProductos';
import { CabeceraFicha } from '@/components/publico/Piezas';

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
  title: 'Precios de referencia de productos',
  description:
    'Busca un producto y mira cuánto pagan por él los compradores públicos en Chile, con datos de ChileCompra.',
  alternates: { canonical: '/productos' },
};

export default function PaginaProductos() {
  return (
    <article className="max-w-3xl">
      <CabeceraFicha
        tipo="Precios de referencia"
        titulo="¿Cuánto paga el Estado por…?"
        subtitulo="Busca un producto por cómo lo describen los compradores. Cada ficha trae la banda de precios por unidad y quién lo compra."
      />
      <BuscadorProductos />
    </article>
  );
}
