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

/** Lo que se lee en la red, en una frase por cosa. Va al lado, no encima: la conclusión ya está arriba. */
export const COMO_LEER_LA_RED = [
  'Cada círculo de color es un organismo, con el color de su sector, y cada punto, un proveedor.',
  'Los del centro le venden a muchos; los del borde, a uno solo.',
  'Pasa el mouse por uno para ver con quién se une.',
] as const;

export function ComoLeerLaRed({ className = '' }: { className?: string }) {
  return (
    <div className={`max-w-[44ch] text-sm leading-relaxed text-muted ${className}`.trim()}>
      <p className="font-semibold text-text">Cómo leer la red</p>
      <p className="mt-1">{COMO_LEER_LA_RED.join(' ')}</p>
    </div>
  );
}
