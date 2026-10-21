/**
 * Los sectores del Estado y su color, en UN sitio.
 *
 * El color sigue a la entidad, nunca a su puesto: Salud es `serie-1` en la
 * portada, en `/mercado` y en cualquier gráfico que venga, aunque un mes
 * Municipalidades compre más. Así quien aprendió el azul de Salud en un gráfico
 * lo reconoce en el siguiente sin leer la leyenda. Los cinco sectores grandes
 * tienen su tono (`--color-serie-1…5`, `app/globals.css`); lo demás —«Otros»,
 * «Legislativo y judicial» y lo que llegue sin sector— va junto, en gris.
 *
 * Los nombres son los de `analytics.sector_dashboard` y `analytics.time_series`
 * (el campo `sector` del ETL). Las clases van escritas enteras: Tailwind sólo
 * genera las que encuentra literales en el código.
 */

export interface SectorConColor {
  /** El nombre del ETL, o `OTROS` para el resto. */
  clave: string;
  /** Cómo se escribe en el sitio. */
  nombre: string;
  /** Relleno de una barra o una columna. */
  fondo: string;
  /** Trazo de una línea o el borde de un punto. */
  trazo: string;
}

export const OTROS = 'Otros';

export const SECTORES_CON_COLOR: readonly SectorConColor[] = [
  { clave: 'Salud', nombre: 'Salud', fondo: 'bg-serie-1', trazo: 'stroke-serie-1' },
  { clave: 'Municipalidades', nombre: 'Municipalidades', fondo: 'bg-serie-2', trazo: 'stroke-serie-2' },
  {
    clave: 'Gob. Central, Universidades',
    nombre: 'Gobierno y universidades',
    fondo: 'bg-serie-3',
    trazo: 'stroke-serie-3',
  },
  { clave: 'Obras Públicas', nombre: 'Obras públicas', fondo: 'bg-serie-4', trazo: 'stroke-serie-4' },
  { clave: 'FFAA', nombre: 'Fuerzas Armadas', fondo: 'bg-serie-5', trazo: 'stroke-serie-5' },
  { clave: OTROS, nombre: 'Otros', fondo: 'bg-serie-otros', trazo: 'stroke-serie-otros' },
];

const POR_CLAVE = new Map(SECTORES_CON_COLOR.map((s) => [s.clave, s]));

/** El sector con su color; lo que no es uno de los cinco grandes cae en «Otros». */
export function sectorConColor(sector: string | null | undefined): SectorConColor {
  return POR_CLAVE.get((sector ?? '').trim()) ?? POR_CLAVE.get(OTROS)!;
}
