import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { entero, plata } from '@/lib/publico';
import { predictibilidadInfo } from '@/lib/predictibilidad';
import type { BandaUnidad } from '@/types/publico';

/**
 * La banda de precio de un producto en UNA unidad: P10·P25·P50·P75·P90.
 *
 * Una por unidad y nunca mezcladas: la misma firma se compra por caja y por
 * unidad, y una banda que juntara las dos mediría el envase, no el precio.
 * Cada banda lleva su propia escala por lo mismo.
 *
 * Sin librería de gráficos: cinco cifras sobre una barra se dibujan con dos
 * cajas, y así la página llega como HTML puro — que es lo que lee Google.
 */
export function BandaPrecio({ banda }: { banda: BandaUnidad }) {
  const { p10, p25, p50, p75, p90 } = banda;
  const info = predictibilidadInfo(banda.predictibilidad ?? undefined);
  const completa = p10 != null && p90 != null && p90 > p10;
  const pos = (v: number | null) =>
    completa && v != null ? Math.min(100, Math.max(0, ((v - p10) / (p90 - p10)) * 100)) : 0;

  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">
          Por {banda.unidad?.toLowerCase() || 'unidad'}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {info && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${info.clase}`}>
              {info.etiqueta}
            </span>
          )}
          <ConfidenceBadge n={banda.n} />
        </div>
      </header>

      <p className="mt-4 text-[11px] uppercase tracking-wider text-subtle">Precio mediano</p>
      <p className="cifra text-3xl font-bold leading-none text-text">{plata(p50)}</p>

      {completa && (
        <div className="mt-6" role="img" aria-label={`Banda de precios: la mitad de las compras entre ${plata(p25)} y ${plata(p75)}`}>
          <div className="relative h-3 rounded-full bg-primary/15">
            <div
              className="absolute inset-y-0 rounded-full bg-accent/40"
              style={{ left: `${pos(p25)}%`, width: `${Math.max(1, pos(p75) - pos(p25))}%` }}
            />
            <div
              className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-accent"
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
            <dt className="text-[10px] uppercase tracking-wider text-subtle">{etiqueta}</dt>
            <dd className="cifra mt-0.5 text-xs font-semibold text-text sm:text-sm">{plata(valor)}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs text-muted">
        La mitad de las {entero(banda.n)} compras pagó entre {plata(p25)} y {plata(p75)}.
        {banda.predictibilidad === 'baja' &&
          ' La dispersión es alta: en este producto el precio no es lo que decide la adjudicación.'}
      </p>
    </article>
  );
}
