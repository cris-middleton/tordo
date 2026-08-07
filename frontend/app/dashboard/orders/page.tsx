'use client';

import { useState, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import SelectField from '@/components/SelectField';
import {
  Search,
  MapPin,
  BookmarkPlus,
  BookmarkCheck,
  Send,
  CheckCircle2,
  X,
  ExternalLink,
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

const ESTADOS_OC = [
  'Aceptada',
  'Cancelada',
  'En proceso',
  'Enviada a proveedor',
  'No aceptada',
  'Recepción Conforme',
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

interface OrderDetalle {
  id?: number;
  numero_actualizaciones?: number;
  estado_actual?: string;
  estado_proveedor_actual?: string;
  fecha_aceptacion_real?: string;
  fecha_entrega_real?: string;
  fecha_recepcion_real?: string;
  monto_final?: number;
  items?: any[];
}

type NivelEncaje = 'alto' | 'medio' | 'bajo' | 'sin_encaje';

interface Order {
  id: number;
  codigo_oc: string;
  nombre: string;
  descripcion?: string;
  fecha_publicacion: string;
  monto_total: number;
  estado?: string;
  region?: string;
  comuna?: string;
  nombre_organismo?: string;
  nombre_proveedor?: string;
  moneda?: string;
  detalle?: OrderDetalle;
  similarity_score?: number | null;
  score_encaje?: number | null;
  nivel_encaje?: NivelEncaje | null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    estado: 'En proceso',
    region: '',
    codigo_organismo: '',
    codigo_proveedor: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const { hydrated, isOrderStored, toggleOrder } = useDashboardCollections();

  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState('fecha_publicacion');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [firstEmpresaId, setFirstEmpresaId] = useState<string | null>(null);

  useEffect(() => {
    apiClient.getEmpresas().then((empresas: any[]) => {
      if (empresas?.[0]?.id) setFirstEmpresaId(String(empresas[0].id));
    }).catch(() => {});
  }, []);

  const loadOrders = useCallback(async () => {
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
      if (filters.codigo_organismo) params.codigo_organismo = filters.codigo_organismo;
      if (filters.codigo_proveedor) params.codigo_proveedor = filters.codigo_proveedor;
      if (keywords.length) params.search = keywords.join(' ');
      if (firstEmpresaId) params.empresa_id = firstEmpresaId;
      const response = await apiClient.getOrders(params);
      setOrders(response.data || []);
      setTotal(response.total_count || 0);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  }, [filters.codigo_organismo, filters.codigo_proveedor, filters.estado, filters.region, keywords, page, limit, sortBy, sortOrder, firstEmpresaId]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

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

  const formatCurrency = (amount: number, currency: string = 'CLP') => {
    if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
  };

  const getEstadoOCCls = (estado?: string | null) => {
    if (!estado) return 'bg-border/50 text-subtle border-border';
    const e = estado.toLowerCase();
    if (e.includes('aceptada') || e.includes('conforme')) return 'bg-accent/10 text-accent border-accent/20';
    if (e.includes('proceso') || e.includes('enviada')) return 'bg-info/10 text-info border-info/20';
    if (e.includes('cancelada') || e.includes('no aceptada')) return 'bg-danger/10 text-danger border-danger/20';
    return 'bg-border/50 text-muted border-border';
  };

  const getEstadoOCAccent = (estado?: string | null) => {
    if (!estado) return 'bg-primary/30';
    const e = estado.toLowerCase();
    if (e.includes('aceptada') || e.includes('conforme')) return 'bg-accent';
    if (e.includes('proceso') || e.includes('enviada')) return 'bg-info';
    if (e.includes('cancelada') || e.includes('no aceptada')) return 'bg-danger';
    return 'bg-primary/30';
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

  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Órdenes de Compra</h1>
        <p className="text-sm text-muted mt-0.5">Explora órdenes de compra públicas</p>
      </div>

      {/* Search + Filters */}
      <div className="card space-y-3 py-3 px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Nombre, organismo o proveedor — Enter para buscar"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeywordKeyDown}
            className="input-field pl-9 text-sm"
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SelectField
            value={filters.estado}
            onChange={(v) => handleFilterChange('estado', v)}
            options={[
              { value: '', label: 'Todos los estados' },
              ...ESTADOS_OC.map((e) => ({ value: e, label: e })),
            ]}
          />
          <SelectField
            value={filters.region ?? ''}
            onChange={(v) => handleFilterChange('region', v)}
            options={[
              { value: '', label: 'Todas las regiones' },
              ...REGIONES_CHILE.map((r) => ({ value: r, label: r.replace('Región de ', '').replace('Región del ', '').replace('Región ', '') })),
            ]}
          />
          <input
            type="text"
            placeholder="Organismo (nombre o código)"
            value={filters.codigo_organismo}
            onChange={(e) => handleFilterChange('codigo_organismo', e.target.value)}
            className="input-field text-sm col-span-2 sm:col-span-1"
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
            <option value="monto_total">Monto</option>
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
                  <div className="h-3 w-3/5 rounded bg-border" />
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
      ) : orders.length === 0 ? (
        <div className="card text-center py-12">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface">
            <Search className="h-7 w-7 text-muted" />
          </div>
          <p className="font-medium text-text">No se encontraron órdenes de compra</p>
          <p className="text-sm text-muted mt-1">Ajusta tus filtros o términos de búsqueda</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {orders.map((order) => {
              const isSaved = hydrated && isOrderStored('saved', order.id);
              const isApplied = hydrated && isOrderStored('applied', order.id);
              const estadoCls = getEstadoOCCls(order.estado);
              const accentCls = getEstadoOCAccent(order.estado);

              return (
                <div
                  key={order.id}
                  className="relative flex overflow-hidden rounded-xl border border-border bg-surface transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-md hover:border-primary/20"
                >
                  {/* Left accent bar */}
                  <div className={`w-1 shrink-0 ${accentCls}`} />

                  <div className="flex flex-col flex-1 min-w-0 px-4 pt-3.5 pb-3">
                    {/* Row 1: badge(s) + region */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {order.estado && (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${estadoCls}`}>
                            {normalizeText(order.estado)}
                          </span>
                        )}
                        {getEncajeBadge(order.nivel_encaje)}
                      </div>
                      {order.region && (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted shrink-0">
                          <MapPin className="h-2.5 w-2.5" />
                          {shortRegion(order.region)}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <Link
                      href={`/dashboard/orders/${encodeURIComponent(order.codigo_oc)}`}
                      className="text-sm font-semibold text-text leading-snug line-clamp-2 hover:text-primary transition-colors mb-0.5"
                    >
                      {normalizeText(order.nombre)}
                    </Link>

                    {/* Organismo + Proveedor */}
                    <div className="mb-3 space-y-0.5">
                      {order.nombre_organismo && (
                        <p className="text-[11px] text-muted truncate">
                          <span className="text-subtle">Org: </span>{normalizeText(order.nombre_organismo)}
                        </p>
                      )}
                      {order.nombre_proveedor && (
                        <p className="text-[11px] text-muted truncate">
                          <span className="text-subtle">Prov: </span>{normalizeText(order.nombre_proveedor)}
                        </p>
                      )}
                    </div>

                    {/* Footer: monto + date + actions */}
                    <div className="flex items-center gap-2 pt-2.5 border-t border-border mt-auto">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-primary tabular-nums leading-none">
                          {formatCurrency(order.monto_total, order.moneda)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {order.fecha_publicacion && (
                            <p className="text-[11px] text-subtle">
                              {format(new Date(order.fecha_publicacion), 'dd MMM yy')}
                            </p>
                          )}
                          <p className="text-[11px] text-subtle">· OC {order.codigo_oc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={!hydrated}
                          onClick={() => toggleOrder('saved', order)}
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
                          onClick={() => toggleOrder('applied', order)}
                          title={isApplied ? 'Quitar postulación' : 'Postular'}
                          className={`flex items-center justify-center rounded-lg border p-1.5 transition-all ${
                            isApplied ? 'border-accent/30 bg-accent/8 text-accent' : 'border-border bg-background text-muted hover:border-accent/25 hover:text-accent'
                          } ${!hydrated ? 'opacity-50' : ''}`}
                        >
                          {isApplied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                        </button>
                        <Link
                          href={`/dashboard/orders/${encodeURIComponent(order.codigo_oc)}`}
                          title="Ver detalle"
                          className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-muted hover:border-primary/25 hover:text-primary transition-all"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
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
    </div>
  );
}
