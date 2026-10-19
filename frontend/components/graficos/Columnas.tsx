export interface Columna {
  clave: string;
  /** Lo que va bajo la columna: «ene», «2024». */
  etiqueta: string;
  valor: number;
  /** El valor escrito sobre la columna: «38%», «$2,1 mil millones». */
  texto: string;
  destacada?: boolean;
}

/**
 * Columnas con su valor encima y su etiqueta debajo (docs/GUIA_GRAFICOS.md): la
 * forma para una cantidad a lo largo del tiempo con pocos puntos —doce meses, tres
 * o cuatro años—, donde cada valor importa y una línea suavizada inventaría lo que
 * hay entre dos. Las `destacada` van en `dato` (lo que nombra la conclusión) y el
 * resto en `dato-tenue`. El dibujo es `aria-hidden`; las cifras, texto.
 *
 * Reemplaza a las curvas de Recharts de estacionalidad y de la serie anual del
 * rubro: una curva `monotone` entre meses sugería compras en días que no existen.
 */
export function Columnas({
  columnas,
  alto = 120,
  etiqueta,
  textoArriba = true,
}: {
  columnas: Columna[];
  /** Alto del dibujo, en px. */
  alto?: number;
  /** El nombre de la serie para un lector de pantalla. */
  etiqueta: string;
  /** El valor sobre cada columna. Con muchas y estrechas, mejor en la lista de abajo. */
  textoArriba?: boolean;
}) {
  const tope = Math.max(0, ...columnas.map((c) => c.valor));
  return (
    <figure>
      <ol aria-label={etiqueta} className="flex items-end gap-1 sm:gap-2">
        {columnas.map((c) => (
          <li key={c.clave} className="flex min-w-0 flex-1 flex-col items-center">
            {textoArriba && (
              <span className={`cifra mb-1 break-words text-center text-xs leading-tight ${c.destacada ? 'font-semibold text-text' : 'text-muted'}`}>{c.texto}</span>
            )}
            {!textoArriba && <span className="sr-only">{c.texto}</span>}
            <div aria-hidden="true" className="flex w-full items-end" style={{ height: alto }}>
              <div
                className={`w-full rounded-t-sm ${c.destacada ? 'bg-dato' : 'bg-dato-tenue'}`}
                style={{ height: `${tope > 0 ? Math.max(1, (c.valor / tope) * 100) : 0}%` }}
              />
            </div>
            <span className="mt-1 w-full truncate border-t border-border pt-1 text-center text-xs text-muted">{c.etiqueta}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
