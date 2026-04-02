'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, Loader2, ArrowLeft, Eye, EyeOff, BarChart2, FileCheck, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import TordoLogo from '@/components/TordoLogo';
import { apiClient } from '@/lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('registered') === 'true') {
      setSuccess('Cuenta creada exitosamente. Por favor inicia sesión.');
    }
    const oauthError = params.get('error');
    if (oauthError) setError(decodeURIComponent(oauthError));
  }, []);

  useEffect(() => {
    if (isAuthenticated && !authLoading) router.push('/dashboard');
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error al iniciar sesión';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <TordoLogo size={40} />
          <p className="text-sm text-muted animate-pulse">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[50%] flex-col justify-between bg-[#0F2942] p-12 relative overflow-hidden">
        {/* Dot grid background */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '28px 28px',
          }}
        />
        {/* Accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent via-accent/60 to-transparent" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <TordoLogo size={48} />
            <span className="font-brand text-2xl font-bold text-white tracking-tighter">TORDO</span>
          </div>

          <h1 className="font-display text-4xl xl:text-5xl font-bold text-white leading-[1.15] mb-5">
            Gana más licitaciones.<br />
            <span className="text-accent">Sin sorpresas.</span>
          </h1>
          <p className="text-white/65 text-base leading-relaxed max-w-xs">
            Inteligencia pre-postulación y compliance operativo para PYMES proveedoras del Estado en Chile.
          </p>
        </div>

        {/* Feature pills */}
        <div className="relative z-10 space-y-2.5">
          {[
            { Icon: BarChart2, text: 'Benchmarks de precios con análisis profundo por transacción' },
            { Icon: FileCheck, text: 'Checklist guiado de documentos por tipo de licitación' },
            { Icon: ShieldAlert, text: 'Monitor de estado hábil y alertas de plazos críticos' },
          ].map(({ Icon, text }) => (
            <div key={text} className="flex items-start gap-3 rounded-xl bg-white/[0.06] border border-white/[0.08] px-4 py-3">
              <Icon className="h-4 w-4 text-[#0EAD69] shrink-0 mt-0.5" />
              <p className="text-sm text-white/70 font-medium leading-snug">{text}</p>
            </div>
          ))}
          <p className="text-white/35 text-xs px-1 pt-1.5">
            Fuente: Mercado Público · ChileCompra · Registro de Proveedores
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-20 bg-background relative">
        <Link
          href="/"
          className="absolute top-6 left-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-primary"
        >
          <ArrowLeft size={15} />
          <span>Inicio</span>
        </Link>

        <div className="mx-auto w-full max-w-sm animate-slide-up">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <TordoLogo size={36} />
            <span className="font-brand text-xl font-bold text-primary tracking-tighter">TORDO</span>
          </div>

          <h2 className="font-display text-2xl font-bold text-text mb-1">Bienvenido de vuelta</h2>
          <p className="text-sm text-muted mb-7">Ingresa tus credenciales para continuar</p>

          {success && (
            <div className="alert-success mb-5">
              <span>{success}</span>
            </div>
          )}
          {error && (
            <div className="alert-error mb-5">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="label">Usuario</label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="Tu nombre de usuario"
                disabled={loading}
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Contraseña</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-11"
                  placeholder="Tu contraseña"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-subtle hover:text-muted transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Iniciando sesión…
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  Iniciar sesión
                </>
              )}
            </button>
          </form>

          <div className="divider my-5">o continúa con</div>

          <button
            type="button"
            onClick={() => { window.location.href = apiClient.getGoogleAuthUrl(); }}
            className="btn-secondary w-full"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continuar con Google
          </button>

          <p className="mt-6 text-center text-sm text-muted">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="font-semibold text-primary hover:underline transition-colors">
              Crear cuenta gratis
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
