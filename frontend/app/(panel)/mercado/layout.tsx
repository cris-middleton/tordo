import type { Metadata } from 'next';

import { MESES_ANALISIS } from '@/lib/periodo';

/* Metadatos de Mercados: la página es cliente y Next ignora ahí `metadata`. */
export const metadata: Metadata = {
  title: 'Cuánto compra el Estado en cada rubro',
  description: `Cuánto compró el Estado en cada rubro en los últimos ${MESES_ANALISIS} meses, quién le vende y en qué meses compra. Con las órdenes de compra de ChileCompra.`,
  alternates: { canonical: '/mercado' },
};

export default function LayoutMercados({ children }: { children: React.ReactNode }) {
  return children;
}
