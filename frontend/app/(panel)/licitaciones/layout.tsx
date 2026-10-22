import type { Metadata } from 'next';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

/*
 * Metadatos del catálogo: la página es cliente y Next ignora ahí `metadata`.
 * El detalle (`[codigo]`) pone su propio canonical, o heredaría éste.
 *
 * El título lleva `template` a propósito: Next sólo pasa a los hijos la plantilla
 * del segmento de arriba, y un título de texto plano aquí la borraba. Cada ficha
 * salía «Licitación 2450-100-LE26», sin « | Tordo» como el resto del sitio.
 */
export const metadata: Metadata = {
  title: {
    default: 'Licitaciones y Compras Ágiles de Mercado Público',
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Busca licitaciones y Compras Ágiles de Mercado Público por producto, comprador, región o monto. En cada una, el plazo y quién le vende a ese comprador.',
  alternates: { canonical: '/licitaciones' },
};

export default function LayoutCatalogo({ children }: { children: React.ReactNode }) {
  return children;
}
