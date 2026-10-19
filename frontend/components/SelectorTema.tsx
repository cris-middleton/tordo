'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';

const OPCIONES = [
  { valor: 'light', etiqueta: 'Claro', Icono: Sun },
  { valor: 'dark', etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'system', etiqueta: 'Sistema', Icono: Monitor },
] as const;

const suscribirNada = () => () => {};

/**
 * Claro / oscuro / sistema.
 *
 * Vivía en Configuración, que se fue con las cuentas en el pivote a sitio
 * público, y después al pie de la barra lateral. Desde la cáscara única va en
 * el pie del sitio (`components/cascara/PieSitio.tsx`), en cada página: una isla
 * cliente dentro de un pie de servidor.
 *
 * `montado` existe porque next-themes no sabe el tema hasta hidratar.
 * `useSyncExternalStore` lo expresa sin efecto: en el servidor devuelve false,
 * en el cliente true, y no hay render de más.
 */
export default function SelectorTema() {
  const { theme, setTheme } = useTheme();
  const montado = useSyncExternalStore(suscribirNada, () => true, () => false);

  return (
    <div role="radiogroup" aria-label="Apariencia" className="flex gap-1 rounded-lg bg-surface-elevated p-1">
      {OPCIONES.map(({ valor, etiqueta, Icono }) => {
        const activo = montado && theme === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => setTheme(valor)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2.5 text-xs font-medium transition-colors ${
              activo ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-text'
            }`}
          >
            <Icono className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
