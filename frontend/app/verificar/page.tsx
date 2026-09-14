'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';

/**
 * Confirmar el correo de la cuenta.
 *
 * El formulario va dentro de un límite de Suspense porque usa
 * `useSearchParams`: sin él Next no puede prerenderizar la página y el build
 * falla con "should be wrapped in a suspense boundary" — mismo patrón que
 * `app/restablecer/page.tsx`.
 *
 * **No se confirma solo al cargar.** Un enlace de un solo uso que se canjea con
 * el simple hecho de abrirlo se gasta con el prefetch de cualquier cliente de
 * correo que "abre" los enlaces para escanearlos, y el usuario llega a un enlace
 * ya usado. Hace falta un gesto de la persona.
 */

function Verificacion() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [estado, setEstado] = useState<'inicio' | 'enviando' | 'listo' | 'error'>('inicio');
  const [mensaje, setMensaje] = useState('');
  const [correo, setCorreo] = useState('');
  const [reenviado, setReenviado] = useState(false);

  const confirmar = async () => {
    setEstado('enviando');
    try {
      await apiClient.confirmarVerificacion(token);
      setEstado('listo');
    } catch (e) {
      setMensaje(mensajeDeError(e, 'El enlace no es válido o ya venció.'));
      setEstado('error');
    }
  };

  const reenviar = async () => {
    try {
      await apiClient.reenviarVerificacion(correo);
    } finally {
      // Se confirma pase lo que pase: la respuesta del servidor es la misma
      // exista o no la cuenta, y contarlo distinto aquí delataría cuáles existen.
      setReenviado(true);
    }
  };

  if (estado === 'listo') {
    return (
      <Tarjeta>
        <CheckCircle2 className="h-8 w-8 text-accent" aria-hidden="true" />
        <h1 className="text-xl font-bold text-white">Listo, tu correo está confirmado</h1>
        <p className="text-sm text-white/70">
          Ya puedes recibir los avisos de licitaciones que calcen con lo que vendes.
        </p>
        <Link href="/dashboard" className="btn-primary mt-2">
          Ir a mi panel
        </Link>
      </Tarjeta>
    );
  }

  if (!token || estado === 'error') {
    return (
      <Tarjeta>
        <MailWarning className="h-8 w-8 text-gold" aria-hidden="true" />
        <h1 className="text-xl font-bold text-white">
          {token ? 'No pudimos confirmar tu correo' : 'Este enlace está incompleto'}
        </h1>
        <p className="text-sm text-white/70">
          {mensaje || 'Pide uno nuevo y te lo mandamos de inmediato.'}
        </p>

        {reenviado ? (
          <p className="mt-2 text-sm text-accent">
            Si ese correo está registrado, el enlace nuevo va en camino.
          </p>
        ) : (
          <div className="mt-2 flex w-full max-w-sm flex-col gap-2">
            <label htmlFor="correo" className="sr-only">
              Tu correo
            </label>
            <input
              id="correo"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="tu@empresa.cl"
              className="input-field text-sm"
            />
            <button
              type="button"
              onClick={reenviar}
              disabled={!correo.includes('@')}
              className="btn-primary text-sm"
            >
              Mandarme un enlace nuevo
            </button>
          </div>
        )}
      </Tarjeta>
    );
  }

  return (
    <Tarjeta>
      <h1 className="text-xl font-bold text-white">Confirma tu correo</h1>
      <p className="text-sm text-white/70">
        Un clic y empiezas a recibir los avisos de licitaciones.
      </p>
      <button
        type="button"
        onClick={confirmar}
        disabled={estado === 'enviando'}
        className="btn-primary mt-2 inline-flex items-center gap-2"
      >
        {estado === 'enviando' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Confirmar mi correo
      </button>
    </Tarjeta>
  );
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <main className="dark flex min-h-screen items-center justify-center bg-brand-navy px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
        {children}
      </div>
    </main>
  );
}

export default function VerificarPage() {
  return (
    <Suspense
      fallback={
        <main className="dark flex min-h-screen items-center justify-center bg-brand-navy">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" aria-hidden="true" />
        </main>
      }
    >
      <Verificacion />
    </Suspense>
  );
}
