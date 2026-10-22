import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { urlMercadoPublico } from '@/lib/compraAgil';

/**
 * Una licitación que no está en el catálogo. Casi siempre salió por la
 * retención (`etl/retencion.py`): las licitaciones, 90 días después de cerrar;
 * las Compras Ágiles, entre uno y dos meses después de publicarse. Antes la
 * ficha decía en rojo «No pudimos cargar la información», como si fuera una
 * caída, y ofrecía nada.
 */
export function FueraDelCatalogo({ codigo }: { codigo: string | null }) {
  return (
    <div className="lectura max-w-3xl space-y-4">
      <p className="text-text">
        Guardamos cada licitación hasta 90 días después de su cierre, y cada Compra Ágil entre uno y
        dos meses desde que se publica. Si el código está bien escrito, la encuentras en Mercado
        Público.
      </p>
      <div className="flex flex-wrap gap-2">
        {codigo && (
          <a
            href={urlMercadoPublico(codigo)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex h-11 items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Buscarla en Mercado Público
          </a>
        )}
        <Link href="/licitaciones" className="btn-secondary flex h-11 items-center">
          Ver las licitaciones abiertas
        </Link>
      </div>
    </div>
  );
}
