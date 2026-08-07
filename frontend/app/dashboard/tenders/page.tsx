'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import { useEmpresas, useLicitaciones, usePanelLicitacion } from '@/lib/queries';
import SelectField from '@/components/SelectField';
import {
  Search,
  Loader2,
  ExternalLink,
  Calendar,
  MapPin,
  BookmarkPlus,
  BookmarkCheck,
  Send,
  CheckCircle2,
  X,
  ArrowRight,
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

type NivelEncaje = 'alto' | 'medio' | 'bajo' | 'sin_encaje';

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
  similarity_score?: number | null;
  score_encaje?: number | null;
  nivel_encaje?: NivelEncaje | null;
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
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filters, setFilters] = useState({
    estado: '',
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

  const { data: empresasLista } = useEmpresas();
  const firstEmpresaId =
    (empresasLista as Array<{ id: string }> | undefined)?.[0]?.id ?? null;
  const [mobileTab, setMobileTab] = useState<'filtros' | 'lista' | 'detalle'>('lista');


  // La cancelación con `active` y el vaciado al cambiar de licitación los hace
  // la clave de la consulta: otra licitación, otra clave, otro resultado.
  const consultaPanel = usePanelLicitacion(
    selectedTender?.codigo_externo,
    firstEmpresaId ?? undefined,
  );
  const biPanel = (consultaPanel.data ?? null) as BIPanel | null;
  const biLoading = Boolean(selectedTender) && consultaPanel.isFetching;
  const biError = Boolean(consultaPanel.error);

  // Los parámetros SON la clave: cambiar un filtro cambia la clave y se pide de
  // nuevo. `placeholderData` mantiene la tabla anterior mientras llega la nueva,
  // así que ya no parpadea en cada tecleo del buscador.
  const params: Record<string, unknown> = {
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
  if (firstEmpresaId) params.empresa_id = firstEmpresaId;

  const { data: respuesta, isFetching: loading, refetch: loadTenders } = useLicitaciones(params);
  const tenders: Tender[] = respuesta?.items ?? [];
  const total = respuesta?.total ?? 0;

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const addKeyword = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setKeywords((prev) => {
      if (prev.some((k) => k.toLowerCase() === normalized.toLowerCase())) return prev;
      return [...prev, normalized];
    });
    // On first keyword, switch to relevance ranking if the user is still on
    // the default sort. They can override via the dropdown afterward.
    setSortBy((prev) => (prev === 'fecha_publicacion' ? 'relevance' : prev));
    setSearchInput('');
    setPage(1);
  }, []);

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

  const removeKeyword = useCallback((value: string) => {
    setKeywords((prev) => prev.filter((keyword) => keyword.toLowerCase() !== value.toLowerCase()));
    setPage(1);
  }, []);

  const formatCurrency = (amount?: number) => {
    if (amount == null) return null;
    if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);
  };

  const getEstadoCls = (estado?: string | null) => {
    if (!estado) return 'bg-border/50 text-subtle border-border';
    const e = estado.toLowerCase();
    if (e.includes('public')) return 'bg-accent/10 text-accent border-accent/20';
    if (e.includes('adjudic')) return 'bg-info/10 text-info border-info/20';
    if (e.includes('evaluac')) return 'bg-primary/10 text-primary border-primary/20';
    if (e.includes('desierta') || e.includes('suspend')) return 'bg-border/50 text-subtle border-border';
    if (e.includes('revocad') || e.includes('cancel')) return 'bg-danger/10 text-danger border-danger/20';
    if (e.includes('cerrada')) return 'bg-gold/10 text-gold border-gold/20';
    return 'bg-border/50 text-muted border-border';
  };

  const getEstadoAccent = (estado?: string | null) => {
    if (!estado) return 'bg-primary/30';
    const e = estado.toLowerCase();
    if (e.includes('public')) return 'bg-accent';
    if (e.includes('adjudic')) return 'bg-info';
    if (e.includes('evaluac')) return 'bg-primary';
    if (e.includes('desierta') || e.includes('suspend')) return 'bg-subtle';
    if (e.includes('revocad') || e.includes('cancel')) return 'bg-danger';
    if (e.includes('cerrada')) return 'bg-gold';
    return 'bg-primary/30';
  };

  const getClosingUrgency = (fechaCierre?: string | null) => {
    if (!fechaCierre) return null;
    const closing = new Date(fechaCierre);
    const now = new Date();
    const daysLeft = Math.ceil((closing.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return null;
    if (daysLeft === 0) return { label: 'Cierra hoy', cls: 'text-danger font-bold' };
    if (daysLeft <= 2) return { label: `${daysLeft}d`, cls: 'text-danger font-semibold' };
    if (daysLeft <= 7) return { label: `${daysLeft}d`, cls: 'text-gold font-medium' };
    return { label: format(closing, 'dd MMM'), cls: 'text-muted' };
  };

  const getEncajeBadge = (nivel?: NivelEncaje | null) => {
    if (!nivel || nivel === 'sin_encaje') return null;
    const map: Record<string, { label: string; cls: string }> = {
      alto: { label: 'Encaje alto', cls: 'bg-accent/10 text-accent border-accent/20' },
      medio: { label: 'Encaje medio', cls: 'bg-primary/10 text-primary border-primary/20' },
      bajo: { label: 'Encaje bajo', cls: 'bg-border/50 text-subtle border-border' },
    };
    const config = map[nivel];
    if (!config) return null;
    return (
      <span
        title="Afinidad con el perfil de tu empresa (TF-IDF)"
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${config.cls}`}
      >
        {config.label}
      </span>
    );
  };

  const shortRegion = (region?: string) => {
    if (!region) return '';
    return normalizeText(region)
      .replace(/^Región (Metropolitana.*)$/i, 'RM')
      .replace(/^Región (del Libertador.*)$/i, "O'Higgins")
      .replace(/^Región (Aysén.*)$/i, 'Aysén')
      .replace(/^Región (de |del |de la )?/i, '')
      .trim();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Licitaciones</h1>
          <p className="text-sm text-muted mt-0.5">Busca y explora licitaciones públicas</p>
        </div>
        <Link href="/dashboard/calendario" className="btn-secondary gap-2 text-sm hidden sm:inline-flex">
          <Calendar size={15} />
          Calendario
        </Link>
      </div>

      {/* Search + Filters */}
      <div className="card space-y-3 py-3 px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Nombre, organismo o descripción — Enter para buscar"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeywordKeyDown}
            className="input-field pl-9 text-sm"
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
            className="input-field text-sm"
          />
          <input
            type="number"
            placeholder="Monto máximo"
            value={filters.max_amount}
            onChange={(e) => handleFilterChange('max_amount', e.target.value)}
            className="input-field text-sm"
          />
        </div>
        {keywords.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {keywords.map((keyword) => (
              <span key={keyword} className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary">
                {keyword}
                <button type="button" onClick={() => removeKeyword(keyword)} className="ml-0.5 text-primary/60 hover:text-primary">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                setKeywords([]);
                setSortBy((prev) => (prev === 'relevance' ? 'fecha_publicacion' : prev));
                setPage(1);
              }}
              className="text-xs text-muted hover:text-danger transition-colors"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Sort bar */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-1.5">
        <p className="text-xs text-muted">
          <span className="font-semibold text-text">{total.toLocaleString()}</span> resultado{total !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-1.5">
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary/50 focus:outline-none"
          >
            {keywords.length > 0 && <option value="relevance">Relevancia</option>}
            {firstEmpresaId && <option value="score_encaje">Encaje</option>}
            <option value="fecha_publicacion">Publicación</option>
            <option value="fecha_cierre">Cierre</option>
            <option value="monto_estimado">Monto</option>
            <option value="nombre">Nombre</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => { setSortOrder(e.target.value as 'asc' | 'desc'); setPage(1); }}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary/50 focus:outline-none"
          >
            <option value="desc">↓ Mayor</option>
            <option value="asc">↑ Menor</option>
          </select>
          <select
            value={String(limit)}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-text focus:border-primary/50 focus:outline-none"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface overflow-hidden animate-pulse">
              <div className="flex">
                <div className="w-1 bg-border shrink-0" />
                <div className="flex-1 p-4 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="h-5 w-20 rounded-full bg-border" />
                    <div className="h-3.5 w-16 rounded bg-border" />
                  </div>
                  <div className="h-4 w-full rounded bg-border" />
                  <div className="h-4 w-4/5 rounded bg-border" />
                  <div className="h-3 w-2/5 rounded bg-border" />
                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <div className="h-5 w-24 rounded bg-border" />
                    <div className="flex gap-1">
                      <div className="h-7 w-7 rounded-lg bg-border" />
                      <div className="h-7 w-7 rounded-lg bg-border" />
                      <div className="h-7 w-7 rounded-lg bg-border" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tenders.length === 0 ? (
        <div className="card text-center py-12">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface">
            <Search className="h-7 w-7 text-muted" />
          </div>
          <p className="font-medium text-text">No se encontraron licitaciones</p>
          <p className="text-sm text-muted mt-1">Ajusta tus filtros o términos de búsqueda</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  className={`relative flex overflow-hidden rounded-xl border transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-md cursor-pointer ${
                    isSelected
                      ? 'border-primary/40 bg-primary/3 shadow-card-md'
                      : 'border-border bg-surface hover:border-primary/20'
                  }`}
                >
                  {/* Left accent bar */}
                  <div className={`w-1 shrink-0 ${accentCls}`} />

                  <div className="flex flex-col flex-1 min-w-0 px-4 pt-3.5 pb-3">
                    {/* Row 1: badge(s) + region */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {estadoDisplay && (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${estadoCls}`}>
                            {normalizeText(estadoDisplay)}
                          </span>
                        )}
                        {getEncajeBadge(tender.nivel_encaje)}
                      </div>
                      {tender.region && (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted shrink-0">
                          <MapPin className="h-2.5 w-2.5" />
                          {shortRegion(tender.region)}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <Link
                      href={`/dashboard/tenders/${encodeURIComponent(tender.codigo_externo)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm font-semibold text-text leading-snug line-clamp-2 hover:text-primary transition-colors mb-0.5"
                    >
                      {normalizeText(tender.nombre)}
                    </Link>

                    {/* Organismo */}
                    <p className="text-[11px] text-muted truncate mb-3">
                      {tender.nombre_organismo ? normalizeText(tender.nombre_organismo) : tender.codigo_externo}
                    </p>

                    {/* Footer: monto + urgency + actions */}
                    <div className="flex items-center gap-2 pt-2.5 border-t border-border mt-auto">
                      <div className="flex-1 min-w-0">
                        {tender.monto_estimado ? (
                          <p className="text-sm font-bold text-primary tabular-nums leading-none">
                            {formatCurrency(tender.monto_estimado)}
                          </p>
                        ) : (
                          <p className="text-[11px] text-subtle leading-none">Sin monto</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {tender.fecha_publicacion && (
                            <p className="text-[11px] text-subtle">
                              {format(new Date(tender.fecha_publicacion), 'dd MMM yy')}
                            </p>
                          )}
                          {urgency && (
                            <p className={`text-[11px] ${urgency.cls}`}>· {urgency.label}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={!hydrated}
                          onClick={(e) => { e.stopPropagation(); toggleTender('saved', tender); }}
                          title={isSaved ? 'Quitar guardada' : 'Guardar'}
                          className={`flex items-center justify-center rounded-lg border p-1.5 transition-all ${
                            isSaved ? 'border-primary/30 bg-primary/8 text-primary' : 'border-border bg-background text-muted hover:border-primary/25 hover:text-primary'
                          } ${!hydrated ? 'opacity-50' : ''}`}
                        >
                          {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          disabled={!hydrated}
                          onClick={(e) => { e.stopPropagation(); toggleTender('applied', tender); }}
                          title={isApplied ? 'Quitar postulación' : 'Postular'}
                          className={`flex items-center justify-center rounded-lg border p-1.5 transition-all ${
                            isApplied ? 'border-accent/30 bg-accent/8 text-accent' : 'border-border bg-background text-muted hover:border-accent/25 hover:text-accent'
                          } ${!hydrated ? 'opacity-50' : ''}`}
                        >
                          {isApplied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                        </button>
                        {tender.url_licitacion ? (
                          <a
                            href={tender.url_licitacion}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Ver en Mercado Público"
                            className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-muted hover:border-primary/25 hover:text-primary transition-all"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <Link
                            href={`/dashboard/tenders/${encodeURIComponent(tender.codigo_externo)}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Ver detalle"
                            className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-muted hover:border-primary/25 hover:text-primary transition-all"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-sm disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="px-3 text-xs text-muted">
                {page} / {pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="btn-secondary text-sm disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      {/* BI Panel */}
      {selectedTender && (
        <div className="card space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text line-clamp-1 leading-snug">
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

          {biLoading && (
            <div className="animate-pulse grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
              <div className="h-16 rounded-lg bg-border" />
              <div className="h-16 rounded-lg bg-border" />
              <div className="h-16 rounded-lg bg-border" />
            </div>
          )}

          {!biLoading && biError && (
            <p className="text-xs text-muted italic">Análisis BI no disponible para esta licitación.</p>
          )}

          {!biLoading && !biError && biPanel && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border bg-background px-3 py-2 space-y-1">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">Comprador</p>
                {biPanel.comprador.disponible ? (
                  <>
                    {biPanel.comprador.buyer_score != null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Score</span>
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
                  <p className="text-xs text-muted">Sin datos</p>
                )}
              </div>

              {biPanel.precios.length > 0 && biPanel.precios[0].disponible && biPanel.precios[0].p50 != null && (
                <div className="rounded-lg border border-border bg-background px-3 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">Precio referencia</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">P50</span>
                    <span className="font-semibold text-primary">
                      {biPanel.precios[0].p50 >= 1_000_000
                        ? `CLP ${(biPanel.precios[0].p50 / 1_000_000).toFixed(1)}M`
                        : `CLP ${(biPanel.precios[0].p50 / 1_000).toFixed(0)}K`}
                    </span>
                  </div>
                  {biPanel.precios[0].p25 != null && biPanel.precios[0].p75 != null && (
                    <p className="text-[10px] text-muted">
                      Rango: {biPanel.precios[0].p25 >= 1_000_000 ? `${(biPanel.precios[0].p25/1_000_000).toFixed(1)}M` : `${(biPanel.precios[0].p25/1_000).toFixed(0)}K`}
                      {' – '}
                      {biPanel.precios[0].p75 >= 1_000_000 ? `${(biPanel.precios[0].p75/1_000_000).toFixed(1)}M` : `${(biPanel.precios[0].p75/1_000).toFixed(0)}K`}
                    </p>
                  )}
                </div>
              )}

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

              {biPanel.ventana.disponible && biPanel.ventana.alerta_ventana_corta && (
                <div className="flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Ventana corta: {biPanel.ventana.window_days} días
                </div>
              )}
            </div>
          )}

          <Link
            href={`/dashboard/tenders/${encodeURIComponent(selectedTender.codigo_externo)}`}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-primary transition-all hover:border-primary/30 hover:bg-primary/5"
            onClick={(e) => e.stopPropagation()}
          >
            Ver análisis completo <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
