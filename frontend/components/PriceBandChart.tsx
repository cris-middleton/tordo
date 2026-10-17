'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ConfidenceBadge } from './ConfidenceBadge';
import { decimal } from '@/lib/formato';

interface PrecioFallback {
  disponible: boolean;
  codigo_producto?: string | null;
  nivel_usado?: string | null;
  fallback?: boolean;
  p10?: number | null;
  p25?: number | null;
  p50?: number | null;
  p75?: number | null;
  p90?: number | null;
  confianza?: string | null;
  n?: number | null;
}

interface PriceBandChartProps {
  precios: PrecioFallback[];
}

const fmtCLP = (v?: number | null): string => {
  if (v == null) return '—';
  if (v >= 1_000_000) return `CLP ${decimal(v / 1_000_000, 1)}M`;
  if (v >= 1_000) return `CLP ${decimal(v / 1_000, 0)}K`;
  return `CLP ${decimal(v, 0)}`;
};

/**
 * Los tokens son tripletes («84 99 122»): la variable a secas, sin `rgb()`, no es un
 * color, y el tooltip salía sin fondo, con el texto encima del gráfico. Van dentro
 * de `rgb()`, y en `style`: un atributo SVG no sabe leer `var()` en todos los navegadores.
 */
const TINTA_SUAVE = 'rgb(var(--color-muted))';

const nivelLabel: Record<string, string> = {
  L1: 'datos del organismo',
  L2: 'datos del sector',
  L3: 'datos nacionales',
};

function ProductPriceSection({ p }: { p: PrecioFallback }) {
  const n = p.n ?? 0;

  if (!p.disponible) {
    return (
      <div className="py-3 text-sm text-muted">
        Sin datos de precios para este producto.
      </div>
    );
  }

  if (n < 5) {
    return (
      <div className="flex flex-col gap-2 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text">
            Precio de referencia:{' '}
            <span className="text-accent font-semibold">{fmtCLP(p.p50)}</span>
            <span className="text-muted font-normal">
              {' '}(mediana — datos insuficientes para bandas)
            </span>
          </span>
          <ConfidenceBadge n={n} />
        </div>
      </div>
    );
  }

  // La mediana en `dato` y el resto en `dato-tenue`, por clase: el CSS le gana al
  // `fill` que Recharts escribe como atributo, y así siguen al tema.
  const chartData = [
    { label: 'P10', value: p.p10, clase: 'fill-dato-tenue' },
    { label: 'P25', value: p.p25, clase: 'fill-dato-tenue' },
    { label: 'P50', value: p.p50, clase: 'fill-dato' },
    { label: 'P75', value: p.p75, clase: 'fill-dato-tenue' },
    { label: 'P90', value: p.p90, clase: 'fill-dato-tenue' },
  ];

  const nivelDesc = p.nivel_usado ? nivelLabel[p.nivel_usado] ?? p.nivel_usado : null;

  return (
    <div className="flex flex-col gap-2">
      {nivelDesc && (
        <p className="text-xs text-muted">
          Nivel: {p.nivel_usado} ({nivelDesc})
        </p>
      )}

      <div className="relative">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, style: { fill: TINTA_SUAVE } }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => fmtCLP(v)}
              width={80}
              tick={{ fontSize: 12, style: { fill: TINTA_SUAVE } }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v: number) => [fmtCLP(v), 'Precio']}
              contentStyle={{
                background: 'rgb(var(--color-surface))',
                border: '1px solid rgb(var(--color-border))',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: 'rgb(var(--color-text))', fontWeight: 600 }}
              itemStyle={{ color: 'rgb(var(--color-text))' }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} className={d.clase} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted">
          Actualizado — datos históricos de {n} transacciones
        </p>
        {p.fallback && (
          <p className="text-xs text-gold bg-gold/10 border border-gold/20 rounded px-2 py-1 w-fit">
            Referencia por sector (sin datos específicos del organismo)
          </p>
        )}
      </div>
    </div>
  );
}

export function PriceBandChart({ precios }: PriceBandChartProps) {
  if (!precios || precios.length === 0) {
    return (
      <div className="card">
        <p className="text-sm text-muted">Sin referencias de precios disponibles.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {precios.map((p, idx) => {
        const productLabel = p.codigo_producto
          ? `Producto ${p.codigo_producto}`
          : `Producto ${idx + 1}`;
        const n = p.n ?? 0;

        return (
          <div key={p.codigo_producto ?? idx} className="card">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h3 className="section-title">
                Referencia de precios — {productLabel}
              </h3>
              {p.disponible && <ConfidenceBadge n={n} />}
            </div>
            <ProductPriceSection p={p} />
          </div>
        );
      })}
    </div>
  );
}
