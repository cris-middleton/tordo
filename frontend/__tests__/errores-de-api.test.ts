/**
 * El `detail` de FastAPI no siempre es una cadena, y pintarlo tal cual mata la
 * pantalla.
 *
 * En un 422 —el que produce cualquier validador de esquema de Pydantic— `detail`
 * es una LISTA de objetos `{type, loc, msg, input, ctx}`. Cada pantalla lo
 * tipaba como `string` y lo metía en el JSX, así que React moría con «Objects
 * are not valid as a React child». Pasó en el antiguo onboarding, con un RUT
 * con el dígito verificador cambiado. El TypeScript no lo vio porque la
 * mentira estaba en el `as` con que se leía la respuesta.
 *
 * Aquí se fija el contrato en tres niveles:
 *   1. `mensajeDeError` entiende las formas del `detail`.
 *   2. Ninguna pantalla vuelve a leer `response.data.detail` por su cuenta.
 *   3. Ningún error de la API saca al visitante de la página: desde el pivote
 *      a sitio público no hay login al que mandarlo ni plan que mejorar.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mensajeDeError } from '@/lib/errores';

/**
 * La respuesta LITERAL del backend ante `{"rut_empresa": "12345678-9"}`, que era
 * el RUT del placeholder del antiguo onboarding. Capturada contra la API corriendo, no
 * escrita a mano: el valor de este test depende de que la forma sea la real.
 */
const DETALLE_422 = [
  {
    type: 'value_error',
    loc: ['body', 'rut_empresa'],
    msg: 'Value error, RUT inválido (formato esperado: 12345678-9 o 12.345.678-9)',
    input: '12345678-9',
    ctx: { error: {} },
  },
];

describe('mensajeDeError con el 422 de Pydantic', () => {
  it('saca el texto del validador y le quita el prefijo de la librería', () => {
    const error = { response: { data: { detail: DETALLE_422 } } };
    expect(mensajeDeError(error)).toBe(
      'RUT inválido (formato esperado: 12345678-9 o 12.345.678-9)',
    );
  });

  it('devuelve SIEMPRE una cadena — es lo que React puede pintar', () => {
    const error = { response: { data: { detail: DETALLE_422 } } };
    expect(typeof mensajeDeError(error)).toBe('string');
  });

  it('nombra el campo cuando falta, porque "Field required" solo no dice nada', () => {
    const error = {
      response: {
        data: {
          detail: [{ type: 'missing', loc: ['body', 'nombre_empresa'], msg: 'Field required' }],
        },
      },
    };
    expect(mensajeDeError(error)).toBe('Falta un dato obligatorio: nombre_empresa.');
  });

  it('junta los campos malos en un solo mensaje', () => {
    const error = {
      response: {
        data: {
          detail: [
            { type: 'missing', loc: ['body', 'username'], msg: 'Field required' },
            { type: 'missing', loc: ['body', 'email'], msg: 'Field required' },
          ],
        },
      },
    };
    expect(mensajeDeError(error)).toBe(
      'Falta un dato obligatorio: username. Falta un dato obligatorio: email.',
    );
  });

  it('cae al respaldo si la lista no trae nada legible', () => {
    const error = { response: { data: { detail: [{ type: 'raro' }] } } };
    expect(mensajeDeError(error, 'No se pudo')).toBe('No se pudo');
  });
});

// ─── Que no vuelva a repartirse por las pantallas ────────────────────────────

const RAIZ = join(__dirname, '..');
const CARPETAS = ['app', 'components'];

/** `data.detail` / `data?.detail`, que es como se leía a mano en cada catch. */
const LECTURA_CRUDA = /data\s*\??\s*\.\s*detail/;

function archivosDeCodigo(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDeCodigo(ruta));
    else if (ruta.endsWith('.tsx') || ruta.endsWith('.ts')) salida.push(ruta);
  }
  return salida;
}

describe('la forma del error la conoce un solo sitio', () => {
  it('ninguna pantalla lee response.data.detail por su cuenta', () => {
    const infractores: string[] = [];

    for (const carpeta of CARPETAS) {
      for (const archivo of archivosDeCodigo(join(RAIZ, carpeta))) {
        const lineas = readFileSync(archivo, 'utf8').split('\n');
        lineas.forEach((linea, i) => {
          if (LECTURA_CRUDA.test(linea)) {
            infractores.push(`${archivo.replace(RAIZ + '/', '')}:${i + 1}  ${linea.trim()}`);
          }
        });
      }
    }

    expect(
      infractores,
      'Usa `mensajeDeError(err, respaldo)` de @/lib/errores: en un 422 el ' +
        '`detail` es una lista de objetos y React no sabe pintarla.\n' +
        infractores.join('\n'),
    ).toEqual([]);
  });
});

// ─── Un error de la API no saca a nadie de la página ─────────────────────────

/**
 * Hace que la llamada al catálogo falle con `status` y devuelve a dónde habría
 * ido el navegador y si alguien pidió el aviso de mejora de plan.
 */
async function provocarError(status: number): Promise<{ href?: string; avisoDePlan: boolean }> {
  vi.spyOn(axios, 'create').mockReturnValue(
    axios as unknown as ReturnType<typeof axios.create>,
  );
  vi.resetModules();
  const { apiClient } = await import('@/lib/api');

  const cliente = (apiClient as unknown as { client: typeof axios }).client;
  cliente.defaults.adapter = async (config) => {
    const error = new Error('respuesta simulada') as Error & {
      response?: unknown;
      config?: unknown;
    };
    error.response = {
      status,
      data: { detail: { bloqueada_por_plan: true, mensaje: 'antiguo 402' } },
      config,
      headers: {},
      statusText: '',
    };
    error.config = config;
    throw error;
  };

  // `window.location.href` es de sólo lectura en jsdom: se sustituye por un
  // objeto espía para poder ver a dónde habría ido el navegador.
  const destino: { href?: string } = {};
  Object.defineProperty(window, 'location', {
    value: { pathname: '/licitaciones', get href() { return destino.href ?? ''; }, set href(v: string) { destino.href = v; } },
    writable: true,
    configurable: true,
  });

  let avisoDePlan = false;
  const escuchar = () => { avisoDePlan = true; };
  window.addEventListener('plan-upgrade-needed', escuchar);
  try {
    await apiClient.getTenders().catch(() => undefined);
  } finally {
    window.removeEventListener('plan-upgrade-needed', escuchar);
  }
  return { href: destino.href, avisoDePlan };
}

describe('sin cuentas, el cliente no redirige ni anuncia planes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([401, 402, 403])('un %i no manda al visitante a ninguna parte', async (status) => {
    // Antes un 401 mandaba a la página de entrada. Ya no existe: redirigir ahí
    // sería un 404 en vez del mensaje de error de la pantalla.
    const { href, avisoDePlan } = await provocarError(status);
    expect(href).toBeUndefined();
    // Y un 402 ya no se traduce al aviso de mejora: no hay plan que comprar.
    expect(avisoDePlan).toBe(false);
  });
});
