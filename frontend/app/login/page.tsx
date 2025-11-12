'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, LogIn, Loader2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
  }, []);
  
  useEffect(() => {
    // Redirect if already authenticated (only after loading is complete)
    if (isAuthenticated && !authLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't submit if already loading
    if (loading) return;
    
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await login(username, password);
      // Don't clear form fields on success - just redirect
      // Small delay to ensure state is updated
      setTimeout(() => {
        router.push('/dashboard');
      }, 100);
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Error al iniciar sesión';
      setError(errorMessage);
      setLoading(false);
      // Keep the username and password in the form so user can retry
    }
  };

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md text-center">
          <div className="animate-pulse text-muted">Verificando autenticación...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-2 text-sm font-semibold text-muted transition-colors duration-200 hover:text-primary sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al inicio
      </Link>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <Image
              src="/licituplogo.svg"
              alt="LicitUp isotipo"
              width={56}
              height={56}
              className="h-14 w-14 rounded-2xl shadow-sm"
              priority
            />
            <span className="text-3xl font-semibold tracking-tight text-[#333333]">LicitUp</span>
          </div>
          <p className="text-muted">Ingresa para continuar</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-6">
            {success && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {success}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-muted">
                Usuario
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                placeholder="Ingresa tu usuario"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-muted">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Ingresa tu contraseña"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Iniciar sesión
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-6 space-y-4 text-center">
          <Link
            href="/register"
            className="btn-secondary flex w-full items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Crear nueva cuenta
          </Link>
            <p className="text-sm text-muted">
              Plataforma integral de gestión de licitaciones públicas
          </p>
        </div>
      </div>
    </div>
  );
}

