import { PieDeMetodo } from '@/components/metodo/PieDeMetodo';
import { GastoMensual } from '@/components/graficos/GastoMensual';
import type { LecturaGasto } from '@/lib/lecturasMercado';

/**
 * El gráfico grande de la portada: cuánto compra el Estado, mes a mes y por
 * sector. Desde `lg` ocupa la columna derecha, a la altura del `h1`; en móvil va
 * justo después del buscador.
 *
 * El `h2` es la conclusión, que sale del dato (`fraseGasto`), sin antetítulo: la
 * conclusión ya dice de qué trata. El pie dice de qué base sale y lo que no está
 * (las obras del MOP).
 */
export function GastoPortada({ lectura, className = '' }: { lectura: LecturaGasto; className?: string }) {
  return (
    <section aria-labelledby="gasto-titulo" className={`min-w-0 ${className}`.trim()}>
      <h2 id="gasto-titulo" className="font-sans text-xl font-bold leading-snug text-text">
        {lectura.conclusion}
      </h2>
      <div className="mt-10">
        <GastoMensual datos={lectura.grafico} />
      </div>
      <PieDeMetodo texto={lectura.pie} enlaces={lectura.enlaces} className="mt-5" />
    </section>
  );
}
