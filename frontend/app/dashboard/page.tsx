'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import {
  FileText,
  ShoppingCart,
  Bell,
  TrendingUp,
  Bookmark,
  Send,
  Calendar,
  DollarSign,
  MapPin,
  Building2,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDashboardCollections } from '@/hooks/useDashboardCollections';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    tenders: { total: 0, recent: 0 },
    orders: { total: 0, recent: 0 },
    alerts: { total: 0, unread: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    tenders: { saved: false, applied: false },
    orders: { saved: false, applied: false },
  });
  const { collections, counts, hydrated, toggleTender, toggleOrder } = useDashboardCollections();

  const savedChartData = useMemo(
    () => [
      { name: 'Licitaciones', value: counts.tenders.saved },
      { name: 'Órdenes', value: counts.orders.saved },
    ],
    [counts],
  );

  const appliedChartData = useMemo(
    () => [
      { name: 'Licitaciones', value: counts.tenders.applied },
      { name: 'Órdenes', value: counts.orders.applied },
    ],
    [counts],
  );

  // Normalize text to Title Case (first letter uppercase, rest lowercase)
  const normalizeText = (text: string | undefined): string => {
    if (!text) return '';
    return text
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatStoredDate = (iso: string) => {
    try {
      return format(new Date(iso), 'dd MMM yyyy HH:mm', { locale: es });
    } catch (error) {
      return '';
    }
  };

  const formatCurrency = (amount?: number, currency: string = 'CLP') => {
    if (typeof amount !== 'number') return 'N/A';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [tendersRes, ordersRes, alertsRes] = await Promise.all([
        apiClient.getTenders({ limit: 1 }),
        apiClient.getOrders({ limit: 1 }),
        apiClient.getAlerts({ limit: 1 }),
      ]);

      setStats({
        tenders: {
          total: tendersRes.total || 0,
          recent: 0, // Could calculate recent based on date
        },
        orders: {
          total: ordersRes.total_count || 0,
          recent: 0,
        },
        alerts: {
          total: alertsRes.total || 0,
          unread: alertsRes.unread_count || 0,
        },
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Licitaciones',
      value: stats.tenders.total,
      icon: FileText,
      color: 'blue',
    },
    {
      title: 'Órdenes de Compra',
      value: stats.orders.total,
      icon: ShoppingCart,
      color: 'green',
    },
    {
      title: 'Alertas',
      value: stats.alerts.unread,
      subtitle: `${stats.alerts.total} total`,
      icon: Bell,
      color: 'yellow',
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="animate-pulse text-muted">Cargando estadísticas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-semibold text-text sm:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted">
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const colorClasses = {
            blue: 'bg-primary/10 border-primary/30 text-primary',
            green: 'bg-emerald-100 border-emerald-200 text-emerald-600',
            yellow: 'bg-amber-100 border-amber-200 text-amber-600',
          };

          return (
            <div key={stat.title} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="mb-1 text-sm text-muted">{stat.title}</p>
                  <p className="text-2xl font-semibold text-text sm:text-3xl">
                    {stat.value.toLocaleString()}
                  </p>
                  {stat.subtitle && (
                    <p className="mt-1 text-xs text-muted">{stat.subtitle}</p>
                  )}
                </div>
                <div
                  className={`rounded-lg border ${colorClasses[stat.color as keyof typeof colorClasses]} p-3`}
                >
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Saved/applied charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Guardados</h2>
            <Bookmark className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-4 h-64">
            {!hydrated ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Cargando datos locales...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={savedChartData}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis
                    allowDecimals={false}
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}`, 'Total']}
                    cursor={{ fill: 'rgba(99, 102, 241, 0.12)' }}
                  />
                  <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Aplicados</h2>
            <Send className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-4 h-64">
            {!hydrated ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Cargando datos locales...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={appliedChartData}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis
                    allowDecimals={false}
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}`, 'Total']}
                    cursor={{ fill: 'rgba(16, 185, 129, 0.12)' }}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Combined Collections with Tabs */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Licitaciones */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-lg font-semibold text-text">Licitaciones</h3>
            <div className="flex gap-2 text-xs text-muted">
              <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                {counts.tenders.saved} guardadas
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-600">
                {counts.tenders.applied} aplicadas
              </span>
            </div>
          </div>

          {/* Guardadas Section */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() =>
                setExpandedSections((prev) => ({
                  ...prev,
                  tenders: { ...prev.tenders, saved: !prev.tenders.saved },
                }))
              }
              className="flex w-full items-center justify-between rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-primary" />
                <span className="font-medium text-text">
                  Guardadas ({collections.tenders.saved.length})
                </span>
              </div>
              {expandedSections.tenders.saved ? (
                <ChevronUp className="h-4 w-4 text-muted" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted" />
              )}
            </button>
            {expandedSections.tenders.saved && (
              <div className="max-h-96 space-y-2 overflow-y-auto pl-4">
                {!hydrated ? (
                  <p className="text-sm text-muted">Cargando datos locales...</p>
                ) : collections.tenders.saved.length === 0 ? (
                  <p className="text-sm text-muted">No hay licitaciones guardadas aún.</p>
                ) : (
                  collections.tenders.saved.map((item) => (
                    <div
                      key={`tender-saved-${item.id}`}
                      className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <Link
                              href={`/dashboard/tenders/${encodeURIComponent(item.codigo_externo)}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {normalizeText(item.nombre)}
                            </Link>
                            <p className="text-xs text-muted">Código: {item.codigo_externo}</p>
                          </div>
                          <button
                            type="button"
                            aria-label="Quitar de guardados"
                            className="rounded-md border border-border p-1 text-muted hover:border-destructive/40 hover:text-destructive"
                            onClick={() => toggleTender('saved', item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted">
                          {item.region && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {normalizeText(item.region)}
                            </span>
                          )}
                          {typeof item.monto_estimado === 'number' && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {formatCurrency(item.monto_estimado)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Guardado: {formatStoredDate(item.storedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Aplicadas Section */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() =>
                setExpandedSections((prev) => ({
                  ...prev,
                  tenders: { ...prev.tenders, applied: !prev.tenders.applied },
                }))
              }
              className="flex w-full items-center justify-between rounded-lg border border-border bg-surface p-3 transition-colors hover:border-emerald-400/40"
            >
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-emerald-600" />
                <span className="font-medium text-text">
                  Aplicadas ({collections.tenders.applied.length})
                </span>
              </div>
              {expandedSections.tenders.applied ? (
                <ChevronUp className="h-4 w-4 text-muted" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted" />
              )}
            </button>
            {expandedSections.tenders.applied && (
              <div className="max-h-96 space-y-2 overflow-y-auto pl-4">
                {!hydrated ? (
                  <p className="text-sm text-muted">Cargando datos locales...</p>
                ) : collections.tenders.applied.length === 0 ? (
                  <p className="text-sm text-muted">No hay licitaciones aplicadas aún.</p>
                ) : (
                  collections.tenders.applied.map((item) => (
                    <div
                      key={`tender-applied-${item.id}`}
                      className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-emerald-400/40"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <Link
                              href={`/dashboard/tenders/${encodeURIComponent(item.codigo_externo)}`}
                              className="font-medium text-emerald-600 hover:underline"
                            >
                              {normalizeText(item.nombre)}
                            </Link>
                            <p className="text-xs text-muted">Código: {item.codigo_externo}</p>
                          </div>
                          <button
                            type="button"
                            aria-label="Quitar de aplicados"
                            className="rounded-md border border-border p-1 text-muted hover:border-destructive/40 hover:text-destructive"
                            onClick={() => toggleTender('applied', item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted">
                          {item.region && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {normalizeText(item.region)}
                            </span>
                          )}
                          {typeof item.monto_estimado === 'number' && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {formatCurrency(item.monto_estimado)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Aplicada: {formatStoredDate(item.storedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Órdenes de Compra */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-lg font-semibold text-text">Órdenes de Compra</h3>
            <div className="flex gap-2 text-xs text-muted">
              <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                {counts.orders.saved} guardadas
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-600">
                {counts.orders.applied} aplicadas
              </span>
            </div>
          </div>

          {/* Guardadas Section */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() =>
                setExpandedSections((prev) => ({
                  ...prev,
                  orders: { ...prev.orders, saved: !prev.orders.saved },
                }))
              }
              className="flex w-full items-center justify-between rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-primary" />
                <span className="font-medium text-text">
                  Guardadas ({collections.orders.saved.length})
                </span>
              </div>
              {expandedSections.orders.saved ? (
                <ChevronUp className="h-4 w-4 text-muted" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted" />
              )}
            </button>
            {expandedSections.orders.saved && (
              <div className="max-h-96 space-y-2 overflow-y-auto pl-4">
                {!hydrated ? (
                  <p className="text-sm text-muted">Cargando datos locales...</p>
                ) : collections.orders.saved.length === 0 ? (
                  <p className="text-sm text-muted">No hay órdenes guardadas aún.</p>
                ) : (
                  collections.orders.saved.map((item) => (
                    <div
                      key={`order-saved-${item.id}`}
                      className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <Link
                              href={`/dashboard/orders/${encodeURIComponent(item.codigo_oc)}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {normalizeText(item.nombre)}
                            </Link>
                            <p className="text-xs text-muted">Código OC: {item.codigo_oc}</p>
                          </div>
                          <button
                            type="button"
                            aria-label="Quitar de guardados"
                            className="rounded-md border border-border p-1 text-muted hover:border-destructive/40 hover:text-destructive"
                            onClick={() => toggleOrder('saved', item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted">
                          {item.region && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {normalizeText(item.region)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {formatCurrency(item.monto_total, item.moneda || 'CLP')}
                          </span>
                          {item.nombre_proveedor && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {normalizeText(item.nombre_proveedor)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Guardado: {formatStoredDate(item.storedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Aplicadas Section */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() =>
                setExpandedSections((prev) => ({
                  ...prev,
                  orders: { ...prev.orders, applied: !prev.orders.applied },
                }))
              }
              className="flex w-full items-center justify-between rounded-lg border border-border bg-surface p-3 transition-colors hover:border-emerald-400/40"
            >
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-emerald-600" />
                <span className="font-medium text-text">
                  Aplicadas ({collections.orders.applied.length})
                </span>
              </div>
              {expandedSections.orders.applied ? (
                <ChevronUp className="h-4 w-4 text-muted" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted" />
              )}
            </button>
            {expandedSections.orders.applied && (
              <div className="max-h-96 space-y-2 overflow-y-auto pl-4">
                {!hydrated ? (
                  <p className="text-sm text-muted">Cargando datos locales...</p>
                ) : collections.orders.applied.length === 0 ? (
                  <p className="text-sm text-muted">No hay órdenes aplicadas aún.</p>
                ) : (
                  collections.orders.applied.map((item) => (
                    <div
                      key={`order-applied-${item.id}`}
                      className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-emerald-400/40"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <Link
                              href={`/dashboard/orders/${encodeURIComponent(item.codigo_oc)}`}
                              className="font-medium text-emerald-600 hover:underline"
                            >
                              {normalizeText(item.nombre)}
                            </Link>
                            <p className="text-xs text-muted">Código OC: {item.codigo_oc}</p>
                          </div>
                          <button
                            type="button"
                            aria-label="Quitar de aplicados"
                            className="rounded-md border border-border p-1 text-muted hover:border-destructive/40 hover:text-destructive"
                            onClick={() => toggleOrder('applied', item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted">
                          {item.region && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {normalizeText(item.region)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {formatCurrency(item.monto_total, item.moneda || 'CLP')}
                          </span>
                          {item.nombre_proveedor && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {normalizeText(item.nombre_proveedor)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Aplicada: {formatStoredDate(item.storedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

