'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { Loader2, MailCheck } from 'lucide-react';

export default function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await apiClient.solicitarRecuperacion(email);
      setMensaje(res.message);
    } catch {
      // El backend responde 200 aunque el correo no exista; un fallo aquí es de
      // red. Se muestra el mismo texto a propósito: distinguirlos volvería a
      // filtrar qué correos están registrados.
      setMensaje('Si ese correo tiene una cuenta, te enviamos un enlace para restablecer la contraseña.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="dark flex min-h-screen items-center justify-center bg-brand-navy px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-bold text-text">Recuperar contraseña</h1>
        <p className="mt-2 text-sm text-muted">
          Escribe tu correo y te mandamos un enlace para elegir una nueva.
        </p>

        {mensaje ? (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-text">
            <MailCheck className="mt-0.5 shrink-0 text-accent" size={16} />
            <span>{mensaje}</span>
          </div>
        ) : (
          <form onSubmit={enviar} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text">
                Correo
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
              />
            </div>
            <button
              type="submit"
              disabled={enviando}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-onAccent hover:bg-accent/90 disabled:opacity-60"
            >
              {enviando ? <Loader2 className="animate-spin" size={14} /> : null}
              Enviar enlace
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Volver a entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
