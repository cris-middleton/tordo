import { PieDeMetodo } from '@/components/metodo/PieDeMetodo';
import { RedProveedores } from '@/components/graficos/RedProveedores';
import type { LecturaRed } from '@/lib/redPortada';

/** El `id` del `h2` de la red: lo nombra la sección del dibujo, que va en la otra columna. */
export const ID_TITULO_RED = 'red-titulo';

/**
 * La conclusión de la red (`fraseRed`) y dónde se ve en el dibujo (`detalleRed`).
 * Desde `lg` va en la columna del buscador, bajo las abiertas, y el dibujo ocupa la
 * otra columna desde arriba: con el título encima del dibujo, la columna derecha medía
 * ~900 px y la izquierda ~550, y quedaba un hueco abajo a la izquierda (el dueño,
 * 2026-10-24: «no ocupan los mismos espacios y se ve mal»). En el teléfono queda justo
 * antes del dibujo, como siempre.
 */
export function CabeceraRed({ lectura, className = '' }: { lectura: LecturaRed; className?: string }) {
  return (
    <div className={className}>
      <h2 id={ID_TITULO_RED} className="font-sans text-xl font-bold leading-snug text-text">
        {lectura.conclusion}
      </h2>
      {lectura.detalle && <p className="mt-2 text-muted">{lectura.detalle}</p>}
    </div>
  );
}

/**
 * El gráfico grande de la portada: quién le compra a quién entre los compradores
 * que más compran (`lib/redPortada.ts`). Su título es `CabeceraRed`, que va antes en
 * el documento. El pie dice qué se dibuja y de qué periodo, con los enlaces de método.
 */
export function RedPortada({ lectura, className = '' }: { lectura: LecturaRed; className?: string }) {
  return (
    <section aria-labelledby={ID_TITULO_RED} className={`min-w-0 ${className}`.trim()}>
      {/* Dos disposiciones de la misma red: casi cuadrada en el teléfono, apaisada desde `md`
          (a 768 px la cuadrada medía 720 × 684 y los nodos parecían botones). La que no
          corresponde va con `display: none`, así que ni se lee ni se anima. En el teléfono,
          lo del punto tocado va en una caja bajo el dibujo: un globo flotante se salía de
          la pantalla. */}
      <div className="md:hidden">
        <RedProveedores datos={lectura.graficoMovil} accesible={lectura.accesible} enLinea />
      </div>
      <div className="hidden md:block">
        <RedProveedores datos={lectura.grafico} accesible={lectura.accesible} />
      </div>
      <PieDeMetodo texto={lectura.pie} enlaces={lectura.enlaces} className="mt-4" completo breve />
    </section>
  );
}
