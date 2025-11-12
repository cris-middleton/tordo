'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import {
  Search,
  Filter,
  Loader2,
  Calendar,
  DollarSign,
  MapPin,
  Building2,
  BookmarkPlus,
  BookmarkCheck,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useDashboardCollections } from '@/hooks/useDashboardCollections';

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
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    estado: '',
    codigo_organismo: '',
    codigo_proveedor: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const { hydrated, isOrderStored, toggleOrder } = useDashboardCollections();

  const limit = 20;

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        offset: (page - 1) * limit,
        limit,
      };

      if (filters.estado) params.estado = filters.estado;
      if (filters.codigo_organismo) params.codigo_organismo = filters.codigo_organismo;
      if (filters.codigo_proveedor) params.codigo_proveedor = filters.codigo_proveedor;
      const response = await apiClient.getOrders(params);
      setOrders(response.data || []);
      setTotal(response.total_count || 0);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  }, [filters.codigo_organismo, filters.codigo_proveedor, filters.estado, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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

  const removeKeyword = useCallback((value: string) => {
    setKeywords((prev) =>
      prev.filter((keyword) => keyword.toLowerCase() !== value.toLowerCase()),
    );
    setPage(1);
  }, []);

  const formatCurrency = (amount: number, currency: string = 'CLP') => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const pages = Math.ceil(total / limit);

  const normalizedKeywords = useMemo(
    () => keywords.map((keyword) => keyword.toLowerCase()),
    [keywords],
  );

  const filteredOrders = useMemo(() => {
    if (!normalizedKeywords.length) return orders;
    return orders.filter((order) => {
      const values = [
        order.codigo_oc,
        order.nombre,
        order.descripcion,
        order.fecha_publicacion,
        order.estado,
        order.region,
        order.comuna,
        order.nombre_organismo,
        order.nombre_proveedor,
        order.moneda,
        typeof order.monto_total === 'number' ? order.monto_total.toString() : '',
      ];
      const haystack = values
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .join(' ');
      return normalizedKeywords.every((keyword) => haystack.includes(keyword));
    });
  }, [normalizedKeywords, orders]);

  const displayCount = normalizedKeywords.length ? filteredOrders.length : total;
  const displayPage = normalizedKeywords.length ? 1 : page;
  const displayPages = normalizedKeywords.length ? 1 : pages;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-text sm:text-3xl">Órdenes de Compra</h1>
        <p className="text-muted">Explora órdenes de compra públicas</p>
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
          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">Estado</label>
              <input
                type="text"
                placeholder="Ej: Aceptada"
                value={filters.estado}
                onChange={(e) => handleFilterChange('estado', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">Código Organismo</label>
              <input
                type="text"
                placeholder="Código"
                value={filters.codigo_organismo}
                onChange={(e) => handleFilterChange('codigo_organismo', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">Código Proveedor</label>
              <input
                type="text"
                placeholder="Código"
                value={filters.codigo_proveedor}
                onChange={(e) => handleFilterChange('codigo_proveedor', e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {displayCount.toLocaleString()} resultado{displayCount !== 1 ? 's' : ''}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-muted">No se encontraron órdenes de compra</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const isSaved = hydrated && isOrderStored('saved', order.id);
                const isApplied = hydrated && isOrderStored('applied', order.id);
                return (
                  <div key={order.id} className="card-hover">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 space-y-3">
                        <div>
                          <Link
                            href={`/dashboard/orders/${encodeURIComponent(order.codigo_oc)}`}
                            className="mb-1 inline-block text-lg font-semibold text-primary hover:underline"
                          >
                            {order.nombre}
                          </Link>
                          <p className="text-sm text-muted">Código OC: {order.codigo_oc}</p>
                        </div>

                        {order.descripcion && (
                          <p className="line-clamp-2 text-sm text-muted">{order.descripcion}</p>
                        )}

                        <div className="flex flex-wrap gap-4 text-sm text-muted">
                          {order.fecha_publicacion && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-primary" />
                              <span>
                                {format(new Date(order.fecha_publicacion), 'dd MMM yyyy')}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-accent" />
                            <span className="font-semibold text-emerald-600">
                              {formatCurrency(order.monto_total, order.moneda)}
                            </span>
                          </div>
                          {order.region && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primaryDark" />
                              <span>{order.region}</span>
                            </div>
                          )}
                          {order.estado && (
                            <span className="badge-primary text-xs">{order.estado}</span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-3 border-t border-border pt-2 sm:grid-cols-2">
                          {order.nombre_organismo && (
                            <div className="flex items-start gap-2">
                              <Building2 className="mt-0.5 h-4 w-4 text-primary" />
                              <div>
                                <p className="text-xs text-muted">Organismo</p>
                                <p className="text-sm text-text">{order.nombre_organismo}</p>
                              </div>
                            </div>
                          )}
                          {order.nombre_proveedor && (
                            <div className="flex items-start gap-2">
                              <Building2 className="mt-0.5 h-4 w-4 text-primary" />
                              <div>
                                <p className="text-xs text-muted">Proveedor</p>
                                <p className="text-sm text-text">{order.nombre_proveedor}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:items-end">
                        <button
                          type="button"
                          disabled={!hydrated}
                          onClick={() => toggleOrder('saved', order)}
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
                          onClick={() => toggleOrder('applied', order)}
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
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
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

