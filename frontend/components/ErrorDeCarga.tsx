'use client';

import { AlertTriangle, RotateCw } from 'lucide-react';

import { mensajeDeCarga } from '@/lib/errores';

/**
 * Una sección que no pudo cargar: qué pasó y un botón para volver a intentarlo.
 *
 * Existe por `/mercado` (spec del rediseño §8.2): con la API caída la pantalla
 * se quedaba más de 30 s con el spinner y luego vacía, como si el rubro no
 * tuviera datos. **Nunca un spinner indefinido**: o datos, o esto.
 */
export function ErrorDeCarga({
  titulo,
  error,
  onReintentar,
  reintentando = false,
}: {
  titulo: string;
  error: unknown;
  onReintentar: () => void;
  /**
   * Pásale el `isFetching` de la consulta. TanStack mantiene `isError` en true
   * durante un `refetch()`: sin esto el botón parece no hacer nada, y si el
   * reintento vuelve a fallar, el visitante no ve que hubo uno.
   */
  reintentando?: boolean;
}) {
  return (
    <div
      role="alert"
      className="alert-error flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{titulo}</p>
          <p className="text-sm">{mensajeDeCarga(error)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onReintentar}
        disabled={reintentando}
        className="btn-secondary inline-flex items-center gap-2 self-start disabled:cursor-not-allowed disabled:opacity-60 sm:self-center"
      >
        <RotateCw className={`h-4 w-4 ${reintentando ? 'animate-spin' : ''}`} aria-hidden="true" />
        {reintentando ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  );
}
