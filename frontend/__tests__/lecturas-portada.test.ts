/**
 * Las lecturas del panel de la portada (spec docs/IDENTIDAD_Y_PORTADA_2026-10.md
 * §3.2–§3.5 y §8): cada frase sale del dato, con reglas, y cada regla se fija
 * aquí con sus bordes. «Salud y municipios compran casi lo mismo» es verdad hoy
 * y puede no serlo el domingo (D8).
 *
 * Sin dato que pintar con verdad, una lectura devuelve `null` y la portada la
 * oculta entera (principio 4): sin periodo, sin p25/p75, tramos que no suman.
 */
import { describe, expect, it } from 'vitest';

import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import {
  BARRAS_SECTOR,
  esConteo,
  esProductoPortada,
  esSectores,
  fraseCierres,
  izquierdaDeRotulo,
  lecturaCierres,
  lecturaPrecio,
  lecturaSectores,
  nombreSector,
  posicionDeRotulo,
  PRODUCTO_PORTADA,
  rotulosDeBanda,
  SEPARACION_MINIMA_ROTULOS,
  UMBRAL_EMPATE,
} from '@/lib/lecturasPortada';
import { textoPeriodo } from '@/lib/periodo';
import { rutaProducto } from '@/lib/publico';
import type { SectorBI, SectoresBI } from '@/types/bi';
import type { BandaUnidad, ProductoPublico, ResumenPortada } from '@/types/publico';

// ── Lectura 1: quién compra ─────────────────────────────────────────────────

const VENTANA = { ventana_desde: '2023-11-01', ventana_hasta: '2026-10-11' };

function fila(
  sector: string,
  monto_total: number,
  ventana: Pick<SectorBI, 'ventana_desde' | 'ventana_hasta'> = VENTANA,
): SectorBI {
  return { sector, monto_total, ...ventana };
}

const respuesta = (...sectores: SectorBI[]): SectoresBI => ({ disponible: true, sectores, total: sectores.length });

/** Los siete sectores de los datos locales (6 meses), con su monto real. */
const SIETE = respuesta(
  fila('Salud', 2.9816e12),
  fila('Municipalidades', 2.9484e12),
  fila('Gob. Central, Universidades', 1.9975e12),
  fila('Obras Públicas', 1.8626e12),
  fila('FFAA', 3.8045e11),
  fila('Otros', 1.5986e11),
  fila('Legislativo y judicial', 7.3408e10),
);

