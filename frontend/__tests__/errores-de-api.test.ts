/**
 * El `detail` de FastAPI no siempre es una cadena, y pintarlo tal cual mata la
 * pantalla.
 *
 * En un 422 —el que produce cualquier validador de esquema de Pydantic— `detail`
 * es una LISTA de objetos `{type, loc, msg, input, ctx}`. Cada pantalla lo
 * tipaba como `string` y lo metía en el JSX, así que React moría con «Objects
 * are not valid as a React child». Pasó en el onboarding: es el primer
 * formulario de un usuario nuevo, y basta escribir un RUT con el dígito
 * verificador cambiado para reventarlo. El TypeScript no lo vio porque la
 * mentira estaba en el `as` con que se leía la respuesta.
 *
 * Aquí se fija el contrato en tres niveles:
 *   1. `mensajeDeError` entiende las tres formas del `detail`.
 *   2. Ninguna pantalla vuelve a leer `response.data.detail` por su cuenta.
 *   3. El 401 de la sonda de sesión NO redirige — o la landing se vuelve
 *      inalcanzable para quien no ha entrado.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mensajeDeError } from '@/lib/errores';

/**
 * La respuesta LITERAL del backend ante `{"rut_empresa": "12345678-9"}`, que es
 * el RUT del placeholder del onboarding. Capturada contra la API corriendo, no
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
const CARPETAS = ['app', 'components', 'contexts'];

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

// ─── El 401 de la sonda de sesión no echa a nadie de la landing ──────────────

async function provocar401En(ruta: string): Promise<string | undefined> {
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
    error.response = { status: 401, data: { detail: 'Not authenticated' }, config, headers: {}, statusText: '' };
    // Axios pone `config` también en el error, y es de ahí de donde el
    // interceptor saca la ruta para saber si el 401 es la sonda de sesión.
    error.config = config;
    throw error;
  };

  // `window.location.href` es de sólo lectura en jsdom: se sustituye por un
  // objeto espía para poder ver a dónde habría ido el navegador.
  const destino: { href?: string } = {};
  Object.defineProperty(window, 'location', {
    value: { pathname: '/', get href() { return destino.href ?? ''; }, set href(v: string) { destino.href = v; } },
    writable: true,
    configurable: true,
  });

  if (ruta === 'sonda') await apiClient.getCurrentUser().catch(() => undefined);
  else await apiClient.getEmpresas().catch(() => undefined);

  return destino.href;
}

describe('401 y redirección al login', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('NO redirige cuando el 401 viene de preguntar si hay sesión', async () => {
    // La landing monta AuthContext, que pregunta por `/auth/me`. Para un
    // visitante anónimo la respuesta es 401 y es la correcta. Cuando esto
    // redirigía, `/` rebotaba a `/login` y la home no la veía nadie.
    expect(await provocar401En('sonda')).toBeUndefined();
  });

  it('SÍ redirige cuando el 401 viene de cualquier otra llamada', async () => {
    // Una sesión que se cae a media faena sigue mandando al login.
    expect(await provocar401En('otra')).toBe('/login');
  });
});
