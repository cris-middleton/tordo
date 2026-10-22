import type { KeyboardEvent } from 'react';

/**
 * Recorrer las marcas de un gráfico con el teclado: el contenedor recibe el foco
 * (`tabIndex={0}`) y las flechas mueven la marca activa —la que abre el globo—,
 * Inicio y Fin van a la primera y la última, y Escape la suelta. Así lo que se lee
 * al pasar el mouse también se lee sin mouse (crítica del 22-10: «Sighted keyboard
 * users can't open any tooltip»). El valor, además, lo anuncia una región `sr-only`
 * con `aria-live` de cada gráfico.
 */
export function teclasDeRecorrido(n: number, activo: number | null, fijar: (i: number | null) => void) {
  return (e: KeyboardEvent) => {
    if (n === 0) return;
    const siguiente = (paso: number) => (activo == null ? (paso > 0 ? 0 : n - 1) : (activo + paso + n) % n);
    const acciones: Record<string, () => void> = {
      ArrowRight: () => fijar(siguiente(1)),
      ArrowDown: () => fijar(siguiente(1)),
      ArrowLeft: () => fijar(siguiente(-1)),
      ArrowUp: () => fijar(siguiente(-1)),
      Home: () => fijar(0),
      End: () => fijar(n - 1),
      Escape: () => fijar(null),
    };
    const accion = acciones[e.key];
    if (!accion) return;
    e.preventDefault();
    accion();
  };
}
