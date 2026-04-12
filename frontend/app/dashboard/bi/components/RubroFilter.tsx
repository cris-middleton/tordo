// frontend/app/dashboard/bi/components/RubroFilter.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, Settings2, X, Check, Loader2, Search } from 'lucide-react';
import { TFIDFPerfilData, PlanTier, isPaidPlan } from '../types';

interface RubroFilterProps {
  rubros: string[];               // available rubros for the dropdown
  selectedRubro: string;
  onRubroChange: (rubro: string) => void;
  plan: PlanTier | undefined;
  // Edit modal props
  allRubros: string[];            // full standardized ChileCompra rubro list for the modal
  perfil: TFIDFPerfilData | null;
  empresaId: string | null;
  onSavePerfil: (rubros: string[]) => Promise<void>;
}

export function RubroFilter({
  rubros,
  selectedRubro,
  onRubroChange,
  plan,
  allRubros,
  perfil,
  empresaId,
  onSavePerfil,
}: RubroFilterProps) {
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState<string[]>(
    perfil?.rubros_usados ?? []
  );
  const [modalSearch, setModalSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const locked = !isPaidPlan(plan);

  const handleSave = async () => {
    if (selectedClusters.length === 0) return;
    setSaving(true);
    try {
      await onSavePerfil(selectedClusters);
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleCluster = (label: string) => {
    setSelectedClusters((prev) =>
      prev.includes(label) ? prev.filter((r) => r !== label) : [...prev, label]
    );
  };


  return (
    <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex flex-wrap items-center gap-3">
      {/* Title */}
      <span className="text-sm font-semibold text-text shrink-0">Mercado:</span>

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => !locked && setOpen((o) => !o)}
          disabled={locked}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <span className="max-w-[200px] truncate">
            {selectedRubro || 'Seleccionar rubro'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted shrink-0" />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 w-72 rounded-xl border border-border bg-surface shadow-lg z-30 max-h-64 overflow-y-auto">
            {rubros.map((r) => (
              <button
                key={r}
                onClick={() => { onRubroChange(r); setOpen(false); }}
                className={`w-full text-left flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors ${
                  r === selectedRubro ? 'text-primary font-medium' : 'text-text'
                }`}
              >
                <span className="truncate">{r}</span>
                {r === selectedRubro && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lock badge for basico */}
      {locked && (
        <span className="text-xs text-muted bg-surface border border-border rounded-full px-2.5 py-0.5">
          Desbloquea más rubros con plan PYME
        </span>
      )}

      {/* Edit button */}
      {empresaId && (
        <button
          onClick={() => setShowModal(true)}
          className="ml-auto flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Editar mis rubros
        </button>
      )}

      {/* Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-lg mx-4 p-6 flex flex-col gap-4 max-h-[80vh]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text">Editar mis rubros</h3>
              <button onClick={() => setShowModal(false)}>
                <X className="h-4 w-4 text-muted" />
              </button>
            </div>
            <p className="text-xs text-muted">
              Selecciona los rubros de tu empresa usando la taxonomía oficial de ChileCompra. El panel se ajustará automáticamente.
            </p>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                className="input-field pl-9 text-sm w-full"
                placeholder="Buscar rubro..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0 max-h-64">
              {allRubros
                .filter((r) => !modalSearch || r.toLowerCase().includes(modalSearch.toLowerCase()))
                .map((r) => (
                  <button
                    key={r}
                    onClick={() => toggleCluster(r)}
                    className={`w-full text-left flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      selectedClusters.includes(r)
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-primary/5 text-text'
                    }`}
                  >
                    <span>{r}</span>
                    {selectedClusters.includes(r) && (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </button>
                ))}
              {allRubros.filter((r) => !modalSearch || r.toLowerCase().includes(modalSearch.toLowerCase())).length === 0 && (
                <p className="text-xs text-muted px-3 py-4 text-center">Sin resultados para "{modalSearch}"</p>
              )}
            </div>
            {/* Selected chips */}
            {selectedClusters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedClusters.map((r) => (
                  <span
                    key={r}
                    className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                  >
                    {r}
                    <button onClick={() => toggleCluster(r)}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving || selectedClusters.length === 0}
              className="btn-primary w-full"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
