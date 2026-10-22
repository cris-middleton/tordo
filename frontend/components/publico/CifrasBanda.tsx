import { comprasDeOrganismos, notaCompradores, plata } from '@/lib/publico';
import { textoDiferencia } from '@/lib/predictibilidad';
import type { BandaUnidad } from '@/types/publico';

/** «$167.227 a $320.900», o una sola cifra si las dos se escriben igual. */
export function rango(desde: number | null, hasta: number | null): string | null {
  if (desde == null || hasta == null) return null;
  const a = plata(desde);
  const b = plata(hasta);
  return a === b ? a : `${a} a ${b}`;
}

/**
 * Las cifras de una banda bajo su gráfico: la mediana, la mitad de las compras
 * y 8 de cada 10 compras. De cuántas compras y compradores salen lo dice el pie
 * del gráfico, justo debajo: repetirlo aquí lo ponía dos veces en dos líneas.
 * Cuánto se separan los precios (`textoDiferencia`, con la cifra) va bajo la mitad de
 * las compras, que es lo que mide. Antes iban en una tarjeta
 * aparte (P10…P90 con su propia barra), encima del gráfico, y la ficha decía lo
 * mismo tres veces.
 */
export function CifrasBanda({ banda }: { banda: BandaUnidad }) {
  const variacion = rango(banda.p25, banda.p75)?.includes(' a ') ? textoDiferencia(banda.p25, banda.p75) : null;
  const nota = notaCompradores(banda);
  const cifras: { etiqueta: string; valor: string | null; detalle?: string | null }[] = [
    { etiqueta: 'Mediana', valor: plata(banda.p50), detalle: 'El precio del medio' },
    { etiqueta: 'La mitad de las compras', valor: rango(banda.p25, banda.p75), detalle: variacion },
    { etiqueta: '8 de cada 10 compras', valor: rango(banda.p10, banda.p90) },
  ];
  return (
    <div className="mt-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border py-4 sm:grid-cols-3">
        {cifras
          .filter((c) => c.valor)
          .map((c) => (
            <div key={c.etiqueta} className="min-w-0">
              <dt className="text-sm text-muted">{c.etiqueta}</dt>
              <dd className="cifra mt-1 font-semibold text-text">{c.valor}</dd>
              {c.detalle && <dd className="text-sm text-muted">{c.detalle}</dd>}
            </div>
          ))}
      </dl>
      {nota && <p className="mt-3 text-sm text-muted">{nota}</p>}
      {banda.predictibilidad === 'baja' && (
        <p className="mt-3 text-sm text-muted">
          Con precios tan distintos, la mediana orienta poco. Antes de fijar el tuyo, mira quién lo compra.
        </p>
      )}
    </div>
  );
}

/**
 * Las bandas de un producto, una fila por unidad de medida: cada unidad es otro
 * envase y no se compara con las demás. Sólo cuando hay más de una.
 *
 * **Una sola tabla en los dos anchos**, como `TablaCostos`. Desde `sm`, cinco
 * columnas con filetes. Por debajo, cada fila es una rejilla: la unidad y su
 * mediana en una línea y las demás cifras debajo, cada una con su nombre (los
 * encabezados quedan sólo para el lector de pantalla). A 390 px la tabla se
 * desplazaba de lado y escondía cuántas compras había detrás. Al cambiar el
 * `display`, los roles de tabla van explícitos para que siga siéndolo.
 */
const FILA_UNIDAD =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-border py-3 sm:table-row sm:py-0';
const CELDA_UNIDAD = 'block sm:table-cell sm:py-3';
const DEBAJO = `${CELDA_UNIDAD} col-span-2 text-muted sm:whitespace-nowrap sm:pl-4 sm:text-right`;

/** El nombre de la cifra, sólo bajo `sm` (arriba lo dice el encabezado). */
function NombreEnMovil({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="sm:hidden">
      {children}:{' '}
    </span>
  );
}

export function TablaUnidades({ unidades, titulo }: { unidades: BandaUnidad[]; titulo: (u: BandaUnidad) => string }) {
  return (
    <table role="table" className="block w-full text-sm sm:table">
      <thead role="rowgroup" className="sr-only sm:not-sr-only sm:table-header-group">
        <tr role="row" className="border-b border-border text-left text-muted">
          <th role="columnheader" scope="col" className="py-2 pr-4 font-normal">Se compra</th>
          <th role="columnheader" scope="col" className="py-2 pl-4 text-right font-normal">Mediana</th>
          <th role="columnheader" scope="col" className="py-2 pl-4 text-right font-normal">La mitad de las compras</th>
          <th role="columnheader" scope="col" className="py-2 pl-4 text-right font-normal">8 de cada 10 compras</th>
          <th role="columnheader" scope="col" className="py-2 pl-4 text-right font-normal">Cuántas compras</th>
        </tr>
      </thead>
      <tbody role="rowgroup" className="block border-t border-border sm:table-row-group sm:border-t-0">
        {unidades.map((u, i) => (
          <tr role="row" key={`${u.unidad ?? 'sin-unidad'}-${i}`} className={FILA_UNIDAD}>
            <th role="rowheader" scope="row" className={`${CELDA_UNIDAD} pr-4 text-left font-semibold text-text`}>
              {titulo(u)}
            </th>
            <td role="cell" className={`${CELDA_UNIDAD} cifra whitespace-nowrap text-right font-semibold text-text sm:pl-4`}>
              <span aria-hidden="true" className="font-normal text-muted sm:hidden">
                Mediana{' '}
              </span>
              {plata(u.p50)}
            </td>
            <td role="cell" className={`${DEBAJO} cifra`}>
              <NombreEnMovil>La mitad de las compras</NombreEnMovil>
              {rango(u.p25, u.p75) ?? '—'}
            </td>
            <td role="cell" className={`${DEBAJO} cifra`}>
              <NombreEnMovil>8 de cada 10 compras</NombreEnMovil>
              {rango(u.p10, u.p90) ?? '—'}
            </td>
            <td role="cell" className={`${DEBAJO} cifra`}>
              {comprasDeOrganismos(u.n, u.compradores)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
