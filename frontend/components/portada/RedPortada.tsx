import { PieDeMetodo } from '@/components/metodo/PieDeMetodo';
import { RedProveedores } from '@/components/graficos/RedProveedores';
import type { LecturaRed } from '@/lib/redPortada';

/**
 * El gráfico grande de la portada: quién le compra a quién entre los organismos
 * que más compran (`lib/redPortada.ts`). Desde `lg` ocupa la columna derecha, a la
 * altura del `h1`; en móvil va justo después del buscador.
 *
 * El `h2` es la conclusión, que sale del dato (`fraseRed`). El pie dice qué se
 * dibuja y de qué periodo, con los enlaces de método.
 */
export function RedPortada({ lectura, className = '' }: { lectura: LecturaRed; className?: string }) {
  return (
    <section aria-labelledby="red-titulo" className={`min-w-0 ${className}`.trim()}>
      <h2 id="red-titulo" className="font-sans text-xl font-bold leading-snug text-text">
        {lectura.conclusion}
      </h2>
      <div className="mt-4">
        <RedProveedores datos={lectura.grafico} accesible={lectura.accesible} />
      </div>
      <PieDeMetodo texto={lectura.pie} enlaces={lectura.enlaces} className="mt-4" completo />
    </section>
  );
}
