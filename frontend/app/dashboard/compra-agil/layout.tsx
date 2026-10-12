import type { Metadata } from 'next';

/*
 * Metadatos de «Lo mejor de hoy». La página es cliente (filtros en la URL), y
 * Next ignora `metadata` en un componente cliente: sin este layout salía con el
 * título genérico del sitio y sin canonical, siendo una de las páginas del
 * sitemap (`e2e/calidad-paginas.spec.ts`).
 */
export const metadata: Metadata = {
  title: 'Lo mejor de hoy en Compra Ágil',
  description:
    'Compras Ágiles abiertas donde cotizar tiene más sentido: pocas cotizaciones, un comprador que adjudica y tiempo para preparar la oferta. Actualizado varias veces al día.',
  alternates: { canonical: '/dashboard/compra-agil' },
};

export default function LayoutCompraAgil({ children }: { children: React.ReactNode }) {
  return children;
}
