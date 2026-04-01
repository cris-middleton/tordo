'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import SelectField from '@/components/SelectField';
import {
  Search,
  Loader2,
  ExternalLink,
  Calendar,
  DollarSign,
  MapPin,
  BookmarkPlus,
  BookmarkCheck,
  Send,
  CheckCircle2,
  X,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

const REGIONES_CHILE = [
  'Región de Arica y Parinacota',
  'Región de Tarapacá',
  'Región de Antofagasta',
  'Región de Atacama',
  'Región de Coquimbo',
  'Región de Valparaíso',
  'Región Metropolitana de Santiago',
  'Región del Libertador General Bernardo O´Higgins',
  'Región del Maule',
  'Región del Ñuble',
  'Región del Biobío',
  'Región de la Araucanía',
  'Región de Los Ríos',
  'Región de los Lagos',
  'Región Aysén del General Carlos Ibáñez del Campo',
  'Región de Magallanes y de la Antártica',
];

const ESTADOS_LICITACION = [
  'Publicada',
  'Cerrada',
  'En evaluación',
  'Adjudicada',
  'Desierta',
  'Revocada',
  'Suspendida',
];
import { format } from 'date-fns';
import { useDashboardCollections } from '@/hooks/useDashboardCollections';

// Normalize text to Title Case (first letter uppercase, rest lowercase)
const normalizeText = (text: string | undefined): string => {
  if (!text) return '';
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

interface TenderDetalle {
  id?: number;
  numero_actualizaciones?: number;
  estado_actual?: string;
  fecha_adjudicacion?: string;
  monto_adjudicado?: string;
  proveedor_adjudicado?: string;
  fecha_cierre_real?: string;
  items?: any[];
  participantes?: any[];
}

interface Tender {
  id: number;
  codigo_externo: string;
  nombre: string;
  descripcion?: string;
  fecha_publicacion: string;
  fecha_cierre?: string;
  monto_estimado?: number;
  estado?: string;
  region?: string;
  comuna?: string;
  nombre_organismo?: string;
  url_licitacion?: string;
  detalle?: TenderDetalle;
}

interface BIPanel {
  codigo_externo: string;
  organismo_id?: string;
  comprador: {
    disponible: boolean;
    buyer_score?: number | null;
    mediana_dias_pago?: number | null;
    tasa_adjudicacion?: number | null;
    n_flags?: number;
    transparencia?: { clasificacion?: string | null } | null;
    motivo?: string | null;
  };
  ventana: {
    disponible: boolean;
    window_days?: number | null;
    alerta_ventana_corta?: boolean | null;
    presion_score?: number | null;
    clasificacion_ventana?: string | null;
    pct_del_tipico?: number | null;
    motivo?: string | null;
  };
  competidores: {
    disponible: boolean;
    top5?: Array<{
      NombreProveedor?: string | null;
      market_share_pct?: number | null;
      n_oc?: number | null;
      n_proveedores?: number | null;
    }> | null;
    hhi?: number | null;
    tipo_mercado?: string | null;
    motivo?: string | null;
  };
  precios: Array<{
    disponible: boolean;
    codigo_producto?: string | null;
    nivel_usado?: string | null;
    fallback?: boolean;
    p25?: number | null;
    p50?: number | null;
    p75?: number | null;
    confianza?: string | null;
    n?: number | null;
  }>;
  postulacion_id?: string | null;
}

export default function TendersPage() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filters, setFilters] = useState({
    estado: 'Publicada',
    region: '',
    min_amount: '',
    max_amount: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const { hydrated, isTenderStored, toggleTender } = useDashboardCollections();

  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('fecha_publicacion');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [biPanel, setBiPanel] = useState<BIPanel | null>(null);
  const [biLoading, setBiLoading] = useState(false);
  const [biError, setBiError] = useState(false);
  const [firstEmpresaId, setFirstEmpresaId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'filtros' | 'lista' | 'detalle'>('lista');

  // Load empresa ID once for BI calls
  useEffect(() => {
    // TODO: migrar a React Query
    apiClient.getEmpresas().then((empresas: any[]) => {
      if (empresas?.[0]?.id) setFirstEmpresaId(empresas[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTender) {
      setBiPanel(null);
      setBiError(false);
      return;
    }
    let active = true;
    setBiLoading(true);
    setBiError(false);
    setBiPanel(null);
    // TODO: migrar a React Query
    apiClient
      .getBIPanel(selectedTender.codigo_externo, firstEmpresaId ?? undefined)
      .then((data: any) => { if (active) setBiPanel(data); })
      .catch(() => { if (active) setBiError(true); })
      .finally(() => { if (active) setBiLoading(false); });
    return () => { active = false; };
  }, [selectedTender, firstEmpresaId]);

  const loadTenders = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        offset: (page - 1) * limit,
        limit,
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      if (filters.estado) params.estado = filters.estado;
      if (filters.region) params.region = filters.region;
      if (filters.min_amount) params.min_amount = parseFloat(filters.min_amount);
      if (filters.max_amount) params.max_amount = parseFloat(filters.max_amount);
      if (keywords.length) params.search = keywords.join(' ');
      const response = await apiClient.getTenders(params);
      setTenders(response.items || []);
      setTotal(response.total || 0);
      setPages(response.pages || 1);
    } catch (error) {
      console.error('Error loading tenders:', error);
    } finally {
      setLoading(false);
    }
  }, [filters.estado, filters.max_amount, filters.min_amount, filters.region, keywords, page, limit, sortBy, sortOrder]);

  useEffect(() => {
    loadTenders();
  }, [loadTenders]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const addKeyword = useCallback(
    (value: string) => {
      const normalized = value.trim();
      if (!normalized) return;
      const exists = keywords.some((keyword) => keyword.toLowerCase() === normalized.toLowerCase());
      if (exists) return;
      setKeywords((prev) => [...prev, normalized]);
      setSearchInput('');
      setPage(1);
    },
    [keywords],
  );

  const handleKeywordKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addKeyword(searchInput);
    } else if (event.key === 'Backspace' && searchInput === '' && keywords.length) {
      event.preventDefault();
      const lastKeyword = keywords[keywords.length - 1];
      setKeywords((prev) => prev.slice(0, -1));
      setSearchInput(lastKeyword);
    }
  };

  const removeKeyword = useCallback(
    (value: string) => {
      setKeywords((prev) =>
        prev.filter((keyword) => keyword.toLowerCase() !== value.toLowerCase()),
      );
      setPage(1);
    },
    [],
  );

  const formatCurrency = (amount?: number) => {
    if (!amount) return null;
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getEstadoCls = (estado?: string | null) => {
    if (!estado) return 'bg-border/50 text-subtle border-border';
    const e = estado.toLowerCase();
    if (e.includes('public')) return 'bg-accent/10 text-accent border-accent/20';
    if (e.includes('adjudic')) return 'bg-info/10 text-info border-info/20';
    if (e.includes('evaluac')) return 'bg-primary/10 text-primary border-primary/20';
    if (e.includes('desierta') || e.includes('suspend')) return 'bg-border/50 text-subtle border-border';
    if (e.includes('revocd') || e.includes('cancel')) return 'bg-danger/10 text-danger border-danger/20';
    if (e.includes('cerrada')) return 'bg-gold/10 text-gold border-gold/20';
    return 'bg-border/50 text-muted border-border';
  };

  const getEstadoAccent = (estado?: string | null) => {
    if (!estado) return 'bg-primary';
    const e = estado.toLowerCase();
    if (e.includes('public')) return 'bg-accent';
    if (e.includes('adjudic')) return 'bg-info';
    if (e.includes('evaluac')) return 'bg-primary';
    if (e.includes('desierta') || e.includes('suspend')) return 'bg-subtle';
    if (e.includes('revocd') || e.includes('cancel')) return 'bg-danger';
    if (e.includes('cerrada')) return 'bg-gold';
    return 'bg-primary';
  };

  const getClosingUrgency = (fechaCierre?: string | null) => {
    if (!fechaCierre) return null;
    const closing = new Date(fechaCierre);
    const now = new Date();
    const daysLeft = Math.ceil((closing.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return null;
    if (daysLeft === 0) return { label: 'Cierra hoy', cls: 'text-danger font-bold' };
    if (daysLeft <= 2) return { label: `${daysLeft}d restantes`, cls: 'text-danger font-semibold' };
    if (daysLeft <= 7) return { label: `${daysLeft}d restantes`, cls: 'text-gold font-medium' };
    return { label: format(closing, 'dd MMM yyyy'), cls: 'text-muted' };
  };


  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-semibold text-text sm:text-3xl">Licitaciones</h1>
          <p className="text-muted">Busca y explora licitaciones públicas</p>
        </div>
        <Link
          href="/dashboard/calendario"
          className="btn-secondary gap-2 text-sm hidden sm:inline-flex"
        >
          <Calendar size={15} />
          Calendario
        </Link>
      </div>

      {/* Mobile tab bar — visible only on mobile */}
      <div className="flex border-b border-border lg:hidden">
        {(['filtros', 'lista', 'detalle'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
              mobileTab === tab
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted hover:text-text'
            }`}
          >
            {tab === 'filtros' ? 'Filtros' : tab === 'lista' ? 'Lista' : 'Detalle'}
            {tab === 'detalle' && selectedTender && (
              <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-white">1</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-4 items-start">

        {/* LEFT — Filters sidebar */}
        <aside className={`w-60 shrink-0 space-y-3 ${mobileTab !== 'filtros' ? 'hidden lg:block' : 'block w-full lg:w-60'}`}>
          <div className="card space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Buscar — Enter para agregar..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                className="input-field pl-9"
                autoComplete="off"
              />
            </div>

            <SelectField
              value={filters.estado}
              onChange={(v) => handleFilterChange('estado', v)}
              options={[
                { value: '', label: 'Todos los estados' },
                ...ESTADOS_LICITACION.map((e) => ({ value: e, label: e })),
              ]}
            />
            <SelectField
              value={filters.region}
              onChange={(v) => handleFilterChange('region', v)}
              options={[
                { value: '', label: 'Todas las regiones' },
                ...REGIONES_CHILE.map((r) => ({ value: r, label: r.replace('Región ', '').replace('Región de ', '') })),
              ]}
            />
            <input
              type="number"
              placeholder="Monto mínimo"
              value={filters.min_amount}
              onChange={(e) => handleFilterChange('min_amount', e.target.value)}
              className="input-field"
            />
            <input
              type="number"
              placeholder="Monto máximo"
              value={filters.max_amount}
              onChange={(e) => handleFilterChange('max_amount', e.target.value)}
              className="input-field"
            />

            {keywords.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {keywords.map((keyword) => (
                  <span key={keyword} className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {keyword}
                    <button type="button" onClick={() => removeKeyword(keyword)} className="ml-0.5 text-primary/60 hover:text-primary">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button type="button" onClick={() => { setKeywords([]); setPage(1); }} className="text-xs text-muted hover:text-danger transition-colors">
                  Limpiar todo
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* CENTER — Tender list */}
        <div className={`flex-1 min-w-0 space-y-4 ${mobileTab !== 'lista' ? 'hidden lg:block' : 'block'}`}>
          {/* Sort controls + result count */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              {total.toLocaleString()} resultado{total !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SelectField
                value={sortBy}
                onChange={(v) => { setSortBy(v); setPage(1); }}
                options={[
                  { value: 'fecha_publicacion', label: 'Fecha publicación' },
                  { value: 'fecha_cierre', label: 'Fecha cierre' },
                  { value: 'monto_estimado', label: 'Monto' },
                  { value: 'nombre', label: 'Nombre' },
                ]}
                className="w-44"
              />
              <SelectField
                value={sortOrder}
                onChange={(v) => { setSortOrder(v as 'asc' | 'desc'); setPage(1); }}
                options={[
                  { value: 'desc', label: '↓ Mayor a menor' },
                  { value: 'asc', label: '↑ Menor a mayor' },
                ]}
                className="w-40"
              />
              <SelectField
                value={String(limit)}
                onChange={(v) => { setLimit(Number(v)); setPage(1); }}
                options={[
                  { value: '10', label: '10 / pág' },
                  { value: '20', label: '20 / pág' },
                  { value: '50', label: '50 / pág' },
                  { value: '100', label: '100 / pág' },
                ]}
                className="w-28"
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card animate-pulse">
                  <div className="space-y-4">
                    <div className="h-6 w-3/4 bg-surface rounded"></div>
                    <div className="h-4 w-1/2 bg-surface rounded"></div>
                    <div className="flex gap-4">
                      <div className="h-4 w-24 bg-surface rounded"></div>
                      <div className="h-4 w-32 bg-surface rounded"></div>
                      <div className="h-4 w-20 bg-surface rounded"></div>
                    </div>
                    <div className="h-20 bg-surface rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : tenders.length === 0 ? (
            <div className="card text-center py-12">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface">
                <Search className="h-8 w-8 text-muted" />
              </div>
              <p className="mb-2 text-lg font-medium text-text">No se encontraron licitaciones</p>
              <p className="text-sm text-muted">Intenta ajustar tus filtros o términos de búsqueda</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4">
                {tenders.map((tender) => {
                  const isSaved = hydrated && isTenderStored('saved', tender.id);
                  const isApplied = hydrated && isTenderStored('applied', tender.id);
                  const urgency = getClosingUrgency(tender.fecha_cierre);
                  const estadoDisplay = tender.estado ?? tender.detalle?.estado_actual;
                  const estadoCls = getEstadoCls(estadoDisplay);
                  const accentCls = getEstadoAccent(estadoDisplay);
                  const isSelected = selectedTender?.id === tender.id;

                  return (
                    <div
                      key={tender.id}
                      onClick={() => { setSelectedTender(tender); setMobileTab('detalle'); }}
                      className={`relative flex flex-col overflow-hidden rounded-xl border bg-surface shadow-card transition-all duration-200 hover:border-primary/25 hover:shadow-card-md hover:-translate-y-0.5 cursor-pointer ${
                        isSelected ? 'border-primary/40 bg-primary/5' : 'border-border'
                      }`}
                    >
                      {/* Status accent line */}
                      <div className={`h-0.5 w-full ${accentCls}`} />

                      <div className="flex flex-col flex-1 p-5">
                        {/* Top row: estado badge + región */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {estadoDisplay && (
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${estadoCls}`}>
                                {normalizeText(estadoDisplay)}
                              </span>
                            )}
                          </div>
                          {tender.region && (
                            <span className="flex items-center gap-1 text-xs text-muted shrink-0">
                              <MapPin className="h-3 w-3" />
                              {normalizeText(tender.region).replace(/Región (de |del |Aysén.*|Metropolitana.*|del Libertador.*)/i, '').trim() || normalizeText(tender.region)}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <Link
                          href={`/dashboard/tenders/${encodeURIComponent(tender.codigo_externo)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-semibold text-text leading-snug line-clamp-2 hover:text-primary transition-colors mb-1"
                          style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
                        >
                          {normalizeText(tender.nombre)}
                        </Link>

                        {/* Organismo */}
                        <p className="text-xs text-muted truncate mb-1">
                          {tender.nombre_organismo ? normalizeText(tender.nombre_organismo) : tender.codigo_externo}
                        </p>

                        {/* Spacer */}
                        <div className="flex-1 min-h-[0.5rem]" />

                        {/* Monto + cierre */}
                        <div className="flex items-end justify-between mt-4 pt-3 border-t border-border">
                          <div>
                            {tender.monto_estimado ? (
                              <>
                                <p className="text-xs text-muted leading-none mb-0.5">Monto estimado</p>
                                <p className="text-base font-bold text-accent" style={{ fontFamily: 'var(--font-outfit, system-ui)' }}>
                                  {formatCurrency(tender.monto_estimado)}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-subtle">Monto no especificado</p>
                            )}
                            {tender.fecha_publicacion && (
                              <p className="text-xs text-subtle mt-0.5">
                                Publicada {format(new Date(tender.fecha_publicacion), 'dd MMM yyyy')}
                              </p>
                            )}
                          </div>
                          {urgency && (
                            <div className="text-right">
                              <p className="text-xs text-muted leading-none mb-0.5">Cierre</p>
                              <p className={`text-xs ${urgency.cls}`}>{urgency.label}</p>
                            </div>
                          )}
                        </div>

                        {/* Action bar */}
                        <div className="flex items-center gap-1.5 mt-3">
                          <button
                            type="button"
                            disabled={!hydrated}
                            onClick={(e) => { e.stopPropagation(); toggleTender('saved', tender); }}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all ${
                              isSaved ? 'border-primary/30 bg-primary/8 text-primary' : 'border-border bg-background text-muted hover:border-primary/25 hover:text-primary'
                            } ${!hydrated ? 'opacity-50' : ''}`}
                          >
                            {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                            {isSaved ? 'Guardada' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            disabled={!hydrated}
                            onClick={(e) => { e.stopPropagation(); toggleTender('applied', tender); }}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all ${
                              isApplied ? 'border-accent/30 bg-accent/8 text-accent' : 'border-border bg-background text-muted hover:border-accent/25 hover:text-accent'
                            } ${!hydrated ? 'opacity-50' : ''}`}
                          >
                            {isApplied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                            {isApplied ? 'Aplicada' : 'Aplicar'}
                          </button>
                          {tender.url_licitacion ? (
                            <a
                              href={tender.url_licitacion}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-muted hover:border-primary/25 hover:text-primary transition-all"
                              title="Ver en Mercado Público"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <Link
                              href={`/dashboard/tenders/${encodeURIComponent(tender.codigo_externo)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-muted hover:border-primary/25 hover:text-primary transition-all"
                              title="Ver detalle"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <span className="px-4 text-sm text-muted">
                    Página {page} de {pages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT — Contextual BI panel */}
        <aside className={`w-[360px] shrink-0 ${mobileTab !== 'detalle' ? 'hidden lg:block' : 'block w-full lg:w-[360px]'}`}>
          {selectedTender ? (
            <div className="card space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text line-clamp-2 leading-snug">
                    {normalizeText(selectedTender.nombre)}
                  </p>
                  <p className="text-xs text-muted mt-0.5 truncate">
                    {selectedTender.nombre_organismo ?? selectedTender.codigo_externo}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTender(null)}
                  className="shrink-0 rounded p-0.5 text-muted hover:text-text transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* BI loading */}
              {biLoading && (
                <div className="animate-pulse space-y-2 py-2">
                  <div className="h-16 rounded-lg bg-border" />
                  <div className="h-12 rounded-lg bg-border" />
                  <div className="h-12 rounded-lg bg-border" />
                </div>
              )}

              {/* BI error */}
              {!biLoading && biError && (
                <p className="text-xs text-muted italic">Análisis BI no disponible para esta licitación.</p>
              )}

              {/* BI data */}
              {!biLoading && !biError && biPanel && (
                <div className="space-y-3">
                  {/* Comprador */}
                  <div className="rounded-lg border border-border bg-background px-3 py-2 space-y-1">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">Comprador</p>
                    {biPanel.comprador.disponible ? (
                      <>
                        {biPanel.comprador.buyer_score != null && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted">Score comprador</span>
                            <span className="font-semibold text-text">{biPanel.comprador.buyer_score.toFixed(1)}/10</span>
                          </div>
                        )}
                        {biPanel.comprador.mediana_dias_pago != null && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted">Pago mediano</span>
                            <span className="text-text">{Math.round(biPanel.comprador.mediana_dias_pago)} días</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted">Sin datos del comprador</p>
                    )}
                  </div>

                  {/* Price reference */}
                  {biPanel.precios.length > 0 && biPanel.precios[0].disponible && biPanel.precios[0].p50 != null && (
                    <div className="rounded-lg border border-border bg-background px-3 py-2 space-y-1">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">Precio de referencia</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Mediana (P50)</span>
                        <span className="font-semibold text-accent">
                          {biPanel.precios[0].p50 >= 1_000_000
                            ? `CLP ${(biPanel.precios[0].p50 / 1_000_000).toFixed(1)}M`
                            : `CLP ${(biPanel.precios[0].p50 / 1_000).toFixed(0)}K`}
                        </span>
                      </div>
                      {biPanel.precios[0].p25 != null && biPanel.precios[0].p75 != null && (
                        <p className="text-[10px] text-muted">
                          Rango típico: {biPanel.precios[0].p25 >= 1_000_000 ? `${(biPanel.precios[0].p25/1_000_000).toFixed(1)}M` : `${(biPanel.precios[0].p25/1_000).toFixed(0)}K`}
                          {' – '}
                          {biPanel.precios[0].p75 >= 1_000_000 ? `${(biPanel.precios[0].p75/1_000_000).toFixed(1)}M` : `${(biPanel.precios[0].p75/1_000).toFixed(0)}K`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Competitors preview */}
                  {biPanel.competidores.disponible && (biPanel.competidores.top5?.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-border bg-background px-3 py-2 space-y-1">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">
                        Competidores {biPanel.competidores.tipo_mercado ? `· ${biPanel.competidores.tipo_mercado}` : ''}
                      </p>
                      {biPanel.competidores.top5!.slice(0, 3).map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-text truncate max-w-[200px]">{i + 1}. {c.NombreProveedor ?? '—'}</span>
                          <span className="text-muted shrink-0 ml-1">
                            {c.market_share_pct != null ? `${c.market_share_pct.toFixed(0)}%` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Window alert */}
                  {biPanel.ventana.disponible && biPanel.ventana.alerta_ventana_corta && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Ventana corta: {biPanel.ventana.window_days} días disponibles
                    </div>
                  )}
                </div>
              )}

              {/* Footer link */}
              <Link
                href={`/dashboard/tenders/${encodeURIComponent(selectedTender.codigo_externo)}`}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5"
                onClick={(e) => e.stopPropagation()}
              >
                Ver análisis completo <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center gap-2 py-12 text-center">
              <TrendingUp className="h-8 w-8 text-muted/40" />
              <p className="text-sm text-muted">Selecciona una licitación para ver el análisis BI</p>
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}