describe('lecturaSectores', () => {
  it('con los datos locales: Salud y municipios empatan, cuatro barras y las dos primeras pintadas', () => {
    const l = lecturaSectores(SIETE)!;
    expect(l.conclusion).toBe('Salud y municipios compran casi lo mismo');
    expect(l.pie).toBe(`Órdenes de compra, ${textoPeriodo({ desde: '2023-11-01', hasta: '2026-10-11' })}`);
    expect(l.pie).toMatch(/\(36 meses\)$/);
    expect(l.enlace).toEqual({ texto: 'Ver mercados', href: '/mercado' });
    expect(l.barras.map((b) => [b.nombre, b.monto, b.destacada])).toEqual([
      ['Salud', '$3 billones', true],
      ['Municipalidades', '$2,9 billones', true],
      ['Gob. central', '$2 billones', false],
      ['Obras públicas', '$1,9 billones', false],
    ]);
    expect(l.barras).toHaveLength(BARRAS_SECTOR);
    // El ancho es relativo al primero, con un decimal: 1,8626 / 2,9816 = 62,47 %.
    expect(l.barras.map((b) => b.ancho)).toEqual([100, 98.9, 67, 62.5]);
  });

  it(`el ${UMBRAL_EMPATE * 100} % justo NO es empate: se pinta uno y la frase reparte $100`, () => {
    const l = lecturaSectores(respuesta(fila('Salud', 100), fila('Municipalidades', 95)))!;
    expect(l.conclusion).toBe('Salud gasta $51 de cada $100 en órdenes de compra');
    expect(l.barras.map((b) => b.destacada)).toEqual([true, false]);
  });

  it('un pelo por debajo del 5 % sí es empate', () => {
    const l = lecturaSectores(respuesta(fila('Salud', 100), fila('Municipalidades', 95.01)))!;
    expect(l.conclusion).toBe('Salud y municipios compran casi lo mismo');
  });

  it('«Otros» entre los cuatro primeros se salta y entra el quinto; el reparto cuenta todos', () => {
    const l = lecturaSectores(
      respuesta(
        fila('Salud', 100),
        fila('Otros', 90),
        fila('Municipalidades', 80),
        fila('Gob. Central, Universidades', 70),
        fila('Obras Públicas', 60),
      ),
    )!;
    expect(l.barras.map((b) => b.nombre)).toEqual(['Salud', 'Municipalidades', 'Gob. central', 'Obras públicas']);
    // 100 sobre 400 (Otros incluido): la frase habla de todas las órdenes de la respuesta.
    expect(l.conclusion).toBe('Salud gasta $25 de cada $100 en órdenes de compra');
  });

  it('un sector sin nombre («NA», está en el fixture del golden) tampoco ocupa barra, pero suma en el reparto', () => {
    const l = lecturaSectores(respuesta(fila('Salud', 100), fila('NA', 90), fila('Municipalidades', 10)))!;
    expect(l.barras.map((b) => b.nombre)).toEqual(['Salud', 'Municipalidades']);
    // 100 sobre 200 (NA incluido).
    expect(l.conclusion).toBe('Salud gasta $50 de cada $100 en órdenes de compra');
  });

  it('«Otros» y «NA» se saltan sin importar mayúsculas', () => {
    const l = lecturaSectores(respuesta(fila('OTROS', 100), fila('na', 90), fila('Salud', 10)))!;
    expect(l.barras.map((b) => b.nombre)).toEqual(['Salud']);
  });

  it('una ventana con fecha imposible se oculta sin lanzar', () => {
    const datos = respuesta(fila('Salud', 10, { ventana_desde: '2023-99-01', ventana_hasta: '2026-10-11' }));
    expect(esSectores(datos)).toBe(false);
    expect(lecturaSectores(datos)).toBeNull();
  });

  it('un solo sector: gasta los $100 y se pinta', () => {
    const l = lecturaSectores(respuesta(fila('Salud', 7)))!;
    expect(l.conclusion).toBe('Salud gasta $100 de cada $100 en órdenes de compra');
    expect(l.barras).toEqual([{ nombre: 'Salud', monto: '$7', ancho: 100, destacada: true }]);
  });

  it('el reparto de $100 con decimales se redondea a entero', () => {
    const l = lecturaSectores(respuesta(fila('Salud', 2), fila('Municipalidades', 1)))!;
    expect(l.conclusion).toBe('Salud gasta $67 de cada $100 en órdenes de compra');
    expect(l.barras[1].ancho).toBe(50);
  });

  it('un sector fuera del mapa sale con su nombre tal cual, en la barra y en la frase', () => {
    const l = lecturaSectores(respuesta(fila('Bomberos de Chile', 300), fila('FFAA', 100)))!;
    expect(l.conclusion).toBe('Bomberos de Chile gasta $75 de cada $100 en órdenes de compra');
    expect(l.barras.map((b) => b.nombre)).toEqual(['Bomberos de Chile', 'FFAA']);
  });

  it('la frase empieza con mayúscula aunque el nombre de la frase no', () => {
    const l = lecturaSectores(respuesta(fila('Municipalidades', 100), fila('Salud', 99)))!;
    expect(l.conclusion).toBe('Municipios y Salud compran casi lo mismo');
  });

  it('ordena por monto aunque el backend no lo haga', () => {
    const l = lecturaSectores(respuesta(fila('Municipalidades', 10), fila('Salud', 100)))!;
    expect(l.barras.map((b) => b.nombre)).toEqual(['Salud', 'Municipalidades']);
  });

  it.each([
    ['sin respuesta (el backend falló o dio 503)', null],
    ['disponible: false (tabla ausente)', { disponible: false, motivo: 'parquet no generado' }],
    ['sin filas', respuesta()],
    ['sólo «Otros»', respuesta(fila('Otros', 10))],
    ['sin ventana (la semanal aún no la escribió)', respuesta(fila('Salud', 10, { ventana_desde: null, ventana_hasta: null }))],
    ['sin ventana porque el backend es anterior', respuesta({ sector: 'Salud', monto_total: 10 })],
    ['con la ventana a medias', respuesta(fila('Salud', 10, { ventana_desde: '2023-11-01', ventana_hasta: null }))],
    ['con todo en cero', respuesta(fila('Salud', 0), fila('Municipalidades', 0))],
  ])('%s: se oculta', (_, datos) => {
    expect(lecturaSectores(datos as SectoresBI | null)).toBeNull();
  });
});

