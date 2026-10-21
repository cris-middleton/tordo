'use client';

import { useRef } from 'react';
import { Loader2 } from 'lucide-react';

import { EligeRubro } from '@/components/bi/EligeRubro';
import { Columnas } from '@/components/graficos/Columnas';
import { decimal, monto } from '@/lib/formato';

import { SerieAnualPunto } from '../types';
import { ShareMenu } from './ShareMenu';

interface TendenciasSectionProps {
  loading: boolean;
  selectedRubro: string;
  serieAnual?: SerieAnualPunto[] | null;
  cagrRubro?: number | null;
}

const conSigno = (v: number, digitos = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${decimal(Math.abs(v), digitos)} %`;

/**
 * Cuánto se compró en el rubro cada año: una columna por año con su monto, el
 * último en `dato`, y la conclusión arriba en palabras («crece 12,4 % al año»).
 *
 * Antes era una curva de Recharts con el crecimiento en verde o rojo según el
 * signo —el color como juicio— y, sin rubro, un ranking de 12 rubros en barras;
 * desde que `/mercado` abre siempre con un rubro, esa rama no se pintaba nunca.
 */
export function TendenciasSection({ loading, selectedRubro, serieAnual, cagrRubro }: TendenciasSectionProps) {
  const rootRef = useRef<HTMLElement>(null);

  if (!selectedRubro) return <EligeRubro que="ver cómo viene creciendo ese mercado" />;
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  // Sólo la cifra del rubro, que viene en porcentaje. Había un respaldo a la
  // fila de `tendencias`, que es UN organismo en el rubro y trae el CAGR como
  // fracción: un 25 % salía «0,3 % al año». Sin la cifra del rubro, no se dice.
  const cagr = cagrRubro ?? null;
  const serie = serieAnual ?? [];
  const ordenes = serie.every((p) => p.n_oc != null)
    ? serie.reduce((suma, p) => suma + (p.n_oc ?? 0), 0)
    : null;
  const primero = serie[0]?.anio;
  const ultimo = serie.at(-1)?.anio;
  const conclusion =
    cagr == null
      ? null
      : `${cagr >= 0 ? 'Crece' : 'Cae'} ${decimal(Math.abs(cagr), 1)} % al año${primero && ultimo ? ` entre ${primero} y ${ultimo}` : ''}.`;
  const resumen = conclusion ? `${selectedRubro}: ${conclusion}` : selectedRubro;

  let interanual: string | null = null;
  if (serie.length >= 2) {
    const [antes, despues] = serie.slice(-2);
    if (antes.monto_total > 0) {
      interanual = `${conSigno((despues.monto_total / antes.monto_total - 1) * 100)} en ${despues.anio} frente a ${antes.anio}`;
    }
  }

  return (
    <section ref={rootRef} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-sans text-lg font-semibold text-text">Cómo viene creciendo</h3>
          <p className="mt-1 text-sm text-muted">
            Monto en órdenes de compra del rubro, por año, de todos los organismos.
          </p>
        </div>
        <ShareMenu
          targetRef={rootRef}
          summaryText={resumen}
          filename={`tendencia-${selectedRubro.replace(/\s+/g, '-').toLowerCase()}`}
        />
      </div>

      {serie.length >= 2 ? (
        <div className="max-w-3xl">
          {conclusion && <p className="font-semibold text-text">{conclusion}</p>}
          {interanual && <p className="mt-1 text-sm text-muted">{interanual}.</p>}
          <div className="mt-4">
            <Columnas
              etiqueta="Monto en órdenes de compra por año"
              columnas={serie.map((p, i) => ({
                clave: String(p.anio),
                etiqueta: String(p.anio),
                valor: p.monto_total,
                texto: monto(p.monto_total),
                destacada: i === serie.length - 1,
              }))}
            />
          </div>
          {ordenes != null && (
            <p className="mt-3 text-sm text-muted">
              {ordenes.toLocaleString('es-CL')} órdenes de compra en {serie.length} años completos.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Este rubro no tiene dos años completos para comparar.</p>
      )}
    </section>
  );
}
