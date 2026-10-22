import type { ReactNode } from 'react';

/**
 * El globo de un gráfico: lo que se lee al pasar el mouse (o tocar) una marca.
 *
 * **Refuerza, no reemplaza**: todo lo que dice también está en texto —en la
 * conclusión, en la leyenda o en la tabla `sr-only` del gráfico—, así que es
 * `aria-hidden` y no recibe el puntero (no tapa la marca de al lado).
 *
 * Dos formas de ponerse, según el ancho del gráfico:
 * - **`costado`** (gráficos anchos): arriba y dentro del gráfico, a la derecha de
 *   una marca de la mitad izquierda y a la izquierda de una de la mitad derecha.
 *   Nunca tapa la columna que se está leyendo ni se sale por arriba.
 * - **`encima`** (gráficos angostos, donde a un costado no cabe): sobre el
 *   gráfico, centrado en la marca pero sin salirse por los lados. **`debajo`**, lo
 *   mismo por abajo: para las primeras filas de una lista, donde encima taparía la
 *   conclusión.
 * `x` es el centro de la marca y `medio` su medio ancho, en % del ancho del
 * contenedor que lo posiciona.
 */
export function Globo({
  x,
  medio = 0,
  modo = 'costado',
  children,
}: {
  x: number;
  medio?: number;
  modo?: 'costado' | 'encima' | 'debajo';
  children: ReactNode;
}) {
  const centrado = `clamp(0px, calc(${x}% - 8rem), calc(100% - 16rem))`;
  const posicion =
    modo === 'encima'
      ? { left: centrado, bottom: 'calc(100% + 6px)' }
      : modo === 'debajo'
        ? { left: centrado, top: 'calc(100% + 6px)' }
      : x < 50
        ? { left: `calc(${x + medio}% + 8px)`, top: 0 }
        : { right: `calc(${100 - x + medio}% + 8px)`, top: 0 };
  return (
    <div
      aria-hidden="true"
      data-globo=""
      className="pointer-events-none absolute z-10 w-64 rounded-md border border-border-light bg-surface px-3 py-2 text-[13px] leading-snug text-text"
      style={posicion}
    >
      {children}
    </div>
  );
}

/** Una fila del globo: la llave de color (una raya corta), el nombre y el valor, que manda. */
export function FilaGlobo({
  llave,
  nombre,
  valor,
  forma = 'raya',
}: {
  llave?: string;
  nombre: string;
  valor: string;
  /** La forma de la llave: la misma que la leyenda del gráfico (`cuadro` para columnas apiladas). */
  forma?: 'raya' | 'cuadro';
}) {
  return (
    <div className="flex items-baseline gap-2">
      {llave && (
        <span className={`shrink-0 self-center ${forma === 'cuadro' ? 'h-2.5 w-2.5 rounded-sm' : 'h-0.5 w-3 rounded-full'} ${llave}`} />
      )}
      {/* Sin cortar: «La mitad de las co…» no decía nada. El nombre se parte en dos líneas si hace falta. */}
      <span className="min-w-0 text-muted">{nombre}</span>
      <span className="cifra ml-auto shrink-0 pl-2 font-semibold">{valor}</span>
    </div>
  );
}