describe('nombreSector', () => {
  it('un nombre para la barra y otro para la frase', () => {
    expect(nombreSector('Municipalidades')).toEqual({ barra: 'Municipalidades', frase: 'municipios' });
    expect(nombreSector('Gob. Central, Universidades')).toEqual({ barra: 'Gob. central', frase: 'Gob. central' });
    expect(nombreSector('Obras Públicas')).toEqual({ barra: 'Obras públicas', frase: 'Obras públicas' });
  });

  it('fuera del mapa, tal cual (sin espacios de sobra)', () => {
    expect(nombreSector(' Salud ')).toEqual({ barra: 'Salud', frase: 'Salud' });
  });
});

describe('esSectores', () => {
  it('acepta la respuesta buena, la de «no disponible» y filas sin ventana', () => {
    expect(esSectores(SIETE)).toBe(true);
    expect(esSectores({ disponible: false, motivo: 'parquet no generado' })).toBe(true);
    expect(esSectores({ disponible: true, sectores: [{ sector: 'Salud', monto_total: 1 }] })).toBe(true);
  });

  it.each([
    ['null', null],
    ['un texto', 'raro'],
    ['sin disponible', { sectores: [] }],
    ['disponible sin lista', { disponible: true }],
    ['una fila nula', { disponible: true, sectores: [null] }],
    ['un sector nulo', { disponible: true, sectores: [{ sector: null, monto_total: 1 }] }],
    ['un sector vacío', { disponible: true, sectores: [{ sector: '  ', monto_total: 1 }] }],
    ['un monto de texto', { disponible: true, sectores: [{ sector: 'Salud', monto_total: '1' }] }],
    ['un monto negativo', { disponible: true, sectores: [{ sector: 'Salud', monto_total: -1 }] }],
    ['una ventana que no es fecha', { disponible: true, sectores: [{ ...fila('Salud', 1), ventana_desde: 2023 }] }],
    ['un mes imposible', { disponible: true, sectores: [{ ...fila('Salud', 1), ventana_desde: '2023-99-01' }] }],
    ['un día imposible', { disponible: true, sectores: [{ ...fila('Salud', 1), ventana_hasta: '2023-02-30' }] }],
  ])('rechaza %s', (_, datos) => {
    expect(esSectores(datos)).toBe(false);
  });
});

// ── Lectura 2: a qué precio ─────────────────────────────────────────────────

const BANDA: BandaUnidad = {
  unidad: 'Caja',
  n: 184,
  p10: 2100,
  p25: 4200,
  p50: 5390,
  p75: 6900,
  p90: 11800,
  predictibilidad: 'media',
  confianza: 0.5,
};

const PRODUCTO: ProductoPublico = {
  slug: PRODUCTO_PORTADA.slug,
  firma: 'higiénico jumbo papel',
  nombre_generico: 'Papel higiénico',
  codigo_onu: null,
  descripcion: null,
  indexable: true,
  // La API las ordena de más a menos compras: se usa la primera.
  unidades: [BANDA, { ...BANDA, unidad: 'Unidad', n: 12 }],
  compradores: [],
  periodo: { ventana_desde: '2025-10-01', ventana_hasta: '2026-09-30' },
};

