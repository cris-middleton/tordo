'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Search, Filter, Loader2, ExternalLink, Calendar, DollarSign, MapPin } from 'lucide-react';
import { format } from 'date-fns';

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
}

export default function TendersPage() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    estado: '',
    region: '',
    min_amount: '',
    max_amount: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const limit = 20;

  useEffect(() => {
    loadTenders();
  }, [page, filters]);

  const loadTenders = async () => {
    setLoading(true);
    try {
      const params: any = {
        offset: (page - 1) * limit,
        limit,
      };

      if (filters.search) params.search = filters.search;
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
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

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
              placeholder="Buscar por nombre o descripción..."
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {total.toLocaleString()} resultado{total !== 1 ? 's' : ''}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : tenders.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-muted">No se encontraron licitaciones</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {tenders.map((tender) => (
                <div key={tender.id} className="card-hover">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="mb-1 text-lg font-semibold text-text">
                          {tender.nombre}
                        </h3>
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
                            <DollarSign className="h-4 w-4 text-accent" />
                            <span>{formatCurrency(tender.monto_estimado)}</span>
                          </div>
                        )}
                        {tender.region && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primaryDark" />
                            <span>{tender.region}</span>
                          </div>
                        )}
                        {tender.estado && (
                          <span className="badge-primary text-xs">{tender.estado}</span>
                        )}
                      </div>

                      {tender.nombre_organismo && (
                        <p className="text-sm text-muted">
                          Organismo: {tender.nombre_organismo}
                        </p>
                      )}
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

