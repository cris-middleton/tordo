/**
 * La URL que escribe una pantalla y la que le llega de fuera.
 *
 * `/licitaciones`, `/compra-agil`, `/mercado` y `/productos` guardan sus filtros
 * en la URL: los leen al montar y la reescriben con `replaceState`. Desde Next 16
 * una navegación que sólo cambia la consulta **no desmonta la página**, así que
 * pulsar «Licitaciones» en la cabecera con un filtro puesto dejaba la URL limpia
 * y los filtros en pantalla. Desde Next 14.1 `replaceState` también actualiza
 * `useSearchParams`: lo que escribe la propia pantalla y lo que llega de un
 * enlace se ven igual. Este módulo los distingue.
 *
 * Cada pantalla escribe con `escribirUrlPropia`, que anota la consulta antes de
 * reemplazar la URL, y monta su contenido con la clave de
 * `useClaveDeUrlExterna` (`hooks/`): una consulta que no es la anotada viene de
 * fuera y vuelve a montar la pantalla desde la URL.
 */

const propias = new Map<string, string>();

/**
 * Reemplaza la consulta de la URL (sin `?`) y la anota como escrita por
 * `pagina`. `ruta`, si se da, va delante; sin ella la consulta es relativa a la
 * página en que se está.
 */
export function escribirUrlPropia(pagina: string, consulta: string, ruta?: string): void {
  propias.set(pagina, consulta);
  const destino = consulta ? `${ruta ?? ''}?${consulta}` : (ruta ?? window.location.pathname);
  window.history.replaceState({}, '', destino);
}

/** ¿Es ésta la última consulta que escribió la propia pantalla? */
export function esUrlPropia(pagina: string, consulta: string): boolean {
  return propias.get(pagina) === consulta;
}

export interface VistaDeUrl {
  /** La consulta que se vio por última vez. */
  consulta: string;
  /** La clave con que se monta el contenido: cambia sólo con una consulta que llega de fuera. */
  clave: number;
}

/** La vista tras ver `consulta`: la misma si no cambió, otra clave si la consulta no es propia. */
export function siguienteVista(vista: VistaDeUrl, consulta: string, propia: boolean): VistaDeUrl {
  if (vista.consulta === consulta) return vista;
  return { consulta, clave: propia ? vista.clave : vista.clave + 1 };
}
