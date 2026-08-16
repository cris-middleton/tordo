// frontend/app/dashboard/bi/components/RubroFilter.tsx
'use client';

import { useState, useEffect } from 'react';
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
  // Cross-link focus
  focusedOrganismo?: { codigo: string; nombre: string } | null;
  onClearFocus?: () => void;
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
  focusedOrganismo,
  onClearFocus,
}: RubroFilterProps) {
  const [open, setOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState<string[]>(
    perfil?.rubros_usados ?? []
  );
  const [modalSearch, setModalSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const locked = !isPaidPlan(plan);

  const misRubros = perfil?.rubros_usados ?? [];

  // Listen for custom event to open modal from BIOnboarding
  useEffect(() => {
    const handler = () => setShowModal(true);
    window.addEventListener('bi:open-rubros-modal', handler);
    return () => window.removeEventListener('bi:open-rubros-modal', handler);
  }, []);

  const handleSave = async () => {
    if (selectedClusters.length === 0) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSavePerfil(selectedClusters);
      setShowModal(false);
    } catch (err: any) {
      setSaveError(err?.response?.data?.detail || 'Error al guardar. Intenta de nuevo.');
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

      {/* Dropdown with search */}
      <div className="relative">
        {/* Trigger button */}
        <button
          onClick={() => { if (!locked) { setOpen((o) => !o); setDropdownSearch(''); } }}
          disabled={locked}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <span className="max-w-[220px] truncate">
            {selectedRubro || 'Seleccionar rubro'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted shrink-0" />
        </button>

        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />

            <div className="absolute top-full left-0 mt-1 w-80 rounded-xl border border-border bg-surface shadow-xl z-30 flex flex-col overflow-hidden max-h-96">
              {/* Search input */}
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
                  <input
                    autoFocus
                    type="text"
                    className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="Buscar rubro..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>

              <div className="overflow-y-auto flex-1">
                {/* Clear selection — "Todos los rubros" */}
                {!dropdownSearch && (
                  <button
                    onClick={() => { onRubroChange(''); setOpen(false); }}
                    className={`w-full text-left flex items-center gap-2 px-4 py-2 text-sm border-b border-border hover:bg-primary/5 transition-colors ${
                      !selectedRubro ? 'text-primary font-semibold' : 'text-muted'
                    }`}
                  >
                    🌐 Todos los rubros
                  </button>
                )}

                {/* Mis rubros — pinned at top when no search */}
                {misRubros.length > 0 && !dropdownSearch && (
                  <>
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-xs font-semibold text-muted">Mis rubros</span>
                    </div>
                    {misRubros
                      .filter((r) => rubros.includes(r))
                      .sort((a, b) => a.localeCompare(b, 'es'))
                      .map((r) => (
                        <button
                          key={`mis-${r}`}
                          onClick={() => { onRubroChange(r); setOpen(false); }}
                          className={`w-full text-left flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-primary/5 transition-colors ${
                            r === selectedRubro ? 'text-primary font-semibold' : 'text-primary/80'
                          }`}
                        >
                          <span className="truncate">{r}</span>
                          {r === selectedRubro && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      ))}
                    <div className="mx-3 border-t border-border my-1" />
                    <div className="px-3 pb-1">
                      <span className="text-xs font-semibold text-muted">Todos los rubros</span>
                    </div>
                  </>
                )}

                {/* Full list */}
                {rubros
                  .filter((r) => !dropdownSearch || r.toLowerCase().includes(dropdownSearch.toLowerCase()))
                  .map((r) => {
                    const esMio = misRubros.includes(r);
                    return (
                      <button
                        key={r}
                        onClick={() => { onRubroChange(r); setOpen(false); }}
                        className={`w-full text-left flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-primary/5 transition-colors ${
                          r === selectedRubro ? 'text-primary font-semibold' : 'text-text'
                        }`}
                      >
                        <span className="truncate flex-1">{r}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {esMio && dropdownSearch && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary leading-none">
                              tu perfil
                            </span>
                          )}
                          {r === selectedRubro && <Check className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    );
                  })}

                {dropdownSearch && rubros.filter((r) => r.toLowerCase().includes(dropdownSearch.toLowerCase())).length === 0 && (
                  <p className="text-xs text-muted px-4 py-4 text-center">Sin resultados para &ldquo;{dropdownSearch}&rdquo;</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lock badge for basico */}
      {locked && (
        <span className="text-xs text-muted bg-surface border border-border rounded-full px-2.5 py-0.5">
          Desbloquea más rubros con plan Pro
        </span>
      )}

      {/* Focused organismo chip */}
      {focusedOrganismo && (
        <span className="flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/30 px-3 py-1 text-xs font-medium text-accent">
          Enfocado: {focusedOrganismo.nombre.length > 32 ? `${focusedOrganismo.nombre.slice(0, 32)}…` : focusedOrganismo.nombre}
          <button
            onClick={onClearFocus}
            aria-label="Desfijar organismo"
            className="hover:text-danger transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {/* Mis rubros — chips + gear icon */}
      {empresaId && (
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {misRubros.length === 0 ? (
            /* Nothing configured yet — subtle hint */
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>Configurar mis rubros</span>
            </button>
          ) : (
            <>
              <span className="text-xs font-semibold text-muted shrink-0">Rubros:</span>
              {/* Chips: show first 2, then +N */}
              {misRubros.slice(0, 2).map((r) => (
                <button
                  key={r}
                  onClick={() => setShowModal(true)}
                  title={r}
                  className="flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors max-w-[130px]"
                >
                  <span className="truncate">{r}</span>
                </button>
              ))}
              {misRubros.length > 2 && (
                <button
                  onClick={() => setShowModal(true)}
                  className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
                >
                  +{misRubros.length - 2}
                </button>
              )}
              {/* Gear icon */}
              <button
                onClick={() => setShowModal(true)}
                aria-label="Configurar mis rubros"
                className="p-1 text-muted hover:text-primary transition-colors"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
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
            {/* Active rubros pinned at top */}
            {selectedClusters.length > 0 && !modalSearch && (
              <div>
                <p className="text-xs font-semibold text-muted mb-1.5">Activos ({selectedClusters.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...selectedClusters].sort((a, b) => a.localeCompare(b, 'es')).map((r) => (
                    <span
                      key={r}
                      className="flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-medium text-primary"
                    >
                      {r}
                      <button
                        onClick={() => toggleCluster(r)}
                        aria-label={`Eliminar ${r}`}
                        className="hover:text-danger transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="border-t border-border mt-3 mb-1" />
              </div>
            )}

            {/* Full A-Z list */}
            <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0 max-h-56">
              {[...allRubros]
                .sort((a, b) => a.localeCompare(b, 'es'))
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
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              {allRubros.filter((r) => !modalSearch || r.toLowerCase().includes(modalSearch.toLowerCase())).length === 0 && (
                <p className="text-xs text-muted px-3 py-4 text-center">Sin resultados para &ldquo;{modalSearch}&rdquo;</p>
              )}
            </div>
            {saveError && (
              <p className="text-xs text-danger text-center">{saveError}</p>
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
