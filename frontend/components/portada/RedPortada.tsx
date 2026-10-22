import { PieDeMetodo } from '@/components/metodo/PieDeMetodo';
import { RedProveedores } from '@/components/graficos/RedProveedores';
import type { LecturaRed } from '@/lib/redPortada';

/**
 * El gráfico grande de la portada: quién le compra a quién entre los compradores
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
      {lectura.detalle && <p className="mt-2 text-muted">{lectura.detalle}</p>}
      {/* Dos disposiciones de la misma red: casi cuadrada en el teléfono, apaisada desde `md`
          (a 768 px la cuadrada medía 720 × 684 y los nodos parecían botones). La que no
          corresponde va con `display: none`, así que ni se lee ni se anima. */}
      <div className="mt-4 md:hidden">
        <RedProveedores datos={lectura.graficoMovil} accesible={lectura.accesible} />
      </div>
      <div className="mt-4 hidden md:block">
        <RedProveedores datos={lectura.grafico} accesible={lectura.accesible} />
      </div>
      {/* Cómo se lee, justo bajo la leyenda: en la columna de al lado quedaba a 500 px de ella. */}
      <ComoLeerLaRed className="mt-2" />
      <PieDeMetodo texto={lectura.pie} enlaces={lectura.enlaces} className="mt-4" completo breve />
    </section>
  );
}

/**
 * Lo que la leyenda no dice: dónde queda cada proveedor y cómo se explora. Qué es
 * cada círculo ya lo dice la leyenda de arriba, y se fue de aquí.
 */
export const COMO_LEER_LA_RED = [
  'Los proveedores del centro le venden a muchos; los del borde, a uno solo.',
  'Toca o pasa el mouse por uno para ver con quién se une.',
] as const;

export function ComoLeerLaRed({ className = '' }: { className?: string }) {
  return <p className={`text-sm leading-relaxed text-muted ${className}`.trim()}>{COMO_LEER_LA_RED.join(' ')}</p>;
}
