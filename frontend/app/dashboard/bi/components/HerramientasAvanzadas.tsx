'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Wrench, Loader2, Search, Info } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { OrganismoConNombre } from '../types';

function extractErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { detail?: string; motivo?: string } }; message?: string };
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail || e?.response?.data?.motivo;

  if (status === 429) {
    return 'Se agotó tu cuota diaria de búsquedas BI (3 consultas/día en plan básico). Vuelve mañana o actualiza tu plan.';
  }
  if (status === 503) {
    return detail || 'Módulo no disponible en esta instalación.';
  }
  if (status === 401) {
    return 'Sesión expirada. Recarga la página.';
  }
  if (detail) return detail;
  if (e?.message) return `Error: ${e.message}`;
  return 'Error desconocido al consultar.';
}

type Tab = 'matching' | 'precio' | 'descuento' | 'forecast' | 'simular';

interface HerramientasAvanzadasProps {
  rubro: string;
  topOrganismos?: OrganismoConNombre[];
  allRubros?: string[];
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
      .catch((err) => {
        setError(extractErrorMessage(err));
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

interface ProductoOption {
  codigoProductoONU?: string;
  nombre?: string;
  n?: number;
}

function TabPrecio({ organismosConNombre }: { organismosConNombre?: OrganismoConNombre[] }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ProductoOption[]>([]);
  const [selected, setSelected] = useState<ProductoOption | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [organismo, setOrganismo] = useState('');
  const [resultado, setResultado] = useState<PrecioResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Debounced search del autocomplete
  useEffect(() => {
    if (!query || query.trim().length < 2 || selected?.nombre === query) {
      setOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiClient.getBIProductos({ q: query, limit: 20 });
        if (res.disponible) {
          setOptions(res.resultados ?? []);
          setShowDropdown(true);
        }
      } catch {
        setOptions([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, selected]);

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
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          onFocus={() => { if (options.length > 0) setShowDropdown(true); }}
          onBlur={() => { setTimeout(() => setShowDropdown(false), 150); }}
          placeholder="Escribe al menos 2 letras (ej: uniformes, reactivos, papel)"
          className="input-field pl-9 pr-9 w-full text-sm"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
        )}

        {/* Dropdown con resultados */}
        {showDropdown && options.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-border bg-surface shadow-xl">
            {options.map((p) => (
              <button
                key={p.codigoProductoONU}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelected(p);
                  setQuery(p.nombre || '');
                  setShowDropdown(false);
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
    } catch (err) {
      setError(extractErrorMessage(err));
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
  ['simular', '🎯 Simulador pre-bid'],
];

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

function TabSimulador({ rubroInicial, organismosConNombre, allRubros }: {
  rubroInicial: string;
  organismosConNombre?: OrganismoConNombre[];
  allRubros: string[];
}) {
  const [tipo, setTipo] = useState('LP');
  const [rubro, setRubro] = useState(rubroInicial);
  const [organismo, setOrganismo] = useState('');
  const [result, setResult] = useState<SimuladorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sincronizar rubro cuando el user cambia el del panel
  useEffect(() => {
    if (!rubro && rubroInicial) setRubro(rubroInicial);
  }, [rubroInicial, rubro]);

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

export function HerramientasAvanzadas({ rubro, topOrganismos, allRubros = [] }: HerramientasAvanzadasProps) {
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
            {tab === 'simular' && <TabSimulador rubroInicial={rubro} organismosConNombre={topOrganismos} allRubros={allRubros} />}
          </div>
        </div>
      )}
    </section>
  );
}
