import type { Metadata } from 'next';

import { DESCRIPCION_DESTACADAS, TITULO_DESTACADAS } from '@/lib/compraAgil';
import { FRECUENCIA_CATALOGO } from '@/lib/portada';

/*
 * Metadatos de «Lo mejor de hoy». La página es cliente (filtros en la URL), y
 * Next ignora `metadata` en un componente cliente: sin este layout salía con el
 * título genérico del sitio y sin canonical, siendo una de las páginas del
 * sitemap (`e2e/calidad-paginas.spec.ts`).
 */
export const metadata: Metadata = {
  title: TITULO_DESTACADAS,
  description: `${DESCRIPCION_DESTACADAS} Se actualiza ${FRECUENCIA_CATALOGO}.`,
  alternates: { canonical: '/compra-agil' },
};

export default function LayoutCompraAgil({ children }: { children: React.ReactNode }) {
  return children;
}
