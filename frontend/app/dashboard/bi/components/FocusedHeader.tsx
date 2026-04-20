'use client';

import { Target } from 'lucide-react';

interface FocusedHeaderProps {
  nombre: string;
}

export function FocusedHeader({ nombre }: FocusedHeaderProps) {
  const shortNombre = nombre.length > 60 ? `${nombre.slice(0, 60)}…` : nombre;
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm flex items-center gap-2">
      <Target className="h-4 w-4 text-accent shrink-0" />
      <div className="flex-1">
        <span className="text-muted">Analizando: </span>
        <span className="font-semibold text-text" title={nombre}>{shortNombre}</span>
      </div>
    </div>
  );
}
