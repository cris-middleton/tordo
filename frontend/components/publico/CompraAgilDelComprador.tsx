'use client';

import Link from 'next/link';

import { FilaCompraAgil } from '@/components/compraAgil/FilaCompraAgil';
import { CON_PUESTO, mesesDeVentana } from '@/lib/compraAgil';
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
 * esta sección no debería hacer parecer rota una ficha que sí cargó. Pero cada
 * línea dice lo que pasó: con error no se sabe si tiene abiertas, y decir que
 * no tiene sería falso.
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
        {consulta.isError
          ? 'No pudimos traer sus Compras Ágiles abiertas.'
          : 'Este comprador no tiene Compras Ágiles abiertas ahora mismo.'}{' '}
        <Link href="/compra-agil" className="enlace">
          Ver las de todos los compradores
        </Link>
      </p>
    );
  }

  const meses = mesesDeVentana(datos?.ventana_desde ?? null, datos?.ventana_hasta ?? null);
  const Lista = CON_PUESTO ? 'ol' : 'ul';
  return (
    <Lista className="divide-y divide-border border-y border-border" aria-label="Compras Ágiles abiertas de este comprador">
      {items.map((item, i) => (
        <li key={item.codigo_externo}>
          <FilaCompraAgil
            item={item}
            posicion={CON_PUESTO ? i + 1 : undefined}
            actualizadoEn={datos?.actualizado_en ?? null}
            historia={{ meses, disponible: datos?.historia_disponible ?? false }}
          />
        </li>
      ))}
    </Lista>
  );
}
