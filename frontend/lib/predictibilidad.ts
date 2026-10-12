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
