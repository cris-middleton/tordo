/**
 * Cifras con decimales, como se escriben en Chile: coma decimal y punto de miles.
 *
 * `Number.prototype.toFixed` escribe siempre con punto («6.6», «CLP 1.5M»), y
 * la misma pantalla enseñaba al lado cifras formateadas con `es-CL` («6,6»).
 * Toda cifra con decimales que llega a la vista pasa por aquí; un test
 * estructural (`__tests__/sin-tofixed.test.ts`) impide que vuelva `toFixed`.
 */

const formateadores = new Map<number, Intl.NumberFormat>();

function formateador(digitos: number): Intl.NumberFormat {
  let f = formateadores.get(digitos);
  if (!f) {
    f = new Intl.NumberFormat('es-CL', {
      minimumFractionDigits: digitos,
      maximumFractionDigits: digitos,
    });
    formateadores.set(digitos, f);
  }
  return f;
}

/**
 * `v` con exactamente `digitos` decimales, en es-CL: `decimal(6.6, 1)` → «6,6»,
 * `decimal(1234.5, 0)` → «1.235». Redondea como `toFixed`, pero escribe con
 * la coma y el punto de miles que lee un usuario chileno.
 */
export function decimal(v: number, digitos = 1): string {
  return formateador(digitos).format(v);
}
