import type { Metadata } from 'next';

/* Metadatos de la inteligencia de mercado: la página es cliente y Next ignora ahí `metadata`. */
export const metadata: Metadata = {
  title: 'Inteligencia de mercado por rubro',
  description:
    'Cuánto se compra en cada rubro de Mercado Público, quién lo compra, qué tan concentrado está y en qué meses. Con datos de ChileCompra, sin cuenta.',
  alternates: { canonical: '/dashboard/bi' },
};

export default function LayoutInteligencia({ children }: { children: React.ReactNode }) {
  return children;
}
