'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import SelectField from '@/components/SelectField';
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
  Activity,
  Award,
  Clock
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell
} from 'recharts';

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

  // ── Ventana de presión ───────────────────────────────────────────────────
  const [codigoExterno, setCodigoExterno] = useState('');
  const [ventanaResult, setVentanaResult] = useState<any>(null);
  const [loadingVentana, setLoadingVentana] = useState(false);

  const checkVentana = async () => {
    if (!codigoExterno.trim()) return;
    setLoadingVentana(true);
    setVentanaResult(null);
    try {
      const res = await apiClient.getBIVentana(codigoExterno.trim());
      setVentanaResult(res);
    } catch (err: any) {
      setVentanaResult({
        disponible: false,
        motivo: err.response?.data?.detail || 'Error comprobando ventana.',
      });
    } finally {
      setLoadingVentana(false);
    }
  };

  // ── Auto-load inicial ────────────────────────────────────────────────────
  useEffect(() => {
    if (initialized && biEnabled && !loadingOp && !loadingTend && tendencias.length === 0) {
      if (perfilData?.rubros_usados && perfilData.rubros_usados.length > 0) {
        const topRubro = perfilData.rubros_usados[0];
        if (!rubroFiltro) setRubroFiltro(topRubro);
        if (!tendRubroFiltro) setTendRubroFiltro(topRubro);
      }
      loadOportunidades();
      loadTendencias();
      if (!organismoInput) {
        setOrganismoInput('7485'); // Municipalidad default demo
        loadOrganismoData();
      }
    }
  }, [initialized, biEnabled, perfilData]);

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
        <h1 className="text-2xl font-semibold text-text flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          Command Center: Inteligencia de Mercado
        </h1>
        <BIDisabledBanner />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER & GLOBAL FILTERS */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 bg-surface p-5 rounded-2xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-text flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Command Center: Inteligencia de Mercado
          </h1>
          <p className="text-sm text-muted mt-1">
            Perspectiva ejecutiva de tendencias y competencia para {perfilData?.rubros_usados?.[0] || 'tu industria'}.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              className="pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none w-full sm:w-64"
              placeholder="Filtro global (Rubro/Industria)"
              value={rubroFiltro}
              onChange={(e) => {
                setRubroFiltro(e.target.value);
                setTendRubroFiltro(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  loadOportunidades();
                  loadTendencias();
                }
              }}
            />
          </div>
          <button
            onClick={() => {
              loadOportunidades();
              loadTendencias();
            }}
            disabled={loadingOp || loadingTend}
            className="btn-primary"
          >
            {(loadingOp || loadingTend) ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Actualizar Dashboards'}
          </button>
        </div>
      </div>

      {/* KPI LEVEL 1: AT A GLANCE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card shadow-sm border border-border bg-surface p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Activity className="w-16 h-16" />
          </div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-medium text-muted uppercase tracking-wider">Volumen Creado Relevante</p>
              <h3 className="text-3xl font-bold text-text mt-2">
                {oportunidades.length > 0 ? `${(oportunidades.reduce((acc, curr) => acc + curr.n_transacciones, 0) / 1000).toFixed(1)}k` : '—'} <span className="text-lg text-muted font-medium">txs</span>
              </h3>
            </div>
          </div>
          <p className="text-xs text-accent mt-4 font-medium flex items-center gap-1 z-10 relative">
            <TrendingUp className="h-3.5 w-3.5" /> Sector Activo
          </p>
        </div>
        
        <div className="card shadow-sm border border-border bg-surface p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Target className="w-16 h-16 text-gold" />
          </div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-sm font-medium text-muted uppercase tracking-wider">Hot Leads Detectados</p>
              <h3 className="text-3xl font-bold text-text mt-2">
                {oportunidades.filter(o => o.opportunity_score >= 8).length || '0'}
              </h3>
            </div>
          </div>
          <p className="text-xs text-muted mt-4 z-10 relative">Oportunidades con Score Predictivo ≥ 8</p>
        </div>

        <div className="card shadow-sm border border-border bg-surface p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Clock className="w-16 h-16 text-danger" />
          </div>
          <div className="flex justify-between items-start relative z-10">
            <div>
               <div className="flex items-center gap-2">
                 <p className="text-sm font-medium text-muted uppercase tracking-wider">Días Promedio Pago</p>
               </div>
              <h3 className="text-3xl font-bold text-text mt-2">
                {compradorResult?.pago?.mediana_dias_pago || '—'} <span className="text-lg font-medium text-muted">días</span>
              </h3>
            </div>
          </div>
          <div className="text-xs text-muted mt-4 z-10 relative flex items-center justify-between w-full">
            <span className="truncate max-w-[200px]">Organismo: {compradorResult?.nombre || organismoInput || '—'}</span>
            <button onClick={() => {
                 const newOrg = prompt('Ingresa el código de organismo para analizar sus pagos (Ej: 7485):');
                 if (newOrg) {
                    setOrganismoInput(newOrg);
                    loadOrganismoData(); // Fetch implicitly takes new state next cycle, so better direct set or trigger again
                 }
                }} className="text-primary hover:underline font-medium">Analizar otro
            </button>
          </div>
        </div>
      </div>

      {/* DASHBOARDS ROW MAPPED */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CHART 1: Market Trends Line Chart (CAGR Bar) */}
        <div className="card flex flex-col space-y-4 shadow-sm border border-border h-[420px] rounded-2xl p-5">
          <div className="flex justify-between items-center bg-transparent m-0 p-0 shadow-none border-0">
            <div>
              <h2 className="text-lg font-semibold text-text flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Crecimiento de Categorías (CAGR)
              </h2>
            </div>
          </div>
          {emergentes.length > 0 && (
             <div className="flex flex-wrap gap-1.5 pt-1">
                {emergentes.slice(0, 3).map((t, i) => (
                  <span key={i} className="rounded-full bg-accent/10 border border-accent/20 text-accent px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest">
                    🔥 {t.RubroN2?.substring(0,20)} ({t.cagr != null ? `+${(t.cagr * 100).toFixed(0)}%` : '—'})
                  </span>
                ))}
            </div>
          )}
          <div className="flex-1 w-full relative">
            {tendencias.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tendencias.slice(0, 7).map(t => ({ name: t.RubroN2?.substring(0, 20) + '...', cagr: (t.cagr || 0) * 100 }))} margin={{ top: 20, right: 30, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} dx={0} dy={10} width={200} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} unit="%" />
                  <RechartsTooltip cursor={{fill: 'var(--color-surface)'}} contentStyle={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)', borderRadius: '8px' }} />
                  <Bar dataKey="cagr" fill="var(--color-primary)" radius={[4, 4, 0, 0]}>
                    {tendencias.slice(0, 7).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={(entry.cagr || 0) > 0 ? 'var(--color-accent)' : 'var(--color-danger)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                 <Loader2 className={`h-8 w-8 ${loadingTend ? 'animate-spin text-primary' : 'hidden'}`} />
                 {!loadingTend && (
                   <span className="text-muted text-sm mt-3">No hay suficientes datos de tendencias para este rubro.</span>
                 )}
              </div>
            )}
          </div>
        </div>

        {/* CHART 2: Competitor Radar (Scatter) */}
        <div className="card flex flex-col space-y-4 shadow-sm border border-border h-[420px] rounded-2xl p-5">
          <div className="flex justify-between items-center bg-transparent m-0 p-0 shadow-none border-0">
            <div>
              <h2 className="text-lg font-semibold text-text flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Radar de Competencia
              </h2>
            </div>
             <button onClick={() => setExpandedComp(!expandedComp)} className="text-xs text-primary font-medium hover:underline bg-primary/10 px-3 py-1.5 rounded-full transition-colors hover:bg-primary/20">
               {expandedComp ? 'Ver Gráfico' : 'Ver Tabla'}
             </button>
          </div>
          <div className="flex-1 w-full relative">
             {competidores.length > 0 ? (
                expandedComp ? (
                  <div className="overflow-auto h-[320px] pr-2">
                    <ul className="space-y-3">
                      {competidores.slice(0, 15).map((c, i) => (
                        <li key={i} className="flex flex-col gap-1 border-b border-border/50 pb-2">
                          <span className="truncate text-sm font-medium text-text">
                            {c.NombreProveedor || c.CodigoProveedor}
                          </span>
                          <div className="flex items-center justify-between text-xs text-muted">
                            <span>Share: {c.market_share_pct?.toFixed(1)}%</span>
                            <span>WR: {(c.win_rate_pct! * 100).toFixed(1)}%</span>
                            <span className="px-1.5 py-0.5 bg-surface rounded text-[10px]">Rank: #{c.rank_monto}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
                      <XAxis type="number" dataKey="win_rate" name="Win Rate" unit="%" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} domain={[0, 'auto']} dx={0} dy={10} />
                      <YAxis type="number" dataKey="share" name="Market Share" unit="%" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                      <ZAxis type="number" dataKey="ranking" range={[80, 500]} />
                      <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)', borderRadius: '8px' }} />
                      <Scatter name="Competidores" data={competidores.filter(c => c.win_rate_pct != null).map(c => ({
                        win_rate: (c.win_rate_pct! * 100).toFixed(1),
                        share: c.market_share_pct?.toFixed(1),
                        ranking: Math.max(10, 150 - (c.rank_monto * 5)), // Bigger bubble = better rank
                        name: c.NombreProveedor || c.CodigoProveedor
                      }))} fill="var(--color-primary)" opacity={0.65} />
                    </ScatterChart>
                  </ResponsiveContainer>
                )
             ) : (
               <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
                 <Loader2 className={`h-8 w-8 ${loadingComp ? 'animate-spin text-primary' : 'hidden'}`} />
                 {!loadingComp && (
                   <>
                     <span className="text-muted text-sm">Carga un organismo para visualizar su distribución competitiva.</span>
                     <button onClick={loadOrganismoData} className="btn-secondary text-xs">
                        Refrescar Análisis
                     </button>
                   </>
                 )}
               </div>
             )}
          </div>
        </div>

      </div>

      {/* ACTION CENTER: HOT LEADS */}
      <section className="card shadow-sm space-y-4 border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gold/10 rounded-xl text-gold">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text">Hot Leads Detectados</h2>
              <p className="text-xs text-muted mt-0.5">Basado en tu compatibilidad histórica y puntaje predictivo.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted hidden sm:inline-block">Score Mín.</span>
            <select 
              value={minScore} 
              onChange={(e) => setMinScore(e.target.value)} 
              className="bg-background border border-border rounded-lg text-xs py-1.5 px-2 text-text outline-none focus:ring-1 focus:ring-primary/30"
            >
              {['4', '5', '6', '7', '8', '9'].map(s => <option key={s} value={s}>{s}+</option>)}
            </select>
          </div>
        </div>

        {oportunidades.length > 0 ? (
          <div className="overflow-x-auto mt-4 rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="border-b border-border text-left text-[11px] text-muted uppercase tracking-wider font-semibold">
                  <th className="py-4 px-5">Organismo</th>
                  <th className="py-4 px-5">Rubro / Dominio</th>
                  <th className="py-4 px-5">Match Score</th>
                  <th className="py-4 px-5">Txs Histo.</th>
                  <th className="py-4 px-5">Competitividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {oportunidades.sort((a,b) => b.opportunity_score - a.opportunity_score).slice(0, 10).map((op, i) => (
                  <tr key={i} className="hover:bg-active/20 transition-colors group">
                    <td className="py-4 px-5 font-mono text-xs font-semibold text-text group-hover:text-primary transition-colors">{op.CodigoOrganismoPublico}</td>
                    <td className="py-4 px-5 max-w-[200px] truncate text-xs text-muted font-medium">{op.RubroN2}</td>
                    <td className="py-4 px-5 w-48">
                      <ScoreBar value={op.opportunity_score} max={10} />
                    </td>
                    <td className="py-4 px-5 text-xs font-medium text-text">{op.n_transacciones.toLocaleString()} <span className="text-muted text-[10px]">oc's</span></td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-muted" />
                        <span className="text-xs font-medium">{op.n_proveedores}</span> 
                        {op.n_proveedores < 3 && <span className="ml-1 text-[10px] bg-accent/10 border border-accent/20 text-accent px-1.5 py-0.5 rounded-md uppercase tracking-wider font-bold">Baja</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-xl bg-surface/30">
             {loadingOp ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
             ) : (
               <>
                 <Target className="h-10 w-10 text-muted opacity-30 mb-3" />
                 <p className="text-sm text-text font-medium">No se encontraron Leads Relevantes con Score ≥ {minScore}</p>
                 <p className="text-xs text-muted mt-1 max-w-sm text-center">Intenta ajustar tu filtro global de Rubro en la parte superior o baja tu exigencia de Score actual.</p>
               </>
             )}
          </div>
        )}
      </section>

      {/* TF-IDF SETTINGS MODAL / TOGGLE (Clean profile widget) */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between bg-surface border border-border p-5 rounded-2xl shadow-sm mt-6 gap-4">
         <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary shrink-0">
              <Settings2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-bold text-text flex items-center gap-2">Calibrar Radar Semántico <span className="px-2 py-0.5 bg-background border border-border rounded text-[10px] text-muted tracking-wide font-mono">TF-IDF</span></p>
              <p className="text-sm text-muted mt-0.5 max-w-xl leading-relaxed">Personaliza los Rubros detectados ({perfilData?.rubros_usados?.length || 0}) para mejorar las recomendaciones del dashboard y optimizar el cálculo de similitud.</p>
            </div>
         </div>
         <button onClick={() => setShowPerfilEditor(!showPerfilEditor)} className="btn-secondary whitespace-nowrap">
            {showPerfilEditor ? 'Cerrar Ajustes' : 'Configurar Perfil'}
         </button>
      </section>

      {/* Perfil Editor Slide-down */}
      {showPerfilEditor && (
        <div className="card shadow-md border border-border mt-0 p-5 rounded-2xl animate-in slide-in-from-top-4 fade-in duration-300">
           <div className="flex gap-3 mb-4">
              <input
                className="input-field flex-1"
                placeholder="Escribe un rubro exacto o palabras clave y presiona Enter..."
                value={customRubro}
                onChange={(e) => setCustomRubro(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomRubro(); } }}
              />
              <button onClick={addCustomRubro} className="btn-secondary">Añadir Rubro</button>
           </div>
           
           <div className="bg-surface p-4 rounded-xl border border-border flex flex-col gap-3">
             <p className="text-xs font-bold text-muted uppercase tracking-wider">Tu Matriz de Referencia ({selectedClusters.length})</p>
             {selectedClusters.length > 0 ? (
               <div className="flex flex-wrap gap-2">
                 {selectedClusters.map((r) => (
                    <span key={r} onClick={() => setSelectedClusters(prev => prev.filter(x => x !== r))} className="cursor-pointer flex items-center gap-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 text-xs font-medium hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-all group">
                      {r} <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                    </span>
                 ))}
               </div>
             ) : (
                <p className="text-sm text-muted italic">No hay rúbros seleccionados. Agrega para alimentar el modelo.</p>
             )}
           </div>
           
           <div className="pt-4 flex justify-end gap-3 mt-2">
             <button onClick={() => setShowPerfilEditor(false)} className="btn-secondary">Cancelar</button>
             <button onClick={() => { savePerfil(); setShowPerfilEditor(false); }} disabled={savingPerfil} className="btn-primary flex items-center gap-2 shadow-sm shadow-primary/20">
                {savingPerfil ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Guardar y Recalibrar Dashboard
             </button>
           </div>
        </div>
      )}

    </div>
  );
}Result && (
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
