import type { Metadata } from 'next';

import { DESCRIPCION_DESTACADAS, TITULO_DESTACADAS } from '@/lib/compraAgil';

/*
 * Metadatos de «Lo mejor de hoy». La página es cliente (filtros en la URL), y
 * Next ignora `metadata` en un componente cliente: sin este layout salía con el
 * título genérico del sitio y sin canonical, siendo una de las páginas del
 * sitemap (`e2e/calidad-paginas.spec.ts`).
 */
export const metadata: Metadata = {
  title: TITULO_DESTACADAS,
  description: `${DESCRIPCION_DESTACADAS} Actualizado varias veces al día.`,
  alternates: { canonical: '/compra-agil' },
};

export default function LayoutCompraAgil({ children }: { children: React.ReactNode }) {
  return children;
}
