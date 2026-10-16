import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * Los documentos legales publican sólo nombre y un correo del dominio. El nombre
 * sale de una variable de servidor para no quedar en el repositorio, y sin ella
 * el hueco se ve: nunca un nombre inventado.
 */
describe('responsable de los documentos legales', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('toma el nombre de RESPONSABLE_LEGAL', async () => {
    vi.stubEnv('RESPONSABLE_LEGAL', '  Nombre De Prueba  ');
    const { RESPONSABLE } = await import('@/lib/responsable');
    expect(RESPONSABLE).toBe('Nombre De Prueba');
  });

  it('sin la variable deja el hueco a la vista', async () => {
    vi.stubEnv('RESPONSABLE_LEGAL', '');
    const { RESPONSABLE } = await import('@/lib/responsable');
    expect(RESPONSABLE).toMatch(/^\[\[.*RESPONSABLE_LEGAL.*\]\]$/);
  });

  it('el contacto es del dominio, no un correo personal', async () => {
    const { CORREO_CONTACTO } = await import('@/lib/responsable');
    expect(CORREO_CONTACTO).toMatch(/@tordo\.cl$/);
  });
});

// La firma de la portada y de /acerca ya no es el responsable legal: es
// `AUTOR_NOMBRE` (`lib/autor.ts`, spec PORTADA_V7 V5). Sus tests, en `autor.test.ts`.
