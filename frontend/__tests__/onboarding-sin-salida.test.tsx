/**
 * Quien deja el onboarding a medias tiene que poder volver a entrar.
 *
 * El fallo
 * --------
 * `onboarding_completed` se marcaba SÓLO al pulsar «Ir a mi panel», el botón de
 * la pantalla de confirmación. Todo el trabajo —empresa, rubros, perfil
 * semántico, primera alerta— ocurría una pantalla antes. Cerrar la pestaña al
 * leer «Listo, ya estamos buscando» dejaba la cuenta marcada como incompleta, y
 * a partir de ahí no había forma de entrar al producto:
 *
 *   login             → /onboarding
 *   «Lo hago después» → /onboarding   (empujaba al panel, que devolvía aquí)
 *   /dashboard a mano → /onboarding   (guarda de app/dashboard/layout.tsx)
 *   rehacer el paso 1 → 409 «Ya tienes acceso a esta empresa»
 *
 * Las cuatro salidas cerradas a la vez. Medido en el navegador, no deducido.
 *
 * Qué se prueba aquí
 * ------------------
 * Las tres reglas que lo desatascan, contra el módulo real:
 *   1. tener empresa significa que el paso 1 está hecho;
 *   2. el onboarding se da por terminado cuando termina el TRABAJO;
 *   3. «Lo hago después» deja constancia antes de irse, o no lleva a ninguna
 *      parte.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const FUENTE = readFileSync(join(__dirname, '..', 'app', 'onboarding', 'page.tsx'), 'utf8');

describe('el onboarding no puede dejar a nadie encerrado', () => {
  it('el paso se DERIVA de si ya hay empresa, no arranca fijo en 1', () => {
    // `pasoElegido ?? (empresaId ? 2 : 1)`: quien vuelve con su empresa ya
    // creada entra por el paso 2 en vez de chocar con un 409.
    expect(FUENTE).toMatch(/const step: Step = pasoElegido \?\? \(empresaId \? 2 : 1\)/);
    // Y la empresa existente se consulta, no se supone.
    expect(FUENTE).toContain('useEmpresas()');
  });

  it('marca el onboarding al terminar el trabajo, no sólo en el último botón', () => {
    // `handleStep2` es donde se crean rubros, perfil y alerta.
    const pasos = FUENTE.match(/marcarOnboardingHecho\(\d\)/g) ?? [];
    expect(
      pasos.length,
      'se esperaban las tres llamadas: fin del paso 1 (saltar), fin del paso 2 ' +
        '(trabajo hecho) y el botón final',
    ).toBeGreaterThanOrEqual(3);
    expect(FUENTE).toMatch(/marcarOnboardingHecho\(2\)/);
  });

  it('«Lo hago después» deja constancia ANTES de irse al panel', () => {
    // Sin esto el enlace no lleva a ninguna parte: el panel rebota.
    // Se va por `irAlPanel()`, que además invalida la caché: el onboarding
    // cambia la cuenta entera y el panel mostraba lo de antes.
    expect(FUENTE).toMatch(/await marcarOnboardingHecho\(1\);\s*\n\s*await irAlPanel\(\)/);
  });

  it('al salir se invalida la caché, porque la cuenta cambió', () => {
    expect(FUENTE).toMatch(/await queryClient\.invalidateQueries\(\);\s*\n\s*router\.push\('\/dashboard'\)/);
  });

  it('marcar es idempotente y no bloquea', () => {
    // Es contabilidad interna. Que falle no puede dejar al usuario atascado —
    // que es exactamente el fallo que se está arreglando.
    expect(FUENTE).toMatch(/if \(!user \|\| user\.onboarding_completed\) return;/);
    expect(FUENTE).toMatch(/\.catch\(\(\) => \{\}\)/);
  });

  it('la función se declara antes de usarse', () => {
    // Una `const` no se iza. Este repo ya se quemó con eso en AuthContext.
    const declara = FUENTE.indexOf('const marcarOnboardingHecho');
    const usa = FUENTE.indexOf('await marcarOnboardingHecho');
    expect(declara).toBeGreaterThan(-1);
    expect(declara).toBeLessThan(usa);
  });
});
