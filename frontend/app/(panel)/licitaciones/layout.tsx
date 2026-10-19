import type { Metadata } from 'next';

/*
 * Metadatos del catálogo: la página es cliente y Next ignora ahí `metadata`.
 * El detalle (`[codigo]`) pone su propio canonical, o heredaría éste.
 */
export const metadata: Metadata = {
  title: 'Licitaciones y Compras Ágiles de Mercado Público',
  description:
    'Busca licitaciones y Compras Ágiles de Mercado Público por palabra, región, monto y tipo, con la historia del comprador al lado.',
  alternates: { canonical: '/licitaciones' },
};

export default function LayoutCatalogo({ children }: { children: React.ReactNode }) {
  return children;
}
