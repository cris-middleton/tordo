'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import {
  ArrowLeft,
  Loader2,
  Calendar,
  DollarSign,
  MapPin,
  Building2,
  Info,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Users,
  TrendingUp,
  BadgeAlert,
  FilePlus,
  FileCheck2,
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenderDetail {
  id: number;
  codigo_externo: string;
  nombre: string;
  descripcion?: string;
  fecha_publicacion?: string;
  fecha_cierre?: string;
  monto_estimado?: number;
  estado?: string;
  region?: string;
  comuna?: string;
  nombre_organismo?: string;
  url_licitacion?: string;
  categoria?: string;
  tipo_licitacion?: string;
  dias_publicacion?: number;
  dias_cierre?: number;
  moneda?: string;
  codigo_organismo?: string;
  informacion_adicional?: Record<string, any>;
}

interface PageParams {
  params: { codigo: string };
}

interface PerfilMatchResult {
  disponible: boolean;
  codigo_externo?: string;
  licitacion_nombre?: string;
  score_encaje?: number;
  nivel?: string;
  motivo?: string;
}

interface Transparencia {
  transparencia_score?: number;
  clasificacion?: string;
  pct_trato_directo?: number;
  tasa_fracaso?: number;
  hhi?: number;
  n_lic_total?: number;
}

interface CompradorPanel {
  disponible: boolean;
  nombre?: string;
  buyer_score?: number;
  clasificacion?: string;
  mediana_dias_pago?: number;
  tasa_adjudicacion?: number;
  n_flags?: number;
  transparencia?: Transparencia;
  motivo?: string;
}

interface VentanaPanel {
  disponible: boolean;
  alerta_ventana_corta?: boolean;
  presion_score?: number;
  clasificacion_ventana?: string;
  pct_del_tipico?: number;
  window_days?: number;
  motivo?: string;
}

interface Competidor {
  NombreProveedor?: string;
  market_share_pct?: number;
  win_rate_pct?: number;
  rank_monto?: number;
  n_oc?: number;
  monto_total?: number;
}

interface CompetidoresPanel {
  disponible: boolean;
  top5?: Competidor[];
  hhi?: number;
  tipo_mercado?: string;
  motivo?: string;
}

interface PrecioFallback {
  disponible: boolean;
  codigo_producto?: string;
  nivel_usado?: string;
  fallback?: boolean;
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  confianza?: string;
  n?: number;
}

