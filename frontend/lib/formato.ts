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

/**
 * Una cuota (nunca negativa) en es-CL con su espacio: `porcentaje(34.5)` → «34,5 %». Lo que se
 * redondearía a cero dice «menos de 0,1 %»: «0,0 % de las órdenes» de un proveedor
 * que sí vendió se leía como que no vendió nada.
 */
export function porcentaje(v: number, digitos = 1): string {
  const minimo = 10 ** -digitos;
  if (v < minimo / 2) return `menos de ${decimal(minimo, digitos)} %`;
  return `${decimal(v, digitos)} %`;
}

/**
 * Un monto en pesos, como se lee en Chile: «$825.000», «$7,2 millones», «$1 millón»,
 * «$1,5 mil millones», «$2,1 billones». **El formato de montos de todo el sitio**
 * (listas, fichas, RSS): antes convivían «$825K», «$7,2M», «$1,5B» (que en Chile se
 * lee como billón, 10¹²), «CLP 42,1 billones» y hasta «$1.000K».
 *
 * Bajo un millón, la cifra entera: se lee de una vez y no pierde nada. Desde un
 * millón, un decimal sin «,0». `plata` (`lib/publico.ts`) redondea los millones a
 * entero a propósito, para las bandas de precio; aquí no.
 */
export function monto(clp: number): string {
  const signo = clp < 0 ? '−' : '';
  const v = Math.abs(clp);
  const uno = (x: number) => decimal(Math.round(x * 10) / 10, 1).replace(/,0$/, '');
  if (v < 999_950) return `${signo}$${decimal(Math.round(v), 0)}`;
  if (v < 999_950_000) {
    const m = uno(v / 1e6);
    return `${signo}$${m} ${m === '1' ? 'millón' : 'millones'}`;
  }
  if (v < 999_950_000_000) return `${signo}$${uno(v / 1e9)} mil millones`;
  const b = uno(v / 1e12);
  return `${signo}$${b} ${b === '1' ? 'billón' : 'billones'}`;
}

/**
 * Una fecha corta de `Intl` en es-CL, escrita como el resto del sitio: «vie 25 sep».
 * `Intl` pone punto a las abreviaturas («sept.», «vie.»), abrevia septiembre como
 * «sept» —las listas del sitio dicen «sep»— y separa el día de la semana con coma
 * («vie, 25 sept.»). Convivían «sept» y «sep» en la misma portada.
 */
export function fechaCortaDeIntl(texto: string): string {
  return texto
    .replace(/\./g, '')
    .replace(/\bsept\b/g, 'sep')
    .replace(/^(\p{L}+),\s*/u, '$1 ');
}
