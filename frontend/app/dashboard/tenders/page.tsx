'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import {
  Search,
  Filter,
  Loader2,
  ExternalLink,
  Calendar,
  DollarSign,
  MapPin,
  BookmarkPlus,
  BookmarkCheck,
  Send,
  CheckCircle2,
} from 'lucide-react';
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

export default function TendersPage() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filters, setFilters] = useState({
    estado: '',
    region: '',
    min_amount: '',
    max_amount: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const { hydrated, isTenderStored, toggleTender } = useDashboardCollections();

  const [limit, setLimit] = useState(20);

  const loadTenders = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        offset: (page - 1) * limit,
        limit,
      };

      if (filters.estado) params.estado = filters.estado;
      if (filters.region) params.region = filters.region;
      if (filters.min_amount) params.min_amount = parseFloat(filters.min_amount);
      if (filters.max_amount) params.max_amount = parseFloat(filters.max_amount);
      const response = await apiClient.getTenders(params);
      setTenders(response.items || []);
      setTotal(response.total || 0);
      setPages(response.pages || 1);
    } catch (error) {
      console.error('Error loading tenders:', error);
    } finally {
      setLoading(false);
    }
  }, [filters.estado, filters.max_amount, filters.min_amount, filters.region, page, limit]);

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
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const normalizedKeywords = useMemo(
    () => keywords.map((keyword) => keyword.toLowerCase()),
    [keywords],
  );

  const filteredTenders = useMemo(() => {
    if (!normalizedKeywords.length) return tenders;
    return tenders.filter((tender) => {
      const values = [
        tender.codigo_externo,
        tender.nombre,
        tender.descripcion,
        tender.fecha_publicacion,
        tender.fecha_cierre,
        tender.estado,
        tender.region,
        tender.comuna,
        tender.nombre_organismo,
        typeof tender.monto_estimado === 'number' ? tender.monto_estimado.toString() : '',
      ];
      const haystack = values
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .join(' ');
      return normalizedKeywords.every((keyword) => haystack.includes(keyword));
    });
  }, [normalizedKeywords, tenders]);

  const displayCount = normalizedKeywords.length ? filteredTenders.length : total;
  const displayPage = normalizedKeywords.length ? 1 : page;
  const displayPages = normalizedKeywords.length ? 1 : pages;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-text sm:text-3xl">Licitaciones</h1>
        <p className="text-muted">Busca y explora licitaciones públicas</p>
      </div>

      {/* Search and filters */}
      <div className="card space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Buscar por palabra clave y presiona Enter..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              className="input-field pl-10"
              autoComplete="off"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center gap-2 sm:w-auto w-full justify-center"
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
        </div>

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                {keyword}
                <button
                  type="button"
                  className="text-primary transition-colors hover:text-primaryDark"
                  onClick={() => removeKeyword(keyword)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {showFilters && (
          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">Estado</label>
              <input
                type="text"
                placeholder="Ej: Publicada"
                value={filters.estado}
                onChange={(e) => handleFilterChange('estado', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">Región</label>
              <input
                type="text"
                placeholder="Ej: Metropolitana"
                value={filters.region}
                onChange={(e) => handleFilterChange('region', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">Monto mínimo</label>
              <input
                type="number"
                placeholder="0"
                value={filters.min_amount}
                onChange={(e) => handleFilterChange('min_amount', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">Monto máximo</label>
              <input
                type="number"
                placeholder="0"
                value={filters.max_amount}
                onChange={(e) => handleFilterChange('max_amount', e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {displayCount.toLocaleString()} resultado{displayCount !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="per-page" className="text-sm text-muted">
              Registros por página:
            </label>
            <select
              id="per-page"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="input-field w-auto min-w-[100px]"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
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
        ) : filteredTenders.length === 0 ? (
          <div className="card text-center py-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface">
              <Search className="h-8 w-8 text-muted" />
            </div>
            <p className="mb-2 text-lg font-medium text-text">No se encontraron licitaciones</p>
            <p className="text-sm text-muted">Intenta ajustar tus filtros o términos de búsqueda</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {filteredTenders.map((tender) => {
                const isSaved = hydrated && isTenderStored('saved', tender.id);
                const isApplied = hydrated && isTenderStored('applied', tender.id);
                return (
                  <div key={tender.id} className="card-hover">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div className="flex-1 space-y-3">
                        <div>
                          <Link
                            href={`/dashboard/tenders/${encodeURIComponent(tender.codigo_externo)}`}
                            className="mb-1 inline-block text-lg font-semibold text-primary hover:underline"
                          >
                            {normalizeText(tender.nombre)}
                          </Link>
                          <p className="text-sm text-muted">Código: {tender.codigo_externo}</p>
                        </div>

                        {tender.descripcion && (
                          <p className="line-clamp-2 text-sm text-muted">
                            {tender.descripcion}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-4 text-sm text-muted">
                          {tender.fecha_publicacion && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-primary" />
                              <span>
                                {format(new Date(tender.fecha_publicacion), 'dd MMM yyyy')}
                              </span>
                            </div>
                          )}
                          {tender.monto_estimado && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-emerald-600">
                                {formatCurrency(tender.monto_estimado)}
                              </span>
                            </div>
                          )}
                          {tender.region && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primaryDark" />
                              <span>{normalizeText(tender.region)}</span>
                            </div>
                          )}
                          {tender.estado && (
                            <span className="badge-primary text-xs">{normalizeText(tender.estado)}</span>
                          )}
                        </div>

                        {tender.nombre_organismo && (
                          <p className="text-sm text-muted">
                            Organismo: {normalizeText(tender.nombre_organismo)}
                          </p>
                        )}

                        {/* Detalle information */}
                        {tender.detalle && (
                          <div className="mt-3 space-y-2 border-t border-border pt-3">
                            {tender.detalle.numero_actualizaciones !== undefined && (
                              <p className="text-xs text-muted">
                                Actualizaciones: {tender.detalle.numero_actualizaciones}
                              </p>
                            )}
                            {tender.detalle.estado_actual && (
                              <p className="text-xs text-muted">
                                Estado actual: {normalizeText(tender.detalle.estado_actual)}
                              </p>
                            )}
                            {tender.detalle.fecha_adjudicacion && (
                              <p className="text-xs text-muted">
                                Fecha adjudicación: {format(new Date(tender.detalle.fecha_adjudicacion), 'dd MMM yyyy')}
                              </p>
                            )}
                            {tender.detalle.proveedor_adjudicado && (
                              <p className="text-xs text-muted">
                                Proveedor adjudicado: {normalizeText(tender.detalle.proveedor_adjudicado)}
                              </p>
                            )}
                            {tender.detalle.monto_adjudicado && (
                              <p className="text-xs text-muted">
                                Monto adjudicado: {tender.detalle.monto_adjudicado}
                              </p>
                            )}
                            {tender.detalle.items && Array.isArray(tender.detalle.items) && tender.detalle.items.length > 0 && (
                              <p className="text-xs text-muted">
                                Items: {tender.detalle.items.length}
                              </p>
                            )}
                            {tender.detalle.participantes && Array.isArray(tender.detalle.participantes) && tender.detalle.participantes.length > 0 && (
                              <p className="text-xs text-muted">
                                Participantes: {tender.detalle.participantes.length}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 sm:items-end">
                        <div className="flex flex-col gap-2 sm:items-end">
                          <button
                            type="button"
                            disabled={!hydrated}
                            onClick={() => toggleTender('saved', tender)}
                            className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                              isSaved
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-surface text-text hover:border-primary/40'
                            } ${hydrated ? '' : 'opacity-60'}`}
                          >
                            {isSaved ? (
                              <BookmarkCheck className="h-4 w-4" />
                            ) : (
                              <BookmarkPlus className="h-4 w-4" />
                            )}
                            {isSaved ? 'Guardada' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            disabled={!hydrated}
                            onClick={() => toggleTender('applied', tender)}
                            className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                              isApplied
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                                : 'border-border bg-surface text-text hover:border-emerald-400'
                            } ${hydrated ? '' : 'opacity-60'}`}
                          >
                            {isApplied ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            {isApplied ? 'Aplicada' : 'Aplicar'}
                          </button>
                        </div>
                        {tender.url_licitacion && (
                          <a
                            href={tender.url_licitacion}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary flex items-center gap-2 sm:w-auto w-full justify-center"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Ver más
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {displayPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={displayPage === 1}
                  className="btn-secondary disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="px-4 text-sm text-muted">
                  Página {displayPage} de {displayPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(displayPages, p + 1))}
                  disabled={displayPage === displayPages}
                  className="btn-secondary disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

