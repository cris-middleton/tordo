/**
 * Qué slug o código puede llegar al backend desde la URL de una ficha pública.
 *
 * Las fichas (`app/(publico)/`) se generan al primer pedido (`dynamicParams`) y
 * piden al backend **como renderizado del servidor**, exentas del límite por IP
 * (`lib/publicoServidor.ts`). Sin este filtro, cualquier URL inventada era una
 * llamada al backend que nadie contaba. Lo que no tiene la forma de un slug o
 * de un código real da 404 sin salir del servidor de Next.
 */

/**
 * Copia de `LARGO_MAXIMO` en `backend/app/utils/slug.py`;
 * `backend/tests/test_parametros_publicos_del_frontend.py` falla si se separan.
 */
export const LARGO_MAXIMO_SLUG = 80;

/** La forma que deja `slug()`: `[a-z0-9]` en tramos separados por un guion. */
const FORMA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Los códigos de comprador (`CodigoOrganismoPublico`) son números de 4 a 7
 * cifras sin ceros a la izquierda (medido en los datos locales y en el fixture
 * del golden). Se deja holgura hasta 12 por si la numeración crece.
 */
const FORMA_CODIGO_COMPRADOR = /^[1-9][0-9]{0,11}$/;

export function esSlugPublico(valor: string): boolean {
  return valor.length <= LARGO_MAXIMO_SLUG && FORMA_SLUG.test(valor);
}

export function esCodigoComprador(valor: string): boolean {
  return FORMA_CODIGO_COMPRADOR.test(valor);
}
