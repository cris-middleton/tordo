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

// jsdom no implementa `matchMedia`. `useMediaQuery`
// lo llama al montar, y sin este stub cualquier test que renderice esas
// pantallas revienta con "window.matchMedia is not a function" antes de llegar
// a la aserción.
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

// jsdom tampoco implementa `IntersectionObserver`. `useRotatingExample` (los
// mockups animados de la landing) lo instancia al montar, y sin este stub
// cualquier test que renderice `LandingClient` revienta antes de llegar a la
// aserción. No hace falta que detecte intersección: los mockups no rotan en el
// test, que es el mismo estado inicial que tienen en el servidor.
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    IntersectionObserverStub;
}
