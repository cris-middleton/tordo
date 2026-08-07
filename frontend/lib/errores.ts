/**
 * El mensaje que se le enseña al usuario cuando una llamada falla.
 *
 * El backend responde en español y con detalle —"El plan Básico incluye 1
 * usuario…"— porque ese texto lo lee una persona. Un "algo salió mal" genérico
 * tira esa información justo cuando hace falta.
 *
 * `detail` llega de dos formas: una cadena en los errores normales, y un objeto
 * con `mensaje` en los 402 de cuota, que además traen plan, límite y consumo.
 */
export function mensajeDeError(error: unknown, respaldo = 'No se pudo completar la operación.'): string {
  const detalle = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detalle === 'string') return detalle;
  if (detalle && typeof detalle === 'object' && 'mensaje' in detalle) {
    return String((detalle as { mensaje: unknown }).mensaje);
  }
  return respaldo;
}
