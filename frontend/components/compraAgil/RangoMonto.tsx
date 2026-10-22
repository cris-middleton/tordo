import type { RangoMonto as Rango } from '@/lib/rangoMonto';

/**
 * El monto de una Compra Ágil contra lo que suele pedir su unidad de compra
 * (`lib/rangoMonto.ts`): la franja de la mitad de sus órdenes en `dato-tenue`, la
 * mediana como una raya y el monto de esta Compra Ágil como un punto en `dato`.
 * Escala lineal desde cero.
 *
 * El dibujo es `aria-hidden`; la frase de debajo dice la comparación, y los
 * valores están escritos en la fila (el monto y «La mitad de sus órdenes va de…»).
 * Las posiciones van en % y las marcas en px: el punto sigue redondo a cualquier
 * ancho. El riel lleva 5 px de aire a cada lado para que el punto no se corte, y
 * un margen negativo igual para que la franja quede alineada con el monto. En un
 * teléfono, dibujo y frase van en una línea bajo el monto; desde `sm`, a la
 * derecha, uno sobre otra.
 */
export function RangoMonto({ rango }: { rango: Rango }) {
  return (
    <div className="mt-1 flex items-center gap-2 sm:block">
      <div aria-hidden="true" className="-ml-[5px] w-28 shrink-0 px-[5px] sm:-mr-[5px] sm:ml-auto">
        <div className="relative h-3">
          <div className="absolute inset-x-0 top-1/2 border-t border-border" />
          <div
            className="absolute top-0.5 h-2 min-w-[2px] rounded-sm bg-dato-tenue"
            style={{ left: `${rango.desde}%`, width: `${rango.hasta - rango.desde}%` }}
          />
          <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-muted" style={{ left: `${rango.mediana}%` }} />
          <div
            className="absolute top-px h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-dato"
            style={{ left: `${rango.monto}%` }}
          />
        </div>
      </div>
      <p className="text-xs text-muted sm:mt-1">{rango.texto}</p>
    </div>
  );
}
