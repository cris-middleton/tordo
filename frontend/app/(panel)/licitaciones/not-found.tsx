'use client';

import { usePathname } from 'next/navigation';

import { FueraDelCatalogo } from '@/components/licitacion/FueraDelCatalogo';
import { codigoDeRutaLicitacion } from '@/lib/licitacionDetalle';

/**
 * El 404 de una ficha de licitación (`[codigo]/layout.tsx` llama a
 * `notFound()`): dice por qué suele faltar una y enlaza a Mercado Público con
 * su código. Un `not-found` no recibe `params`, así que el código sale de la
 * ruta. Next pone el `noindex`.
 */
export default function LicitacionNoEncontrada() {
  const codigo = codigoDeRutaLicitacion(usePathname());
  return (
    <div>
      <h1 className="page-title break-words">No tenemos esta licitación</h1>
      {codigo && <p className="mt-1 font-mono text-sm text-subtle">{codigo}</p>}
      <div className="mt-6">
        <FueraDelCatalogo codigo={codigo} />
      </div>
    </div>
  );
}
