/**
 * Un `localStorage` en memoria para los tests. El de jsdom no es fiable aquí:
 * con Node ≥22 el global experimental de Node lo tapa y le faltan métodos
 * (`clear is not a function`).
 */
export class AlmacenDePrueba {
  private datos = new Map<string, string>();
  getItem(k: string) {
    return this.datos.has(k) ? (this.datos.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.datos.set(k, String(v));
  }
  removeItem(k: string) {
    this.datos.delete(k);
  }
  clear() {
    this.datos.clear();
  }
}

/** Instala uno nuevo en `window.localStorage` y lo devuelve. */
export function instalarAlmacenDePrueba(): AlmacenDePrueba {
  const almacen = new AlmacenDePrueba();
  Object.defineProperty(window, 'localStorage', { value: almacen, configurable: true });
  return almacen;
}
