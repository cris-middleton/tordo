'use client';

import { useState, useEffect, FormEvent } from 'react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Save, Loader2, Mail, Bell, Webhook, Lock, Eye, EyeOff } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    notification_email: true,
    notification_in_app: true,
    notification_webhook: false,
    webhook_url: '',
  });
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || '',
        email: user.email || '',
        notification_email: user.notification_email ?? true,
        notification_in_app: user.notification_in_app ?? true,
        notification_webhook: user.notification_webhook ?? false,
        webhook_url: '', // Not available in user response, would need to fetch separately
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
      setMessage({ type: 'success', text: 'Configuración guardada exitosamente' });
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Error al guardar la configuración',
      });
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
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setShowPasswordFields(false);
    } catch (error: any) {
      setPasswordMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Error al cambiar la contraseña',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-gray-400">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Configuración</h1>
        <p className="text-gray-400">Gestiona tu perfil y preferencias de notificaciones</p>
      </div>

      {/* Profile section */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-white">Perfil</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-300 mb-2">
                Nombre completo
              </label>
              <input
                id="full_name"
                type="text"
                value={formData.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
                className="input-field"
                placeholder="Tu nombre completo"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="input-field"
                placeholder="tu@email.com"
              />
            </div>
          </div>

          {/* Message */}
          {message && (
            <div
              className={`p-4 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-900/20 border border-green-800 text-green-200'
                  : 'bg-red-900/20 border border-red-800 text-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Submit button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Guardar cambios
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Password change section */}
      <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Cambiar contraseña
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Actualiza tu contraseña para mantener tu cuenta segura
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPasswordFields(!showPasswordFields);
                setPasswordMessage(null);
                if (!showPasswordFields) {
                  setPasswordData({
                    current_password: '',
                    new_password: '',
                    confirm_password: '',
                  });
                }
              }}
              className="btn-secondary text-sm w-full sm:w-auto"
            >
              {showPasswordFields ? 'Cancelar' : 'Cambiar contraseña'}
            </button>
          </div>

          {showPasswordFields && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-4 border-t border-dark-800">
              {passwordMessage && (
                <div
                  className={`p-4 rounded-lg ${
                    passwordMessage.type === 'success'
                      ? 'bg-green-900/20 border border-green-800 text-green-200'
                      : 'bg-red-900/20 border border-red-800 text-red-200'
                  }`}
                >
                  {passwordMessage.text}
                </div>
              )}

              <div>
                <label
                  htmlFor="current_password"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Contraseña actual
                </label>
                <div className="relative">
                  <input
                    id="current_password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    required
                    value={passwordData.current_password}
                    onChange={(e) => handlePasswordChange('current_password', e.target.value)}
                    className="input-field pr-10"
                    placeholder="Ingresa tu contraseña actual"
                    disabled={changingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new_password"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input
                    id="new_password"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={passwordData.new_password}
                    onChange={(e) => handlePasswordChange('new_password', e.target.value)}
                    className="input-field pr-10"
                    placeholder="Mínimo 6 caracteres"
                    disabled={changingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm_password"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Confirmar nueva contraseña
                </label>
                <div className="relative">
                  <input
                    id="confirm_password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={passwordData.confirm_password}
                    onChange={(e) => handlePasswordChange('confirm_password', e.target.value)}
                    className="input-field pr-10"
                    placeholder="Repite la nueva contraseña"
                    disabled={changingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={changingPassword}
                className="btn-primary flex items-center gap-2"
              >
                {changingPassword ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cambiando...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Cambiar contraseña
                  </>
                )}
              </button>
            </form>
          )}
        </div>

      {/* Notifications section */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-white">Notificaciones</h2>
        <p className="text-sm text-gray-400">
          Configura cómo deseas recibir las alertas y notificaciones
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <label className="flex items-center gap-3 p-4 bg-dark-800 rounded-lg cursor-pointer hover:bg-dark-700 transition-colors">
              <input
                type="checkbox"
                checked={formData.notification_email}
                onChange={(e) => handleChange('notification_email', e.target.checked)}
                className="w-5 h-5 rounded border-dark-600 bg-dark-900 text-blue-600 focus:ring-blue-600 focus:ring-2"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-white">Notificaciones por Email</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Recibe alertas importantes en tu correo electrónico
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 bg-dark-800 rounded-lg cursor-pointer hover:bg-dark-700 transition-colors">
              <input
                type="checkbox"
                checked={formData.notification_in_app}
                onChange={(e) => handleChange('notification_in_app', e.target.checked)}
                className="w-5 h-5 rounded border-dark-600 bg-dark-900 text-blue-600 focus:ring-blue-600 focus:ring-2"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-white">Notificaciones en la App</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Recibe alertas dentro de la plataforma
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 bg-dark-800 rounded-lg cursor-pointer hover:bg-dark-700 transition-colors">
              <input
                type="checkbox"
                checked={formData.notification_webhook}
                onChange={(e) => handleChange('notification_webhook', e.target.checked)}
                className="w-5 h-5 rounded border-dark-600 bg-dark-900 text-blue-600 focus:ring-blue-600 focus:ring-2"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Webhook className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-white">Notificaciones por Webhook</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Envía alertas a un endpoint personalizado
                </p>
              </div>
            </label>

            {formData.notification_webhook && (
              <div className="mt-4">
                <label
                  htmlFor="webhook_url"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  URL del Webhook
                </label>
                <input
                  id="webhook_url"
                  type="url"
                  value={formData.webhook_url}
                  onChange={(e) => handleChange('webhook_url', e.target.value)}
                  className="input-field"
                  placeholder="https://tu-servidor.com/webhook"
                />
              </div>
            )}
          </div>

          {/* Message */}
          {message && (
            <div
              className={`p-4 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-900/20 border border-green-800 text-green-200'
                  : 'bg-red-900/20 border border-red-800 text-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Submit button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Guardar cambios
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

