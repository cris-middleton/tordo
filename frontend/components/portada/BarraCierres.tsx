/**
 * Diez celdas: tantas en `dato` como décimos de «hoy o mañana», con el mismo
 * redondeo que la frase («6 de cada 10» se cuenta a la vista), y el resto en
 * `dato-tenue`. Los rótulos van debajo, en cada extremo, en vez de una leyenda.
 *
 * `aria-hidden`: la conclusión y la tabla de tramos que van con ella dicen lo
 * mismo en texto (docs/GUIA_GRAFICOS.md).
 */
export function BarraCierres({ decimos }: { decimos: number }) {
  return (
    <div aria-hidden="true">
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} data-decimo={i < decimos ? 'si' : 'no'} className={`h-8 rounded-sm ${i < decimos ? 'bg-dato' : 'bg-dato-tenue'}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        {decimos > 0 && <span>hoy o mañana</span>}
        {decimos < 10 && <span className="ml-auto">después</span>}
      </div>
    </div>
  );
}
