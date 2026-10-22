/**
 * El núcleo puro de `/buscar` (spec del rediseño §6.4).
 *
 * Se fija:
 *   1. qué se busca: el término limpio, recortado a 8 palabras y 100
 *      caracteres ANTES de llamar (Compra Ágil responde 422 con más) y sólo
 *      desde 3 caracteres — la misma regla que `/productos`;
 *   2. que los parámetros de `/tenders/` salen del MISMO enlace que el bloque
 *      ofrece, así que el total que se lee es el que se encuentra al seguirlo;
 *   3. que lo que escribe el visitante no inyecta parámetros;
 *   4. cuándo la página puede decir «no encontramos nada» (y cuándo no).
 */
import { describe, expect, it } from 'vitest';

import {
  COMPRADORES_EN_BUSCAR,
  EJEMPLOS_BUSQUEDA,
  LICITACIONES_EN_BUSCAR,
  MAXIMO_CARACTERES_BUSCAR,
  MAXIMO_TERMINOS_BUSCAR,
  MINIMO_LETRAS_BUSCAR,
  compradoresDistintos,
  estadoDeLaBusqueda,
  montoNumerico,
  paramsLicitacionesAbiertas,
  prepararBusqueda,
  rutaBuscar,
  textoDeFallo,
} from '@/lib/buscar';
import { leerFiltros, paramsDeApi, urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import { rutaLicitacion } from '@/lib/publico';
import { MAXIMO_BUSQUEDA_PRODUCTOS, MINIMO_BUSQUEDA_PRODUCTOS } from '@/lib/queries';
import type { LicitacionesEncontradas, ResultadosBusqueda } from '@/types/buscar';
import type { CompradorDeProducto } from '@/types/publico';

import { DESTACADAS, LICITACIONES, PRODUCTO, PRODUCTOS, fallo, ok } from './ayudas/buscarDePrueba';

describe('prepararBusqueda', () => {
  it('limpia los espacios y separa los términos', () => {
    expect(prepararBusqueda('  guantes   de nitrilo ')).toEqual({
      termino: 'guantes de nitrilo',
      terminos: ['guantes', 'de', 'nitrilo'],
      buscable: true,
      recortada: false,
    });
  });

  it('desde tres caracteres; por debajo no se busca', () => {
    expect(prepararBusqueda('abc').buscable).toBe(true);
    expect(prepararBusqueda('ab')).toEqual({ termino: 'ab', terminos: ['ab'], buscable: false, recortada: false });
    expect(prepararBusqueda('   ').buscable).toBe(false);
    expect(prepararBusqueda(undefined)).toEqual({ termino: '', terminos: [], buscable: false, recortada: false });
    expect(prepararBusqueda(null).buscable).toBe(false);
  });

  it('con dos q en la URL vale la primera', () => {
    expect(prepararBusqueda(['resma', 'toner']).termino).toBe('resma');
    expect(prepararBusqueda([]).buscable).toBe(false);
  });

  it('recorta a 8 palabras y lo dice', () => {
    const b = prepararBusqueda('uno dos tres cuatro cinco seis siete ocho nueve diez');
    expect(b.terminos).toEqual(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho']);
    expect(b.termino).toBe('uno dos tres cuatro cinco seis siete ocho');
    expect(b.recortada).toBe(true);
  });

  it('recorta a 100 caracteres, también con 8 palabras largas', () => {
    const una = prepararBusqueda('x'.repeat(150));
    expect(una.termino).toHaveLength(MAXIMO_CARACTERES_BUSCAR);
    expect(una.recortada).toBe(true);

    const pegada = prepararBusqueda(`${'palabra '.repeat(7)}${'z'.repeat(90)}`);
    expect(pegada.termino.length).toBeLessThanOrEqual(MAXIMO_CARACTERES_BUSCAR);
    expect(pegada.terminos.length).toBeLessThanOrEqual(MAXIMO_TERMINOS_BUSCAR);
    expect(pegada.termino).toBe(pegada.terminos.join(' '));
    expect(pegada.recortada).toBe(true);
  });

  it('compone las tildes que algunos teclados mandan sueltas', () => {
    expect(prepararBusqueda('jabón').termino).toBe('jabón');
  });

  it('corta por caracteres, no por unidades UTF-16: un emoji en el borde no queda partido', () => {
    const b = prepararBusqueda(`${'x'.repeat(99)}😀`);
    // El emoji es UN carácter (el backend cuenta así): cabe, y no queda media pareja suelta.
    expect(Array.from(b.termino)).toHaveLength(MAXIMO_CARACTERES_BUSCAR);
    expect(b.termino.endsWith('😀')).toBe(true);
    expect(b.recortada).toBe(false);

    const pasado = prepararBusqueda(`${'x'.repeat(99)}😀😀`);
    expect(Array.from(pasado.termino)).toHaveLength(MAXIMO_CARACTERES_BUSCAR);
    expect(pasado.termino).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(pasado.termino).not.toMatch(/(?<![\ud800-\udbff])[\udc00-\udfff]/);
    expect(pasado.recortada).toBe(true);
  });

  it('sólo signos: se limpia igual y se busca si llega a tres caracteres', () => {
    expect(prepararBusqueda('!?')).toEqual({ termino: '!?', terminos: ['!?'], buscable: false, recortada: false });
    expect(prepararBusqueda('...').buscable).toBe(true);
    expect(prepararBusqueda(' - ').termino).toBe('-');
  });

  it('el texto con tildes sueltas (NFD) no cuenta como recortado', () => {
    const b = prepararBusqueda('jabón líquido');
    expect(b.termino).toBe('jabón líquido');
    expect(b.recortada).toBe(false);
  });

  it('un corte a media palabra deja esa palabra truncada, sin espacios de sobra', () => {
    const ocho = prepararBusqueda('palabra '.repeat(12).trim());
    expect(ocho.terminos).toHaveLength(MAXIMO_TERMINOS_BUSCAR);
    expect(ocho.terminos.every((t) => t === 'palabra')).toBe(true);

    // 7 palabras de 9 letras + espacio = 70 caracteres; la octava se corta en el 100.
    const larga = prepararBusqueda(`${'abcdefghi '.repeat(7)}abcdefghijklmnopqrstuvwxyzabcdefghijklmn`);
    expect(Array.from(larga.termino)).toHaveLength(MAXIMO_CARACTERES_BUSCAR);
    expect(larga.terminos.at(-1)).toBe('abcdefghijklmnopqrstuvwxyzabcd');
    expect(larga.termino).toBe(larga.terminos.join(' '));
    expect(larga.recortada).toBe(true);
  });
});

describe('rutas', () => {
  it('rutaBuscar escapa todo y sin término es la página sola', () => {
    expect(rutaBuscar('guantes de nitrilo')).toBe('/buscar?q=guantes+de+nitrilo');
    expect(rutaBuscar('a&b=c #d')).toBe('/buscar?q=a%26b%3Dc+%23d');
    expect(rutaBuscar('   ')).toBe('/buscar');
  });

  it('rutaLicitacion escapa el código', () => {
    expect(rutaLicitacion('1234-5-LE26')).toBe('/licitaciones/1234-5-LE26');
    expect(rutaLicitacion('a/b?c')).toBe('/licitaciones/a%2Fb%3Fc');
  });
});

describe('paramsLicitacionesAbiertas', () => {
  it('pide pocas filas, sólo abiertas y sin Compra Ágil, por relevancia', () => {
    const p = paramsLicitacionesAbiertas(['resma', 'carta']);
    expect(p.get('limit')).toBe(String(LICITACIONES_EN_BUSCAR));
    expect(p.get('offset')).toBe('0');
    expect(p.get('abiertas')).toBe('true');
    expect(p.get('search')).toBe('resma carta');
    expect(p.get('sort_by')).toBe('relevance');
    expect(p.get('tipo_convocatoria')).toBe('licitacion,convenio_marco,trato_directo');
  });

  it('son los filtros del enlace del bloque, salvo el tamaño de página', () => {
    const terminos = ['resma', 'carta'];
    const enlace = new URL(urlCatalogoAbiertas('licitaciones', terminos), 'https://x');
    const delEnlace = paramsDeApi(leerFiltros(enlace.searchParams));
    const p = paramsLicitacionesAbiertas(terminos);
    expect([...p.keys()].sort()).toEqual(Object.keys(delEnlace).sort());
    for (const [nombre, valor] of Object.entries(delEnlace)) {
      if (nombre === 'limit' || nombre === 'offset') continue;
      expect(p.get(nombre), nombre).toBe(String(valor));
    }
  });

  it('lo que escribe el visitante no abre el filtro', () => {
    const p = paramsLicitacionesAbiertas(['guante&abiertas=false&limit=500']);
    expect(p.getAll('abiertas')).toEqual(['true']);
    expect(p.getAll('limit')).toEqual([String(LICITACIONES_EN_BUSCAR)]);
    expect(p.get('search')).toBe('guante&abiertas=false&limit=500');
  });
});

describe('compradoresDistintos', () => {
  const c = (codigo: string, unidad: string, n: number): CompradorDeProducto => ({
    codigo,
    nombre: `Comprador ${codigo}`,
    unidad,
    n,
    p50: 1000,
  });

  it('uno por código, en el orden del backend', () => {
    const lista = [c('1', 'Caja', 40), c('2', 'Caja', 30), c('1', 'Unidad', 20), c('3', 'Caja', 10)];
    expect(compradoresDistintos(lista, COMPRADORES_EN_BUSCAR).map((x) => x.codigo)).toEqual(['1', '2', '3']);
  });

  it('como mucho los pedidos', () => {
    const lista = ['1', '2', '3', '4', '5', '6', '7'].map((k) => c(k, 'Caja', 1));
    expect(compradoresDistintos(lista, COMPRADORES_EN_BUSCAR)).toHaveLength(COMPRADORES_EN_BUSCAR);
  });
});

describe('montoNumerico', () => {
  it('el Decimal llega como texto; lo que no es cifra es null', () => {
    expect(montoNumerico('12500000.00')).toBe(12_500_000);
    expect(montoNumerico(4800)).toBe(4800);
    expect(montoNumerico(null)).toBeNull();
    expect(montoNumerico(undefined)).toBeNull();
    expect(montoNumerico('')).toBeNull();
    expect(montoNumerico('n/a')).toBeNull();
  });
});

describe('textoDeFallo', () => {
  it('el límite por IP pide esperar; el resto, que no se pudo', () => {
    expect(textoDeFallo('los precios', 'limite')).toMatch(/espera un momento/);
    expect(textoDeFallo('los precios', 'error')).toBe('No pudimos consultar los precios ahora. Prueba de nuevo en un momento.');
  });
});

describe('estadoDeLaBusqueda', () => {
  const vacios: ResultadosBusqueda = {
    productos: ok([]),
    ficha: null,
    licitaciones: ok({ items: [], total: 0 }),
    comprasAgiles: ok({ ...DESTACADAS, items: [] }),
    compradoresPorNombre: ok([]),
  };

  it('con algo en cualquier bloque hay resultados', () => {
    expect(estadoDeLaBusqueda({ ...vacios, productos: ok(PRODUCTOS), ficha: ok(PRODUCTO) })).toBe('con-resultados');
    expect(estadoDeLaBusqueda({ ...vacios, licitaciones: ok(LICITACIONES) })).toBe('con-resultados');
    expect(estadoDeLaBusqueda({ ...vacios, comprasAgiles: ok(DESTACADAS) })).toBe('con-resultados');
    expect(
      estadoDeLaBusqueda({
        ...vacios,
        compradoresPorNombre: ok([{ codigo: '1', nombre: 'HOSPITAL DE TALCA', n: 9, indexable: true }]),
      }),
    ).toBe('con-resultados');
  });

  it('«no encontramos nada» sólo si los cuatro respondieron vacíos', () => {
    expect(estadoDeLaBusqueda(vacios)).toBe('sin-resultados');
    expect(estadoDeLaBusqueda({ ...vacios, licitaciones: fallo<LicitacionesEncontradas>() })).toBe('incompleta');
  });
});

describe('constantes', () => {
  it('el mínimo y el máximo son los de /productos', () => {
    expect(MINIMO_LETRAS_BUSCAR).toBe(MINIMO_BUSQUEDA_PRODUCTOS);
    expect(MAXIMO_CARACTERES_BUSCAR).toBe(MAXIMO_BUSQUEDA_PRODUCTOS);
  });

  it('los ejemplos se pueden buscar: sin recorte y con una palabra útil', () => {
    expect(EJEMPLOS_BUSQUEDA.length).toBeGreaterThanOrEqual(4);
    for (const ejemplo of EJEMPLOS_BUSQUEDA) {
      const b = prepararBusqueda(ejemplo);
      expect(b.buscable && !b.recortada, ejemplo).toBe(true);
      // La búsqueda de precios descarta palabras de menos de 3 letras y con dígitos (0e).
      expect(b.terminos.some((t) => t.length >= 3 && !/\d/.test(t)), ejemplo).toBe(true);
    }
  });
});

describe('prepararBusqueda corta palabras como el backend', () => {
  it('U+001C–U+001F separan palabras, como str.split() de Python', () => {
    const q = Array.from({ length: 10 }, (_, i) => `palabra${i}`).join('\u001f');
    const b = prepararBusqueda(q);
    expect(b.terminos).toHaveLength(8);
    expect(b.recortada).toBe(true);
  });
});
