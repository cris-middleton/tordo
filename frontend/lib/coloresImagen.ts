/**
 * Colores de la imagen de vista previa (`app/opengraph-image.tsx`).
 *
 * **La única excepción a «nunca hardcodear un color», y por qué**: la imagen la
 * dibuja `ImageResponse` en el servidor, sin hoja de estilos, así que no puede
 * leer los tokens de `app/globals.css`. Se copian aquí **con el token del que
 * salen**, y `__tests__/colores-imagen.test.ts` falla si un token cambia y esta
 * copia no, y `__tests__/contraste-wcag.test.ts` deriva de esta tabla los pares
 * que mide (tinta, fondo y tema), así que no hay una segunda copia que se separe.
 * Hoy ningún componente pinta esta superficie navy: es la tarjeta de vista previa
 * y nada más (el hero se fue con la portada nueva), y `brand-navy` sigue vivo por ella.
 */
export const COLORES_IMAGEN = {
  /** `--color-brand-navy` (invariante de tema). */
  fondo: { hex: '#102858', token: '--color-brand-navy', rgb: '16 40 88' },
  /** `--color-accent`, parada clara (tema oscuro): teal sobre navy. */
  acento: { hex: '#3DB9BB', token: '--color-accent', rgb: '61 185 187' },
  /** `--color-primary` del tema oscuro: el navy alzado, para el texto secundario. */
  tenue: { hex: '#8FA8E8', token: '--color-primary', rgb: '143 168 232' },
  /** `--color-on-accent` del tema claro: blanco. */
  texto: { hex: '#FFFFFF', token: '--color-on-accent', rgb: '255 255 255' },
} as const;