interface BIPanel {
  codigo_externo: string;
  organismo_id?: string;
  comprador: CompradorPanel;
  ventana: VentanaPanel;
  competidores: CompetidoresPanel;
  precios: PrecioFallback[];
  postulacion_id?: string;
  estado_habil?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const buildLookup = (source?: Record<string, any> | null) => {
  const map = new Map<string, any>();
  if (!source) return map;
  Object.entries(source).forEach(([key, value]) => {
    map.set(normalizeKey(key), value);
  });
  return map;
};

const getFirstValue = (lookups: Map<string, any>[], ...keys: string[]) => {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    for (const lookup of lookups) {
      if (lookup.has(normalized)) {
        const value = lookup.get(normalized);
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
    }
  }
  return undefined;
};

const toNumber = (value: any) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    return Number.isNaN(value) ? undefined : value;
  }
  const parsed = Number(String(value).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeTenderDetail = (data: any): TenderDetail => {
  const detail: TenderDetail = { ...data };
  const lookups = [buildLookup(data), buildLookup(data?.informacion_adicional)];

  const fechaPublicacion = getFirstValue(
    lookups,
    'fecha_publicacion',
    'fechapublicacion',
    'fechapublicacionlicitacion',
    'fechapublicacionutc',
    'publicacion'
  );
  if (fechaPublicacion) detail.fecha_publicacion = fechaPublicacion;

  const fechaCierre = getFirstValue(
    lookups,
    'fecha_cierre',
    'fechacierre',
    'fechacierrepropuestas',
    'fechacierrelicitacion'
  );
  if (fechaCierre) detail.fecha_cierre = fechaCierre;

  const montoEstimado = toNumber(
    getFirstValue(lookups, 'monto_estimado', 'montorestimado', 'montoreferencial', 'montototal')
  );
  if (montoEstimado !== undefined) detail.monto_estimado = montoEstimado;

  const moneda = getFirstValue(lookups, 'moneda', 'tipomoneda', 'monedaoferta');
  if (moneda) detail.moneda = moneda;

  const categoria = getFirstValue(
    lookups,
    'categoria',
    'categorianombre',
    'categoriaobjetocontratacion',
    'rubros',
    'rubrosprincipal'
  );
  if (categoria) detail.categoria = categoria;

  const tipoLicitacion = getFirstValue(
    lookups,
    'tipo_licitacion',
    'tipolicitacion',
    'modalidad',
    'tipo'
  );
  if (tipoLicitacion) detail.tipo_licitacion = tipoLicitacion;

  const region = getFirstValue(lookups, 'region', 'regiongeografica');
  if (region) detail.region = region;

  const comuna = getFirstValue(lookups, 'comuna', 'comunageografica');
  if (comuna) detail.comuna = comuna;

  const nombreOrganismo = getFirstValue(
    lookups,
    'nombre_organismo',
    'nombreorganismo',
    'organismonombre'
  );
  if (nombreOrganismo) detail.nombre_organismo = nombreOrganismo;

  const codigoOrganismo = getFirstValue(lookups, 'codigo_organismo', 'codigoorganismo');
  if (codigoOrganismo) detail.codigo_organismo = codigoOrganismo;

  const urlLicitacion = getFirstValue(
    lookups,
    'url_licitacion',
    'urllicitacion',
    'urldetalle',
    'url'
  );
  if (urlLicitacion) detail.url_licitacion = urlLicitacion;

  return detail;
};

const fmtCLP = (n?: number) => {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(n);
};

const fmtPct = (n?: number) =>
  n == null ? '—' : `${(n * 100).toFixed(1)}%`;

const fmtDays = (n?: number) =>
  n == null ? '—' : `${n} días`;

// ─── Sub-components ───────────────────────────────────────────────────────────

// Estado Hábil badge
function EstadoHabilBadge({ estado }: { estado?: string }) {
  if (!estado || estado === 'desconocido') return null;

  const cfg: Record<string, { icon: JSX.Element; cls: string; label: string }> = {
    habil: {
      icon: <ShieldCheck className="h-4 w-4" />,
      cls: 'bg-green-50 text-green-700 border-green-200',
      label: 'Tu empresa está hábil',
    },
    inhabil: {
      icon: <ShieldAlert className="h-4 w-4" />,
      cls: 'bg-red-50 text-red-700 border-red-200',
      label: 'Tu empresa no está hábil',
    },
    no_encontrado: {
      icon: <AlertTriangle className="h-4 w-4" />,
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
      label: 'RUT no encontrado en registro',
    },
  };

  const c = cfg[estado];
  if (!c) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${c.cls}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

// ¿Tu perfil encaja? widget
const nivelConfig: Record<string, { icon: JSX.Element; color: string; label: string; description: string }> = {
  alto: {
    icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    color: 'bg-green-50 border-green-200 text-green-800',
    label: 'Encaje alto',
    description: 'Tu empresa tiene experiencia directa en este tipo de producto o servicio.',
  },
  medio: {
    icon: <CheckCircle2 className="h-5 w-5 text-amber-600" />,
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    label: 'Encaje moderado',
    description: 'Hay similitud parcial entre tu perfil y esta licitación.',
  },
  bajo: {
    icon: <MinusCircle className="h-5 w-5 text-slate-500" />,
    color: 'bg-slate-50 border-slate-200 text-slate-700',
    label: 'Encaje bajo',
    description: 'Hay poca coincidencia entre tu perfil y esta licitación.',
  },
  sin_encaje: {
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    color: 'bg-red-50 border-red-200 text-red-700',
    label: 'Sin encaje detectado',
    description: 'No se detectó coincidencia semántica entre tu perfil y esta licitación.',
  },
};

function PerfilEncajeWidget({
  loading,
  result,
}: {
  loading: boolean;
  result: PerfilMatchResult | null;
}) {
  if (loading) {
    return (
      <div className="card flex items-center gap-3 text-sm text-muted py-4">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Analizando encaje con tu perfil…
      </div>
    );
  }
  if (!result) return null;
  if (!result.disponible && result.motivo?.includes('deshabilitado')) return null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text">
        <Sparkles className="h-4 w-4 text-primary" />
        ¿Tu perfil encaja?
      </div>

      {result.nivel === 'sin_perfil' && (
        <div className="rounded-lg border border-border bg-background p-4 space-y-2">
          <p className="text-sm text-muted">{result.motivo}</p>
          <Link
            href="/dashboard/bi"
            className="btn-secondary text-xs inline-flex items-center gap-1"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Configurar perfil en Inteligencia BI
          </Link>
        </div>
      )}

      {!result.disponible && result.nivel !== 'sin_perfil' && (
        <p className="text-sm text-muted">{result.motivo || 'Matching no disponible.'}</p>
      )}

      {result.disponible && result.nivel && result.nivel !== 'sin_perfil' && (
        <div
          className={`rounded-lg border p-4 space-y-3 ${nivelConfig[result.nivel]?.color ?? 'bg-background border-border'}`}
        >
          <div className="flex items-center gap-3">
            {nivelConfig[result.nivel]?.icon}
            <div>
              <p className="font-semibold text-sm">{nivelConfig[result.nivel]?.label}</p>
              <p className="text-xs opacity-80">{nivelConfig[result.nivel]?.description}</p>
            </div>
            {result.score_encaje != null && (
              <div className="ml-auto text-right shrink-0">
                <p className="text-2xl font-bold">{(result.score_encaje * 100).toFixed(0)}%</p>
                <p className="text-xs opacity-70">similitud</p>
              </div>
            )}
          </div>
          {result.score_encaje != null && (
            <div className="w-full h-2 rounded-full bg-black/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-current opacity-60"
                style={{ width: `${Math.min(100, result.score_encaje * 400)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// BI Panel component
function BIPanelSection({ panel }: { panel: BIPanel }) {

  const { comprador, ventana, competidores, precios } = panel;

  // Transparencia label
  const transpLabel: Record<string, string> = {
    muy_transparente: 'Muy transparente',
    transparente: 'Transparente',
    moderado: 'Moderado',
    poco_transparente: 'Poco transparente',
    opaco: 'Opaco',
  };

  const transpColor: Record<string, string> = {
    muy_transparente: 'text-green-700 bg-green-50',
    transparente: 'text-green-600 bg-green-50',
    moderado: 'text-amber-700 bg-amber-50',
    poco_transparente: 'text-orange-700 bg-orange-50',
    opaco: 'text-red-700 bg-red-50',
  };

  const ventanaColor =
    ventana.disponible && ventana.alerta_ventana_corta
      ? 'border-red-200 bg-red-50'
      : 'border-border bg-background';

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        Inteligencia pre-oferta
      </h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ── Comprador ── */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Building2 className="h-4 w-4 text-primary" />
            Perfil del comprador
          </div>

          {!comprador.disponible ? (
            <p className="text-xs text-muted">{comprador.motivo || 'Sin datos históricos.'}</p>
          ) : (
            <div className="space-y-2 text-sm">
              {comprador.buyer_score != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Score comprador</span>
                  <span className="font-semibold text-text">
                    {comprador.buyer_score.toFixed(1)}/10
                  </span>
                </div>
              )}
              {comprador.mediana_dias_pago != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Pago mediano
                  </span>
                  <span className="text-text">{fmtDays(comprador.mediana_dias_pago)}</span>
                </div>
              )}
              {comprador.tasa_adjudicacion != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Tasa adjudicación</span>
                  <span className="text-text">{fmtPct(comprador.tasa_adjudicacion)}</span>
                </div>
              )}
              {(comprador.n_flags ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs">
                  <BadgeAlert className="h-3.5 w-3.5 shrink-0" />
                  {comprador.n_flags} flag{(comprador.n_flags ?? 0) > 1 ? 's' : ''} de riesgo
                </div>
              )}
              {comprador.transparencia?.clasificacion && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Transparencia</span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${transpColor[comprador.transparencia.clasificacion] ?? ''}`}
                  >
                    {transpLabel[comprador.transparencia.clasificacion] ??
                      comprador.transparencia.clasificacion}
                  </span>
                </div>
              )}
              {comprador.transparencia?.pct_trato_directo != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted text-xs">% Trato directo</span>
                  <span className="text-xs text-text">
                    {fmtPct(comprador.transparencia.pct_trato_directo)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Ventana de preparación ── */}
        <div className={`card space-y-3 border ${ventanaColor}`}>
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Calendar className="h-4 w-4 text-primary" />
            Ventana de preparación
          </div>

          {!ventana.disponible ? (
            <p className="text-xs text-muted">{ventana.motivo || 'Sin datos históricos.'}</p>
          ) : (
            <div className="space-y-2 text-sm">
              {ventana.alerta_ventana_corta && (
                <div className="flex items-center gap-1.5 text-red-700 bg-red-100 rounded px-2 py-1 text-xs font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Ventana inusualmente corta
                </div>
              )}
              {ventana.window_days != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Días disponibles</span>
                  <span className="font-semibold text-text">{ventana.window_days}</span>
                </div>
              )}
              {ventana.clasificacion_ventana && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Clasificación</span>
                  <span className="text-text capitalize">
                    {ventana.clasificacion_ventana.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
              {ventana.pct_del_tipico != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">% del plazo típico</span>
                  <span className="text-text">{fmtPct(ventana.pct_del_tipico / 100)}</span>
                </div>
              )}
              {ventana.presion_score != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Score de presión</span>
                  <span className="text-text">{ventana.presion_score.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Top competidores ── */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Users className="h-4 w-4 text-primary" />
            Top competidores
            {competidores.tipo_mercado && (
              <span className="ml-auto text-xs text-muted font-normal">
                {competidores.tipo_mercado}
              </span>
            )}
          </div>

          {!competidores.disponible ? (
            <p className="text-xs text-muted">{competidores.motivo || 'Sin datos históricos.'}</p>
          ) : (
            <div className="space-y-2">
              {(competidores.top5 ?? []).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 text-muted font-mono">{i + 1}.</span>
                    <span className="truncate text-text">{c.NombreProveedor ?? '—'}</span>
                  </div>
                  <span className="shrink-0 text-muted ml-2">
                    {c.market_share_pct != null ? fmtPct(c.market_share_pct / 100) : '—'}
                  </span>
                </div>
              ))}
              {competidores.hhi != null && (
                <p className="text-xs text-muted pt-1 border-t border-border">
                  HHI concentración: {competidores.hhi.toFixed(3)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Referencia de precios ── */}
        {precios.length > 0 && (
          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <DollarSign className="h-4 w-4 text-accent" />
              Referencia de precios
            </div>

            <div className="space-y-3">
              {precios.map((p, i) => (
                <div key={i} className="text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted truncate max-w-[160px]">
                      Producto {p.codigo_producto ?? i + 1}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {p.nivel_usado && (
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            p.fallback
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {p.nivel_usado}
                        </span>
                      )}
                    </div>
                  </div>
                  {p.disponible && p.p50 != null ? (
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div className="rounded bg-muted/10 px-1 py-0.5">
                        <p className="text-[10px] text-muted">P25</p>
                        <p className="font-medium text-text">{fmtCLP(p.p25)}</p>
                      </div>
                      <div className="rounded bg-primary/10 px-1 py-0.5">
                        <p className="text-[10px] text-muted">P50</p>
                        <p className="font-semibold text-text">{fmtCLP(p.p50)}</p>
                      </div>
                      <div className="rounded bg-muted/10 px-1 py-0.5">
                        <p className="text-[10px] text-muted">P75</p>
                        <p className="font-medium text-text">{fmtCLP(p.p75)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted">Sin datos de precios</p>
                  )}
                  {p.fallback && p.disponible && (
                    <p className="text-[10px] text-amber-600">
                      Referencia {p.nivel_usado === 'L2' ? 'por sector' : 'nacional'} (sin datos específicos del organismo)
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TenderDetailPage({ params }: PageParams) {
  const router = useRouter();
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // BI panel
  const [biPanel, setBiPanel] = useState<BIPanel | null>(null);
  const [biLoading, setBiLoading] = useState(false);

  // TF-IDF encaje
  const [perfilMatch, setPerfilMatch] = useState<PerfilMatchResult | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);

  // Postulación
  const [creatingPost, setCreatingPost] = useState(false);
  const [firstEmpresaId, setFirstEmpresaId] = useState<string | null>(null);

  useEffect(() => {
    const loadTender = async () => {
      const codigo = decodeURIComponent(params.codigo);
      try {
        const response = await apiClient.getTenderByCode(codigo);
        setTender(response);
      } catch {
        setError('No pudimos cargar la información de la licitación seleccionada.');
      } finally {
        setLoading(false);
      }
    };
    loadTender();
  }, [params.codigo]);

  // Load BI panel + encaje after tender is ready
  useEffect(() => {
    if (!tender) return;
    let active = true;
    const codigo = decodeURIComponent(params.codigo);

    // Get first empresa for per-empresa BI data and encaje check
    apiClient.getEmpresas().then((empresas: any[]) => {
      if (!active) return;
      const empresaId: string | undefined = empresas?.[0]?.id;
      if (empresaId) setFirstEmpresaId(empresaId);

      // BI panel
      const cod = tender?.codigo_externo ?? codigo
      if (!cod) return
      setBiLoading(true);
      apiClient
        .getBIPanel(cod, empresaId)
        .then((data: BIPanel) => { if (active) setBiPanel(data) })
        .catch(() => { if (active) setBiPanel(null) })   // 503 = feature disabled — fail silently
        .finally(() => { if (active) setBiLoading(false) });

      // Encaje
      const textoLicitacion = tender.nombre || '';
      if (textoLicitacion && empresaId) {
        setLoadingMatch(true);
        apiClient
          .getBILicitacionMatch(codigo, { empresa_id: empresaId, texto: textoLicitacion })
          .then((res: PerfilMatchResult) => { if (active) setPerfilMatch(res) })
          .catch(() => {/* TF-IDF not enabled — skip */})
          .finally(() => { if (active) setLoadingMatch(false) });
      }
    }).catch(() => {/* no empresas — skip */});

    return () => { active = false };
  }, [tender, params.codigo]);

  const handleIniciarPostulacion = async () => {
    if (!tender || !firstEmpresaId) return;

    // If already tracked, go to postulaciones list
    if (biPanel?.postulacion_id) {
      router.push('/dashboard/postulaciones');
      return;
    }

    setCreatingPost(true);
    try {
      await apiClient.createPostulacion({
        empresa_id: firstEmpresaId,
        licitacion_id: tender.id,
      });
      router.push('/dashboard/postulaciones');
    } catch (err: any) {
      // Duplicate — already tracked
      if (err?.response?.status === 409) {
        router.push('/dashboard/postulaciones');
      }
    } finally {
      setCreatingPost(false);
    }
  };

  const formatCurrency = (amount?: number, currency: string = 'CLP') => {
    if (amount === undefined || amount === null || Number.isNaN(amount)) return 'N/A';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const tenderData = useMemo(() => {
    if (!tender) return null;
    return normalizeTenderDetail(tender);
  }, [tender]);

  const tenderCurrency =
    tenderData?.moneda && typeof tenderData.moneda === 'string' && tenderData.moneda.length
      ? tenderData.moneda
      : 'CLP';

  const isTracked = Boolean(biPanel?.postulacion_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="btn-secondary flex items-center gap-2"
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="text-2xl font-semibold text-text sm:text-3xl">Detalle Licitación</h1>
      </div>

      {loading ? (
        <div className="card flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="card border border-destructive/40 bg-destructive/5 p-6 text-destructive">
          {error}
        </div>
      ) : !tenderData ? (
        <div className="card p-6 text-muted">No se encontró la licitación solicitada.</div>
      ) : (
        <div className="space-y-6">
          {/* ── Header card ─────────────────────────────────────── */}
          <div className="card space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-sm text-muted">Código externo</p>
                <h2 className="text-2xl font-semibold text-text">{tenderData.codigo_externo}</h2>
                {/* Estado hábil badge from BI panel */}
                <EstadoHabilBadge estado={biPanel?.estado_habil} />
              </div>

              <div className="flex flex-col gap-2 sm:items-end sm:shrink-0">
                {tenderData.url_licitacion && (
                  <Link
                    href={tenderData.url_licitacion}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-2 sm:w-auto w-full justify-center"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir en Mercado Público
                  </Link>
                )}

                {/* Postulación button — only shown when empresa exists */}
                {firstEmpresaId && (
                  <button
                    type="button"
                    onClick={handleIniciarPostulacion}
                    disabled={creatingPost}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isTracked
                        ? 'btn-secondary'
                        : 'bg-primary text-white hover:bg-primaryDark'
                    }`}
                  >
                    {creatingPost ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isTracked ? (
                      <FileCheck2 className="h-4 w-4" />
                    ) : (
                      <FilePlus className="h-4 w-4" />
                    )}
                    {isTracked ? 'Ver postulación' : 'Iniciar postulación'}
                  </button>
                )}
              </div>
            </div>

            <div>
              <p className="text-sm text-muted">Nombre</p>
              <p className="text-lg font-medium text-text">{tenderData.nombre}</p>
            </div>

            {tenderData.descripcion && (
              <div>
                <p className="text-sm text-muted">Descripción</p>
                <p className="text-sm leading-6 text-text">{tenderData.descripcion}</p>
              </div>
            )}
          </div>

          {/* ── Info cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <Calendar className="h-4 w-4 text-primary" />
                Fechas
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Publicación: </span>
                  {tenderData.fecha_publicacion
                    ? format(new Date(tenderData.fecha_publicacion), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Cierre: </span>
                  {tenderData.fecha_cierre
                    ? format(new Date(tenderData.fecha_cierre), 'dd MMM yyyy')
                    : 'Sin información'}
                </p>
                {typeof tenderData.dias_publicacion === 'number' && (
                  <p>
                    <span className="font-medium text-text">Días publicada: </span>
                    {tenderData.dias_publicacion}
                  </p>
                )}
                {typeof tenderData.dias_cierre === 'number' && (
                  <p>
                    <span className="font-medium text-text">Días hasta cierre: </span>
                    {tenderData.dias_cierre}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <DollarSign className="h-4 w-4 text-accent" />
                Monto y clasificación
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Monto estimado: </span>
                  {formatCurrency(tenderData.monto_estimado, tenderCurrency)}
                </p>
                {tenderData.categoria && (
                  <p>
                    <span className="font-medium text-text">Categoría: </span>
                    {tenderData.categoria}
                  </p>
                )}
                {tenderData.tipo_licitacion && (
                  <p>
                    <span className="font-medium text-text">Tipo: </span>
                    {tenderData.tipo_licitacion}
                  </p>
                )}
                {tenderData.moneda && (
                  <p>
                    <span className="font-medium text-text">Moneda: </span>
                    {tenderData.moneda}
                  </p>
                )}
              </div>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <MapPin className="h-4 w-4 text-primaryDark" />
                Ubicación y organismo
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p>
                  <span className="font-medium text-text">Región: </span>
                  {tenderData.region || 'Sin información'}
                </p>
                <p>
                  <span className="font-medium text-text">Comuna: </span>
                  {tenderData.comuna || 'Sin información'}
                </p>
                {tenderData.nombre_organismo && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-1 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted">Organismo público</p>
                      <p className="text-sm text-text">{tenderData.nombre_organismo}</p>
                      {tenderData.codigo_organismo && (
                        <p className="text-xs text-muted">Código: {tenderData.codigo_organismo}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Información adicional ────────────────────────────── */}
          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <Info className="h-4 w-4 text-primary" />
              Información adicional
            </div>
            <div className="grid grid-cols-1 gap-4 text-sm text-muted sm:grid-cols-2">
              <div>
                <p className="font-medium text-text">Estado</p>
                <p>{tenderData.estado || 'Sin información'}</p>
              </div>
              <div>
                <p className="font-medium text-text">ID interno</p>
                <p>{tenderData.id}</p>
              </div>
            </div>
          </div>

          {/* ── BI Panel ─────────────────────────────────────────── */}
          <div className="mt-6">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Análisis de Mercado</h2>
            {biLoading && (
              <div className="animate-pulse bg-gray-100 rounded-xl h-48 flex items-center justify-center">
                <span className="text-gray-400 text-sm">Cargando análisis de mercado…</span>
              </div>
            )}
            {!biLoading && biPanel && (
              <BIPanelSection panel={biPanel} />
            )}
            {!biLoading && !biPanel && (
              <p className="text-sm text-gray-400 italic bg-gray-50 rounded-xl px-4 py-3">
                Panel BI no disponible para esta licitación.
              </p>
            )}
          </div>

          {/* ── ¿Tu perfil encaja? ──────────────────────────────── */}
          <PerfilEncajeWidget loading={loadingMatch} result={perfilMatch} />
        </div>
      )}
    </div>
  );
}
