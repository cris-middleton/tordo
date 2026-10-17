/**
 * La medida de lectura: en las páginas de texto, cada párrafo mide como mucho
 * `58ch` (`.lectura`, en `app/globals.css`), unos 77 caracteres de texto: `ch` es
 * el ancho del «0», más ancho que la letra media. Con `65ch` salían 85–89 y el
 * detector seguía marcándolo (pide menos de 80).
 *
 * La columna es `max-w-3xl` (768 px) y el cuerpo va a 14–15 px, así que una
 * línea llegaba a ~120 caracteres: el detector de Impeccable (`make diseno`) lo
 * marcó en `/acerca`, `/apoyar`, `/abierto` y en cada nota. Entre 45 y 75 es la
 * medida de un libro; 80 es el tope de una pantalla. La columna no se estrecha (las cajas de código, las
 * tablas y los gráficos siguen usando los 768 px): sólo el texto corrido.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

const PAGINAS_DE_LECTURA = [
  'app/(publico)/acerca/page.tsx',
  'app/(publico)/apoyar/page.tsx',
  'app/(publico)/abierto/page.tsx',
  'app/(publico)/guias/page.tsx',
  'app/(publico)/guias/[slug]/page.tsx',
  'app/(publico)/notas/page.tsx',
  'app/(publico)/notas/[slug]/page.tsx',
  'components/legal/DocumentoLegal.tsx',
];

describe('medida de lectura', () => {
  it('globals.css limita el texto corrido de `.lectura` a 58ch', () => {
    const css = leer('app/globals.css');
    expect(css).toMatch(/\.lectura\s+:where\([^)]*\bp\b[^)]*\)\s*\{[^}]*max-width:\s*58ch/);
  });

  it.each(PAGINAS_DE_LECTURA)('%s marca su columna con `lectura`', (ruta) => {
    expect(leer(ruta)).toMatch(/className="[^"]*\blectura\b[^"]*max-w-3xl|className="[^"]*max-w-3xl[^"]*\blectura\b/);
  });
});
