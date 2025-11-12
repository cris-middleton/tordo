'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { Bell, Check, Trash2, Loader2, Plus, Filter } from 'lucide-react';
import { format } from 'date-fns';

interface Alert {
  id: number;
  alert_type: string;
  status: string;
  title: string;
  message?: string;
  created_at: string;
  read_at?: string;
  metadata?: any;
}

interface AlertPreference {
  id: number;
  name: string;
  is_active: boolean;
  keywords?: string[];
  min_amount?: number;
  max_amount?: number;
  estados?: string[];
  regiones?: string[];
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [preferences, setPreferences] = useState<AlertPreference[]>([]);
  const [loading, setLoading] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');
  const [showPrefs, setShowPrefs] = useState(false);

  const limit = 20;

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        offset: (page - 1) * limit,
        limit,
        unread_only: filter === 'unread',
      };

      const response = await apiClient.getAlerts(params);
      setAlerts(response.items || []);
      setTotal(response.total || 0);
      setUnreadCount(response.unread_count || 0);
      setPages(response.pages || 1);
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  const loadPreferences = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const data = await apiClient.getAlertPreferences(false);
      setPreferences(data || []);
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const markAsRead = async (id: number) => {
    try {
      await apiClient.markAlertAsRead(id);
      loadAlerts();
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const deleteAlert = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta alerta?')) return;
    try {
      await apiClient.deleteAlert(id);
      loadAlerts();
    } catch (error) {
      console.error('Error deleting alert:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-semibold text-text sm:text-3xl">Alertas</h1>
          <p className="text-sm text-muted">
            {unreadCount > 0 && (
              <span className="font-semibold text-primary">{unreadCount} sin leer</span>
            )}{' '}
            {total} total
          </p>
        </div>
        <button
          onClick={() => setShowPrefs(!showPrefs)}
          className="btn-primary flex w-full items-center justify-center gap-2 sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          Gestionar Preferencias
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setFilter('unread');
              setPage(1);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              filter === 'unread'
                ? 'bg-primary text-white shadow-sm'
                : 'border border-border bg-surface text-muted hover:border-primary/40 hover:text-primary'
            }`}
          >
            Sin leer ({unreadCount})
          </button>
          <button
            onClick={() => {
              setFilter('all');
              setPage(1);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'border border-border bg-surface text-muted hover:border-primary/40 hover:text-primary'
            }`}
          >
            Todas ({total})
          </button>
        </div>
      </div>

      {/* Preferences section */}
      {showPrefs && (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-text">Preferencias de Alertas</h2>
          {prefsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : preferences.length === 0 ? (
            <p className="py-8 text-center text-muted">
              No hay preferencias configuradas. Crea una nueva preferencia para recibir alertas.
            </p>
          ) : (
            <div className="space-y-3">
              {preferences.map((pref) => (
                <div
                  key={pref.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-4"
                >
                  <div>
                    <h3 className="font-medium text-text">{pref.name}</h3>
                    <p className="text-sm text-muted">
                      {pref.is_active ? 'Activa' : 'Inactiva'}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      pref.is_active
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-gray-100 text-muted'
                    }`}
                  >
                    {pref.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alerts list */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="card py-12 text-center">
            <Bell className="mx-auto mb-4 h-12 w-12 text-muted" />
            <p className="text-muted">
              No hay alertas {filter === 'unread' ? 'sin leer' : ''}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`card ${
                    alert.status !== 'READ' ? 'border-l-4 border-l-primary/70' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Bell
                          className={`h-5 w-5 ${
                            alert.status !== 'READ' ? 'text-primary' : 'text-muted'
                          }`}
                        />
                        <h3 className="font-semibold text-text">{alert.title}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            alert.status === 'READ'
                              ? 'bg-gray-100 text-muted'
                              : alert.status === 'UNREAD'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-amber-100 text-amber-600'
                          }`}
                        >
                          {alert.status}
                        </span>
                      </div>
                      {alert.message && (
                        <p className="text-sm text-muted">{alert.message}</p>
                      )}
                      <p className="text-xs text-muted">
                        {format(new Date(alert.created_at), "dd MMM yyyy 'a las' HH:mm")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {alert.status !== 'READ' && (
                        <button
                          onClick={() => markAsRead(alert.id)}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-600 transition-colors duration-200 hover:bg-emerald-100"
                          title="Marcar como leída"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteAlert(alert.id)}
                        className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-500 transition-colors duration-200 hover:bg-red-100"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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

