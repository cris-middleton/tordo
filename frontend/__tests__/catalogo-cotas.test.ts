/**
 * El catálogo no le pide a la API lo que la API rechaza.
 *
 * Cada 422 de `GET /tenders/` se pintaba como «0 resultados»: más de ocho
 * palabras o cien letras en la búsqueda, un `offset` sobre 100.000, un monto
 * negativo o un mecanismo desconocido en la URL. Y la URL guarda la búsqueda:
 * un `fbclid` no es un filtro, y «Todas las licitaciones» guardada no puede
 * reabrirse en «Sólo abiertas».
 */
import { describe, expect, it } from 'vitest';

import { consultaCanonica } from '@/hooks/useBusquedasGuardadas';
import { MAXIMO_CARACTERES_BUSCAR, MAXIMO_TERMINOS_BUSCAR } from '@/lib/buscar';
import {
  FILTROS_POR_DEFECTO,
  OFFSET_MAXIMO,
  agregarTerminos,
  describirBusqueda,
  filtrosIniciales,
  leerFiltros,
  limitarTerminos,
  montoDeEntrada,
  montoParaMostrar,
  paginaMaxima,
  paramsDeApi,
} from '@/lib/filtrosCatalogo';

describe('términos de búsqueda', () => {
  it('sin repetidos, sin mirar mayúsculas', () => {
    expect(agregarTerminos(['Mesa'], 'mesa silla MESA').terminos).toEqual(['Mesa', 'silla']);
    expect(leerFiltros(new URLSearchParams('search=mesa+mesa')).terminos).toEqual(['mesa']);
  });

  it(`como mucho ${MAXIMO_TERMINOS_BUSCAR} palabras, y avisa que cortó`, () => {
    const r = agregarTerminos([], 'a b c d e f g h i j');
    expect(r.terminos).toHaveLength(MAXIMO_TERMINOS_BUSCAR);
    expect(r.recortados).toBe(true);
    expect(agregarTerminos([], 'uno dos').recortados).toBe(false);
  });

  it(`como mucho ${MAXIMO_CARACTERES_BUSCAR} caracteres en total, contando los espacios`, () => {
    const larga = 'x'.repeat(60);
    const r = limitarTerminos([larga, 'y'.repeat(39), 'z']);
    expect(r.terminos.join(' ').length).toBeLessThanOrEqual(MAXIMO_CARACTERES_BUSCAR);
    expect(r.terminos).toEqual([larga, 'y'.repeat(39)]);
    expect(r.recortados).toBe(true);
    // Los caracteres se cuentan como Python: un emoji es uno, no dos.
    expect(limitarTerminos(['😀'.repeat(MAXIMO_CARACTERES_BUSCAR)]).terminos).toHaveLength(1);
  });

  it('una URL con una búsqueda enorme llega a la API dentro de las cotas', () => {
    const f = leerFiltros(new URLSearchParams({ search: 'palabra '.repeat(30) }));
    const search = String(paramsDeApi(f).search);
    expect(search.split(' ')).toHaveLength(1); // repetidas: una sola
    const variada = leerFiltros(new URLSearchParams({ search: Array.from({ length: 30 }, (_, i) => `p${i}`).join(' ') }));
    expect(String(paramsDeApi(variada).search).split(' ')).toHaveLength(MAXIMO_TERMINOS_BUSCAR);
  });
});

describe('la URL del catálogo', () => {
  it('un mecanismo desconocido se descarta: el backend respondería 422', () => {
    expect(leerFiltros(new URLSearchParams('tipo_convocatoria=compra_agiles')).tipo_convocatoria).toBe('');
    expect(leerFiltros(new URLSearchParams('tipo_convocatoria=trato_directo,foo,licitacion')).tipo_convocatoria).toBe(
      'licitacion,trato_directo',
    );
  });

  it('un monto negativo o con letras no se lee', () => {
    expect(leerFiltros(new URLSearchParams('min_amount=-5&max_amount=1e9')).min_amount).toBe('');
    expect(leerFiltros(new URLSearchParams('max_amount=1e9')).max_amount).toBe('');
    expect(leerFiltros(new URLSearchParams('min_amount=5000000')).min_amount).toBe('5000000');
  });

  it(`la página se queda en la última que cabe en offset ≤ ${OFFSET_MAXIMO}`, () => {
    expect(paginaMaxima(20)).toBe(5001);
    const f = leerFiltros(new URLSearchParams('page=999999&abiertas=1'));
    expect(f.page).toBe(paginaMaxima(FILTROS_POR_DEFECTO.limit));
    expect(paramsDeApi(f).offset).toBe(OFFSET_MAXIMO);
    expect(paramsDeApi({ ...FILTROS_POR_DEFECTO, page: 10_000_000 }).offset).toBe(OFFSET_MAXIMO);
  });

  it('un parámetro ajeno (fbclid, utm) no quita «Sólo abiertas»', () => {
    expect(filtrosIniciales(new URLSearchParams('fbclid=abc&utm_source=x')).abiertas).toBe(true);
    expect(filtrosIniciales(new URLSearchParams('fbclid=abc&search=mesa')).abiertas).toBe(false);
    expect(filtrosIniciales(new URLSearchParams('page=2')).abiertas).toBe(false);
  });
});

describe('campos de monto', () => {
  it('se escriben como en Chile y se guardan como cifras', () => {
    expect(montoDeEntrada('5.000.000')).toBe('5000000');
    expect(montoDeEntrada('$ 5.000')).toBe('5000');
    expect(montoDeEntrada('5000000')).toBe('5000000');
    expect(montoDeEntrada('1.500,75')).toBe('1500');
    expect(montoDeEntrada('-300')).toBe('300');
    expect(montoDeEntrada('abc')).toBe('');
    expect(montoDeEntrada('007')).toBe('7');
    expect(montoDeEntrada('9'.repeat(30))).toHaveLength(15);
  });

  it('se muestran con punto de miles', () => {
    expect(montoParaMostrar('5000000')).toBe('5.000.000');
    expect(montoParaMostrar('')).toBe('');
  });
});

describe('«Todas las licitaciones» guardada', () => {
  it('se guarda como abiertas=0 y se reabre igual', () => {
    expect(consultaCanonica('abiertas=0')).toBe('abiertas=0');
    expect(filtrosIniciales(new URLSearchParams(consultaCanonica('abiertas=0'))).abiertas).toBe(false);
    expect(describirBusqueda('abiertas=0')).toBe('Todas las licitaciones');
  });

  it('una guardada vacía de antes significa lo mismo', () => {
    expect(consultaCanonica('')).toBe('abiertas=0');
  });

  it('las demás no cambian', () => {
    expect(consultaCanonica('abiertas=1')).toBe('abiertas=1');
    expect(consultaCanonica('search=mesa')).toBe('search=mesa');
  });
});
