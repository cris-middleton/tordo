'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Wrench, Loader2, Search, Info } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { OrganismoConNombre } from '../types';

type Tab = 'matching' | 'precio' | 'descuento' | 'forecast';

interface HerramientasAvanzadasProps {
  rubro: string;
  topOrganismos?: OrganismoConNombre[];
}

interface MatchingResult {
  CodigoProveedor?: string;
  NombreProveedor?: string;
  similarity_score?: number;
  n_oc?: number;
}

interface PrecioBanda {
  p10?: number;
  p50?: number;
  p90?: number;
  n?: number;
  confianza?: string;
  NombreProductoGenerico?: string;
}

interface PrecioResultado {
  disponible: boolean;
  resultado?: PrecioBanda[];
  nivel_usado?: string;
  motivo?: string;
}

interface DescuentoItem {
  n_oferentes_rango?: string;
  p10?: number;
  p50?: number;
  p90?: number;
  senial_competencia?: string;
  n?: number;
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
                <th className="px-3 py-2 text-xs font-medium text-muted">OC históricas</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.CodigoProveedor} className="border-b border-border last:border-0 hover:bg-primary/5">
                  <td className="px-3 py-2 font-medium text-text">{r.NombreProveedor || '—'}</td>
                  <td className="px-3 py-2 text-text">
                    {r.similarity_score != null ? `${(r.similarity_score * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-text">
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

function TabDescuento({ rubro }: { rubro: string }) {
  const [data, setData] = useState<DescuentoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!rubro) {
      setData([]);
      return;
    }
    setLoading(true);
    setError('');
    apiClient
      .getBIDescuento({ rubro })
      .then((res) => {
        if (res.disponible) {
          setData(res.descuentos ?? []);
        } else {
          setError(res.motivo || 'Sin datos de descuento para este rubro.');
          setData([]);
        }
      })
      .catch(() => {
        setError('Error al cargar descuentos.');
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [rubro]);

  if (!rubro) {
    return (
      <p className="text-xs text-muted">
        Selecciona un rubro en el filtro superior para ver descuentos típicos.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Cargando descuentos...
      </div>
    );
  }

  if (error) {
    const isMissingParquet = error.toLowerCase().includes('parquet') || error.toLowerCase().includes('sin datos');
    return (
      <div className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
        isMissingParquet ? 'border-border bg-surface/60 text-muted' : 'border-danger/30 bg-danger/5 text-danger'
      }`}>
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          {isMissingParquet ? (
            <>
              <p className="font-medium text-text">Datos aún no procesados</p>
              <p className="text-xs mt-0.5">
                Esta herramienta requiere que el ETL genere el parquet de descuentos. Contacta al administrador.
              </p>
            </>
          ) : error}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="text-xs text-muted">Sin datos de descuento para este rubro.</p>;
  }

  // Ordenar por rango de oferentes para mostrar progresión competitiva
  const sortOrder: Record<string, number> = { '1': 1, '2-3': 2, '4-5': 3, '4+': 4, '5+': 5, '6+': 6 };
  const ordered = [...data].sort((a, b) => {
    const oa = sortOrder[a.n_oferentes_rango || ''] ?? 99;
    const ob = sortOrder[b.n_oferentes_rango || ''] ?? 99;
    return oa - ob;
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Descuento típico observado según cuántos oferentes compiten por la licitación:
      </p>
      <ul className="space-y-2 text-sm">
        {ordered.slice(0, 6).map((d, i) => (
          <li key={`${d.n_oferentes_rango}-${i}`} className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium shrink-0">
              {d.n_oferentes_rango} oferente{d.n_oferentes_rango !== '1' ? 's' : ''}
            </span>
            <span className="text-text">
              descuento típico{' '}
              <b>{d.p50 != null ? `${d.p50.toFixed(1)}%` : '—'}</b>
              {d.p90 != null && (
                <span className="text-muted"> (hasta {d.p90.toFixed(0)}% en casos competitivos)</span>
              )}
              {d.n != null && (
                <span className="text-xs text-subtle"> · {d.n.toLocaleString('es-CL')} casos</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-subtle">
        Interpreta así: a mayor número de oferentes, mayor presión competitiva y mayor descuento típico.
      </p>
    </div>
  );
}

interface ForecastDataRow {
  n?: number;
  p10?: number;
  p50?: number;
  p90?: number;
  media?: number;
  pct_sin_competencia?: number;
  pct_baja_competencia?: number;
}

interface ForecastResultado {
  disponible: boolean;
  nivel_usado?: string;
  fallback?: boolean;
  data?: ForecastDataRow[];
  motivo?: string;
}

function formatCLPShort(v: number): string {
  if (v >= 1e9) return `CLP ${(v / 1e9).toFixed(1)} mil M`;
  if (v >= 1e6) return `CLP ${(v / 1e6).toFixed(1)} M`;
  if (v >= 1e3) return `CLP ${(v / 1e3).toFixed(0)}K`;
  return `CLP ${Math.round(v).toLocaleString('es-CL')}`;
}

function TabPrecio({ organismosConNombre }: { organismosConNombre?: OrganismoConNombre[] }) {
  const [codigo, setCodigo] = useState('');
  const [organismo, setOrganismo] = useState('');
  const [resultado, setResultado] = useState<PrecioResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const consultar = async () => {
    const codigoTrim = codigo.trim();
    if (codigoTrim.length < 3) return;
    setLoading(true);
    setError('');
    try {
      const res: PrecioResultado = await apiClient.getBIPrecio(codigoTrim, {
        organismo_id: organismo.trim() || undefined,
      });
      setResultado(res);
      if (!res.disponible) {
        setError(res.motivo || 'Sin datos para este código de producto.');
      }
    } catch {
      setError('Error al consultar. Verifica el código ONU y vuelve a intentar.');
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
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted space-y-1">
        <p>
          <b className="text-text">¿Qué es el código ONU?</b> Es el código de 8 dígitos que identifica un producto en el
          catálogo de Mercado Público (ej: <code>41115802</code> para &quot;Reactivos PCR&quot;).
        </p>
        <p>
          Puedes encontrarlo en las bases técnicas de licitaciones o en el catálogo oficial de ChileCompra.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && consultar()}
          placeholder="Código ONU (ej: 41115802)"
          className="input-field text-sm"
        />
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
            onKeyDown={(e) => e.key === 'Enter' && consultar()}
            placeholder="Organismo (opcional)"
            className="input-field text-sm"
          />
        )}
        <button
          onClick={consultar}
          disabled={loading || codigo.trim().length < 3}
          className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Consultar'}
        </button>
      </div>

      {error && !banda && <p className="text-xs text-danger">{error}</p>}

      {banda && banda.p50 != null && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm space-y-2">
          {banda.NombreProductoGenerico && (
            <p className="font-semibold text-text">{banda.NombreProductoGenerico}</p>
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

function TabForecast({ rubro }: { rubro: string }) {
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
        setError(res.motivo || 'Sin datos para esta combinación.');
      }
    } catch {
      setError('Error al consultar. Intenta de nuevo.');
      setResultado(null);
    } finally {
      setLoading(false);
    }
  };

  const nivelLabel = (nivel?: string) =>
    nivel === 'L1' ? 'datos del organismo + rubro + tipo'
      : nivel === 'L2' ? 'datos del rubro + tipo a nivel nacional'
      : nivel === 'L3' ? 'datos del tipo de licitación nivel nacional'
      : nivel || '';

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        ¿Cuántos competidores esperar si postulo a una licitación de este tipo en este rubro/organismo?
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="input-field text-sm"
        >
          <option value="L1">L1 — menor cuantía</option>
          <option value="LE">LE — mediana cuantía</option>
          <option value="LP">LP — pública</option>
        </select>
        <input
          value={organismo}
          onChange={(e) => setOrganismo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && consultar()}
          placeholder="Organismo (opcional)"
          className="input-field text-sm"
        />
        <button
          onClick={consultar}
          disabled={loading}
          className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pronosticar'}
        </button>
      </div>

      {!rubro && (
        <p className="text-xs text-muted">
          Tip: si tienes un rubro seleccionado en el filtro superior, el pronóstico será más preciso.
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
                  <p className="font-medium text-text">Datos aún no procesados</p>
                  <p className="text-xs mt-0.5">
                    Esta herramienta requiere que el ETL genere los parquets de pronóstico. Contacta al administrador.
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
        const media = row.media != null ? row.media.toFixed(1) : null;
        const nCasos = row.n != null ? row.n.toLocaleString('es-CL') : null;

        return (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm space-y-2">
            {p10 != null && p90 != null ? (
              <p className="text-text">
                Este tipo de licitación suele atraer entre <b>{p10}</b> y <b>{p90}</b> competidores
                {media != null && <> (promedio: {media})</>}.
              </p>
            ) : media != null ? (
              <p className="text-text">
                Promedio de competidores para esta combinación: <b>{media}</b>.
              </p>
            ) : (
              <p className="text-muted">Resultado sin rangos disponibles.</p>
            )}
            <p className="text-xs text-muted">
              {nCasos && <>Basado en {nCasos} casos históricos</>}
              {resultado?.nivel_usado && <> · Fuente: {nivelLabel(resultado.nivel_usado)}</>}
              {resultado?.fallback && <> · <span className="italic">fallback a nivel más general</span></>}
            </p>
          </div>
        );
      })()}
    </div>
  );
}

const TABS: Array<[Tab, string]> = [
  ['matching', 'Buscador semántico'],
  ['precio', 'Precio histórico'],
  ['descuento', 'Descuentos'],
  ['forecast', 'Competencia esperada'],
];

export function HerramientasAvanzadas({ rubro, topOrganismos }: HerramientasAvanzadasProps) {
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
            {tab === 'precio' && <TabPrecio organismosConNombre={topOrganismos} />}
            {tab === 'descuento' && <TabDescuento rubro={rubro} />}
            {tab === 'forecast' && <TabForecast rubro={rubro} />}
          </div>
        </div>
      )}
    </section>
  );
}