const conBanda = (cambio: Partial<BandaUnidad> | Record<string, unknown>): ProductoPublico => ({
  ...PRODUCTO,
  unidades: [{ ...BANDA, ...cambio } as BandaUnidad],
});

describe('PRODUCTO_PORTADA', () => {
  it('lleva un slug de verdad (tomado de producción), no el marcador del plan', () => {
    expect(PRODUCTO_PORTADA.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(PRODUCTO_PORTADA.slug.length).toBeLessThanOrEqual(80);
    expect(PRODUCTO_PORTADA.slug).not.toMatch(/SLUG|produccion/i);
  });

  it('y un nombre escrito a mano, que se lee como un nombre: no la firma', () => {
    expect(PRODUCTO_PORTADA.nombre).toMatch(/^\p{Lu}/u);
    expect(PRODUCTO_PORTADA.nombre.trim()).toBe(PRODUCTO_PORTADA.nombre);
    expect(PRODUCTO_PORTADA.nombre.toLowerCase()).not.toBe(PRODUCTO_PORTADA.slug.replace(/-/g, ' '));
  });
});

describe('lecturaPrecio', () => {
  it('la mitad se pagó entre p25 y p75, de la unidad con más compras, con el nombre a mano', () => {
    const l = lecturaPrecio(PRODUCTO)!;
    expect(l.conclusion).toBe(`${PRODUCTO_PORTADA.nombre}: la mitad se pagó entre $4.200 y $6.900`);
    expect(l.conclusion).not.toContain(PRODUCTO.firma);
    expect(l.pie).toBe(`Precio por caja, 184 compras, ${textoPeriodo({ desde: '2025-10-01', hasta: '2026-09-30' })}`);
    expect(l.pie).toMatch(/\(12 meses\)$/);
    expect(l.enlace).toEqual({ texto: 'Ver el producto', href: rutaProducto(PRODUCTO_PORTADA.slug) });
  });

  it('la ficha de PRODUCTO_PORTADA tal como respondía producción el 2026-10-16 pasa el filtro', () => {
    const real = conBanda({
      unidad: 'paquete',
      n: 90,
      p10: 674,
      p25: 842.5,
      p50: 1685,
      p75: 2106.25,
      p90: 3370,
      predictibilidad: 'media',
      confianza: 0.534,
    });
    const l = lecturaPrecio({ ...real, periodo: { ventana_desde: '2025-11-01', ventana_hasta: '2026-10-31' } })!;
    expect(l.conclusion).toBe('Papel higiénico jumbo: la mitad se pagó entre $843 y $2.106');
    expect(l.pie).toMatch(/^Precio por paquete, 90 compras, nov 2025 – oct 2026 \(12 meses\)$/);
  });

  it('con otra ficha, su nombre y su enlace: nunca los de la constante', () => {
    const l = lecturaPrecio({ ...PRODUCTO, slug: 'otro-producto' }, 'Otro producto')!;
    expect(l.conclusion).toMatch(/^Otro producto: /);
    expect(l.enlace.href).toBe(rutaProducto('otro-producto'));
  });

  it('las marcas van sobre un riel de p10 a p90, en % con un decimal', () => {
    const l = lecturaPrecio(PRODUCTO)!;
    expect(l.p10).toEqual({ valor: '$2.100', posicion: 0 });
    expect(l.p25).toEqual({ valor: '$4.200', posicion: 21.6 });
    expect(l.p50).toEqual({ valor: '$5.390', posicion: 33.9 });
    expect(l.p75).toEqual({ valor: '$6.900', posicion: 49.5 });
    expect(l.p90).toEqual({ valor: '$11.800', posicion: 100 });
  });

  it('sin p10 ni p90, el riel va de p25 a p75 y no hay extremos', () => {
    const l = lecturaPrecio(conBanda({ p10: null, p90: null }))!;
    expect(l.p10).toBeNull();
    expect(l.p90).toBeNull();
    expect(l.p25.posicion).toBe(0);
    expect(l.p75.posicion).toBe(100);
  });

  it('sin mediana no hay marca de mediana, y la lectura sigue', () => {
    const l = lecturaPrecio(conBanda({ p50: null }))!;
    expect(l.p50).toBeNull();
    expect(l.conclusion).toMatch(/la mitad se pagó entre/);
  });

  it('extremos pegados a la banda: p10 = p25 y p90 = p75 caen en los bordes del riel', () => {
    const l = lecturaPrecio(conBanda({ p10: 4200, p90: 6900 }))!;
    expect([l.p10, l.p25, l.p50, l.p75, l.p90].map((m) => m?.posicion)).toEqual([0, 0, 44.1, 100, 100]);
  });

  it('una sola compra, en singular; la unidad en minúsculas y sin espacios de sobra', () => {
    expect(lecturaPrecio(conBanda({ n: 1 }))!.pie).toMatch(/^Precio por caja, 1 compra, /);
    expect(lecturaPrecio(conBanda({ unidad: ' KILOGRAMO ' }))!.pie).toMatch(/^Precio por kilogramo, /);
  });

  it('predictibilidad alta también vale, y la comparación no mira mayúsculas', () => {
    expect(lecturaPrecio(conBanda({ predictibilidad: 'alta' }))).not.toBeNull();
    expect(lecturaPrecio(conBanda({ predictibilidad: ' Media ' }))).not.toBeNull();
  });

  it('p25 justo en $1 pasa el filtro, y p75 apenas sobre p25 también', () => {
    expect(lecturaPrecio(conBanda({ p10: 1, p25: 1 }))).not.toBeNull();
    expect(lecturaPrecio(conBanda({ p25: 1150, p50: 1150, p75: 1151 }))).not.toBeNull();
  });

  it('sólo mira la primera unidad: una segunda sin declarar no la oculta', () => {
    const p = { ...PRODUCTO, unidades: [BANDA, { ...BANDA, unidad: 'sin unidad declarada', predictibilidad: 'baja' }] };
    expect(lecturaPrecio(p)).not.toBeNull();
  });

  it.each([
    ['sin ficha (404 o backend caído)', null],
    ['no indexable', { ...PRODUCTO, indexable: false }],
    ['sin unidades', { ...PRODUCTO, unidades: [] }],
    ['sin p25', conBanda({ p25: null })],
    ['sin p75', conBanda({ p75: null })],
    ['con p75 bajo p25', conBanda({ p25: 7000, p75: 4000 })],
  ])('%s: se oculta', (_, producto) => {
    expect(lecturaPrecio(producto as ProductoPublico | null)).toBeNull();
  });

  // El filtro de calidad (spec §3.4): mejor ninguna banda que «entre $0 y $0».
  describe('filtro de calidad sobre la unidad con más compras', () => {
    it.each([
      ['unidad nula', conBanda({ unidad: null })],
      ['unidad vacía', conBanda({ unidad: '   ' })],
      ['«sin unidad declarada»', conBanda({ unidad: 'sin unidad declarada' })],
      ['«Sin Unidad Declarada» con espacios', conBanda({ unidad: '  Sin  Unidad Declarada ' })],
      ['predictibilidad baja', conBanda({ predictibilidad: 'baja' })],
      ['predictibilidad nula', conBanda({ predictibilidad: null })],
      ['predictibilidad desconocida', conBanda({ predictibilidad: 'altísima' })],
      ['p25 en $0', conBanda({ p10: 0, p25: 0 })],
      ['p25 bajo $1', conBanda({ p10: 0.0005, p25: 0.0017 })],
      // «Entre $1.150 y $1.150» no dice nada: una banda sin dispersión no es banda.
      ['p75 igual a p25', conBanda({ p25: 1150, p75: 1150 })],
      ['todos los precios iguales', conBanda({ p10: 1150, p25: 1150, p50: 1150, p75: 1150, p90: 1150 })],
      // Distintos en el dato pero escritos igual: «entre $2 millones y $2 millones».
      ['p25 y p75 iguales al escribirlos, en millones', conBanda({ p10: 1_400_000, p25: 1_500_000, p50: 1_550_000, p75: 1_600_000, p90: 1_700_000 })],
      ['p25 y p75 iguales al escribirlos, en pesos', conBanda({ p10: 1100, p25: 1150.2, p50: 1150.3, p75: 1150.4, p90: 1200 })],
    ])('%s: se oculta', (_, producto) => {
      expect(lecturaPrecio(producto)).toBeNull();
    });
  });

  describe('sin periodo, nada: una cifra sin periodo se lee como «de siempre»', () => {
    it.each([
      ['sin periodo (backend anterior)', { ...PRODUCTO, periodo: undefined }],
      ['con periodo nulo', { ...PRODUCTO, periodo: null }],
      ['con una ventana de fecha imposible', { ...PRODUCTO, periodo: { ventana_desde: '2025-99-01', ventana_hasta: '2026-09-30' } }],
      ['sin ventana_desde', { ...PRODUCTO, periodo: { ventana_desde: null, ventana_hasta: '2026-09-30' } }],
      ['sin ventana_hasta', { ...PRODUCTO, periodo: { ventana_desde: '2025-10-01', ventana_hasta: null } }],
    ])('%s: se oculta', (_, producto) => {
      expect(lecturaPrecio(producto as ProductoPublico)).toBeNull();
    });
  });
});

describe('posicionDeRotulo', () => {
  it('deja los rótulos centrados dentro del riel', () => {
    expect(posicionDeRotulo(0)).toBe(12);
    expect(posicionDeRotulo(50)).toBe(50);
    expect(posicionDeRotulo(100)).toBe(88);
  });

  it('sin posición (NaN), al centro: nunca «left: NaN%»', () => {
    expect(posicionDeRotulo(Number.NaN)).toBe(50);
  });
});

describe('izquierdaDeRotulo', () => {
  it('centra el rótulo en su marca sin dejar que su mitad se salga del riel', () => {
    // «$4.200»: 6 caracteres, media anchura de 3ch a cada lado.
    expect(izquierdaDeRotulo(21.6, '$4.200')).toBe('clamp(3ch, 21.6%, calc(100% - 3ch))');
    expect(izquierdaDeRotulo(50, 'mediana $5.390')).toBe('clamp(7ch, 50%, calc(100% - 7ch))');
  });

  it('pasa la posición por posicionDeRotulo', () => {
    expect(izquierdaDeRotulo(0, '$1')).toBe('clamp(1ch, 12%, calc(100% - 1ch))');
    expect(izquierdaDeRotulo(Number.NaN, '$1')).toBe('clamp(1ch, 50%, calc(100% - 1ch))');
  });
});

describe('rotulosDeBanda', () => {
  const marca = (posicion: number) => ({ valor: '$1', posicion });

  it('p25 y p75 separados: un rótulo bajo cada uno', () => {
    expect(rotulosDeBanda(marca(21.6), marca(49.5))).toEqual({ juntos: false, p25: 21.6, p75: 49.5 });
  });

  it(`a menos del ${SEPARACION_MINIMA_ROTULOS} % del riel entre sí, un solo rótulo en el medio`, () => {
    expect(rotulosDeBanda(marca(40), marca(50))).toEqual({ juntos: true, centro: 45 });
    expect(rotulosDeBanda(marca(40), marca(40 + SEPARACION_MINIMA_ROTULOS))).toEqual({
      juntos: false,
      p25: 40,
      p75: 40 + SEPARACION_MINIMA_ROTULOS,
    });
  });

  it('cola larga a la derecha: la banda se aprieta contra el inicio y se cuenta tras acotar', () => {
    // 1,0 y 9,0 están a 8 puntos, pero acotados quedan los dos en 12.
    expect(rotulosDeBanda(marca(1), marca(9))).toEqual({ juntos: true, centro: 12 });
    // 2 y 25: separados 23 en bruto, 13 tras acotar el primero a 12.
    expect(rotulosDeBanda(marca(2), marca(25))).toEqual({ juntos: true, centro: 18.5 });
  });

  it('cola larga a la izquierda: igual contra el final', () => {
    expect(rotulosDeBanda(marca(91), marca(99))).toEqual({ juntos: true, centro: 88 });
  });
});

describe('esConteo', () => {
  it('un entero no negativo', () => {
    expect(esConteo(0)).toBe(true);
    expect(esConteo(184)).toBe(true);
    expect([-1, 1.5, '3', null, Number.NaN].some(esConteo)).toBe(false);
  });
});

describe('esProductoPortada', () => {
  it('acepta la ficha, con y sin periodo', () => {
    expect(esProductoPortada(PRODUCTO)).toBe(true);
    const { periodo: _sinPeriodo, ...anterior } = PRODUCTO;
    expect(esProductoPortada(anterior)).toBe(true);
  });

  it('acepta una unidad o una predictibilidad nulas (el backend las permite): el filtro las oculta después', () => {
    expect(esProductoPortada(conBanda({ unidad: null }))).toBe(true);
    expect(esProductoPortada(conBanda({ predictibilidad: null }))).toBe(true);
  });

  it.each([
    ['null', null],
    ['sin unidades', { ...PRODUCTO, unidades: undefined }],
    ['una unidad nula', { ...PRODUCTO, unidades: [null] }],
    ['una unidad de número', { ...PRODUCTO, unidades: [{ ...BANDA, unidad: 3 }] }],
    ['n de texto', { ...PRODUCTO, unidades: [{ ...BANDA, n: '184' }] }],
    ['p25 de texto', { ...PRODUCTO, unidades: [{ ...BANDA, p25: '4200' }] }],
    ['un precio negativo', { ...PRODUCTO, unidades: [{ ...BANDA, p90: -1 }] }],
    ['una predictibilidad de número', { ...PRODUCTO, unidades: [{ ...BANDA, predictibilidad: 1 }] }],
    ['indexable de texto', { ...PRODUCTO, indexable: 'sí' }],
    ['un slug nulo', { ...PRODUCTO, slug: null }],
    ['un periodo que no es objeto', { ...PRODUCTO, periodo: 'oct 2025' }],
    ['una ventana que no es fecha', { ...PRODUCTO, periodo: { ventana_desde: 2025, ventana_hasta: null } }],
    ['una ventana con mes imposible', { ...PRODUCTO, periodo: { ventana_desde: '2025-13-01', ventana_hasta: '2026-09-30' } }],
  ])('rechaza %s', (_, datos) => {
    expect(esProductoPortada(datos)).toBe(false);
  });
});

// ── Lectura 3: qué cierra pronto ────────────────────────────────────────────

const CIERRES: ResumenPortada = {
  licitaciones_abiertas: 4232,
  compra_agil_abiertas: 2714,
  actualizado_en: '2026-10-14T11:00:00-03:00',
  compra_agil_por_cierre: { hoy: 312, manana: 740, dos_tres_dias: 1105, despues: 557 },
};

function conTramos(hoy: number, manana: number, dos_tres_dias: number, despues: number): ResumenPortada {
  return {
    ...CIERRES,
    compra_agil_abiertas: hoy + manana + dos_tres_dias + despues,
    compra_agil_por_cierre: { hoy, manana, dos_tres_dias, despues },
  };
}

describe('fraseCierres: los cinco casos de la spec, más N = 1', () => {
  it.each([
    ['r = 0', 0, 15, 'Ninguna Compra Ágil abierta cierra hoy ni mañana'],
    ['N = 0 con r > 0', 1, 100, 'Menos de 1 de cada 10 Compras Ágiles abiertas cierra hoy o mañana'],
    ['N = 1, en singular', 10, 100, '1 de cada 10 Compras Ágiles abiertas cierra hoy o mañana'],
    ['N = 10 con r < 1', 96, 100, 'Casi todas las Compras Ágiles abiertas cierran hoy o mañana'],
    ['r = 1', 5, 5, 'Todas las Compras Ágiles abiertas cierran hoy o mañana'],
    ['el caso normal', 1052, 2714, '4 de cada 10 Compras Ágiles abiertas cierran hoy o mañana'],
  ])('%s', (_, pronto, abiertas, frase) => {
    expect(fraseCierres(pronto, abiertas)).toBe(frase);
  });

  it('los bordes del redondeo: 0,05 ya es 1 de cada 10 y 0,95 ya es casi todas', () => {
    expect(fraseCierres(4, 100)).toBe('Menos de 1 de cada 10 Compras Ágiles abiertas cierra hoy o mañana');
    expect(fraseCierres(5, 100)).toBe('1 de cada 10 Compras Ágiles abiertas cierra hoy o mañana');
    expect(fraseCierres(94, 100)).toBe('9 de cada 10 Compras Ágiles abiertas cierran hoy o mañana');
    expect(fraseCierres(95, 100)).toBe('Casi todas las Compras Ágiles abiertas cierran hoy o mañana');
  });
});

describe('lecturaCierres', () => {
  it('cuatro columnas, hoy y mañana pintadas, la frase y el pie', () => {
    const l = lecturaCierres(CIERRES)!;
    expect(l.conclusion).toBe('4 de cada 10 Compras Ágiles abiertas cierran hoy o mañana');
    expect(l.pie).toBe('2.714 abiertas, por día de cierre');
    expect(l.columnas).toEqual([
      { nombre: 'Hoy', valor: '312', alto: 28, destacada: true },
      { nombre: 'Mañana', valor: '740', alto: 67, destacada: true },
      { nombre: 'En 2 o 3 días', valor: '1.105', alto: 100, destacada: false },
      { nombre: 'Después', valor: '557', alto: 50, destacada: false },
    ]);
  });

  it('enlaza al catálogo de Compra Ágil abierta por cierre, desde el ayudante', () => {
    const { enlace } = lecturaCierres(CIERRES)!;
    expect(enlace).toEqual({
      texto: 'Ver las que cierran primero',
      href: urlCatalogoAbiertas('compra_agil', [], { sort_by: 'fecha_cierre', sort_order: 'asc' }),
    });
  });

  it('con r = 0 no se pinta ninguna columna', () => {
    const l = lecturaCierres(conTramos(0, 0, 10, 5))!;
    expect(l.conclusion).toBe('Ninguna Compra Ágil abierta cierra hoy ni mañana');
    expect(l.columnas.map((c) => c.destacada)).toEqual([false, false, false, false]);
  });

  it('una columna con poco no desaparece; una vacía, sí', () => {
    expect(lecturaCierres(conTramos(1, 0, 1000, 0))!.columnas.map((c) => c.alto)).toEqual([4, 0, 100, 0]);
  });

  it('una sola abierta, en singular', () => {
    expect(lecturaCierres(conTramos(0, 0, 0, 1))!.pie).toBe('1 abierta, por día de cierre');
  });

  it.each([
    ['sin resumen (el backend falló)', null],
    ['con 0 abiertas', conTramos(0, 0, 0, 0)],
    ['sin tramos (backend anterior)', { ...CIERRES, compra_agil_por_cierre: undefined }],
    ['con los tramos nulos', { ...CIERRES, compra_agil_por_cierre: null }],
    ['con un tramo de texto', { ...CIERRES, compra_agil_por_cierre: { ...CIERRES.compra_agil_por_cierre, hoy: '312' } }],
    ['con un tramo negativo', { ...CIERRES, compra_agil_por_cierre: { ...CIERRES.compra_agil_por_cierre, hoy: -1 } }],
    ['con tramos que no suman las abiertas', { ...CIERRES, compra_agil_abiertas: 2715 }],
  ])('%s: se oculta', (_, resumen) => {
    expect(lecturaCierres(resumen as unknown as ResumenPortada | null)).toBeNull();
  });
});
