'use client';

import { useState, useEffect, useSyncExternalStore, FormEvent } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanActual } from '@/lib/queries';
import { incluyePro } from '@/lib/plan';
import { Save, Loader2, Mail, Bell, Webhook, Lock, Eye, EyeOff, MessageCircle, CreditCard, ExternalLink, Sun, Moon, Monitor, ChevronDown, FileText } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { mensajeDeError } from '@/lib/errores';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { data: plan } = usePlanActual();
  const { theme, setTheme } = useTheme();
  // `mounted` existe porque next-themes no sabe el tema hasta hidratar.
  // `useSyncExternalStore` lo expresa sin efecto: en el servidor devuelve false,
  // en el cliente true, y no hay render de más.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    notification_email: true,
    notification_in_app: true,
    notification_webhook: false,
    recibe_informe_semanal: true,
    webhook_url: '',
  });
  const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // Sincronizar un formulario con datos que llegan después SÍ es un efecto: el
  // usuario puede haber empezado a escribir, así que no se puede derivar sin
  // pisarle lo tecleado. Excepción puntual y razonada.
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        full_name: user.full_name || '',
        email: user.email || '',
        notification_email: user.notification_email ?? true,
        recibe_informe_semanal: user.recibe_informe_semanal ?? true,
        notification_in_app: user.notification_in_app ?? true,
        notification_webhook: user.notification_webhook ?? false,
        webhook_url: user.webhook_url || '',
      });
    }
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.updateUser(user.id, formData);
      await refreshUser();
      setMessage({ type: 'success', text: 'Configuración guardada exitosamente' });
    } catch (error: any) {
      setMessage({ type: 'error', text: mensajeDeError(error, 'Error al guardar la configuración') });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }));
    setPasswordMessage(null);
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (passwordData.new_password !== passwordData.confirm_password) {
      setPasswordMessage({ type: 'error', text: 'Las contraseñas no coinciden' });
      return;
    }
    if (passwordData.new_password.length < 6) {
      setPasswordMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }
    setChangingPassword(true);
    try {
      await apiClient.changePassword(passwordData.current_password, passwordData.new_password);
      setPasswordMessage({ type: 'success', text: 'Contraseña cambiada exitosamente' });
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
      setShowPasswordFields(false);
    } catch (error: any) {
      setPasswordMessage({ type: 'error', text: mensajeDeError(error, 'Error al cambiar la contraseña') });
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted">Cargando...</div>
      </div>
    );
  }

  const themeOptions = [
    { value: 'dark', label: 'Oscuro', icon: Moon },
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'system', label: 'Sistema', icon: Monitor },
  ];

  const notificationOptions = [
    { field: 'notification_email', label: 'Email', icon: Mail, desc: 'Alertas por correo' },
    { field: 'notification_in_app', label: 'App', icon: Bell, desc: 'Alertas en plataforma' },
    { field: 'notification_webhook', label: 'Webhook', icon: Webhook, desc: 'Endpoint personalizado' },
    // El correo del informe lleva un enlace para desactivarlo. Esta casilla es
    // lo que hace que ese enlace no sea mentira.
    { field: 'recibe_informe_semanal', label: 'Informe semanal', icon: FileText, desc: 'Resumen de los lunes, con PDF' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Configuración</h1>
        <p className="text-sm text-muted mt-0.5">Perfil, apariencia y preferencias</p>
      </div>

      {/* Row 1: Apariencia + Plan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Apariencia */}
        <div className="card py-3 px-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Apariencia</p>
          {mounted ? (
            <div className="flex gap-2">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all ${
                    theme === value
                      ? 'border-primary bg-primary/8 text-primary'
                      : 'border-border bg-surface text-muted hover:border-primary/30 hover:text-text'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex-1 h-9 animate-pulse rounded-lg bg-surface border border-border" />
              ))}
            </div>
          )}
        </div>

        {/* Plan */}
        <div className="card py-3 px-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Plan actual</p>
            <p className="text-base font-semibold text-text mt-0.5">
              {plan ? (incluyePro(plan.tier) ? 'Pro' : 'Free') : '—'}
            </p>
            <p className="text-xs text-muted">
              {!plan
                ? ''
                : plan.en_trial
                ? 'Prueba gratuita'
                : plan.tier_contratado !== 'basico'
                ? 'Suscripción activa'
                : 'Plan gratuito'}
            </p>
          </div>
          <Link href="/dashboard/billing" className="btn-secondary flex items-center gap-1.5 text-xs shrink-0">
            <CreditCard className="h-3.5 w-3.5" />
            Gestionar
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Row 2: Perfil + Notificaciones */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Perfil */}
          <div className="card py-3 px-4 space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Perfil</p>
            <div>
              <label htmlFor="full_name" className="block text-xs font-medium text-text mb-1">Nombre completo</label>
              <input
                id="full_name"
                type="text"
                value={formData.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
                className="input-field text-sm py-2"
                placeholder="Tu nombre completo"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-text mb-1">Email</label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="input-field text-sm py-2"
                placeholder="tu@email.com"
              />
            </div>
            {message && (
              <div className={message.type === 'success' ? 'alert-success' : 'alert-error'}>
                {message.text}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Guardando...</> : <><Save className="w-3.5 h-3.5" />Guardar</>}
              </button>
            </div>
          </div>

          {/* Notificaciones */}
          <div className="card py-3 px-4 space-y-1">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Notificaciones</p>
            {notificationOptions.map(({ field, label, icon: Icon, desc }) => (
              <label
                key={field}
                className="flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-surface transition-colors"
              >
                <input
                  type="checkbox"
                  checked={formData[field as keyof typeof formData] as boolean}
                  onChange={(e) => handleChange(field, e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-surface text-primary focus:ring-primary focus:ring-1 shrink-0"
                />
                <Icon className="w-4 h-4 text-muted shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-text">{label}</span>
                  <span className="text-xs text-muted ml-1.5">{desc}</span>
                </div>
              </label>
            ))}

            {/* Webhook URL */}
            {formData.notification_webhook && (
              <div className="pt-1 pb-1 px-2">
                <input
                  type="url"
                  value={formData.webhook_url}
                  onChange={(e) => handleChange('webhook_url', e.target.value)}
                  className="input-field text-sm py-1.5"
                  placeholder="https://tu-servidor.com/webhook"
                />
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Guardando...</> : <><Save className="w-3.5 h-3.5" />Guardar</>}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Row 3: Cambiar contraseña */}
      <div className="card py-3 px-4">
        <button
          type="button"
          onClick={() => {
            setShowPasswordFields(!showPasswordFields);
            setPasswordMessage(null);
            if (!showPasswordFields) setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
          }}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted" />
            <span className="text-sm font-semibold text-text">Cambiar contraseña</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted transition-transform ${showPasswordFields ? 'rotate-180' : ''}`} />
        </button>

        {showPasswordFields && (
          <form onSubmit={handlePasswordSubmit} className="mt-3 pt-3 border-t border-border">
            {passwordMessage && (
              <div className={`mb-3 ${passwordMessage.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                {passwordMessage.text}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'current_password', label: 'Contraseña actual', show: showCurrentPassword, toggle: () => setShowCurrentPassword(!showCurrentPassword), placeholder: 'Actual' },
                { id: 'new_password', label: 'Nueva contraseña', show: showNewPassword, toggle: () => setShowNewPassword(!showNewPassword), placeholder: 'Mín. 6 caracteres' },
                { id: 'confirm_password', label: 'Confirmar contraseña', show: showConfirmPassword, toggle: () => setShowConfirmPassword(!showConfirmPassword), placeholder: 'Repite la nueva' },
              ].map(({ id, label, show, toggle, placeholder }) => (
                <div key={id}>
                  <label htmlFor={id} className="block text-xs font-medium text-text mb-1">{label}</label>
                  <div className="relative">
                    <input
                      id={id}
                      type={show ? 'text' : 'password'}
                      required
                      value={passwordData[id as keyof typeof passwordData]}
                      onChange={(e) => handlePasswordChange(id, e.target.value)}
                      className="input-field text-sm py-2 pr-9"
                      placeholder={placeholder}
                      disabled={changingPassword}
                    />
                    <button type="button" onClick={toggle} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text">
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-3">
              <button type="submit" disabled={changingPassword} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
                {changingPassword ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Cambiando...</> : <><Lock className="w-3.5 h-3.5" />Cambiar contraseña</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
