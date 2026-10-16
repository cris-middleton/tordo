import type { Metadata } from 'next';

/* Metadatos de Mercados: la página es cliente y Next ignora ahí `metadata`. */
export const metadata: Metadata = {
  title: 'Mercados por rubro',
  description:
    'Cuánto se compra en cada rubro de Mercado Público, quién lo compra, qué tan concentrado está y en qué meses. Con datos de ChileCompra.',
  alternates: { canonical: '/mercado' },
};

export default function LayoutMercados({ children }: { children: React.ReactNode }) {
  return children;
}
