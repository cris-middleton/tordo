/**
 * La navegación del sitio es UNA lista (`lib/navegacion.ts`): de ella salen la
 * fila de escritorio, el menú móvil y el mapa del pie. Antes había dos menús
 * con nombres distintos para la misma página.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GUARDADOS,
  SECCIONES,
  enlacesAbiertos,
  columnasDelPie,
  esSeccionActiva,
  mapaDelSitio,
} from '@/lib/navegacion';

const RAIZ = join(__dirname, '..');
const APP = join(RAIZ, 'app');

/** Una ruta interna existe si alguna carpeta de `app/` (o de sus grupos) tiene su `page.tsx`. */
function existePagina(href: string): boolean {
  const ruta = href.replace(/^\//, '').split('#')[0];
  return ['', '(panel)', '(publico)'].some((grupo) => existsSync(join(APP, grupo, ruta, 'page.tsx')));
}

describe('las secciones', () => {
  it('son las de la spec, en su orden y con los nombres llanos de R10', () => {
    expect(SECCIONES.map((s) => [s.nombre, s.href])).toEqual([
      ['Compra Ágil', '/compra-agil'],
      ['Licitaciones', '/licitaciones'],
      ['Precios', '/productos'],
      ['Mercados', '/mercado'],
      ['Guías', '/guias'],
      ['Notas', '/notas'],
    ]);
    expect(JSON.stringify(mapaDelSitio('https://github.com/x/tordo'))).not.toMatch(/inteligencia|por producto/i);
  });

  it('cada ruta interna tiene su página (principio 7: ningún enlace a algo que no existe)', () => {
    const internas = mapaDelSitio(null).filter((e) => !e.externo);
    expect(internas.length).toBeGreaterThanOrEqual(7);
    const sinPagina = internas.filter((e) => !existePagina(e.href)).map((e) => e.href);
    expect(sinPagina).toEqual([]);
  });
});

describe('las columnas del pie (spec PORTADA_V7 §6)', () => {
  it('«Sitio», «Abierto» y «Sobre el sitio», y cada ruta interna tiene su página', () => {
    const columnas = columnasDelPie(null, 'hola@tordo.cl');
    expect(columnas.map((c) => c.titulo)).toEqual(['Sitio', 'Abierto', 'Sobre el sitio']);
    const internas = columnas.flatMap((c) => c.enlaces).filter((e) => !e.externo);
    expect(internas.length).toBeGreaterThanOrEqual(12);
    expect(internas.filter((e) => !existePagina(e.href)).map((e) => e.href)).toEqual([]);
  });

  it('«Sitio» son las secciones de la cabecera y Guardados: una sola lista', () => {
    expect(columnasDelPie(null, 'x@y.cl')[0].enlaces).toEqual([...SECCIONES, GUARDADOS]);
  });

  it('el contacto, con el correo que se le pasa', () => {
    const sobre = columnasDelPie(null, 'hola@tordo.cl')[2].enlaces;
    expect(sobre.at(-1)).toEqual({ nombre: 'Contacto', href: 'mailto:hola@tordo.cl', externo: true });
  });
});

describe('lo abierto', () => {
  it('«API y MCP» siempre; «Código» sólo con repositorio, y fuera del sitio', () => {
    expect(enlacesAbiertos(null)).toEqual([{ nombre: 'API y MCP', href: '/abierto' }]);
    expect(enlacesAbiertos('https://github.com/x/tordo')).toEqual([
      { nombre: 'API y MCP', href: '/abierto' },
      { nombre: 'Código', href: 'https://github.com/x/tordo', externo: true },
    ]);
  });

  it('el mapa del sitio: secciones, guardados y lo abierto', () => {
    expect(mapaDelSitio(null).map((e) => e.nombre)).toEqual([
      'Compra Ágil',
      'Licitaciones',
      'Precios',
      'Mercados',
      'Guías',
      'Notas',
      'Guardados',
      'API y MCP',
    ]);
    expect(GUARDADOS).toEqual({ nombre: 'Guardados', href: '/guardados' });
  });
});

describe('esSeccionActiva', () => {
  it.each([
    ['/licitaciones', '/licitaciones', true],
    ['/licitaciones/E2E-1001-LR24', '/licitaciones', true],
    ['/productos/guantes-nitrilo', '/productos', true],
    ['/licitacionesx', '/licitaciones', false],
    ['/', '/licitaciones', false],
    ['/terminos', '/guias', false],
    ['/compradores/7248', '/mercado', false],
    ['/', '/', false],
    ['/abierto', 'https://github.com/x/tordo', false],
  ])('%s dentro de %s → %s', (ruta, href, esperado) => {
    expect(esSeccionActiva(ruta, href)).toBe(esperado);
  });
});

describe('lib/navegacion.ts no importa nada', () => {
  it('lo lee también Playwright, que no resuelve el alias @/', () => {
    const fuente = readFileSync(join(RAIZ, 'lib', 'navegacion.ts'), 'utf8');
    expect(fuente).not.toMatch(/^\s*import\s/m);
  });
});

describe('R10: el nombre del menú es el de la página que abre', () => {
  it('ni «Inteligencia de mercado» ni «Precios por producto» quedan como etiqueta', () => {
    const ficheros = [
      'app/(panel)/mercado/page.tsx',
      'app/(panel)/mercado/layout.tsx',
      'lib/portada.ts',
      'app/(panel)/licitaciones/[codigo]/components/BICard.tsx',
      'content/explicativos/concentracion-de-mercado.mdx',
      'content/explicativos/como-leer-una-banda-de-precio.mdx',
    ];
    const conLaVieja = ficheros.filter((f) =>
      /inteligencia de mercado|precios por producto/i.test(readFileSync(join(RAIZ, f), 'utf8')),
    );
    expect(conLaVieja).toEqual([]);
  });
});
