'use client';

import { useState, useSyncExternalStore } from 'react';
import { Map, X } from 'lucide-react';
import { useSectores } from '@/lib/queries';
import { decimal } from '@/lib/formato';

const DISMISS_KEY = 'tordo-bi-sector-dismiss-date';

const hoy = (): string => new Date().toISOString().slice(0, 10);

// Sin suscripción real: el descarte sólo cambia por acción propia dentro de este
// componente, y eso ya lo cubre `descartadoAhora`.
const suscribirDescarte = () => () => {};
const leerDescarte = (): boolean => localStorage.getItem(DISMISS_KEY) === hoy();

interface SectorRow {
  sector: string;
  monto_total: number;
  n_oc?: number;
  n_organismos?: number;
  n_proveedores?: number;
}

function formatCLP(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `CLP ${decimal(v / 1e12, 1)} billones`;
  if (abs >= 1e9) return `CLP ${decimal(v / 1e9, 1)} mil millones`;
  if (abs >= 1e6) return `CLP ${decimal(v / 1e6, 0)} millones`;
  return `CLP ${v.toLocaleString('es-CL')}`;
}

export function SectorOverview() {
  // El "descartado de hoy" vive en localStorage y se lee con
  // `useSyncExternalStore`, no con un efecto: así el valor está disponible en el
  // primer render y la consulta puede decidir si corre.
  const descartadoHoy = useSyncExternalStore(suscribirDescarte, leerDescarte, () => true);
  const [descartadoAhora, setDescartadoAhora] = useState(false);
  const dismissed = descartadoHoy || descartadoAhora;

  // `enabled` sustituye al `if (dismissed !== false) return` del efecto.
  const { data: res, isFetching: loading } = useSectores(!dismissed);
  const sectores = ((res?.disponible ? (res.sectores ?? res.resultados) : []) ?? []) as SectorRow[];

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, hoy());
    setDescartadoAhora(true);
  };

  if (dismissed) return null;
  if (loading || sectores.length === 0) return null;

  return (
    <section className="card border-accent/20 bg-accent/5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-text">Mapa de sectores</h3>
          <span className="text-xs text-muted">— los grandes compradores del Estado</span>
        </div>
        <button
          onClick={dismiss}
          aria-label="Ocultar por hoy"
          className="text-muted hover:text-text p-0.5 rounded"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {sectores.slice(0, 6).map((s) => (
          <div
            key={s.sector}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <p className="text-xs text-muted truncate" title={s.sector}>
              {s.sector || '—'}
            </p>
            <p className="cifra text-sm font-semibold text-text mt-0.5">
              {formatCLP(s.monto_total ?? 0)}
            </p>
            <p className="text-xs text-subtle mt-0.5">
              {s.n_organismos != null && `${s.n_organismos.toLocaleString('es-CL')} organismos`}
              {s.n_organismos != null && s.n_proveedores != null && ' · '}
              {s.n_proveedores != null && `${s.n_proveedores.toLocaleString('es-CL')} proveedores`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
