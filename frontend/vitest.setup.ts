// Registra los matchers de `@testing-library/jest-dom` (p.ej. `toBeInTheDocument`)
// en el `expect` de Vitest. Sin esto, los tests que renderizan un componente y
// hacen aserciones sobre el DOM fallan con "toBeInTheDocument is not a function".
import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// El auto-cleanup de `@testing-library/react` depende de un `afterEach` GLOBAL,
// y este repo no activa `test.globals` (los tests importan de 'vitest' a
// mano). Sin este cleanup explícito, el DOM de un test queda montado para el
// siguiente: un `render()` posterior encuentra elementos del test anterior.
afterEach(() => {
  cleanup();
});

// jsdom no implementa `matchMedia`. `usePrefersReducedMotion` (usado por
// `TordoLogo`, que sale en casi cualquier pantalla con marca) lo llama al
// montar, y sin este stub cualquier test que renderice esas pantallas
// revienta con "window.matchMedia is not a function" antes de llegar a la
// aserción. `matches: false` es el mismo valor de arranque que usa el hook en
// el servidor.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
