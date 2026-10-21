import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { codigoDeRutaLicitacion } from '@/lib/licitacionDetalle';
import { licitacionExiste } from '@/lib/licitacionServidor';

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
    alternates: { canonical: `/licitaciones/${encodeURIComponent(limpio)}` },
  };
}

/**
 * Una licitación que no está —borrada por la retención, o un código mal
 * escrito— responde 404 con `noindex` (`notFound()`). Se mira aquí y no en
 * `generateMetadata`, que Next puede enviar después de empezar la respuesta:
 * entonces el 200 ya habría salido. Si el backend no contesta, la ficha se pinta
 * igual y el navegador ofrece reintentar.
 */
export default async function LayoutFicha({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ codigo: string }>;
}) {
  const codigo = codigoDeRutaLicitacion(`/licitaciones/${(await params).codigo}`);
  if (!codigo || !(await licitacionExiste(codigo, await headers()))) notFound();
  return children;
}
