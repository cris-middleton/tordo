/**
 * El mensaje que se le enseña al usuario cuando una llamada falla.
 *
 * El backend responde en español y con detalle porque ese texto lo lee una
 * persona. Un "algo salió mal" genérico tira esa información justo cuando hace
 * falta.
 *
 * `detail` llega de DOS formas, y la segunda es la que rompía la pantalla:
 *
 * 1. Una **cadena**, en los errores de negocio que levanta `HTTPException`.
 * 2. Una **lista de objetos** `{type, loc, msg, input, ctx}` — la forma que
 *    FastAPI le da a un 422, y que no la elige nadie: la impone Pydantic
 *    cuando un validador de esquema levanta `ValueError`.
 *
 * (Había una tercera, el objeto con `mensaje` de los 402 de cuota; se fue con
 * los planes en el pivote a sitio público.)
 *
 * La lista no estaba contemplada, y cada pantalla metía ese `detail` crudo en
 * el JSX. React no sabe pintar un objeto: el onboarding moría con «Objects are
 * not valid as a React child» en cuanto alguien escribía un RUT con el dígito
 * verificador cambiado. Y no era un caso raro — es el primer formulario que ve
 * un usuario nuevo, con un RUT de ejemplo en el placeholder.
 *
 * Que la traducción viva AQUÍ y no en cada pantalla es lo que evita que la
 * próxima pantalla repita el fallo: `__tests__/errores-de-api.test.ts` falla si
 * alguien vuelve a leer `response.data.detail` por su cuenta.
 */

/** Un elemento de la lista de errores de validación de Pydantic v2. */
interface ErrorDeValidacion {
  type?: unknown;
  loc?: unknown;
  msg?: unknown;
}

/**
 * Pydantic antepone el tipo de excepción al mensaje del validador: lo que en
 * `EmpresaCreate.validate_rut` se escribió como "RUT inválido (formato
 * esperado: …)" sale por la API como "Value error, RUT inválido (…)". Esa
 * primera parte es vocabulario de la librería, no del producto.
 */
const PREFIJO_DE_PYDANTIC = /^(Value error|Assertion failed),\s*/;

/** El nombre del campo, que es el último tramo de `loc` (`["body", "rut_empresa"]`). */
function campoDe(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;
  const tramos = loc.filter((t): t is string => typeof t === 'string' && t !== 'body');
  return tramos.length > 0 ? tramos[tramos.length - 1] : null;
}

function textoDeUnaValidacion(error: ErrorDeValidacion): string | null {
  // `missing` trae siempre el mismo "Field required", que sin el nombre del
  // campo no le dice nada a nadie. Es además el único caso en que el mensaje
  // por sí solo no basta: el resto los escribe un validador nuestro, en
  // español y ya explicados.
  if (error.type === 'missing') {
    const campo = campoDe(error.loc);
    return campo ? `Falta un dato obligatorio: ${campo}.` : 'Faltan datos obligatorios.';
  }
  if (typeof error.msg !== 'string' || error.msg.length === 0) return null;
  return error.msg.replace(PREFIJO_DE_PYDANTIC, '');
}

function textoDeValidaciones(detalle: unknown[]): string | null {
  const mensajes = detalle
    .map((e) => (e && typeof e === 'object' ? textoDeUnaValidacion(e as ErrorDeValidacion) : null))
    .filter((m): m is string => m !== null);
  // Un 422 puede traer varios campos malos a la vez. Se enseñan todos: contar
  // sólo el primero deja al usuario arreglando de a uno sin saber cuántos van.
  const unicos = [...new Set(mensajes)];
  return unicos.length > 0 ? unicos.join(' ') : null;
}

export function mensajeDeError(error: unknown, respaldo = 'No se pudo completar la operación.'): string {
  const detalle = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detalle === 'string') return detalle;
  if (Array.isArray(detalle)) return textoDeValidaciones(detalle) ?? respaldo;
  return respaldo;
}
