import type { Metadata } from 'next';

/*
 * El detalle es cliente; su título y canonical se ponen aquí. Sin esto heredaba
 * el canonical del catálogo, y un buscador habría tomado cada ficha por una
 * copia del listado.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}): Promise<Metadata> {
  const { codigo } = await params;
  const limpio = decodeURIComponent(codigo);
  return {
    title: `Licitación ${limpio}`,
    description: `Ficha de la licitación ${limpio} de Mercado Público: comprador, plazos, monto y el historial de precios y competencia del comprador.`,
    alternates: { canonical: `/dashboard/tenders/${encodeURIComponent(limpio)}` },
  };
}

export default function LayoutFicha({ children }: { children: React.ReactNode }) {
  return children;
}
