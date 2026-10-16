'use client';

import { useState } from 'react';
import { AlertTriangle, Landmark, Loader2 } from 'lucide-react';

import { mensajeDeError } from '@/lib/errores';
import { useDatosTransferencia } from '@/lib/queries';

/**
 * «Ver datos para transferir». Los datos bancarios no vienen en el HTML de
 * `/apoyar`: se piden al hacer clic (`GET /api/apoyar/transferencia`). Ver
 * `lib/donaciones.ts`.
 *
 * No importa `lib/donaciones.ts`: es un componente cliente, y ese módulo lee
 * variables de servidor.
 */
export function VerTransferencia() {
  const [abierto, setAbierto] = useState(false);
  const consulta = useDatosTransferencia(abierto);

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary text-sm">
        <Landmark className="h-4 w-4" aria-hidden="true" />
        Ver datos para transferir
      </button>
    );
  }

  if (consulta.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando los datos…
      </p>
    );
  }

  if (consulta.isError) {
    return (
      <div className="alert-error" role="alert">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{mensajeDeError(consulta.error)}</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-border bg-surface-elevated px-4 py-3"
      aria-live="polite"
      aria-label="Datos para transferir"
      role="region"
    >
      <p className="whitespace-pre-line text-sm leading-relaxed text-text">{consulta.data.texto}</p>
    </div>
  );
}
