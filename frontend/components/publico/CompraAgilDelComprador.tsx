'use client';

import Link from 'next/link';

import TarjetaDestacada from '@/components/compraAgil/TarjetaDestacada';
import { mesesDeVentana } from '@/lib/compraAgil';
import { useCompraAgilDestacadas } from '@/lib/queries';

/**
 * «Compras Ágiles abiertas de este comprador», en la ficha pública.
 *
 * **Se pide en el navegador, no en el servidor**: la ficha está en caché una
 * semana y las Compras Ágiles abren y cierran en horas. Va por `/api/proxy`
 * con la caché corta de `useCompraAgilDestacadas` (cinco minutos), como «Lo
 * mejor de hoy».
 *
 * Vacío o con error, una línea discreta y el enlace a todas: no tener ninguna
 * abierta hoy es lo normal para la mayoría de los compradores, y un fallo de
 * esta sección no debería hacer parecer rota una ficha que sí cargó.
 */
export function CompraAgilDelComprador({ codigo }: { codigo: string }) {
  const consulta = useCompraAgilDestacadas({ codigo_organismo: codigo, limite: 10 });
  const datos = consulta.data;
  const items = datos?.items ?? [];

  if (consulta.isPending) {
    return <p className="text-sm text-subtle">Buscando Compras Ágiles abiertas…</p>;
  }

  if (consulta.isError || items.length === 0) {
    return (
      <p className="text-sm text-subtle">
        Este comprador no tiene Compras Ágiles abiertas ahora mismo.{' '}
        <Link href="/compra-agil" className="font-medium text-primary hover:underline">
          Ver todas las de hoy
        </Link>
      </p>
    );
  }

  const meses = mesesDeVentana(datos?.ventana_desde ?? null, datos?.ventana_hasta ?? null);
  return (
    <ol className="space-y-3" aria-label="Compras Ágiles abiertas de este comprador">
      {items.map((item, i) => (
        <li key={item.codigo_externo}>
          <TarjetaDestacada item={item} posicion={i + 1} mesesVentana={meses} />
        </li>
      ))}
    </ol>
  );
}
