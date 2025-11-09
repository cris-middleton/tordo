'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { FileText, ShoppingCart, Bell, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    tenders: { total: 0, recent: 0 },
    orders: { total: 0, recent: 0 },
    alerts: { total: 0, unread: 0 },
  });
  const [loading, setLoading] = useState(true);

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
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy")}
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

      {/* Quick actions */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-text">Accesos rápidos</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <a
            href="/dashboard/tenders"
            className="rounded-lg border border-border bg-surface p-4 transition-colors duration-200 hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-medium text-text">Buscar Licitaciones</span>
            </div>
          </a>
          <a
            href="/dashboard/orders"
            className="rounded-lg border border-border bg-surface p-4 transition-colors duration-200 hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-5 w-5 text-emerald-600" />
              <span className="font-medium text-text">Ver Órdenes de Compra</span>
            </div>
          </a>
          <a
            href="/dashboard/alerts"
            className="rounded-lg border border-border bg-surface p-4 transition-colors duration-200 hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-amber-500" />
              <span className="font-medium text-text">Gestionar Alertas</span>
            </div>
          </a>
          <a
            href="/dashboard/settings"
            className="rounded-lg border border-border bg-surface p-4 transition-colors duration-200 hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-medium text-text">Configuración</span>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}

