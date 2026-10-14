/**
 * Qué se le dice al visitante cuando una sección no carga (spec §8.2): qué pasó
 * y qué puede hacer. El 502 de Railway no trae `detail`, así que sin esto la
 * pantalla no tenía nada que decir.
 */
import { describe, expect, it } from 'vitest';

import { mensajeDeCarga } from '@/lib/errores';

const railway502 = {
  response: {
    status: 502,
    data: { status: 'error', code: 502, message: 'Application failed to respond' },
  },
};

describe('mensajeDeCarga', () => {
  it('un tiempo agotado se dice como tal', () => {
    expect(mensajeDeCarga({ code: 'ECONNABORTED' })).toMatch(/tardó demasiado/i);
  });

  it('el 502 del borde dice que el servidor no respondió y a quién escribir', () => {
    const texto = mensajeDeCarga(railway502);
    expect(texto).toMatch(/no respondió/i);
    expect(texto).toMatch(/hola@tordo\.cl/);
  });

  it('un error de red sin respuesta, igual', () => {
    expect(mensajeDeCarga({ message: 'Network Error' })).toMatch(/no respondió/i);
  });

  it('si el backend explica, se usa su explicación', () => {
    const e = { response: { status: 503, data: { detail: 'El módulo de analítica no está activo.' } } };
    expect(mensajeDeCarga(e)).toBe('El módulo de analítica no está activo.');
  });

  it('un 429 pide esperar', () => {
    expect(mensajeDeCarga({ response: { status: 429 } })).toMatch(/espera un momento/i);
  });

  it('un 4xx sin detalle no inventa una causa', () => {
    expect(mensajeDeCarga({ response: { status: 404 } })).toBe('No se pudo cargar esta sección.');
  });
});
