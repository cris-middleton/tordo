'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { UserPlus, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  if (isAuthenticated) {
    router.push('/dashboard');
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      await apiClient.register({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name || undefined,
      });
      router.push('/login?registered=true');
    } catch (err: any) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else if (err.response?.status === 400) {
        setError('Los datos no son válidos. Verifica que el email y usuario sean únicos.');
      } else if (!err.response) {
        setError('No se pudo conectar con el servidor.');
      } else {
        setError('Error al crear la cuenta. Por favor intenta nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [field]: e.target.value });

  return (
    <div className="flex min-h-screen">
      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:w-[40%] flex-col justify-between bg-primary p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '28px 28px',
          }}
        />
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent via-accent/60 to-transparent" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="relative h-10 w-10">
              <Image
                src="/images/TORDO_logo_openwings.png"
                alt="TORDO"
                fill
                sizes="40px"
                className="object-contain brightness-0 invert"
                priority
              />
            </div>
            <span className="font-display text-2xl font-bold text-white tracking-tight">TORDO</span>
          </div>

          <h1 className="font-display text-3xl xl:text-4xl font-bold text-white leading-[1.15] mb-5">
            Empieza a postular<br />
            <span className="text-accent">con ventaja.</span>
          </h1>
          <p className="text-white/65 text-base leading-relaxed max-w-xs">
            Crea tu cuenta gratis. Sin tarjeta de crédito.
          </p>
        </div>

        <div className="relative z-10 space-y-2.5">
          {[
            { icon: '🔍', text: 'Matching semántico sobre historial de órdenes de compra' },
            { icon: '📊', text: 'BI pre-postulación: precios, competidores, tasas de éxito' },
            { icon: '✅', text: 'Checklist guiado por tipo de licitación' },
          ].map((f) => (
            <div key={f.text} className="flex items-start gap-3 rounded-xl bg-white/8 px-4 py-3">
              <span className="text-base mt-0.5">{f.icon}</span>
              <p className="text-sm text-white/75 font-medium leading-snug">{f.text}</p>
            </div>
          ))}
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
            <div className="relative h-9 w-9">
              <Image src="/images/TORDO_logo.png" alt="TORDO" fill sizes="36px" className="object-contain" />
            </div>
            <span className="font-display text-xl font-bold text-primary">TORDO</span>
          </div>

          <h2 className="font-display text-2xl font-bold text-text mb-1">Crear cuenta gratuita</h2>
          <p className="text-sm text-muted mb-7">Comienza en minutos. Sin tarjeta de crédito.</p>

          {error && (
            <div className="alert-error mb-5">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="full_name" className="label">Nombre completo <span className="text-subtle font-normal">(opcional)</span></label>
              <input
                id="full_name"
                type="text"
                value={formData.full_name}
                onChange={update('full_name')}
                className="input-field"
                placeholder="Tu nombre completo"
                disabled={loading}
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="username" className="label">Usuario <span className="text-danger text-xs">*</span></label>
              <input
                id="username"
                type="text"
                required
                value={formData.username}
                onChange={update('username')}
                className="input-field"
                placeholder="Elige un nombre de usuario"
                disabled={loading}
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="email" className="label">Email <span className="text-danger text-xs">*</span></label>
              <input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={update('email')}
                className="input-field"
                placeholder="tu@empresa.cl"
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Contraseña <span className="text-danger text-xs">*</span></label>
              <input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={update('password')}
                className="input-field"
                placeholder="Mínimo 6 caracteres"
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label">Confirmar contraseña <span className="text-danger text-xs">*</span></label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={update('confirmPassword')}
                className="input-field"
                placeholder="Repite tu contraseña"
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creando cuenta…
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Crear cuenta gratis
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline transition-colors">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
