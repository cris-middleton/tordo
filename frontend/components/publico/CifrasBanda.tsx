import { comprasDeOrganismos, notaCompradores, plata } from '@/lib/publico';
import { textoVariacion } from '@/lib/predictibilidad';
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
 * Cuánto se parecen los precios (`textoVariacion`) va bajo la mitad de las
 * compras, que es lo que mide. Antes iban en una tarjeta
 * aparte (P10…P90 con su propia barra), encima del gráfico, y la ficha decía lo
 * mismo tres veces.
 */
export function CifrasBanda({ banda }: { banda: BandaUnidad }) {
  const variacion = textoVariacion(banda.predictibilidad);
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
 */
export function TablaUnidades({ unidades, titulo }: { unidades: BandaUnidad[]; titulo: (u: BandaUnidad) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="py-2 pr-4 font-normal">Se compra</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">Mediana</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">La mitad de las compras</th>
            <th scope="col" className="hidden py-2 pr-4 text-right font-normal sm:table-cell">8 de cada 10 compras</th>
            <th scope="col" className="py-2 text-right font-normal">Cuántas compras</th>
          </tr>
        </thead>
        <tbody>
          {unidades.map((u, i) => (
            <tr key={`${u.unidad ?? 'sin-unidad'}-${i}`} className="border-b border-border">
              <th scope="row" className="py-3 pr-4 text-left font-semibold text-text">
                {titulo(u)}
              </th>
              <td className="cifra whitespace-nowrap py-3 pr-4 text-right font-semibold text-text">{plata(u.p50)}</td>
              <td className="cifra whitespace-nowrap py-3 pr-4 text-right text-muted">{rango(u.p25, u.p75) ?? '—'}</td>
              <td className="cifra hidden whitespace-nowrap py-3 pr-4 text-right text-muted sm:table-cell">
                {rango(u.p10, u.p90) ?? '—'}
              </td>
              <td className="cifra whitespace-nowrap py-3 text-right text-muted">{comprasDeOrganismos(u.n, u.compradores)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
