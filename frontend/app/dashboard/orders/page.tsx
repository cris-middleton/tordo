'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Search, Filter, Loader2, Calendar, DollarSign, MapPin, Building2 } from 'lucide-react';
import { format } from 'date-fns';

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
    search: '',
    estado: '',
    codigo_organismo: '',
    codigo_proveedor: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const limit = 20;

  useEffect(() => {
    loadOrders();
  }, [page, filters]);

  const loadOrders = async () => {
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
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const formatCurrency = (amount: number, currency: string = 'CLP') => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const pages = Math.ceil(total / limit);

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
              placeholder="Buscar por código OC..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="input-field pl-10"
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
            {total.toLocaleString()} resultado{total !== 1 ? 's' : ''}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-muted">No se encontraron órdenes de compra</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="card-hover">
                  <div className="space-y-3">
                    <div>
                      <h3 className="mb-1 text-lg font-semibold text-text">{order.nombre}</h3>
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
                </div>
              ))}
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
    </div>
  );
}

