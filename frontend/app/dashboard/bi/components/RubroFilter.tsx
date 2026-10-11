// frontend/app/dashboard/bi/components/RubroFilter.tsx
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
}

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
}: RubroFilterProps) {
  const [open, setOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');

  return (
    <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 flex flex-wrap items-center gap-3">
      {/* Title */}
      <span className="text-sm font-semibold text-text shrink-0">Mercado:</span>

      {/* Dropdown with search */}
      <div className="relative">
        {/* Trigger button */}
        <button
          onClick={() => { setOpen((o) => !o); setDropdownSearch(''); }}
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

                {/* Full list */}
                {rubros
                  .filter((r) => !dropdownSearch || r.toLowerCase().includes(dropdownSearch.toLowerCase()))
                  .map((r) => (
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

                {dropdownSearch && rubros.filter((r) => r.toLowerCase().includes(dropdownSearch.toLowerCase())).length === 0 && (
                  <p className="text-xs text-muted px-4 py-4 text-center">Sin resultados para &ldquo;{dropdownSearch}&rdquo;</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

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
