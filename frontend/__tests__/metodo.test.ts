/**
 * Los pies de método (spec PORTADA_V7 V3 y §9): cada «Código» apunta a un fichero
 * que existe en el repo y cada «Cómo se calcula» a una guía y un ancla que
 * existen. Un enlace de procedencia roto dice lo contrario de lo que pretende.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BASE_API_PUBLICA } from '@/lib/abierto';
import { parsearGuia } from '@/lib/guias';
import { bloques, idsDeTitulos } from '@/lib/markdown';
import { enlacesDeMetodo, METODO_CIERRES, METODO_PRECIO, METODOS, rutaComoSeCalcula } from '@/lib/metodo';

const REPO = join(__dirname, '..', '..');
const GUIAS = join(__dirname, '..', 'content', 'explicativos');

describe('cada método apunta a algo que existe', () => {
  const metodos = Object.entries(METODOS);

  it('guarda: hay métodos que revisar', () => {
    expect(metodos.length).toBeGreaterThanOrEqual(2);
  });

  it.each(metodos)('%s: el fichero de «Código» está en el repo', (_, metodo) => {
    expect(existsSync(join(REPO, metodo.codigo)), metodo.codigo).toBe(true);
  });

  it.each(metodos.filter(([, m]) => m.guia))('%s: la guía y su ancla de «Cómo se calcula» existen', (_, metodo) => {
    const { slug, ancla } = metodo.guia!;
    const fichero = join(GUIAS, `${slug}.mdx`);
    expect(existsSync(fichero), fichero).toBe(true);
    const { markdown } = parsearGuia(readFileSync(fichero, 'utf8'));
    expect(idsDeTitulos(bloques(markdown))).toContain(ancla);
  });
});

describe('enlacesDeMetodo', () => {
  const REPOSITORIO = 'https://github.com/cris-middleton/tordo';

  it('en su orden: el de la lectura, cómo se calcula, la API y el código', () => {
    const enlaces = enlacesDeMetodo(METODO_PRECIO, {
      primero: { texto: 'Ver el producto', href: '/productos/x', externo: false },
      api: '/publico/productos/x',
      repositorio: REPOSITORIO,
    });
    expect(enlaces).toEqual([
      { texto: 'Ver el producto', href: '/productos/x', externo: false },
      { texto: 'Cómo se calcula', href: rutaComoSeCalcula(METODO_PRECIO.guia!), externo: false },
      { texto: 'Ver en la API', href: `${BASE_API_PUBLICA}/publico/productos/x`, externo: true },
      { texto: 'Código', href: `${REPOSITORIO}/blob/main/etl/analytics/product_price_bands.py`, externo: true },
    ]);
    expect(rutaComoSeCalcula(METODO_PRECIO.guia!)).toBe('/guias/como-leer-una-banda-de-precio#los-cinco-numeros');
  });

  it('sin repositorio no hay «Código»; sin guía, no hay «Cómo se calcula»', () => {
    const enlaces = enlacesDeMetodo(METODO_CIERRES, { api: '/publico/portada', repositorio: null });
    expect(enlaces.map((e) => e.texto)).toEqual(['Ver en la API']);
    expect(enlaces[0].href).toBe('https://api.tordo.cl/api/v1/publico/portada');
  });
});
