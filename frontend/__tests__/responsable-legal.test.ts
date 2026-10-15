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

/*
 * «Hecho por» en la portada y en /acerca (spec del rediseño §6.3): sin la
 * variable no se firma. El hueco a la vista es para los documentos legales, no
 * para la portada; y un nombre inventado, para ninguna.
 */
describe('nombreResponsable («hecho por»)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('con la variable, el nombre sin espacios en los bordes', async () => {
    const { nombreResponsable } = await import('@/lib/responsable');
    expect(nombreResponsable({ RESPONSABLE_LEGAL: '  Nombre De Prueba ' })).toBe('Nombre De Prueba');
  });

  it.each([[{}], [{ RESPONSABLE_LEGAL: '' }], [{ RESPONSABLE_LEGAL: '   ' }]])(
    'sin ella (%j), null: ni el hueco ni un nombre',
    async (entorno) => {
      const { nombreResponsable } = await import('@/lib/responsable');
      expect(nombreResponsable(entorno)).toBeNull();
    },
  );

  it('por defecto lee process.env en cada llamada, no al importar', async () => {
    const { nombreResponsable } = await import('@/lib/responsable');
    vi.stubEnv('RESPONSABLE_LEGAL', 'Otra Persona');
    expect(nombreResponsable()).toBe('Otra Persona');
  });
});
