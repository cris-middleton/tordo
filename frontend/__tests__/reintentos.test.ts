/**
 * Ninguna consulta espera para siempre (spec del rediseño §8.2).
 *
 * `/mercado` se quedó más de 30 s con el spinner: axios sin timeout y TanStack
 * Query reintentando dos veces cada 502 — y cada reintento volvía a lanzar la
 * consulta que había matado a la API por memoria.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { apiClient } from '@/lib/api';
import { debeReintentar, esTiempoAgotado, TIEMPO_MAXIMO_MS } from '@/lib/reintentos';

const conStatus = (status: number) => ({ response: { status } });

describe('debeReintentar', () => {
  it('no reintenta un 4xx', () => {
    expect(debeReintentar(0, conStatus(404))).toBe(false);
    expect(debeReintentar(0, conStatus(429))).toBe(false);
  });

  it('reintenta UNA vez un 502', () => {
    expect(debeReintentar(0, conStatus(502))).toBe(true);
    expect(debeReintentar(1, conStatus(502))).toBe(false);
  });

  it('reintenta una vez un error de red sin respuesta', () => {
    expect(debeReintentar(0, { message: 'Network Error' })).toBe(true);
    expect(debeReintentar(1, { message: 'Network Error' })).toBe(false);
  });

  it('no reintenta un tiempo agotado', () => {
    const agotado = { code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' };
    expect(esTiempoAgotado(agotado)).toBe(true);
    expect(debeReintentar(0, agotado)).toBe(false);
  });
});

describe('el cliente corta', () => {
  it('apiClient lleva timeout, y es corto', () => {
    const cliente = (apiClient as unknown as { client: { defaults: { timeout?: number } } }).client;
    expect(cliente.defaults.timeout).toBe(TIEMPO_MAXIMO_MS);
    expect(TIEMPO_MAXIMO_MS).toBeLessThanOrEqual(20_000);
  });

  it('el QueryClient usa debeReintentar', () => {
    const codigo = readFileSync(join(__dirname, '..', 'app', 'providers.tsx'), 'utf8');
    expect(codigo).toMatch(/retry:\s*debeReintentar/);
  });
});
