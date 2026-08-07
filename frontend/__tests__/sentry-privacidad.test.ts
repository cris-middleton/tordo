/**
 * Lo que no puede cambiarse sin querer al tocar Sentry.
 *
 * El valor entero de estos ajustes depende de una palabra, igual que el
 * `httpOnly` de las cookies: `sendDefaultPii: true` no rompe nada, no falla
 * ningún test y empieza a mandar RUTs, montos y cabeceras a un tercero. Un
 * refactor descuidado no tiene forma de notarlo.
 *
 * Se comprueba además —de forma estructural— que las tres inicializaciones
 * (navegador, Node y edge) salgan del MISMO objeto de opciones. Es la manera
 * fácil de equivocarse: poner el ajuste en dos de los tres sitios.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { esRuido, OPCIONES_COMUNES } from '@/lib/sentry-comun';

const RAIZ = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

describe('opciones comunes de Sentry', () => {
  it('no manda PII, igual que el backend', () => {
    expect(OPCIONES_COMUNES.sendDefaultPii).toBe(false);
  });

  it('sin DSN queda desactivado — en local y en los tests no sale nada a la red', () => {
    // Vitest corre sin `NEXT_PUBLIC_SENTRY_DSN`, que es también el caso de un
    // clone recién hecho.
    expect(OPCIONES_COMUNES.dsn).toBe('');
    expect(OPCIONES_COMUNES.enabled).toBe(false);
  });

  it('muestrea trazas al 10 %, como el backend', () => {
    expect(OPCIONES_COMUNES.tracesSampleRate).toBe(0.1);
  });
});

describe('ruido que no es un fallo', () => {
  it('descarta las peticiones canceladas a propósito', () => {
    // `getCurrentUser` recibe un AbortSignal y TanStack Query cancela las
    // consultas obsoletas: reportarlas convierte lo correcto en alarma.
    expect(esRuido('AbortError: The operation was aborted')).toBe(true);
    expect(esRuido('CanceledError')).toBe(true);
  });

  it('descarta el ruido conocido de ResizeObserver', () => {
    expect(esRuido('ResizeObserver loop limit exceeded')).toBe(true);
  });

  it('deja pasar un error de verdad', () => {
    expect(esRuido("Cannot read properties of undefined (reading 'id')")).toBe(false);
    expect(esRuido(undefined)).toBe(false);
  });
});

describe('las tres inicializaciones comparten las opciones', () => {
  it.each(['instrumentation-client.ts', 'instrumentation.ts'])(
    '%s parte de OPCIONES_COMUNES',
    (fichero) => {
      const fuente = leer(fichero);
      expect(fuente).toContain("from '@/lib/sentry-comun'");
      expect(fuente).toContain('...OPCIONES_COMUNES');
    },
  );

  it('el servidor inicializa los dos runtimes: nodejs y edge', () => {
    // Un `register` que sólo cubre nodejs deja los route handlers de edge sin
    // reportar, y el fallo es no enterarse — nunca un error visible.
    const fuente = leer('instrumentation.ts');
    expect(fuente).toContain("NEXT_RUNTIME === 'nodejs'");
    expect(fuente).toContain("NEXT_RUNTIME === 'edge'");
  });

  it('hay frontera de error, y reporta', () => {
    // Sin `global-error.tsx` un fallo del layout raíz deja una página en blanco
    // y NADA registrado; era el estado anterior.
    for (const fichero of ['app/error.tsx', 'app/global-error.tsx']) {
      expect(leer(fichero)).toContain('Sentry.captureException(error)');
    }
  });
});
