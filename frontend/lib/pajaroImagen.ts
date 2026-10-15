/**
 * El pájaro del logo (`public/images/tordo-logo-3-opened.svg`) para la tarjeta de
 * vista previa, que se dibuja sin CSS ni archivos estáticos: los trazos van aquí,
 * copiados del SVG, y la tarjeta los pinta en dos tonos sobre el panel de marca.
 * `ala` agrupa el ala y el pico (en el logo, el turquesa); `cuerpo`, todo lo demás.
 * `__tests__/pajaro-imagen.test.ts` falla si el logo cambia y esta copia no.
 */

/** El recuadro del pájaro dentro del lienzo de 612×792 del SVG original. */
export const VIEWBOX_PAJARO = '77 141 398 341';

export type ParteDelPajaro = 'cuerpo' | 'ala';

export const TRAZOS_PAJARO: ReadonlyArray<{ parte: ParteDelPajaro; d: string }> = [
  { parte: 'cuerpo', d: 'M273.9,421.1L293,469.8L270.1,469.8C263.7,469.8 257.7,473.4 255.2,479.3C252.7,485.2 254.8,480.2 254.7,480.7L351,480.7C349.5,476.3 346.7,473.3 342.5,471.5C338.3,469.7 337.1,469.9 334.3,469.9L315.5,469.9L297.2,422.6L274,421.2L273.9,421.1Z' }, // feet
  { parte: 'cuerpo', d: 'M218.2,398.5L190.9,381.1L116.3,476.6C116.5,476.6 116.7,476.8 116.8,476.9C138.5,484.3 157.6,476.7 174.8,462.1C183.9,454.4 190.1,441.8 197.4,430.8C204.4,420.2 211.3,408.9 218.1,398.5L218.2,398.5Z' }, // tail-feather-2
  { parte: 'cuerpo', d: 'M77.2,448.8L174.2,368.6L190.9,381.1C173.9,402.5 158,426.5 140.7,441.2C130.3,450.1 118.7,455.3 106.5,455.9C97.2,456.3 88.1,455.1 77.2,448.8Z' }, // tail-feather-1
  { parte: 'cuerpo', d: 'M325.6,180.1C348,129.4 411.6,129.2 435,171.3L434.7,300.1C433.7,311.1 427.5,369.6 379.3,403.7C374.3,407.2 355.7,419.5 328.5,424.6C296.2,430.6 259.2,425 221.1,400.4C206.2,390.8 188.8,381 173,367.5C173,367.5 317,199.7 325.6,180.1Z' }, // Body
  { parte: 'ala', d: 'M435,171.5L475.5,188.6L434.8,207.4L435,171.5Z' }, // beak
  { parte: 'ala', d: 'M87.319,209.86C96.629,208.064 288.808,172.762 332.437,223.84C350.274,244.743 349.685,264.477 349.685,264.477C348.95,288.614 329.078,304.826 324.098,308.968C296.416,331.628 254.577,333.293 222.654,322.637C203.981,316.454 197.26,308.804 118.801,238.115C105.049,225.738 93.999,215.741 87.244,209.793L87.319,209.86Z' }, // Wing
  { parte: 'cuerpo', d: 'M161.3,419.4C161.3,419.4 178.4,403.3 178.2,382.4C178.2,377.4 177.1,373.2 176,369.9C181,373.6 185.9,377.3 190.9,381C167.9,410.7 161.2,419.3 161.3,419.3L161.3,419.4Z' }, // pata
];

export const OJO_PAJARO = { cx: 397.8, cy: 180.1, rx: 14.2, ry: 13.6 } as const;
