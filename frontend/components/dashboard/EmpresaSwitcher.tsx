'use client';

import { useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useEmpresaActiva, setEmpresaActiva } from '@/lib/empresaActive';
import { useEmpresas } from '@/lib/queries';

interface EmpresaOption {
  id: string;
  nombre_empresa: string;
  rut_empresa: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

// `onSwitch` desapareció: existía para avisar al padre de que recargara. Ya no
// hace falta — `setEmpresaActiva` notifica a `useEmpresaActiva`, la clave de la
// consulta cambia y TanStack Query refresca sola las pantallas que dependan de
// ella. De paso arregla el caso que el prop no cubría: pantallas montadas que no
// pasaban por este padre no se enteraban del cambio.
export function EmpresaSwitcher({ open, onClose }: Props) {
  // `enabled` sólo cuando el diálogo está abierto: no tiene sentido pedir la
  // lista hasta que alguien la va a ver.
  const { data, isPending: loading } = useEmpresas();
  const empresas = (Array.isArray(data) ? data : []) as EmpresaOption[];
  const guardada = useEmpresaActiva();
  const active = guardada || (empresas[0]?.id ?? null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function choose(id: string) {
    setEmpresaActiva(id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-card-lg w-full max-w-md mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text">Cambiar empresa activa</h2>
          <button onClick={onClose} className="text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted">Cargando...</div>
        ) : empresas.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">No tienes empresas registradas.</div>
        ) : (
          <ul className="space-y-1">
            {empresas.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => choose(e.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-primary/5 transition-colors text-left"
                >
                  <div>
                    <div className="text-sm font-medium text-text">{e.nombre_empresa}</div>
                    <div className="text-xs text-muted">{e.rut_empresa}</div>
                  </div>
                  {active === e.id && <Check size={16} className="text-accent" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
