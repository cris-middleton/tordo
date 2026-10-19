import type { ReactNode } from 'react';

export interface FilaBarra {
  clave: string;
  etiqueta: ReactNode;
  /** El largo de la barra sale de aquí, contra el mayor de la lista (o `maximo`). */
  valor: number;
  /** El valor escrito: «$3 billones», «42 %». Va como texto, fuera del dibujo. */
  texto: string;
  /** Una línea debajo, en `muted`: la base o una advertencia. */
  detalle?: ReactNode;
}

/**
 * Barras horizontales con su etiqueta y su valor escritos (docs/GUIA_GRAFICOS.md):
 * la forma para comparar cantidades entre categorías con nombre largo —sectores,
 * proveedores, compradores—. Las `destacadas` primeras van en `dato` (lo que nombra
 * la conclusión que va encima) y el resto en `dato-tenue`; la barra es `aria-hidden`
 * y el valor se lee en el texto. Sin ejes ni leyenda: cada barra lleva su cifra.
 *
 * Reemplaza a las tarjetas de sectores y al gráfico de dispersión de competencia
 * de `/mercado`, que pintaba cada proveedor de un color sin significado.
 */
export function BarrasHorizontales({
  filas,
  destacadas = 1,
  maximo,
  etiqueta,
}: {
  filas: FilaBarra[];
  destacadas?: number;
  maximo?: number;
  /** El nombre de la lista para un lector de pantalla. */
  etiqueta: string;
}) {
  const tope = maximo ?? Math.max(0, ...filas.map((f) => f.valor));
  return (
    <ol aria-label={etiqueta} className="space-y-3">
      {filas.map((f, i) => (
        <li key={f.clave}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 break-words text-text">{f.etiqueta}</span>
            <span className="cifra shrink-0 font-semibold text-text">{f.texto}</span>
          </div>
          <div aria-hidden="true" className="mt-1.5 h-2">
            <div
              className={`h-full rounded-sm ${i < destacadas ? 'bg-dato' : 'bg-dato-tenue'}`}
              style={{ width: `${tope > 0 ? Math.max(0.5, (f.valor / tope) * 100) : 0}%` }}
            />
          </div>
          {f.detalle && <p className="mt-1 text-sm text-muted">{f.detalle}</p>}
        </li>
      ))}
    </ol>
  );
}
