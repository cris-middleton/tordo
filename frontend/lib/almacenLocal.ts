/**
 * Un valor guardado en `localStorage`, como almacén externo para
 * `useSyncExternalStore`.
 *
 * Lo usan los favoritos (`hooks/useDashboardCollections.ts`) y las búsquedas
 * guardadas (`hooks/useBusquedasGuardadas.ts`). Antes los favoritos vivían en
 * `useState` + `useEffect`, contra la regla del repo, y con dos fallos: un
 * cambio hecho en otra pestaña no llegaba, y cada componente que llamaba al
 * hook tenía su propia copia del estado.
 *
 * Tres decisiones:
 *
 * - **`try/catch` en cada lectura y cada escritura.** `localStorage` lanza en
 *   una ventana privada de algunos navegadores, con las cookies bloqueadas o
 *   con la cuota llena. Si lanza, el valor sigue vivo en memoria durante la
 *   visita: guardar funciona hasta que se cierra la pestaña, y nada revienta.
 * - **La instantánea se cachea por el texto crudo.** `useSyncExternalStore`
 *   compara con `Object.is`; parsear en cada `getSnapshot` daría un objeto
 *   nuevo cada vez y un bucle de renders.
 * - **Avisa a las demás pestañas** (evento `storage`, que el navegador sólo
 *   dispara en las OTRAS) **y a la propia** (una lista de oyentes local).
 */

type Oyente = () => void;

export interface AlmacenLocal<T> {
  suscribir: (oyente: Oyente) => () => void;
  leer: () => T;
  leerEnServidor: () => T;
  escribir: (actualizar: (anterior: T) => T) => void;
}

export function crearAlmacenLocal<T>(
  clave: string,
  porDefecto: T,
  interpretar: (crudo: unknown) => T,
): AlmacenLocal<T> {
  const oyentes = new Set<Oyente>();
  // Si el almacenamiento falla una vez, se sigue en memoria el resto de la
  // visita: alternar entre los dos daría valores que aparecen y desaparecen.
  let fallo = false;
  let memoria: string | null = null;
  let cacheCrudo: string | null | undefined;
  let cacheValor: T = porDefecto;

  function leerCrudo(): string | null {
    if (fallo) return memoria;
    try {
      return window.localStorage.getItem(clave);
    } catch {
      fallo = true;
      return memoria;
    }
  }

  function leer(): T {
    const crudo = leerCrudo();
    if (crudo === cacheCrudo) return cacheValor;
    cacheCrudo = crudo;
    if (crudo === null) {
      cacheValor = porDefecto;
    } else {
      try {
        cacheValor = interpretar(JSON.parse(crudo));
      } catch {
        cacheValor = porDefecto;
      }
    }
    return cacheValor;
  }

  function avisar() {
    for (const oyente of oyentes) oyente();
  }

  function alCambiarEnOtraPestana(evento: StorageEvent) {
    // `key === null` es un `localStorage.clear()`.
    if (evento.key === clave || evento.key === null) avisar();
  }

  return {
    suscribir(oyente) {
      oyentes.add(oyente);
      if (oyentes.size === 1) window.addEventListener('storage', alCambiarEnOtraPestana);
      return () => {
        oyentes.delete(oyente);
        if (oyentes.size === 0) window.removeEventListener('storage', alCambiarEnOtraPestana);
      };
    },
    leer,
    leerEnServidor: () => porDefecto,
    escribir(actualizar) {
      const crudo = JSON.stringify(actualizar(leer()));
      memoria = crudo;
      if (!fallo) {
        try {
          window.localStorage.setItem(clave, crudo);
        } catch {
          fallo = true;
        }
      }
      avisar();
    },
  };
}
