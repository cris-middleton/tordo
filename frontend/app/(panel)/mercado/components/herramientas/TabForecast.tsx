'use client';

import { useState } from 'react';
import { Info, Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { extractErrorMessage, formatCLPShort, type ForecastResultado } from './comun';
import { motivoParaPersona } from '@/lib/motivos';
import { decimal } from '@/lib/formato';

export default function TabForecast({ rubro }: { rubro: string }) {
  const [tipo, setTipo] = useState('LP');
  const [organismo, setOrganismo] = useState('');
  const [resultado, setResultado] = useState<ForecastResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const consultar = async () => {
    setLoading(true);
    setError('');
    try {
      const res: ForecastResultado = await apiClient.getBIForecastCompetidores({
        tipo,
        rubro: rubro || undefined,
        organismo_id: organismo.trim() || undefined,
      });
      setResultado(res);
      if (!res.disponible) {
        setError(motivoParaPersona(res.motivo, 'Sin datos de licitaciones con esta combinación.'));
      }
    } catch (err) {
      setError(extractErrorMessage(err));
      setResultado(null);
    } finally {
      setLoading(false);
    }
  };

  const nivelLabel = (nivel?: string) =>
    nivel === 'L1' ? 'del mismo comprador, rubro y tipo'
      : nivel === 'L2' ? 'del mismo rubro y tipo, en todo el Estado'
      : nivel === 'L3' ? 'del mismo tipo, en todo el Estado'
      : nivel || '';

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Cuántos suelen postular a una licitación como la tuya, según su tipo, el rubro y el comprador.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2">
        <select
          aria-label="Tipo de licitación"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="input-field"
        >
          <option value="L1">Menor cuantía (L1)</option>
          <option value="LE">Mediana cuantía (LE)</option>
          <option value="LP">Licitación pública (LP)</option>
        </select>
        <input
          value={organismo}
          onChange={(e) => setOrganismo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && consultar()}
          placeholder="Código del comprador (opcional)"
          className="input-field"
        />
        <button
          onClick={consultar}
          disabled={loading}
          className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ver cuántos postulan'}
        </button>
      </div>

      {!rubro && (
        <p className="text-xs text-muted">
          Elige un rubro arriba y el cálculo mira sólo ese rubro.
        </p>
      )}

      {error && !resultado?.data?.[0] && (() => {
        const isMissingParquet = error.toLowerCase().includes('parquet') || error.toLowerCase().includes('sin datos');
        return (
          <div className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
            isMissingParquet ? 'border-border bg-surface/60 text-muted' : 'border-danger/30 bg-danger/5 text-danger'
          }`}>
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              {isMissingParquet ? (
                <>
                  <p className="font-medium text-text">Todavía no calculamos cuántos postulan aquí</p>
                  <p className="text-xs mt-0.5">
                    Si lo necesitas, escríbenos a hola@tordo.cl.
                  </p>
                </>
              ) : error}
            </div>
          </div>
        );
      })()}

      {(() => {
        const row = resultado?.data?.[0];
        if (!row) return null;
        const p10 = row.p10 != null ? Math.round(row.p10) : null;
        const p90 = row.p90 != null ? Math.round(row.p90) : null;
        const media = row.media != null ? decimal(row.media, 1) : null;
        const nCasos = row.n != null ? row.n.toLocaleString('es-CL') : null;

        return (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm space-y-2">
            {p10 != null && p90 != null ? (
              <p className="text-text">
                En 8 de cada 10 licitaciones así postularon entre <b>{p10}</b> y <b>{p90}</b>
                {media != null && <> (en promedio, {media})</>}.
              </p>
            ) : media != null ? (
              <p className="text-text">
                En promedio postulan <b>{media}</b>.
              </p>
            ) : (
              <p className="text-muted">No hay suficientes licitaciones para dar un rango.</p>
            )}
            <p className="text-xs text-muted">
              {nCasos && <>Sale de {nCasos} licitaciones anteriores</>}
              {resultado?.nivel_usado && <> {nivelLabel(resultado.nivel_usado)}</>}
              {resultado?.fallback && <>. Con tu combinación había muy pocas, así que miramos un grupo más amplio</>}
              {(nCasos || resultado?.nivel_usado || resultado?.fallback) && '.'}
            </p>
          </div>
        );
      })()}
    </div>
  );
}
