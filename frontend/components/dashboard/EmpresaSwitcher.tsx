'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { getEmpresaActiva, setEmpresaActiva } from '@/lib/empresaActive';

interface EmpresaOption {
  id: string;
  nombre_empresa: string;
  rut_empresa: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSwitch: (empresaId: string) => void;
}

export function EmpresaSwitcher({ open, onClose, onSwitch }: Props) {
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiClient.getEmpresas()
      .then((list: EmpresaOption[]) => {
        const safe = Array.isArray(list) ? list : [];
        setEmpresas(safe);
        setActive(getEmpresaActiva() || (safe[0]?.id ?? null));
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function choose(id: string) {
    setEmpresaActiva(id);
    onSwitch(id);
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
