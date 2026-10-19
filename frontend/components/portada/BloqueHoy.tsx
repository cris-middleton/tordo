import Link from 'next/link';

import { CLASE_SECCION } from '@/components/cascara/Seccion';

import { FilaCompraAgil } from '@/components/compraAgil/FilaCompraAgil';
import { CON_PUESTO, descripcionDestacadas, TITULO_DESTACADAS } from '@/lib/compraAgil';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';

/**
 * «Lo mejor de hoy» en la portada —o «Cierran pronto», según
 * `TITULO_DESTACADAS`—, compacto (spec del rediseño §6.3): las primeras de la
 * lista en filas, pedidas desde el servidor con media hora de caché
 * (`pedirDestacadas`). La lista entera, con filtros y RSS, es `/compra-agil`.
 *
 * Si el backend falló, o su hora no se puede leer, no se llega aquí: la portada
 * oculta el bloque (principio 4). `actualizado` es esa hora ya leída
 * (`actualizadoEnPalabras`); la lee la portada, que es quien decide si pintar, y
 * aquí no se vuelve a leer. Lleva su propia hora porque la franja de la portada
 * puede faltar sin él; **cuando la franja está, no la repite**
 * (`horaEnLaFranja`): «Actualizado el …» dos veces a pocos centímetros es ruido.
 * La hora se sigue exigiendo para pintar el bloque.
 */
export function BloqueHoy({
  datos,
  actualizado,
  horaEnLaFranja = false,
}: {
  datos: CompraAgilDestacadasResponse;
  /** «mar, 13 oct, 09:30»: la hora de `datos.actualizado_en`, en palabras y en hora de Chile. */
  actualizado: string;
  /** La portada ya dice la hora en su franja: aquí no se repite. Por defecto, sí se dice. */
  horaEnLaFranja?: boolean;
}) {
  const Lista = CON_PUESTO ? 'ol' : 'ul';

  return (
    <section id="hoy" aria-labelledby="hoy-titulo" className={CLASE_SECCION}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="hoy-titulo" className="section-title">
          {TITULO_DESTACADAS}
        </h2>
        <Link
          href="/compra-agil"
          aria-label={`Ver todas: ${TITULO_DESTACADAS}`}
          className="enlace py-1 text-sm"
        >
          Ver todas
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted">
        {descripcionDestacadas(datos.historia_disponible === true)}
        {!horaEnLaFranja && (
          <>
            {' '}
            Actualizado el <span className="cifra">{actualizado}</span>.
          </>
        )}
      </p>

      {datos.items.length > 0 ? (
        <Lista
          aria-label="Compras Ágiles destacadas de hoy"
          className="mt-4 divide-y divide-border border-y border-border"
        >
          {datos.items.map((item, i) => (
            <li key={item.codigo_externo}>
              <FilaCompraAgil
                item={item}
                posicion={CON_PUESTO ? i + 1 : undefined}
                actualizadoEn={datos.actualizado_en}
              />
            </li>
          ))}
        </Lista>
      ) : (
        <p className="mt-4 rounded-xl border border-border bg-surface px-6 py-6 text-sm text-muted">
          Ahora mismo no hay Compras Ágiles abiertas que cierren en más de dos horas. La lista se renueva
          varias veces al día.
        </p>
      )}
    </section>
  );
}
