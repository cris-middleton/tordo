'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Wrench, Loader2, Search } from 'lucide-react';
import { apiClient } from '@/lib/api';

type Tab = 'matching' | 'precio' | 'descuento' | 'forecast';

interface HerramientasAvanzadasProps {
  rubro: string;
}

interface MatchingResult {
  CodigoProveedor?: string;
  NombreProveedor?: string;
  score?: number;
  n_oc?: number;
  monto_total?: number;
}

function TabMatching() {
  const [texto, setTexto] = useState('');
  const [results, setResults] = useState<MatchingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buscar = async () => {
    if (texto.trim().length < 3) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.getBIMatching({ texto, top_n: 20 });
      if (res.disponible) {
        setResults(res.resultados ?? []);
      } else {
        setError(res.motivo || 'Buscador no disponible');
        setResults([]);
      }
    } catch {
      setError('Error al buscar. Intenta de nuevo.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Escribe un producto o servicio. Te muestro los proveedores históricos que más lo trabajan.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="Ej: respiradores mecánicos, uniformes hospitalarios"
            className="input-field pl-9 w-full text-sm"
          />
        </div>
        <button
          onClick={buscar}
          disabled={loading || texto.trim().length < 3}
          className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {results.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/60 text-left">
                <th className="px-3 py-2 text-xs font-medium text-muted">Proveedor</th>
                <th className="px-3 py-2 text-xs font-medium text-muted">Afinidad</th>
                <th className="px-3 py-2 text-xs font-medium text-muted">OC</th>
                <th className="px-3 py-2 text-xs font-medium text-muted">Monto total</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.CodigoProveedor} className="border-b border-border last:border-0 hover:bg-primary/5">
                  <td className="px-3 py-2 font-medium text-text">{r.NombreProveedor || '—'}</td>
                  <td className="px-3 py-2 text-text">
                    {r.score != null ? `${(r.score * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-text">
                    {r.n_oc?.toLocaleString('es-CL') ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-text">
                    {r.monto_total ? `CLP ${(r.monto_total / 1e6).toFixed(1)}M` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && results.length === 0 && texto.trim().length >= 3 && (
        <p className="text-xs text-muted">No se encontraron resultados para &quot;{texto}&quot;.</p>
      )}
    </div>
  );
}

const TABS: Array<[Tab, string]> = [
  ['matching', 'Buscador semántico'],
  ['precio', 'Precio histórico'],
  ['descuento', 'Descuentos'],
  ['forecast', 'Competencia esperada'],
];

export function HerramientasAvanzadas({ rubro }: HerramientasAvanzadasProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('matching');

  return (
    <section className="card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <div>
            <h2 className="section-title">Herramientas avanzadas</h2>
            <p className="text-xs text-muted mt-0.5">
              Buscador semántico, calculadora de precio, descuentos y pronóstico de competencia.
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted shrink-0" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-[120px]">
            {tab === 'matching' && <TabMatching />}
            {tab === 'precio' && <p className="text-sm text-muted">Próximamente — Task 3.3 agrega la calculadora de precio histórico.</p>}
            {tab === 'descuento' && <p className="text-sm text-muted">Próximamente — Task 3.4 agrega la tabla narrativa de descuentos.</p>}
            {tab === 'forecast' && <p className="text-sm text-muted">Próximamente — Task 3.5 agrega el pronóstico de competencia.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
