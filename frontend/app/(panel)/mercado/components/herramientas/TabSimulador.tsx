'use client';

import React, { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/api';
import type { OrganismoConNombre } from '../../types';
import { decimal } from '@/lib/formato';

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
    /** Proporción de sus llamados que termina adjudicando. El resto se declara
     *  desierto: es el riesgo de preparar una oferta para nada. Aquí había
     *  `pago_dias`, que ni era un pago ni era del comprador. */
    tasa_adjudicacion: number | null;
    clasificacion: string | null;
    alerta_desierto: boolean;
  } | null;
}

export default function TabSimulador({ rubroInicial, organismosConNombre, allRubros }: {
  rubroInicial: string;
  organismosConNombre?: OrganismoConNombre[];
  allRubros: string[];
}) {
  // Cada etiqueta nombra a su campo por `htmlFor`: sin eso sólo queda al lado.
  const base = useId();
  const idTipo = `${base}-tipo`;
  const idRubro = `${base}-rubro`;
  const idOrganismo = `${base}-organismo`;
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
      setError('Elige un rubro.');
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
          promedio: row.media ?? null,
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
          p50: d.p50 ?? null,
          p90: d.p90 ?? null,
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
        tramitacion?: { tasa_adjudicacion?: number };
        risk_flags?: { licitaciones_fallidas?: boolean };
      };
      comprador = {
        nombre: c.nombre || null,
        tasa_adjudicacion: c.tramitacion?.tasa_adjudicacion ?? null,
        clasificacion: c.clasificacion || null,
        alerta_desierto: !!c.risk_flags?.licitaciones_fallidas,
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
          Postulan entre <b>{forecast.min}</b> y <b>{forecast.max}</b>
          {forecast.promedio != null && <> (en promedio, {decimal(forecast.promedio, 1)})</>}.
        </li>
      );
    } else if (forecast?.promedio != null) {
      bullets.push(
        <li key="forecast-avg">En promedio postulan <b>{decimal(forecast.promedio, 1)}</b>.</li>
      );
    }

    if (descuento?.p50 != null) {
      bullets.push(
        <li key="descuento">
          {descuento.rango_oferentes ? <>Con {descuento.rango_oferentes} postulantes, la</> : 'La'} mitad se
          adjudicó <b>{decimal(descuento.p50, 1)} %</b> o más bajo el presupuesto
          {descuento.p90 != null && <>; 1 de cada 10, {decimal(descuento.p90, 1)} % o más</>}.
        </li>
      );
    }

    if (comprador) {
      if (comprador.tasa_adjudicacion != null) {
        const adjudica = Math.round(comprador.tasa_adjudicacion * 100);
        bullets.push(
          <li key="adjudica">
            Este comprador adjudica el <b>{adjudica} %</b> de lo que licita.
          </li>
        );
      }
      if (comprador.alerta_desierto) {
        bullets.push(
          <li key="alerta" className="text-danger">
            Declara desierta una parte alta de sus licitaciones. Tenlo en cuenta antes de dedicarle
            horas a la oferta.
          </li>
        );
      }
    }

    return bullets.length > 0 ? bullets : null;
  })();

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Elige el tipo de licitación, el rubro y, si quieres, el comprador. Te mostramos cuántos suelen
        postular, cuánto bajo el presupuesto se adjudica y cuánto adjudica ese comprador.
      </p>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label htmlFor={idTipo} className="text-xs text-muted block mb-1">Tipo de licitación</label>
          <select id={idTipo} value={tipo} onChange={(e) => setTipo(e.target.value)} className="input-field w-full">
            <option value="L1">Menor cuantía (L1)</option>
            <option value="LE">Mediana cuantía (LE)</option>
            <option value="LP">Licitación pública (LP)</option>
          </select>
        </div>
        <div>
          <label htmlFor={idRubro} className="text-xs text-muted block mb-1">Rubro</label>
          <select id={idRubro} value={rubro} onChange={(e) => setRubro(e.target.value)} className="input-field w-full">
            <option value="">Elige un rubro</option>
            {allRubros.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={idOrganismo} className="text-xs text-muted block mb-1">Comprador (opcional)</label>
          {organismosConNombre && organismosConNombre.length > 0 ? (
            <select id={idOrganismo} value={organismo} onChange={(e) => setOrganismo(e.target.value)} className="input-field w-full">
              <option value="">Cualquiera</option>
              {organismosConNombre.map((o) => (
                <option key={o.codigo} value={o.codigo} title={o.nombre}>
                  {o.nombre.length > 35 ? `${o.nombre.slice(0, 35)}…` : o.nombre}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={idOrganismo}
              value={organismo}
              onChange={(e) => setOrganismo(e.target.value)}
              placeholder="Código del comprador"
              className="input-field w-full"
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
          <div className="rounded-xl border border-border bg-surface p-4 text-sm">
            <p className="font-semibold text-text mb-2">Si postulas a una licitación {tipo} de {rubro}{organismo && ' con este comprador'}:</p>
            <ul className="space-y-1.5 text-text list-none">
              {narrativa}
            </ul>
          </div>
          {!result.forecast && !result.descuento && !result.comprador && (
            <p className="text-xs text-muted">
              Hay muy pocas licitaciones con esta combinación. Prueba otro tipo o rubro.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
