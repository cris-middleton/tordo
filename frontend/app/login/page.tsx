'use client';

import { Suspense, useEffect, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, Loader2, ArrowLeft, Eye, EyeOff, BarChart2, FileCheck, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import TordoLogo from '@/components/TordoLogo';
import { apiClient } from '@/lib/api';

// El formulario va dentro de un límite de Suspense porque usa
// `useSearchParams`: sin él, Next no puede prerenderizar la página y el build
// falla con "should be wrapped in a suspense boundary". Es el precio de leer la
// URL en el render en vez de en un efecto — y sale a cuenta: el efecto provocaba
// un render de más y lo marcaba el compilador.
function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  // `useSearchParams` en vez de leer `window.location` dentro de un efecto: es
  // la API de Next para esto, funciona en el render y evita el `setState` que
  // marcaba el compilador.
  const searchParams = useSearchParams();
  const mensajeDeRegistro =
    searchParams.get('registered') === 'true'
      ? 'Cuenta creada. Entra y terminamos de configurarla.'
      : '';
  const mensajeDeRestablecida =
    searchParams.get('restablecida') === '1'
      ? 'Contraseña actualizada. Entra con la nueva.'
      : '';
  const errorDeOAuth = searchParams.get('error')
    ? decodeURIComponent(searchParams.get('error') as string)
    : '';


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
      const errorMessage =
        err.response?.data?.detail || err.message || 'No pudimos entrar. Revisa tus datos y vuelve a intentar.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <TordoLogo size={32} />
          <p className="text-sm text-muted animate-pulse">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left brand panel ── */}
      <div className="dark hidden lg:flex lg:w-[46%] xl:w-[50%] flex-col justify-between bg-brand-navy p-12 relative overflow-hidden">
        {/* Dot grid background */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '28px 28px',
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <TordoLogo size={22} />
            <span className="font-brand text-2xl font-bold text-white tracking-tight">TORDO</span>
          </div>

          {/* Este panel prometía «Gana más licitaciones» —que no depende de
              nosotros— y lo explicaba con las palabras del documento de
              arquitectura: «inteligencia pre-postulación», «compliance
              operativo», «benchmarks». Nadie que venda aseo hospitalario habla
              así.

              Y es una pantalla de VUELTA: quien la ve ya se convenció. No hay
              que re-venderle el producto, hay que darle una razón para entrar
              hoy. Por eso el panel cuenta lo que pasó mientras no estaba, que
              además es cierto: el ETL corre cada hora. (El monitor de estado hábil
              NO entra aquí: no ha corrido nunca, ver estado_habil_service.) */}
          <h1 className="font-display text-4xl xl:text-5xl font-bold text-white leading-[1.15] mb-5">
            Mientras no estabas,<br />
            <span className="text-accent">seguimos mirando.</span>
          </h1>
          <p className="text-white/65 text-base leading-relaxed max-w-xs">
            Revisamos Mercado Público cada hora. Entra y mira qué salió.
          </p>
        </div>

        {/* Feature pills */}
        <div className="relative z-10 space-y-2.5">
          {[
            { Icon: BarChart2, text: 'Lo que se publicó desde la última vez que entraste' },
            { Icon: FileCheck, text: 'Los cierres que tienes encima esta semana' },
            { Icon: ShieldAlert, text: 'Qué documentos tuyos están por vencer' },
          ].map(({ Icon, text }) => (
            <div key={text} className="flex items-start gap-3 rounded-xl bg-white/[0.06] border border-white/[0.08] px-4 py-3">
              <Icon className="h-4 w-4 text-accent shrink-0 mt-0.5" />
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
            <TordoLogo size={18} />
            <span className="font-brand text-xl font-bold text-primary">TORDO</span>
          </div>

          {/* «Bienvenido» está en masculino y a media clientela le llega mal.
              «Hola de nuevo» no tiene género y suena a persona. Y «credenciales»
              es una palabra que nadie usa fuera de un manual de sistemas. */}
          <h2 className="font-display text-2xl font-bold text-text mb-1">Hola de nuevo</h2>
          <p className="text-sm text-muted mb-7">Entra con tu usuario o con tu correo, el que recuerdes.</p>

          {(success || mensajeDeRegistro || mensajeDeRestablecida) && (
            <div className="alert-success mb-5">
              <span>{success || mensajeDeRegistro || mensajeDeRestablecida}</span>
            </div>
          )}
          {(error || errorDeOAuth) && (
            <div className="alert-error mb-5">
              <span>{error || errorDeOAuth}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              {/* El backend acepta usuario o correo desde
                  `repositories/usuarios.buscar_por_identificador`. El nombre
                  de usuario se elige al registrarse y se olvida; el correo no.
                  El campo del cuerpo sigue llamándose `username` para no
                  romper clientes ya escritos. */}
              <label htmlFor="username" className="label">Usuario o correo</label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="Cualquiera de los dos"
                disabled={loading}
                autoComplete="username email"
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
          <p className="mt-2 text-center text-sm text-muted">
            <Link href="/recuperar" className="font-semibold text-primary hover:underline transition-colors">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginForm />
    </Suspense>
  );
}
