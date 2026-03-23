'use client';

/**
 * Google OAuth callback page.
 *
 * The backend redirects here after a successful Google login:
 *   /auth/callback?token=<jwt>
 *
 * This page:
 *  1. Reads the token from the URL
 *  2. Stores it in localStorage
 *  3. Calls refreshUser() to populate AuthContext
 *  4. Redirects to /dashboard
 *
 * On error (e.g. ?error=google_denied) it redirects to /login with an error.
 */
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error || !token) {
      const msg =
        error === 'google_denied'
          ? 'Acceso denegado por Google.'
          : 'Error al iniciar sesión con Google.';
      router.replace(`/login?error=${encodeURIComponent(msg)}`);
      return;
    }

    apiClient.setToken(token);
    refreshUser().then(() => {
      router.replace('/dashboard');
    });
  }, [searchParams, router, refreshUser]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted">Iniciando sesión con Google…</p>
      </div>
    </div>
  );
}
