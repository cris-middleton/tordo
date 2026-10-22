/**
 * Traduce `predictibilidad` (ya decidida por el backend a partir de `qcd` y
 * `n` — ver `etl/analytics/product_price_bands.py`) a una insignia. No se
 * inventa un umbral aquí: el backend ya clasificó en alta/media/baja: esto
 * sólo le pone palabras y color a esa clasificación, sin inventar una nueva.
 *
 * `null` cuando el backend no manda el campo (ocurre en el nivel L4, que sale
 * de una tabla distinta sin `qcd`): no mostrar la insignia es más honesto que
 * mostrar una que no corresponde a ningún cálculo.
 */
export function predictibilidadInfo(
  predictibilidad?: string,
): { etiqueta: string; clase: string } | null {
  switch (predictibilidad) {
    case 'alta':
      return { etiqueta: 'Precio consistente', clase: 'bg-success/10 text-success' };
    case 'media':
      return { etiqueta: 'Precio con variación moderada', clase: 'bg-warning/10 text-warning' };
    case 'baja':
      return { etiqueta: 'Precio muy disperso', clase: 'bg-danger/10 text-danger' };
    default:
      return null;
  }
}

/**
 * La predictibilidad en palabras, sin color: en las fichas públicas va como
 * texto neutro. Una insignia naranja («variación moderada») junto a una teal
 * («confianza alta») se leía como alarma y aprobación a la vez, y el teal es el
 * color de la acción.
 */
export function textoVariacion(predictibilidad?: string | null): string | null {
  switch (predictibilidad) {
    case 'alta':
      return 'Precios parecidos entre sí';
    case 'media':
      return 'Precios algo distintos entre sí';
    case 'baja':
      return 'Precios muy distintos entre sí';
    default:
      return null;
  }
}

/**
 * Cuánto se separan los dos extremos de la mitad de las compras, con un número:
 * «El más alto es 1,9 veces el más bajo». Reemplaza a «Precios algo distintos entre
 * sí» bajo la mitad de las compras (crítica del 21-10: un adjetivo donde cabe la
 * cifra). `null` si no hay rango que medir (p25 = p75 al escribirlos, o falta uno).
 */
export function textoDiferencia(p25: number | null | undefined, p75: number | null | undefined): string | null {
  if (p25 == null || p75 == null || !(p25 > 0) || !(p75 > p25)) return null;
  if (p75 / p25 < 1.1) return 'Casi el mismo precio';
  const veces = Math.round((p75 / p25) * 10) / 10;
  // «De un extremo al otro, 1,9 veces» había que releerlo (¿veces qué?): la frase dice
  // de qué extremos habla y en qué orden.
  if (veces === 2) return 'El más alto es el doble del más bajo';
  if (veces === 3) return 'El más alto es el triple del más bajo';
  return `El más alto es ${veces.toLocaleString('es-CL')} veces el más bajo`;
}
