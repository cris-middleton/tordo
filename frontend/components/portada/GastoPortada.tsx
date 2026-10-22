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
export function GastoPortada({
  lectura,
  ancho = false,
  className = '',
}: {
  lectura: LecturaGasto;
  /**
   * A lo ancho de la página, bajo la red: la conclusión como `h2` de sección y la
   * leyenda en una fila. Sin red, va en la columna derecha (`ancho` falso).
   */
  ancho?: boolean;
  className?: string;
}) {
  return (
    <section aria-labelledby="gasto-titulo" className={`min-w-0 ${className}`.trim()}>
      <h2
        id="gasto-titulo"
        className={ancho ? 'section-title max-w-3xl text-balance' : 'font-sans text-xl font-bold leading-snug text-text'}
      >
        {lectura.conclusion}
      </h2>
      <div className={ancho ? 'mt-6' : 'mt-10'}>
        <GastoMensual datos={lectura.grafico} leyendaEnFila={ancho} />
      </div>
      <PieDeMetodo texto={lectura.pie} enlaces={lectura.enlaces} className="mt-5" completo columnas={ancho} />
    </section>
  );
}
