'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/api';
import type { OrganismoConNombre } from '../../types';

interface SimuladorResult {
  forecast: {
    min: number | null;
    max: number | null;
    promedio: number | null;
    confianza: string | null;
    nivel: string | null;
  } | null;
  descuento: {
    p50: number | null;
    p90: number | null;
    rango_oferentes: string | null;
  } | null;
  comprador: {
    nombre: string | null;
    pago_dias: number | null;
    clasificacion: string | null;
    alerta_pago_lento: boolean;
  } | null;
}

export default function TabSimulador({ rubroInicial, organismosConNombre, allRubros }: {
  rubroInicial: string;
  organismosConNombre?: OrganismoConNombre[];
  allRubros: string[];
}) {
  const [tipo, setTipo] = useState('LP');
  // Se deriva del rubro del panel mientras el usuario no elija otro, en vez de
  // sincronizarlo con un efecto.
  const [rubroElegido, setRubro] = useState('');
  const rubro = rubroElegido || rubroInicial;
  const [organismo, setOrganismo] = useState('');
  const [result, setResult] = useState<SimuladorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');


  const simular = async () => {
    if (!rubro) {
      setError('Selecciona un rubro.');
      return;
    }
    setLoading(true);
    setError('');

    const [forecastRes, descuentoRes, compradorRes] = await Promise.allSettled([
      apiClient.getBIForecastCompetidores({
        tipo,
        rubro,
        organismo_id: organismo.trim() || undefined,
      }),
      apiClient.getBIDescuento({
        tipo,
        rubro,
        n_oferentes_rango: '4+',
      }),
      organismo.trim()
        ? apiClient.getBIComprador(organismo.trim())
        : Promise.resolve({ disponible: false }),
    ]);

    // Parsear forecast
    let forecast: SimuladorResult['forecast'] = null;
    if (forecastRes.status === 'fulfilled' && forecastRes.value?.disponible) {
      const row = forecastRes.value.data?.[0];
      if (row) {
        forecast = {
          min: row.p10 != null ? Math.round(row.p10) : null,
          max: row.p90 != null ? Math.round(row.p90) : null,
          promedio: row.media != null ? parseFloat(row.media.toFixed(1)) : null,
          confianza: row.pct_sin_competencia != null && row.pct_sin_competencia < 0.1 ? 'alta' : 'media',
          nivel: forecastRes.value.nivel_usado || null,
        };
      }
    }

    // Parsear descuento
    let descuento: SimuladorResult['descuento'] = null;
    if (descuentoRes.status === 'fulfilled' && descuentoRes.value?.disponible) {
      const d = descuentoRes.value.descuentos?.[0];
      if (d) {
        descuento = {
          p50: d.p50 != null ? parseFloat(d.p50.toFixed(1)) : null,
          p90: d.p90 != null ? parseFloat(d.p90.toFixed(1)) : null,
          rango_oferentes: d.n_oferentes_rango || null,
        };
      }
    }

    // Parsear comprador
    let comprador: SimuladorResult['comprador'] = null;
    if (compradorRes.status === 'fulfilled' && (compradorRes.value as { disponible?: boolean })?.disponible) {
      const c = compradorRes.value as {
        nombre?: string;
        clasificacion?: string;
        pago?: { mediana_dias_pago?: number };
        risk_flags?: { pago_lento?: boolean };
      };
      comprador = {
        nombre: c.nombre || null,
        pago_dias: c.pago?.mediana_dias_pago != null ? Math.round(c.pago.mediana_dias_pago) : null,
        clasificacion: c.clasificacion || null,
        alerta_pago_lento: !!c.risk_flags?.pago_lento,
      };
    }

    setResult({ forecast, descuento, comprador });
    setLoading(false);
  };

  // Copy narrativa para mostrar
  const narrativa = (() => {
    if (!result) return null;
    const { forecast, descuento, comprador } = result;
    const bullets: React.ReactNode[] = [];

    if (forecast?.min != null && forecast?.max != null) {
      bullets.push(
        <li key="forecast">
          Esperas entre <b>{forecast.min}</b> y <b>{forecast.max}</b> competidores
          {forecast.promedio != null && <> (promedio: {forecast.promedio})</>}.
        </li>
      );
    } else if (forecast?.promedio != null) {
      bullets.push(
        <li key="forecast-avg">Competencia promedio: <b>{forecast.promedio}</b> oferentes.</li>
      );
    }

    if (descuento?.p50 != null) {
      bullets.push(
        <li key="descuento">
          Descuento típico: <b>{descuento.p50}%</b>
          {descuento.p90 != null && <> (hasta {descuento.p90}% en casos muy competitivos)</>}.
        </li>
      );
    }

    if (comprador) {
      if (comprador.pago_dias != null) {
        const labelPago =
          comprador.clasificacion === 'bueno' ? 'buen pagador' :
          comprador.clasificacion === 'medio' ? 'pago normal' :
          comprador.clasificacion === 'lento' ? 'pago lento' : 'sin clasificar';
        const diasTexto =
          comprador.pago_dias === 0 ? 'el mismo día' :
          comprador.pago_dias === 1 ? 'al día siguiente' :
          `en ~${comprador.pago_dias} días`;
        bullets.push(
          <li key="pago">
            El comprador paga <b>{diasTexto}</b> ({labelPago}).
          </li>
        );
      }
      if (comprador.alerta_pago_lento) {
        bullets.push(
          <li key="alerta" className="text-danger">
            ⚠ Alerta: este comprador tiene historial de pagos lentos.
          </li>
        );
      }
    }

    return bullets.length > 0 ? bullets : null;
  })();

  // Veredicto heurístico: "Alta conveniencia" / "Media" / "Baja"
  const veredicto = (() => {
    if (!result) return null;
    const { forecast, descuento, comprador } = result;
    let puntos = 0;
    let totales = 0;

    if (forecast?.min != null) {
      totales++;
      if (forecast.min <= 3) puntos++; // poca competencia = bueno
    }
    if (descuento?.p50 != null) {
      totales++;
      if (descuento.p50 < 10) puntos++; // descuento típico bajo = bueno
    }
    if (comprador) {
      totales++;
      if (comprador.clasificacion === 'bueno' && !comprador.alerta_pago_lento) puntos++;
    }

    if (totales === 0) return null;
    const ratio = puntos / totales;
    if (ratio >= 0.67) return { label: 'Alta conveniencia', color: 'text-accent', bg: 'bg-accent/10 border-accent/30' };
    if (ratio >= 0.34) return { label: 'Conveniencia media', color: 'text-gold', bg: 'bg-gold/10 border-gold/30' };
    return { label: 'Baja conveniencia', color: 'text-danger', bg: 'bg-danger/10 border-danger/30' };
  })();

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Si postularas a una licitación hipotética con estos parámetros, ¿qué esperar?
      </p>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted block mb-1">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input-field text-sm w-full">
            <option value="L1">L1 — menor cuantía</option>
            <option value="LE">LE — mediana cuantía</option>
            <option value="LP">LP — pública</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Rubro</label>
          <select value={rubro} onChange={(e) => setRubro(e.target.value)} className="input-field text-sm w-full">
            <option value="">Selecciona rubro</option>
            {allRubros.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Organismo (opcional)</label>
          {organismosConNombre && organismosConNombre.length > 0 ? (
            <select value={organismo} onChange={(e) => setOrganismo(e.target.value)} className="input-field text-sm w-full">
              <option value="">Cualquiera</option>
              {organismosConNombre.map((o) => (
                <option key={o.codigo} value={o.codigo} title={o.nombre}>
                  {o.nombre.length > 35 ? `${o.nombre.slice(0, 35)}…` : o.nombre}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={organismo}
              onChange={(e) => setOrganismo(e.target.value)}
              placeholder="Código organismo"
              className="input-field text-sm w-full"
            />
          )}
        </div>
      </div>

      <button
        onClick={simular}
        disabled={loading || !rubro}
        className="btn-primary text-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Simular'}
      </button>

      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Resultado */}
      {result && narrativa && (
        <div className="space-y-3 pt-2">
          {veredicto && (
            <div className={`rounded-xl border p-3 text-sm font-semibold ${veredicto.bg} ${veredicto.color}`}>
              Veredicto: {veredicto.label}
            </div>
          )}
          <div className="rounded-xl border border-border bg-surface p-4 text-sm">
            <p className="font-semibold text-text mb-2">Si postulas a una {tipo} en {rubro}{organismo && ', con este organismo,'}:</p>
            <ul className="space-y-1.5 text-text list-none">
              {narrativa}
            </ul>
          </div>
          {!result.forecast && !result.descuento && !result.comprador && (
            <p className="text-xs text-muted">
              Sin datos suficientes para esta combinación. Intenta con otro tipo o rubro.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
