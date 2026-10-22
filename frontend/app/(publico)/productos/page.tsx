import type { Metadata } from 'next';

import Link from 'next/link';

import { BuscadorProductos } from '@/components/publico/BuscadorProductos';
import { CabeceraFicha, Seccion } from '@/components/publico/Piezas';
import { PRODUCTOS_ESCALERA } from '@/lib/escaleraPrecios';
import { MESES_PRECIOS } from '@/lib/periodo';
import { rutaProducto, tituloDeBanda } from '@/lib/publico';

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
 * Mientras no hay búsqueda, seis fichas para abrir de una: las de la escalera de
 * la portada (`PRODUCTOS_ESCALERA`), elegidas en producción y comprobadas por
 * `scripts/verificar-produccion.sh`. Son enlaces escritos, sin cifras: la página
 * no pide nada al backend por mostrarlos. Sin `prefetch`, que en cada vista
 * generaría las seis fichas.
 */
function FichasParaEmpezar() {
  return (
    <Seccion titulo="Lo que compra todo el Estado">
      <ul aria-label="Fichas para empezar" className="divide-y divide-border border-y border-border text-sm">
        {PRODUCTOS_ESCALERA.map((p) => (
          <li key={p.slug}>
            <Link
              href={rutaProducto(p.slug)}
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
