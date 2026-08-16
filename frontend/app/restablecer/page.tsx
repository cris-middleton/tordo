'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { AlertTriangle, Loader2 } from 'lucide-react';

// En un componente cliente el parámetro se lee con useSearchParams(); en un
// server component de Next 16 `searchParams` es una Promesa.
//
// El formulario va dentro de un límite de Suspense porque usa
// `useSearchParams`: sin él, Next no puede prerenderizar la página y el build
// falla con "should be wrapped in a suspense boundary" (mismo patrón que
// `app/login/page.tsx`).
function RestablecerForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== repetida) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await apiClient.confirmarRecuperacion(token, password);
      router.push('/login?restablecida=1');
    } catch {
      setError('El enlace no es válido o ya venció. Pide uno nuevo.');
      setEnviando(false);
    }
  };

  if (!token) {
    return (
      <main className="dark flex min-h-screen items-center justify-center bg-brand-navy px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
          <div className="flex items-start gap-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 shrink-0" size={16} />
            <span>Este enlace está incompleto. Pide uno nuevo desde la pantalla de recuperación.</span>
          </div>
          <p className="mt-6 text-center text-sm text-muted">
            <Link href="/recuperar" className="font-semibold text-primary hover:underline">
              Pedir un enlace nuevo
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="dark flex min-h-screen items-center justify-center bg-brand-navy px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-bold text-text">Elige una contraseña nueva</h1>
        <p className="mt-2 text-sm text-muted">
          Al guardarla se cerrarán las demás sesiones abiertas.
        </p>

        <form onSubmit={enviar} className="mt-6 space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text">
              Contraseña nueva
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label htmlFor="repetida" className="block text-sm font-medium text-text">
              Repítela
            </label>
            <input
              id="repetida"
              type="password"
              required
              minLength={8}
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-onAccent hover:bg-accent/90 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="animate-spin" size={14} /> : null}
            Guardar contraseña
          </button>
        </form>
      </div>
    </main>
  );
}

export default function RestablecerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-navy" />}>
      <RestablecerForm />
    </Suspense>
  );
}
