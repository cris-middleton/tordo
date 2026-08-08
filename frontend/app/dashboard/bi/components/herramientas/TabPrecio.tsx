'use client';

import { useEffect, useState } from 'react';
import { Info, Loader2, Search } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { useBuscarProductos } from '@/lib/queries';
import type { OrganismoConNombre } from '../../types';
import {
  extractErrorMessage,
  formatCLPShort,
  type PrecioBanda,
  type PrecioResultado,
} from './comun';

interface ProductoOption {
  codigoProductoONU?: string;
  nombre?: string;
  n?: number;
}

export default function TabPrecio({ organismosConNombre }: { organismosConNombre?: OrganismoConNombre[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ProductoOption | null>(null);
  // El desplegable se abría solo al llegar resultados (con un `setShowDropdown`
  // dentro del fetch). Al mover la petición a la consulta eso se habría perdido,
  // así que ahora se DERIVA: hay resultados, el campo no está cerrado a mano y
  // el usuario no ha elegido todavía.
  const [cerradoAMano, setCerradoAMano] = useState(false);
  const [organismo, setOrganismo] = useState('');
  const [resultado, setResultado] = useState<PrecioResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // El retardo se queda como efecto —un temporizador SÍ es un efecto— pero ya no
  // hace la petición: sólo publica el texto retardado, y la consulta reacciona a
  // él. Así desaparece la carrera que tenía el original, donde una respuesta
  // lenta podía pisar a una más reciente.
  const [textoRetardado, setTextoRetardado] = useState('');
  useEffect(() => {
    const buscable = !query || query.trim().length < 2 || selected?.nombre === query ? '' : query;
    const t = setTimeout(() => setTextoRetardado(buscable), 250);
    return () => clearTimeout(t);
  }, [query, selected]);

  const consultaProductos = useBuscarProductos(textoRetardado);
  const resProductos = consultaProductos.data as { disponible?: boolean; resultados?: ProductoOption[] } | undefined;
  const options: ProductoOption[] = resProductos?.disponible ? (resProductos.resultados ?? []) : [];
  const searching = textoRetardado.length >= 2 && consultaProductos.isFetching;

  const consultar = async () => {
    const codigo = selected?.codigoProductoONU?.trim();
    if (!codigo) {
      setError('Selecciona un producto de la lista.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res: PrecioResultado = await apiClient.getBIPrecio(codigo, {
        organismo_id: organismo.trim() || undefined,
      });
      setResultado(res);
      if (!res.disponible) {
        setError(res.motivo || 'Sin datos para este producto.');
      }
    } catch (err) {
      setError(extractErrorMessage(err));
      setResultado(null);
    } finally {
      setLoading(false);
    }
  };

  const banda = resultado?.resultado?.[0];
  const nivelLabel = (nivel?: string) =>
    nivel === 'L1' ? 'datos del organismo específico'
      : nivel === 'L2' ? 'datos del sector'
      : nivel === 'L3' ? 'datos a nivel nacional'
      : nivel || '';

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Busca un producto por nombre. Opcionalmente filtra por organismo.
      </p>

      {/* Combobox producto */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); setCerradoAMano(false); }}
          onFocus={() => setCerradoAMano(false)}
          onBlur={() => { setTimeout(() => setCerradoAMano(true), 150); }}
          placeholder="Escribe al menos 2 letras (ej: uniformes, reactivos, papel)"
          className="input-field pl-9 pr-9 w-full text-sm"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
        )}

        {/* Dropdown con resultados */}
        {!cerradoAMano && !selected && options.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-border bg-surface shadow-xl">
            {options.map((p) => (
              <button
                key={p.codigoProductoONU}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelected(p);
                  setQuery(p.nombre || '');
                  setCerradoAMano(true);
                }}
                className="w-full text-left px-3 py-2 hover:bg-primary/5 border-b border-border last:border-0"
              >
                <p className="text-sm text-text font-medium">{p.nombre}</p>
                <p className="text-xs text-muted">
                  Código {p.codigoProductoONU}
                  {p.n != null && <> · {p.n.toLocaleString('es-CL')} transacciones</>}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Organismo + botón */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        {organismosConNombre && organismosConNombre.length > 0 ? (
          <select
            value={organismo}
            onChange={(e) => setOrganismo(e.target.value)}
            className="input-field text-sm"
          >
            <option value="">Todos los organismos (opcional)</option>
            {organismosConNombre.map((o) => (
              <option key={o.codigo} value={o.codigo} title={o.nombre}>
                {o.nombre.length > 45 ? `${o.nombre.slice(0, 45)}…` : o.nombre}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={organismo}
            onChange={(e) => setOrganismo(e.target.value)}
            placeholder="Organismo (opcional)"
            className="input-field text-sm"
          />
        )}
        <button
          onClick={consultar}
          disabled={loading || !selected}
          className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Consultar'}
        </button>
      </div>

      {error && !banda && (() => {
        const isMissingParquet = error.toLowerCase().includes('parquet') || error.toLowerCase().includes('sin datos');
        return (
          <div className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
            isMissingParquet ? 'border-border bg-surface/60 text-muted' : 'border-danger/30 bg-danger/5 text-danger'
          }`}>
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        );
      })()}

      {banda && banda.p50 != null && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm space-y-2">
          {selected?.nombre && (
            <p className="font-semibold text-text">{selected.nombre}</p>
          )}
          <p className="text-text">
            Precio típico: <b>{formatCLPShort(banda.p50)}</b>
            {banda.p10 != null && banda.p90 != null && (
              <> · rango habitual: <b>{formatCLPShort(banda.p10)}</b> a <b>{formatCLPShort(banda.p90)}</b></>
            )}
            {'.'}
          </p>
          <p className="text-xs text-muted">
            {banda.n != null && <>Basado en <b>{banda.n.toLocaleString('es-CL')}</b> transacciones</>}
            {resultado?.nivel_usado && <> · Fuente: {nivelLabel(resultado.nivel_usado)}</>}
            {banda.confianza && <> · Confianza: {banda.confianza}</>}
          </p>
        </div>
      )}
    </div>
  );
}
