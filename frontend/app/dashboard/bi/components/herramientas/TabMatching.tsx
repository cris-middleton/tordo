'use client';

import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { extractErrorMessage, type MatchingResult } from './comun';
import { motivoParaPersona } from '@/lib/motivos';

export default function TabMatching() {
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
        setError(motivoParaPersona(res.motivo, 'La búsqueda no está disponible ahora mismo.'));
        setResults([]);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
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
                <th className="px-3 py-2 text-xs font-medium text-muted">Encaje</th>
                <th className="px-3 py-2 text-xs font-medium text-muted">Órdenes</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.CodigoProveedor} className="border-b border-border last:border-0 hover:bg-primary/5">
                  <td className="px-3 py-2 font-medium text-text">{r.NombreProveedor || '—'}</td>
                  <td className="cifra px-3 py-2 text-text">
                    {r.similarity_score != null ? `${(r.similarity_score * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="cifra px-3 py-2 text-text">
                    {r.n_oc?.toLocaleString('es-CL') ?? '—'}
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
