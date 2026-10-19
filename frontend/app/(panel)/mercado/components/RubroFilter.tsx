// frontend/app/(panel)/mercado/components/RubroFilter.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, X, Check, Search } from 'lucide-react';

interface RubroFilterProps {
  rubros: string[];               // available rubros for the dropdown
  selectedRubro: string;
  onRubroChange: (rubro: string) => void;
  // Cross-link focus
  focusedOrganismo?: { codigo: string; nombre: string } | null;
  onClearFocus?: () => void;
  /** El rubro no lo eligió nadie: es el de más mercados. Se dice al lado. */
  porDefecto?: boolean;
  onComparar?: () => void;
}

/** Sin tildes ni mayúsculas: «cafe» encuentra «Café». */
const plano = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Selector de rubro de la pantalla de analítica.
 *
 * Antes guardaba además «mis rubros» en el perfil de la empresa y bloqueaba el
 * desplegable en el plan Free. Las dos cosas se fueron con las cuentas en el
 * pivote a sitio público: cualquiera elige cualquier rubro, y lo que se
 * comparte es el enlace (el rubro va en la URL).
 */
export function RubroFilter({
  rubros,
  selectedRubro,
  onRubroChange,
  focusedOrganismo,
  onClearFocus,
  porDefecto = false,
  onComparar,
}: RubroFilterProps) {
  const [open, setOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const coinciden = rubros.filter((r) => !dropdownSearch || plano(r).includes(plano(dropdownSearch)));

  return (
    <div className="sticky top-0 z-20 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background py-3">

      {/* Dropdown with search */}
      <div className="relative">
        {/* Trigger button */}
        <button
          onClick={() => { setOpen((o) => !o); setDropdownSearch(''); }}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Rubro: ${selectedRubro || 'ninguno'}. Cambiar`}
          className="flex h-11 max-w-full items-center gap-2 rounded-lg border border-borderInput bg-surface px-3 text-sm font-semibold text-text transition-colors hover:border-primary/40"
        >
          <span className="max-w-[260px] truncate sm:max-w-[420px]">{selectedRubro || 'Elige un rubro'}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
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
                    className="w-full pl-8 pr-3 py-1.5 text-base sm:text-sm rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="Buscar rubro..."
                    value={dropdownSearch}
                    onChange={(e) => setDropdownSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>

              <div className="overflow-y-auto flex-1">
                {coinciden.map((r) => (
                    <button
                      key={r}
                      onClick={() => { onRubroChange(r); setOpen(false); }}
                      className={`w-full text-left flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-primary/5 transition-colors ${
                        r === selectedRubro ? 'text-primary font-semibold' : 'text-text'
                      }`}
                    >
                      <span className="truncate flex-1">{r}</span>
                      {r === selectedRubro && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  ))}

                {dropdownSearch && coinciden.length === 0 && (
                  <p className="px-4 py-4 text-center text-sm text-muted">Ningún rubro se llama así: «{dropdownSearch}».</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {porDefecto && <span className="text-sm text-muted">El rubro con más mercados. Elige otro aquí.</span>}
      {onComparar && (
        <button
          type="button"
          onClick={onComparar}
          className="hidden h-11 items-center px-2 text-sm font-medium text-muted hover:text-primary md:ml-auto md:flex"
        >
          Comparar con otro rubro
        </button>
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

    </div>
  );
}
