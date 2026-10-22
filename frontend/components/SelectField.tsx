import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  /** Lo que el campo filtra, para quien no lo ve: su opción elegida no lo dice. */
  etiqueta: string;
  className?: string;
}

/**
 * Un desplegable de filtro: el `select` nativo, con la flecha de la paleta.
 *
 * Era una lista hecha a mano (`<button>` + `<li onClick>`) que sólo respondía
 * al ratón: con el teclado se abría, pero ninguna flecha ni Enter elegía una
 * opción, así que los filtros de tipo, estado y región del catálogo —y la
 * región de Compra Ágil— no se podían usar sin ratón, y un lector de pantalla
 * no sabía qué era. El nativo trae todo eso, y en el teléfono abre el selector
 * del sistema.
 */
export default function SelectField({ value, onChange, options, etiqueta, className = '' }: SelectFieldProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={etiqueta}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field cursor-pointer appearance-none pr-9"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
        aria-hidden="true"
      />
    </div>
  );
}
