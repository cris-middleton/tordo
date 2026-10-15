import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';

import TarjetaDestacada from '@/components/compraAgil/TarjetaDestacada';
import { CON_PUESTO, DESCRIPCION_DESTACADAS, TITULO_DESTACADAS, mesesDeVentana } from '@/lib/compraAgil';
import { actualizadoEnPalabras } from '@/lib/portada';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';

/**
 * «Lo mejor de hoy» en la portada —o «Cierran pronto», según
 * `TITULO_DESTACADAS`—: las primeras de la lista, pedidas desde el
 * servidor con media hora de caché (`pedirDestacadas`). La página entera, con
 * filtros y RSS, es `/compra-agil`.
 *
 * Si el backend falló no se llega aquí: `app/page.tsx` oculta el bloque.
 */
export function BloqueHoy({ datos }: { datos: CompraAgilDestacadasResponse }) {
  const actualizado = actualizadoEnPalabras(datos.actualizado_en);
  const meses = mesesDeVentana(datos.ventana_desde, datos.ventana_hasta);
  const Lista = CON_PUESTO ? 'ol' : 'ul';

  return (
    <section id="hoy" aria-labelledby="hoy-titulo" className="bg-band2 px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="hoy-titulo" className="flex items-center gap-2 text-2xl font-bold text-text">
              <Zap className="h-6 w-6 text-accent" aria-hidden="true" />
              {TITULO_DESTACADAS}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">{DESCRIPCION_DESTACADAS}</p>
          </div>
          {actualizado && (
            <p className="text-sm text-muted">
              Actualizado el <span className="cifra font-semibold text-text">{actualizado}</span>
            </p>
          )}
        </div>

        {datos.items.length > 0 ? (
          <Lista className="space-y-3" aria-label="Compras Ágiles destacadas de hoy">
            {datos.items.map((item, i) => (
              <li key={item.codigo_externo}>
                <TarjetaDestacada
                  item={item}
                  posicion={CON_PUESTO ? i + 1 : undefined}
                  mesesVentana={meses}
                  actualizadoEn={datos.actualizado_en}
                  historiaDisponible={datos.historia_disponible}
                />
              </li>
            ))}
          </Lista>
        ) : (
          <p className="rounded-xl border border-border bg-surface px-5 py-6 text-sm text-muted">
            Ahora mismo no hay Compras Ágiles abiertas que cierren en más de dos horas. La lista se
            renueva varias veces al día.
          </p>
        )}

        <Link
          href="/compra-agil"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          Ver la lista completa, por región y con RSS
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
