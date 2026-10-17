import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { comprasDeOrganismos, frasePrecio, notaCompradores, plata, tituloDeBanda } from '@/lib/publico';
import { predictibilidadInfo } from '@/lib/predictibilidad';
import type { BandaUnidad } from '@/types/publico';

/**
 * La banda de precio de un producto en UNA unidad: P10, P25, P50, P75 y P90.
 *
 * Una por unidad y nunca mezcladas: la misma firma se compra por caja y por
 * unidad, y una banda que juntara las dos mediría el envase, no el precio.
 * Cada banda lleva su propia escala por lo mismo.
 *
 * Sin librería de gráficos: cinco cifras sobre una barra se dibujan con dos
 * cajas, y así la página llega como HTML puro — que es lo que lee Google.
 *
 * **Dice cuántas compras y de cuántos organismos hay detrás**, y de cuándo si
 * le pasan el `periodo` (ya escrito con `textoPeriodo`): un precio de un solo
 * comprador es el de su contrato. Donde el periodo ya está escrito al lado
 * (la cabecera de la ficha de producto), no se le pasa.
 */
export function BandaPrecio({ banda, periodo }: { banda: BandaUnidad; periodo?: string | null }) {
  const { p10, p25, p50, p75, p90 } = banda;
  const info = predictibilidadInfo(banda.predictibilidad ?? undefined);
  const nota = notaCompradores(banda);
  const completa = p10 != null && p90 != null && p90 > p10;
  const pos = (v: number | null) =>
    completa && v != null ? Math.min(100, Math.max(0, ((v - p10) / (p90 - p10)) * 100)) : 0;

  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">
          {tituloDeBanda(banda.unidad)}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {info && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${info.clase}`}>
              {info.etiqueta}
            </span>
          )}
          <ConfidenceBadge n={banda.n} />
        </div>
      </header>

      <p className="mt-4 text-xs text-muted">Precio mediano</p>
      <p className="cifra text-3xl font-bold leading-none text-text">{plata(p50)}</p>

      {completa && (
        // El dibujo es `aria-hidden`: las cinco cifras van debajo y la frase de la
        // mitad central, al pie (docs/GUIA_GRAFICOS.md). P10–P90 en `border`, la
        // mitad central en `dato-tenue` y la mediana, que es la cifra grande, en `dato`.
        <div className="mt-6" aria-hidden="true">
          <div className="relative h-3 rounded-full bg-border">
            <div
              className="absolute inset-y-0 rounded-full bg-dato-tenue"
              style={{ left: `${pos(p25)}%`, width: `${Math.max(1, pos(p75) - pos(p25))}%` }}
            />
            <div
              className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-dato"
              style={{ left: `${pos(p50)}%` }}
            />
          </div>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-5 gap-2 text-center">
        {(
          [
            ['P10', p10],
            ['P25', p25],
            ['P50', p50],
            ['P75', p75],
            ['P90', p90],
          ] as const
        ).map(([etiqueta, valor]) => (
          <div key={etiqueta}>
            <dt className="text-xs text-muted">{etiqueta}</dt>
            <dd className="cifra mt-0.5 text-xs font-semibold text-text sm:text-sm">{plata(valor)}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs text-muted">{frasePrecio(banda)}</p>
      <p className="mt-1 text-xs text-muted">
        {comprasDeOrganismos(banda.n, banda.compradores)}
        {periodo ? `, ${periodo}` : ''}.
      </p>
      {nota && <p className="mt-1 text-xs text-muted">{nota}</p>}
      {banda.predictibilidad === 'baja' && (
        <p className="mt-1 text-xs text-muted">
          Se pagaron precios muy distintos por lo mismo. Mira quién lo compra antes de fijar el tuyo.
        </p>
      )}
    </article>
  );
}
