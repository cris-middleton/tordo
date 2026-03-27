'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { Bell, Check, Trash2, Loader2, Plus, Filter, Pencil, X } from 'lucide-react';
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
  keywords: string[];
  min_amount: number | null;
  max_amount: number | null;
  estados: string[];
  regiones: string[];
  notify_email: boolean;
  notify_in_app: boolean;
  notify_webhook: boolean;
  webhook_url: string | null;
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

  const [showModal, setShowModal] = useState(false);
  const [editingPref, setEditingPref] = useState<AlertPreference | null>(null);
  const [saving, setSaving] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formKeywords, setFormKeywords] = useState('');
  const [formMinAmount, setFormMinAmount] = useState('');
  const [formMaxAmount, setFormMaxAmount] = useState('');
  const [formRegiones, setFormRegiones] = useState<string[]>([]);
  const [formNotifyEmail, setFormNotifyEmail] = useState(true);
  const [formNotifyInApp, setFormNotifyInApp] = useState(true);
  const [formNotifyWebhook, setFormNotifyWebhook] = useState(false);

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

  const REGIONES_CHILE = [
    'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
    'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble', 'Biobío',
    'Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
  ];

  function openCreate() {
    setEditingPref(null);
    setFormName(''); setFormKeywords(''); setFormMinAmount(''); setFormMaxAmount('');
    setFormRegiones([]); setFormNotifyEmail(true); setFormNotifyInApp(true); setFormNotifyWebhook(false);
    setPrefError(null); setShowModal(true);
  }

  function openEdit(p: AlertPreference) {
    setEditingPref(p);
    setFormName(p.name);
    setFormKeywords((p.keywords ?? []).join(', '));
    setFormMinAmount(p.min_amount != null ? String(p.min_amount) : '');
    setFormMaxAmount(p.max_amount != null ? String(p.max_amount) : '');
    setFormRegiones(p.regiones ?? []);
    setFormNotifyEmail(p.notify_email); setFormNotifyInApp(p.notify_in_app); setFormNotifyWebhook(p.notify_webhook);
    setPrefError(null); setShowModal(true);
  }

  async function handleSavePref() {
    if (!formName.trim()) { setPrefError('El nombre es obligatorio'); return; }
    setSaving(true); setPrefError(null);
    const payload: Record<string, unknown> = {
      name: formName.trim(),
      keywords: formKeywords.split(',').map((k) => k.trim()).filter(Boolean),
      min_amount: formMinAmount ? Number(formMinAmount) : null,
      max_amount: formMaxAmount ? Number(formMaxAmount) : null,
      regiones: formRegiones.length > 0 ? formRegiones : null,
      notify_email: formNotifyEmail, notify_in_app: formNotifyInApp, notify_webhook: formNotifyWebhook,
    };
    try {
      if (editingPref) { await apiClient.updateAlertPreference(editingPref.id, payload); }
      else { await apiClient.createAlertPreference(payload); }
      setShowModal(false); loadPreferences();
    } catch (err: any) {
      setPrefError(err?.response?.data?.detail ?? 'Error al guardar preferencia');
    } finally { setSaving(false); }
  }

  async function handleDeletePref(p: AlertPreference) {
    if (!confirm(`¿Eliminar la preferencia "${p.name}"?`)) return;
    try { await apiClient.deleteAlertPreference(p.id); loadPreferences(); }
    catch (err: any) { alert(err?.response?.data?.detail ?? 'Error al eliminar'); }
  }

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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Preferencias de Alertas</h2>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="h-4 w-4" /> Nueva preferencia
            </button>
          </div>
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
                  className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-4"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-text">{pref.name}</h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          pref.is_active
                            ? 'bg-accent/15 text-accent'
                            : 'bg-border text-muted'
                        }`}
                      >
                        {pref.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    {pref.keywords && pref.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {pref.keywords.map((kw, idx) => (
                          <span key={idx} className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted">
                      {pref.min_amount != null && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">
                          Min: ${pref.min_amount.toLocaleString('es-CL')}
                        </span>
                      )}
                      {pref.max_amount != null && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">
                          Max: ${pref.max_amount.toLocaleString('es-CL')}
                        </span>
                      )}
                      {pref.regiones && pref.regiones.length > 0 && (
                        <span className="rounded bg-gold/10 px-2 py-0.5 text-gold">
                          {pref.regiones.length} {pref.regiones.length === 1 ? 'región' : 'regiones'}
                        </span>
                      )}
                      {pref.notify_email && <span className="rounded bg-border px-2 py-0.5 text-muted">Email</span>}
                      {pref.notify_in_app && <span className="rounded bg-border px-2 py-0.5 text-muted">In-app</span>}
                      {pref.notify_webhook && <span className="rounded bg-border px-2 py-0.5 text-muted">Webhook</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(pref)}
                      className="rounded-lg border border-border bg-surface p-2 text-muted transition-colors hover:border-primary/40 hover:text-primary"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePref(pref)}
                      className="rounded-lg border border-danger/30 bg-danger/10 p-2 text-danger transition-colors hover:bg-danger/20"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit preference modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-surface border border-border p-6 shadow-card-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text">
                {editingPref ? 'Editar preferencia' : 'Nueva preferencia'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            {prefError && (
              <div className="mb-4 rounded-lg bg-danger/10 border border-danger/20 px-4 py-2 text-sm text-danger">{prefError}</div>
            )}

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-text">Nombre *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Licitaciones de tecnología"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Keywords */}
              <div>
                <label className="mb-1 block text-sm font-medium text-text">Palabras clave (separadas por coma)</label>
                <input
                  type="text"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="Ej: software, computadores, licencias"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Min / Max amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">Monto mínimo</label>
                  <input
                    type="number"
                    value={formMinAmount}
                    onChange={(e) => setFormMinAmount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">Monto máximo</label>
                  <input
                    type="number"
                    value={formMaxAmount}
                    onChange={(e) => setFormMaxAmount(e.target.value)}
                    placeholder="Sin límite"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Regiones */}
              <div>
                <label className="mb-1 block text-sm font-medium text-text">Regiones</label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface p-2">
                  <div className="grid grid-cols-2 gap-1">
                    {REGIONES_CHILE.map((r) => (
                      <label key={r} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-border cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formRegiones.includes(r)}
                          onChange={(e) => {
                            if (e.target.checked) setFormRegiones([...formRegiones, r]);
                            else setFormRegiones(formRegiones.filter((x) => x !== r));
                          }}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-text">{r}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notification channels */}
              <div>
                <label className="mb-1 block text-sm font-medium text-text">Canales de notificación</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formNotifyEmail}
                      onChange={(e) => setFormNotifyEmail(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-text">Email</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formNotifyInApp}
                      onChange={(e) => setFormNotifyInApp(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-text">In-app</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formNotifyWebhook}
                      onChange={(e) => setFormNotifyWebhook(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-text">Webhook</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-border/60"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePref}
                disabled={saving}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingPref ? 'Guardar cambios' : 'Crear preferencia'}
              </button>
            </div>
          </div>
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
                    alert.status !== 'read' ? 'border-l-4 border-l-primary/70' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Bell
                          className={`h-5 w-5 ${
                            alert.status !== 'read' ? 'text-primary' : 'text-muted'
                          }`}
                        />
                        <h3 className="font-semibold text-text">{alert.title}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            alert.status === 'read'
                              ? 'bg-border text-muted'
                              : alert.status === 'pending'
                              ? 'bg-primary/15 text-primary'
                              : 'bg-gold/15 text-gold'
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
                      {alert.status !== 'read' && (
                        <button
                          onClick={() => markAsRead(alert.id)}
                          className="rounded-lg border border-accent/30 bg-accent/10 p-2 text-accent transition-colors duration-200 hover:bg-accent/20"
                          title="Marcar como leída"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteAlert(alert.id)}
                        className="rounded-lg border border-danger/30 bg-danger/10 p-2 text-danger transition-colors duration-200 hover:bg-danger/20"
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

