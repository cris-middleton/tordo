'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  BarChart3,
  Search,
  TrendingUp,
  Users,
  Target,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Settings2,
  X,
  Check,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProveedorMatch {
  CodigoProveedor: string;
  NombreProveedor?: string;
  n_oc?: number;
  similarity_score: number;
}

interface ClusterItem {
  cluster_id: number;
  label: string;
  keywords?: string;
  n_productos?: number;
  rubro_dominante?: string;
}

interface TFIDFPerfilData {
  empresa_id: string;
  rubros_usados?: string[];
  modelo_version?: string;
  actualizado_en?: string;
  tiene_vector: boolean;
}

interface BINotAvailable {
  disponible: false;
  motivo: string;
}

interface OportunidadItem {
  CodigoOrganismoPublico: string;
  RubroN2: string;
  opportunity_score: number;
  n_transacciones: number;
  coef_variacion: number;
  hhi: number;
  n_proveedores: number;
  cagr: number;
}

interface CompetidorItem {
  CodigoProveedor: string;
  NombreProveedor: string;
  RubroN2: string;
  market_share_pct: number;
  win_rate_pct: number;
  rank_monto: number;
  n_oc: number;
}

interface CompradorResult {
  disponible: boolean;
  nombre?: string;
  buyer_score?: number;
  clasificacion?: string;
  pago?: {
    mediana_dias_pago?: number;
    tasa_cancelacion?: number;
    tasa_adjudicacion?: number;
  };
  risk_flags?: {
    n_flags: number;
    pago_lento: boolean;
    cancelaciones: boolean;
    baja_calificacion: boolean;
  };
  motivo?: string;
}

interface VentanaResult {
  disponible: boolean;
  alerta_ventana_corta?: boolean;
  presion_score?: number;
  clasificacion_ventana?: string;
  pct_del_tipico?: number;
  window_days?: number;
  motivo?: string;
}

interface EstacionalidadMes {
  mes: number;
  compras_mes?: number;
  prob_mes?: number;
  consistencia?: number;
  es_pico_estacional?: boolean;
}

interface TendenciaItem {
  CodigoOrganismoPublico?: string;
  RubroN2?: string;
  cagr?: number;
  tendencia?: string;
  slope_mensual?: number;
  r_squared?: number;
}

interface DescuentoItem {
  CodigoTipo?: string;
  Rubro2?: string;
  n_oferentes_rango?: string;
  p10?: number;
  p50?: number;
  p90?: number;
  media?: number;
  senial_competencia?: string;
  n?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color =
    pct >= 70 ? 'bg-accent' : pct >= 40 ? 'bg-gold' : 'bg-danger';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted w-8 text-right">
        {typeof value === 'number' ? value.toFixed(1) : '—'}
      </span>
    </div>
  );
}

