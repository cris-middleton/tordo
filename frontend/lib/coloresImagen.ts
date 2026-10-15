/**
 * Colores de la imagen de vista previa (`app/opengraph-image.tsx`).
 *
 * **La única excepción a «nunca hardcodear un color», y por qué**: la imagen la
 * dibuja `ImageResponse` en el servidor, sin hoja de estilos, así que no puede
 * leer los tokens de `app/globals.css`. Se copian aquí **con el token del que
 * salen**, y `__tests__/colores-imagen.test.ts` falla si un token cambia y esta
 * copia no, y `__tests__/contraste-wcag.test.ts` mide los pares de `PARES_IMAGEN`
 * leyendo esta tabla, así que no hay una segunda copia que se separe.
 *
 * La tarjeta tiene dos mitades: un panel con el color del pájaro (`brand-blue`) y
 * la marca en blanco, y un lienzo blanco con el titular en navy y una píldora
 * teal. Hoy ningún componente pinta `brand-blue`: existe por esta tarjeta.
 */
export const COLORES_IMAGEN = {
  /** `--color-brand-blue` (invariante de tema): el cuerpo del pájaro del logo. */
  panel: { hex: '#2848AD', token: '--color-brand-blue', rgb: '40 72 173' },
  /** `--color-on-accent` del tema claro: blanco. La marca y el pájaro, sobre el panel. */
  marca: { hex: '#FFFFFF', token: '--color-on-accent', rgb: '255 255 255' },
  /** `--color-info-light` del tema claro: blanco azulado, para el dominio bajo la marca. */
  dominio: { hex: '#EBF1FD', token: '--color-info-light', rgb: '235 241 253' },
  /** `--color-accent-dark` del tema oscuro: el ala y el pico (decorativo). */
  ala: { hex: '#5CCACC', token: '--color-accent-dark', rgb: '92 202 204' },
  /** `--color-surface` del tema claro: el lienzo. */
  lienzo: { hex: '#FFFFFF', token: '--color-surface', rgb: '255 255 255' },
  /** `--color-brand-navy` (invariante de tema): el titular. */
  titular: { hex: '#102858', token: '--color-brand-navy', rgb: '16 40 88' },
  /** `--color-accent`, parada oscura (tema claro): el relleno de la píldora. */
  pildora: { hex: '#0D7376', token: '--color-accent', rgb: '13 115 118' },
  /** `--color-on-accent` del tema claro: el texto de la píldora. */
  textoPildora: { hex: '#FFFFFF', token: '--color-on-accent', rgb: '255 255 255' },
} as const;

type ClaveColor = keyof typeof COLORES_IMAGEN;

/** Qué texto va sobre qué fondo en la tarjeta: lo que `contraste-wcag.test.ts` mide. */
export const PARES_IMAGEN: ReadonlyArray<{ tinta: ClaveColor; fondo: ClaveColor }> = [
  { tinta: 'marca', fondo: 'panel' },
  { tinta: 'dominio', fondo: 'panel' },
  { tinta: 'titular', fondo: 'lienzo' },
  { tinta: 'textoPildora', fondo: 'pildora' },
];
