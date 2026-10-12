// @vitest-environment node
/**
 * `POST /api/revalidar`: lo que los cron llaman tras materializar.
 *
 * Se fija el orden de las puertas (sin configurar → 503, secreto → 401, cuerpo
 * → 400), la lista blanca de etiquetas, y que cada etiqueta llegue a
 * `revalidateTag` con el perfil `'max'` (la forma de un argumento está
 * obsoleta en Next 16).
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }));

import { POST } from '@/app/api/revalidar/route';
import { etiquetasDelCuerpo, secretoCoincide } from '@/lib/revalidacion';

const SECRETO = 'secreto-de-revalidacion-0123456789';

function peticion(cuerpo: unknown, secreto: string | null = SECRETO) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secreto !== null) headers['X-Revalidar-Secreto'] = secreto;
  return new NextRequest('http://localhost/api/revalidar', {
    method: 'POST',
    headers,
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });
}

beforeEach(() => {
  process.env.REVALIDAR_SECRETO = SECRETO;
  revalidateTag.mockClear();
});
afterEach(() => {
  delete process.env.REVALIDAR_SECRETO;
});

describe('POST /api/revalidar', () => {
  it('revalida las etiquetas pedidas con el perfil max', async () => {
    const r = await POST(peticion({ etiquetas: ['analytics', 'compra-agil'] }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ revalidadas: ['analytics', 'compra-agil'] });
    expect(revalidateTag.mock.calls).toEqual([
      ['analytics', 'max'],
      ['compra-agil', 'max'],
    ]);
  });

  it('sin REVALIDAR_SECRETO configurado responde 503, aunque el secreto venga', async () => {
    delete process.env.REVALIDAR_SECRETO;
    const r = await POST(peticion({ etiquetas: ['analytics'] }, ''));
    expect(r.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ['ausente', null],
    ['vacío', ''],
    ['distinto', 'otro-secreto-0123456789'],
    ['con un carácter de más', `${SECRETO}x`],
  ])('secreto %s → 401', async (_caso, secreto) => {
    const r = await POST(peticion({ etiquetas: ['analytics'] }, secreto));
    expect(r.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON roto', '{etiquetas'],
    ['lista vacía', { etiquetas: [] }],
    ['sin etiquetas', {}],
    ['etiquetas no lista', { etiquetas: 'analytics' }],
    ['etiqueta fuera de la lista blanca', { etiquetas: ['analytics', 'todo'] }],
    ['etiqueta no texto', { etiquetas: [1] }],
    ['una lista suelta', ['analytics']],
  ])('%s → 400 y no revalida nada', async (_caso, cuerpo) => {
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe('ayudas', () => {
  it('quita repetidas', () => {
    expect(etiquetasDelCuerpo({ etiquetas: ['analytics', 'analytics'] })).toEqual(['analytics']);
  });

  it('compara el secreto', () => {
    expect(secretoCoincide(SECRETO, SECRETO)).toBe(true);
    expect(secretoCoincide(null, SECRETO)).toBe(false);
    expect(secretoCoincide(SECRETO.slice(0, -1), SECRETO)).toBe(false);
  });
});