function BIDisabledBanner() {
  return (
    <div className="card flex flex-col items-center gap-4 py-12 text-center">
      <div className="rounded-full bg-gold/15 p-4">
        <BarChart3 className="h-10 w-10 text-gold" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-text">Módulo BI desactivado</h2>
        <p className="mt-2 text-sm text-muted max-w-md">
          La inteligencia de negocios requiere que el pipeline ETL de analytics haya generado
          los parquets de datos históricos (<code>etl/data/analytics/</code>) y que el flag{' '}
          <code>FEATURE_ANALYTICS=true</code> esté activo.
        </p>
      </div>
      <div className="rounded-lg bg-surface border border-border p-4 text-left text-xs text-muted max-w-sm font-mono">
        <p># .env</p>
        <p>FEATURE_ANALYTICS=true</p>
        <p className="mt-2"># Generar parquets</p>
        <p>cd etl && python analytics/run_all.py</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BIPage() {
  const [biEnabled, setBiEnabled] = useState<boolean | null>(null);
  const [loadingInit, setLoadingInit] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Oportunidades
  const [oportunidades, setOportunidades] = useState<OportunidadItem[]>([]);
  const [loadingOp, setLoadingOp] = useState(false);
  const [minScore, setMinScore] = useState('6');
  const [rubroFiltro, setRubroFiltro] = useState('');

  // Competidores / Comprador
  const [organismoInput, setOrganismoInput] = useState('');
  const [competidores, setCompetidores] = useState<CompetidorItem[]>([]);
  const [compradorResult, setCompradorResult] = useState<CompradorResult | null>(null);
  const [loadingComp, setLoadingComp] = useState(false);

  // Ventana de presión
  const [codigoExterno, setCodigoExterno] = useState('');
  const [ventanaResult, setVentanaResult] = useState<VentanaResult | null>(null);
  const [loadingVentana, setLoadingVentana] = useState(false);

  // Expanded sections
  const [expandedComp, setExpandedComp] = useState(false);

  // TF-IDF Matching state
  const [tfidfEnabled, setTfidfEnabled] = useState<boolean | null>(null);
  const [matchingQuery, setMatchingQuery] = useState('');
  const [matchingResults, setMatchingResults] = useState<ProveedorMatch[]>([]);
  const [loadingMatching, setLoadingMatching] = useState(false);

  // Perfil TF-IDF state
  const [firstEmpresaId, setFirstEmpresaId] = useState<string | null>(null);
  const [perfilData, setPerfilData] = useState<TFIDFPerfilData | null>(null);
  const [clusters, setClusters] = useState<ClusterItem[]>([]);
  const [showPerfilEditor, setShowPerfilEditor] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [customRubro, setCustomRubro] = useState('');
  const [savingPerfil, setSavingPerfil] = useState(false);
  const [perfilSaved, setPerfilSaved] = useState(false);

  // ── On mount: probe if BI is enabled ────────────────────────────────────
  const probeBI = async () => {
    setLoadingInit(true);
    try {
      const res = await apiClient.getBIOportunidades({ min_score: 0, limit: 1 });
      setBiEnabled(res.disponible !== false);
      if (res.disponible) {
        loadOportunidades();
      }
    } catch (err: any) {
      setBiEnabled(err?.response?.status !== 503 ? null : false);
    } finally {
      setLoadingInit(false);
      setInitialized(true);
    }
  };

  useEffect(() => {
    if (!initialized && !loadingInit) {
      probeBI();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── On mount: probe TF-IDF + load empresa ────────────────────────────────
  useEffect(() => {
    // Probe TF-IDF availability
    apiClient.getBIMatching({ texto: 'limpieza', top_n: 1 })
      .then(() => setTfidfEnabled(true))
      .catch((err: any) => setTfidfEnabled(err?.response?.status !== 503 ? null : false));

    // Load first empresa for perfil
    apiClient.getEmpresas()
      .then((empresas: any[]) => {
        if (empresas.length > 0) {
          const eid = empresas[0].id;
          setFirstEmpresaId(eid);
          return apiClient.getTFIDFPerfil(eid)
            .then((p: TFIDFPerfilData) => {
              setPerfilData(p);
              if (p.rubros_usados) setSelectedClusters(p.rubros_usados);
            })
            .catch(() => {/* tfidf not enabled or no perfil */});
        }
      })
      .catch(() => {/* not logged in or no empresa */});

    // Load clusters if available
    apiClient.getBIClusters(80)
      .then((res: any) => { if (res.disponible) setClusters(res.clusters || []); })
      .catch(() => {/* not enabled */});
  }, []);

  // ── Load oportunidades ───────────────────────────────────────────────────
  const loadOportunidades = async () => {
    setLoadingOp(true);
    try {
      const res = await apiClient.getBIOportunidades({
        min_score: parseFloat(minScore) || 6,
        rubro: rubroFiltro || undefined,
        limit: 30,
      });
      if (res.disponible) setOportunidades(res.oportunidades || []);
    } catch {
      // ignore
    } finally {
      setLoadingOp(false);
    }
  };

  // ── Load organismo data ──────────────────────────────────────────────────
  const loadOrganismoData = async () => {
    if (!organismoInput.trim()) return;
    setLoadingComp(true);
    setCompetidores([]);
    setCompradorResult(null);
    try {
      const [compRes, buyerRes] = await Promise.all([
        apiClient.getBICompetidores(organismoInput.trim(), { top_n: 15 }),
        apiClient.getBIComprador(organismoInput.trim()),
      ]);
      if (compRes.disponible) setCompetidores(compRes.competidores || []);
      setCompradorResult(buyerRes);
    } catch {
      // ignore
    } finally {
      setLoadingComp(false);
      setExpandedComp(true);
    }
  };

  // ── Check ventana ────────────────────────────────────────────────────────
  const checkVentana = async () => {
    if (!codigoExterno.trim()) return;
    setLoadingVentana(true);
    setVentanaResult(null);
    try {
      const res = await apiClient.getBIVentana(codigoExterno.trim());
      setVentanaResult(res);
    } catch (err: any) {
      if (err?.response?.status === 503) {
        setVentanaResult({ disponible: false, motivo: 'BI no habilitado.' });
      }
    } finally {
      setLoadingVentana(false);
    }
  };

  // ── TF-IDF Matching ───────────────────────────────────────────────────────
  const runMatching = async () => {
    if (!matchingQuery.trim()) return;
    setLoadingMatching(true);
    setMatchingResults([]);
    try {
      const res = await apiClient.getBIMatching({ texto: matchingQuery.trim(), top_n: 20 });
      if (res.disponible) setMatchingResults(res.resultados || []);
    } catch {
      // ignore — show empty state
    } finally {
      setLoadingMatching(false);
    }
  };

  // ── Perfil TF-IDF ────────────────────────────────────────────────────────
  const toggleCluster = (label: string) => {
    setSelectedClusters((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  };

  const addCustomRubro = () => {
    const val = customRubro.trim();
    if (val && !selectedClusters.includes(val)) {
      setSelectedClusters((prev) => [...prev, val]);
    }
    setCustomRubro('');
  };

  const savePerfil = async () => {
    if (!firstEmpresaId || selectedClusters.length === 0) return;
    setSavingPerfil(true);
    setPerfilSaved(false);
    try {
      const p = await apiClient.updateTFIDFPerfil(firstEmpresaId, { rubros_usados: selectedClusters });
      setPerfilData(p);
      setPerfilSaved(true);
      setShowPerfilEditor(false);
      setTimeout(() => setPerfilSaved(false), 3000);
    } catch {
      // ignore
    } finally {
      setSavingPerfil(false);
    }
  };

  // ── Estacionalidad ───────────────────────────────────────────────────────
  const [estacOrganismo, setEstacOrganismo] = useState('');
  const [estacRubro, setEstacRubro] = useState('');
  const [estacResult, setEstacResult] = useState<EstacionalidadMes[] | null>(null);
  const [loadingEstac, setLoadingEstac] = useState(false);

  const loadEstacionalidad = async () => {
    if (!estacOrganismo.trim()) return;
    setLoadingEstac(true);
    setEstacResult(null);
    try {
      const res = await apiClient.getBIEstacionalidad(estacOrganismo.trim(), { rubro: estacRubro || undefined });
      if (res.disponible) setEstacResult(res.patrones || []);
    } catch { /* ignore */ }
    finally { setLoadingEstac(false); }
  };

  // ── Tendencias ────────────────────────────────────────────────────────────
  const [tendencias, setTendencias] = useState<TendenciaItem[]>([]);
  const [emergentes, setEmergentes] = useState<TendenciaItem[]>([]);
  const [loadingTend, setLoadingTend] = useState(false);
  const [tendRubroFiltro, setTendRubroFiltro] = useState('');

  const loadTendencias = async () => {
    setLoadingTend(true);
    setTendencias([]);
    setEmergentes([]);
    try {
      const res = await apiClient.getBITendencia({ rubro: tendRubroFiltro || undefined, limit: 30 });
      if (res.disponible) {
        setTendencias(res.tendencias || []);
        setEmergentes(res.emergentes || []);
      }
    } catch { /* ignore */ }
    finally { setLoadingTend(false); }
  };

  // ── Descuento óptimo ──────────────────────────────────────────────────────
  const [descTipo, setDescTipo] = useState('');
  const [descRubro, setDescRubro] = useState('');
  const [descResult, setDescResult] = useState<DescuentoItem[]>([]);
  const [loadingDesc, setLoadingDesc] = useState(false);

  const loadDescuento = async () => {
    setLoadingDesc(true);
    setDescResult([]);
    try {
      const res = await apiClient.getBIDescuento({
        tipo: descTipo || undefined,
        rubro: descRubro || undefined,
      });
      if (res.disponible) setDescResult(res.descuentos || []);
    } catch { /* ignore */ }
    finally { setLoadingDesc(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingInit || !initialized) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (biEnabled === false) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-text">Inteligencia BI</h1>
        <BIDisabledBanner />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">Inteligencia BI</h1>
        <p className="text-sm text-muted mt-1">
          Benchmarks históricos de precios, análisis de competidores y detección de oportunidades.
        </p>
      </div>

      {/* ── Oportunidades ─────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-text">Oportunidades de mercado</h2>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted shrink-0">Score mín.</label>
            <select
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              className="input-field max-w-[100px]"
            >
              {['4', '5', '6', '7', '8', '9'].map((s) => (
                <option key={s} value={s}>
                  {s}+
                </option>
              ))}
            </select>
          </div>
          <input
            className="input-field flex-1 min-w-[180px]"
            placeholder="Filtrar por rubro (opcional)"
            value={rubroFiltro}
            onChange={(e) => setRubroFiltro(e.target.value)}
          />
          <button
            onClick={loadOportunidades}
            disabled={loadingOp}
            className="btn-primary flex items-center gap-2"
          >
            {loadingOp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </button>
        </div>

        {oportunidades.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="pb-2 pr-4">Organismo</th>
                  <th className="pb-2 pr-4">Rubro</th>
                  <th className="pb-2 pr-4">Score</th>
                  <th className="pb-2 pr-4">Txs</th>
                  <th className="pb-2 pr-4">Proveedores</th>
                  <th className="pb-2">CAGR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {oportunidades.map((op, i) => (
                  <tr key={i} className="hover:bg-background transition-colors">
                    <td className="py-2 pr-4 font-mono text-xs">{op.CodigoOrganismoPublico}</td>
                    <td className="py-2 pr-4 max-w-[200px] truncate text-xs">{op.RubroN2}</td>
                    <td className="py-2 pr-4 w-32">
                      <ScoreBar value={op.opportunity_score} max={10} />
                    </td>
                    <td className="py-2 pr-4 text-xs">{op.n_transacciones.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-xs">{op.n_proveedores}</td>
                    <td className="py-2 text-xs">
                      {op.cagr != null
                        ? `${(op.cagr * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {oportunidades.length === 0 && !loadingOp && (
          <p className="text-sm text-muted">
            No hay oportunidades con score ≥ {minScore} para los filtros seleccionados.
          </p>
        )}
      </section>

      {/* ── Análisis de comprador ──────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-text">Análisis de comprador</h2>
        </div>
        <p className="text-sm text-muted">
          Ingresa el código de organismo (ej. <code>7485</code>) para ver su score de confiabilidad, tiempos de pago y top competidores.
        </p>

        <div className="flex gap-3">
          <input
            className="input-field flex-1"
            placeholder="Código organismo (CodigoOrganismoPublico)"
            value={organismoInput}
            onChange={(e) => setOrganismoInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadOrganismoData()}
          />
          <button
            onClick={loadOrganismoData}
            disabled={loadingComp}
            className="btn-primary flex items-center gap-2"
          >
            {loadingComp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Analizar
          </button>
        </div>

        {compradorResult && (
          <div className="space-y-4">
            {!compradorResult.disponible ? (
              <p className="text-sm text-muted">{compradorResult.motivo}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Buyer score */}
                <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-text truncate max-w-[180px]">
                        {compradorResult.nombre || organismoInput}
                      </p>
                      <p className="text-xs text-muted mt-0.5">{compradorResult.clasificacion}</p>
                    </div>
                    <div
                      className={`rounded-full px-2 py-1 text-xs font-bold ${
                        (compradorResult.buyer_score || 0) >= 0.7
                          ? 'bg-accent/15 text-accent'
                          : (compradorResult.buyer_score || 0) >= 0.4
                            ? 'bg-gold/15 text-gold'
                            : 'bg-danger/15 text-danger'
                      }`}
                    >
                      {compradorResult.buyer_score != null
                        ? (compradorResult.buyer_score * 10).toFixed(1)
                        : '—'}
                      /10
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted">Mediana días pago</span>
                      <span className="font-medium">{compradorResult.pago?.mediana_dias_pago ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Tasa cancelación</span>
                      <span className="font-medium">
                        {compradorResult.pago?.tasa_cancelacion != null
                          ? `${(compradorResult.pago.tasa_cancelacion * 100).toFixed(1)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Tasa adjudicación</span>
                      <span className="font-medium">
                        {compradorResult.pago?.tasa_adjudicacion != null
                          ? `${(compradorResult.pago.tasa_adjudicacion * 100).toFixed(1)}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                  {/* Risk flags */}
                  {compradorResult.risk_flags && compradorResult.risk_flags.n_flags > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {compradorResult.risk_flags.pago_lento && (
                        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger">Pago lento</span>
                      )}
                      {compradorResult.risk_flags.cancelaciones && (
                        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger">Alta cancelación</span>
                      )}
                      {compradorResult.risk_flags.baja_calificacion && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Baja calificación</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Top competidores */}
                <div className="rounded-lg border border-border bg-background p-4 space-y-2">
                  <button
                    className="flex w-full items-center justify-between text-sm font-medium text-text"
                    onClick={() => setExpandedComp((p) => !p)}
                  >
                    <span>Top competidores ({competidores.length})</span>
                    {expandedComp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {expandedComp && (
                    <ul className="space-y-2 max-h-48 overflow-y-auto">
                      {competidores.slice(0, 10).map((c, i) => (
                        <li key={i} className="flex items-center justify-between text-xs">
                          <span className="truncate max-w-[160px] text-text">
                            {c.NombreProveedor || c.CodigoProveedor}
                          </span>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-muted">
                              {c.market_share_pct?.toFixed(1)}%
                            </span>
                            <div
                              className="h-1.5 w-16 rounded-full bg-border overflow-hidden"
                            >
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.min(100, c.market_share_pct || 0)}%` }}
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Matching semántico — Proveedores similares ─────────────────── */}
      {tfidfEnabled !== false && (
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-text">Proveedores similares</h2>
            </div>
            {tfidfEnabled === null && (
              <span className="text-xs text-muted rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-700">
                Requiere FEATURE_TFIDF=true
              </span>
            )}
          </div>
          <p className="text-sm text-muted">
            Busca proveedores que históricamente vendieron productos similares. Tolerante a variantes
            ortográficas y acentos — escribe como quieras.
          </p>

          <div className="flex gap-3">
            <input
              className="input-field flex-1"
              placeholder='Ej: "servicio limpieza hospitalaria", "notebooks computadores", "medicamentos insumos"'
              value={matchingQuery}
              onChange={(e) => setMatchingQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runMatching()}
            />
            <button
              onClick={runMatching}
              disabled={loadingMatching || !matchingQuery.trim()}
              className="btn-primary flex items-center gap-2 shrink-0"
            >
              {loadingMatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </button>
          </div>

          {matchingResults.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="pb-2 pr-4">Proveedor</th>
                    <th className="pb-2 pr-4">Código</th>
                    <th className="pb-2 pr-4">OCs históricas</th>
                    <th className="pb-2 w-40">Similitud</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matchingResults.map((r, i) => (
                    <tr key={i} className="hover:bg-background transition-colors">
                      <td className="py-2 pr-4 font-medium text-text truncate max-w-[220px]">
                        {r.NombreProveedor || '—'}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted">{r.CodigoProveedor}</td>
                      <td className="py-2 pr-4 text-xs">{r.n_oc?.toLocaleString() ?? '—'}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                r.similarity_score >= 0.15
                                  ? 'bg-accent'
                                  : r.similarity_score >= 0.05
                                    ? 'bg-gold'
                                    : 'bg-subtle'
                              }`}
                              style={{ width: `${Math.min(100, r.similarity_score * 400)}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted w-10 text-right">
                            {(r.similarity_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {matchingResults.length === 0 && !loadingMatching && matchingQuery && (
            <p className="text-sm text-muted">
              No se encontraron proveedores con similitud suficiente para «{matchingQuery}».
            </p>
          )}
        </section>
      )}

      {/* ── Perfil TF-IDF de la empresa ────────────────────────────────── */}
      {tfidfEnabled !== false && firstEmpresaId && (
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings2 className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold text-text">Perfil semántico de tu empresa</h2>
                <p className="text-xs text-muted mt-0.5">
                  Define qué productos/servicios ofrece tu empresa para activar «¿Tu perfil encaja?» en cada licitación.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {perfilSaved && (
                <span className="flex items-center gap-1 text-xs text-accent bg-accent/10 border border-accent/20 rounded-full px-2 py-0.5">
                  <Check className="h-3 w-3" /> Guardado
                </span>
              )}
              {perfilData?.tiene_vector && !showPerfilEditor && (
                <button
                  onClick={() => setShowPerfilEditor(true)}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  Editar perfil
                </button>
              )}
            </div>
          </div>

          {/* Current profile summary */}
          {perfilData?.tiene_vector && !showPerfilEditor && (
            <div className="rounded-lg bg-background border border-border p-3 space-y-2">
              <p className="text-xs text-muted">Rubros/productos configurados:</p>
              <div className="flex flex-wrap gap-1.5">
                {(perfilData.rubros_usados || []).map((r, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs"
                  >
                    {r}
                  </span>
                ))}
              </div>
              {perfilData.actualizado_en && (
                <p className="text-xs text-muted">
                  Actualizado: {new Date(perfilData.actualizado_en).toLocaleDateString('es-CL')}
                </p>
              )}
            </div>
          )}

          {/* Editor */}
          {(showPerfilEditor || !perfilData?.tiene_vector) && (
            <div className="space-y-4">
              {/* Selected rubros */}
              {selectedClusters.length > 0 && (
                <div>
                  <p className="text-xs text-muted mb-2">Seleccionados ({selectedClusters.length}):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedClusters.map((r) => (
                      <button
                        key={r}
                        onClick={() => setSelectedClusters((prev) => prev.filter((x) => x !== r))}
                        className="flex items-center gap-1 rounded-full bg-primary text-white px-2.5 py-0.5 text-xs hover:bg-primaryDark transition-colors"
                      >
                        {r}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom rubro input */}
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 text-sm"
                  placeholder="Agregar rubro o producto personalizado (Enter)"
                  value={customRubro}
                  onChange={(e) => setCustomRubro(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addCustomRubro(); }
                  }}
                />
                <button onClick={addCustomRubro} className="btn-secondary text-xs py-2 px-3">
                  Agregar
                </button>
              </div>

              {/* Cluster suggestions */}
              {clusters.length > 0 && (
                <div>
                  <p className="text-xs text-muted mb-2">
                    Sugerencias basadas en el historial de compras del Estado:
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {clusters.map((c) => {
                      const isSelected = selectedClusters.includes(c.label);
                      return (
                        <button
                          key={c.cluster_id}
                          onClick={() => toggleCluster(c.label)}
                          title={c.keywords || c.label}
                          className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                            isSelected
                              ? 'bg-primary/10 border-primary/30 text-primary'
                              : 'bg-background border-border text-muted hover:border-primary/50 hover:text-text'
                          }`}
                        >
                          {c.label}
                          {c.rubro_dominante && (
                            <span className="ml-1 opacity-60">· {c.rubro_dominante}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={savePerfil}
                  disabled={savingPerfil || selectedClusters.length === 0}
                  className="btn-primary flex items-center gap-2"
                >
                  {savingPerfil ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Guardar perfil
                </button>
                {showPerfilEditor && (
                  <button onClick={() => setShowPerfilEditor(false)} className="btn-secondary">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}

          {!perfilData?.tiene_vector && !showPerfilEditor && (
            <div className="rounded-lg bg-background border border-border p-4 text-sm text-muted">
              <p>
                Sin perfil configurado. Selecciona los rubros o productos que ofrece tu empresa para
                activar el análisis «¿Tu perfil encaja?» en cada licitación.
              </p>
              <button
                onClick={() => setShowPerfilEditor(true)}
                className="btn-primary mt-3 text-xs"
              >
                Configurar perfil
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Estacionalidad ─────────────────────────────────────────────── */}
      {biEnabled && (
        <section className="card space-y-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-text">Estacionalidad de compras</h2>
          </div>
          <p className="text-sm text-muted">
            ¿En qué meses compra más este organismo? Detecta picos estacionales para anticipar licitaciones.
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              className="input-field flex-1 min-w-[180px]"
              placeholder="CodigoOrganismo (ej. 1234)"
              value={estacOrganismo}
              onChange={(e) => setEstacOrganismo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadEstacionalidad()}
            />
            <input
              className="input-field flex-1 min-w-[180px]"
              placeholder="Rubro (opcional)"
              value={estacRubro}
              onChange={(e) => setEstacRubro(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadEstacionalidad()}
            />
            <button
              onClick={loadEstacionalidad}
              disabled={loadingEstac}
              className="btn-primary flex items-center gap-2"
            >
              {loadingEstac ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Analizar
            </button>
          </div>

          {estacResult && (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-12 gap-1.5 min-w-[560px]">
                {(['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']).map((name, idx) => {
                  const mes = idx + 1;
                  const data = estacResult.find((m) => m.mes === mes);
                  const prob = data?.prob_mes ?? 0;
                  const isPico = data?.es_pico_estacional;
                  const intensity = Math.round(prob * 9);
                  const bg = isPico
                    ? 'bg-primary text-white'
                    : intensity >= 7 ? 'bg-primary/60 text-white'
                    : intensity >= 4 ? 'bg-primary/30 text-text'
                    : 'bg-background text-muted border border-border';
                  return (
                    <div
                      key={mes}
                      title={`${name}: prob ${(prob * 100).toFixed(0)}%${isPico ? ' — PICO' : ''}`}
                      className={`rounded-lg p-2 text-center text-xs transition-colors ${bg}`}
                    >
                      <p className="font-medium">{name}</p>
                      <p className="mt-0.5 font-mono">{(prob * 100).toFixed(0)}%</p>
                      {isPico && <p className="mt-0.5 font-bold">↑</p>}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">
                Intensidad de color = probabilidad de compra. ↑ = pico estacional histórico.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Tendencias de mercado ───────────────────────────────────────── */}
      {biEnabled && (
        <section className="card space-y-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-text">Tendencias de mercado</h2>
          </div>
          <p className="text-sm text-muted">
            Mercados con mayor crecimiento histórico (CAGR). Los mercados emergentes tienen CAGR &gt; 20%.
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              className="input-field flex-1 min-w-[200px]"
              placeholder="Rubro (opcional, deja vacío para todos)"
              value={tendRubroFiltro}
              onChange={(e) => setTendRubroFiltro(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadTendencias()}
            />
            <button
              onClick={loadTendencias}
              disabled={loadingTend}
              className="btn-primary flex items-center gap-2"
            >
              {loadingTend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Cargar
            </button>
          </div>

          {emergentes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-700 mb-2 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Mercados emergentes (CAGR &gt; 20%)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {emergentes.slice(0, 10).map((t, i) => (
                  <span key={i} className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-0.5 text-xs">
                    {t.RubroN2} · {t.cagr != null ? `+${(t.cagr * 100).toFixed(0)}%` : '—'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {tendencias.length > 0 && (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="pb-2 font-medium">Organismo</th>
                    <th className="pb-2 font-medium">Rubro</th>
                    <th className="pb-2 font-medium text-right">CAGR</th>
                    <th className="pb-2 font-medium text-right">Tendencia</th>
                  </tr>
                </thead>
                <tbody>
                  {tendencias.slice(0, 20).map((t, i) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-surface/50">
                      <td className="py-1.5 pr-2 text-muted font-mono">{t.CodigoOrganismoPublico ?? '—'}</td>
                      <td className="py-1.5 pr-2">{t.RubroN2 ?? '—'}</td>
                      <td className="py-1.5 text-right font-mono font-medium">
                        {t.cagr != null ? (
                          <span className={t.cagr > 0 ? 'text-accent' : 'text-danger'}>
                            {t.cagr > 0 ? '+' : ''}{(t.cagr * 100).toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-1.5 text-right capitalize">{t.tendencia ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loadingTend && tendencias.length === 0 && emergentes.length === 0 && (
            <p className="text-sm text-muted">Haz clic en «Cargar» para obtener las tendencias de mercado.</p>
          )}
        </section>
      )}

      {/* ── Descuento óptimo ───────────────────────────────────────────── */}
      {biEnabled && (
        <section className="card space-y-4">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-text">Descuento óptimo por contexto</h2>
          </div>
          <p className="text-sm text-muted">
            Bandas de descuento observadas en licitaciones similares, segmentadas por tipo y rubro.
            Útil para calibrar tu oferta según la competencia esperada.
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              className="input-field flex-1 min-w-[160px]"
              placeholder="Tipo licitación (CodigoTipo, ej. LP)"
              value={descTipo}
              onChange={(e) => setDescTipo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadDescuento()}
            />
            <input
              className="input-field flex-1 min-w-[160px]"
              placeholder="Rubro (opcional)"
              value={descRubro}
              onChange={(e) => setDescRubro(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadDescuento()}
            />
            <button
              onClick={loadDescuento}
              disabled={loadingDesc}
              className="btn-primary flex items-center gap-2"
            >
              {loadingDesc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Consultar
            </button>
          </div>

          {descResult.length > 0 && (
            <div className="space-y-3">
              {descResult.slice(0, 10).map((d, i) => (
                <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-text">{d.Rubro2 || d.CodigoTipo || '—'}</span>
                    {d.n_oferentes_rango && (
                      <span className="rounded-full bg-surface border border-border px-2 py-0.5 text-muted">
                        {d.n_oferentes_rango} oferentes
                      </span>
                    )}
                    {d.senial_competencia && (
                      <span className={`rounded-full px-2 py-0.5 border text-xs ${
                        d.senial_competencia === 'alta'
                          ? 'bg-danger/10 border-danger/20 text-danger'
                          : d.senial_competencia === 'media'
                          ? 'bg-gold/10 border-gold/20 text-gold'
                          : 'bg-accent/10 border-accent/20 text-accent'
                      }`}>
                        competencia {d.senial_competencia}
                      </span>
                    )}
                    {d.n != null && <span className="text-muted">n={d.n}</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {[['P10', d.p10], ['Media', d.media], ['P50', d.p50], ['P90', d.p90]].map(([label, val]) => (
                      <div key={label as string}>
                        <p className="text-muted">{label}</p>
                        <p className="font-mono font-medium text-text">
                          {val != null ? `${(val as number * 100).toFixed(1)}%` : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingDesc && descResult.length === 0 && (
            <p className="text-sm text-muted">
              Ingresa el tipo de licitación y/o rubro para ver los descuentos históricos típicos.
            </p>
          )}
        </section>
      )}

      {/* ── Ventana de presión ─────────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-text">Presión de ventana de preparación</h2>
        </div>
        <p className="text-sm text-muted">
          Compara la ventana de una licitación contra la norma histórica de su tipo/sector para detectar plazos inusualmente cortos.
        </p>

        <div className="flex gap-3">
          <input
            className="input-field flex-1"
            placeholder="Código externo de la licitación (ej. 750001-23-LP14)"
            value={codigoExterno}
            onChange={(e) => setCodigoExterno(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && checkVentana()}
          />
          <button
            onClick={checkVentana}
            disabled={loadingVentana}
            className="btn-primary flex items-center gap-2"
          >
            {loadingVentana ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Analizar
          </button>
        </div>

        {ventanaResult && (
          <div className="rounded-lg border border-border bg-background p-4 space-y-3">
            {!ventanaResult.disponible ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Info className="h-4 w-4 shrink-0" />
                {ventanaResult.motivo}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {ventanaResult.alerta_ventana_corta ? (
                    <div className="alert-warning">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span className="font-medium">Ventana inusualmente corta — acción urgente recomendada</span>
                    </div>
                  ) : (
                    <div className="alert-success">
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>Ventana normal para este tipo de licitación</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted">Días ventana</p>
                    <p className="text-lg font-bold text-text">{ventanaResult.window_days ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted">% del típico</p>
                    <p className="text-lg font-bold text-text">
                      {ventanaResult.pct_del_tipico != null
                        ? `${(ventanaResult.pct_del_tipico * 100).toFixed(0)}%`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Presión score</p>
                    <p className="text-lg font-bold text-text">
                      {ventanaResult.presion_score != null
                        ? ventanaResult.presion_score.toFixed(2)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Clasificación</p>
                    <p className="font-medium text-text">{ventanaResult.clasificacion_ventana ?? '—'}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
