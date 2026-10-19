/**
 * Las lecturas de la portada (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.2–§3.4 y
 * §9): cada frase sale del dato, con reglas, y cada regla se fija aquí con sus
 * bordes —un comprador, P25 = P75, compradores de otra unidad, puntos que
 * coinciden, 0 abiertas, décimos que redondean a 0 o a 10—. Y cada lectura trae
 * su pie de método.
 *
 * Sin dato que pintar con verdad, una lectura devuelve `null` y la portada la
 * oculta entera (principio 4): sin periodo, sin p25/p75, tramos que no suman.
 */
import { describe, expect, it } from 'vitest';

import { BASE_API_PUBLICA } from '@/lib/abierto';
import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import {
  decimosDe,
  diaYHora,
  esConteo,
  esProductoPortada,
  esSectores,
  fraseCierres,
  lecturaCierres,
  lecturasDeLaPortada,
  lecturaNota,
  lecturaPrecio,
  notaDeLaPortada,
  precioDeBanda,
  PRODUCTO_PORTADA,
} from '@/lib/lecturasPortada';
import { rutaComoSeCalcula, METODO_PRECIO } from '@/lib/metodo';
import type { Nota } from '@/lib/notas';
import { rutaProducto } from '@/lib/publico';
import type { BandaUnidad, CompradorDeProducto, ProductoPublico, ResumenPortada } from '@/types/publico';

const REPO = 'https://github.com/cris-middleton/tordo';
const textos = (enlaces: { texto: string }[]) => enlaces.map((e) => e.texto);

// ── esSectores (la «Base» de la ficha) ──────────────────────────────────────

const VENTANA = { ventana_desde: '2023-11-01', ventana_hasta: '2026-10-11' };
const fila = (sector: string, n_oc: number | null = 1000) => ({ sector, monto_total: 1e12, n_oc, ...VENTANA });

describe('esSectores', () => {
  it('acepta la respuesta buena, la de «no disponible», filas sin ventana y sin n_oc (backend anterior)', () => {
    expect(esSectores({ disponible: true, total: 2, sectores: [fila('Salud'), fila('Municipalidades')] })).toBe(true);
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
    ['un n_oc de texto', { disponible: true, sectores: [{ ...fila('Salud'), n_oc: '1000' }] }],
    ['un n_oc con decimales', { disponible: true, sectores: [{ ...fila('Salud'), n_oc: 10.5 }] }],
    ['una ventana que no es fecha', { disponible: true, sectores: [{ ...fila('Salud'), ventana_desde: 2023 }] }],
    ['un mes imposible', { disponible: true, sectores: [{ ...fila('Salud'), ventana_desde: '2023-99-01' }] }],
    ['un día imposible', { disponible: true, sectores: [{ ...fila('Salud'), ventana_hasta: '2023-02-30' }] }],
  ])('rechaza %s', (_, datos) => {
    expect(esSectores(datos)).toBe(false);
  });
});

// ── Lectura 1: a qué precio ─────────────────────────────────────────────────

const BANDA: BandaUnidad = {
  unidad: 'Unidad',
  n: 46,
  p10: 129_990,
  p25: 150_921,
  p50: 190_762,
  p75: 240_000,
  p90: 369_990,
  predictibilidad: 'alta',
  confianza: 0.79,
  compradores: 40,
  cuota_mayor: 0.04,
  de_mercado: true,
};

const comprador = (p50: number | null, unidad = 'unidad', i = 0): CompradorDeProducto => ({
  codigo: `c${i}`,
  nombre: `Municipalidad ${i}`,
  unidad,
  n: 3,
  p50,
});

const DIEZ = [95_000, 120_000, 151_000, 160_000, 175_000, 190_000, 210_000, 239_000, 280_000, 420_000].map((v, i) =>
  comprador(v, 'unidad', i),
);

const PRODUCTO: ProductoPublico = {
  slug: PRODUCTO_PORTADA.slug,
  firma: 'impresora multifuncional',
  nombre_generico: null,
  codigo_onu: null,
  descripcion: null,
  indexable: true,
  // La API las ordena de más a menos compras: se usa la primera.
  unidades: [BANDA, { ...BANDA, unidad: 'Caja', n: 12 }],
  compradores: DIEZ,
  periodo: { ventana_desde: '2025-11-01', ventana_hasta: '2026-10-31' },
};

const conBanda = (cambio: Partial<BandaUnidad> | Record<string, unknown>, compradores = DIEZ): ProductoPublico => ({
  ...PRODUCTO,
  compradores,
  unidades: [{ ...BANDA, ...cambio } as BandaUnidad],
});

describe('PRODUCTO_PORTADA', () => {
  it('lleva un slug de verdad (tomado de producción), no el marcador del plan', () => {
    expect(PRODUCTO_PORTADA.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(PRODUCTO_PORTADA.slug.length).toBeLessThanOrEqual(80);
    expect(PRODUCTO_PORTADA.slug).not.toMatch(/SLUG|produccion/i);
  });

  it('y un nombre escrito a mano, que se lee como un nombre: no el slug', () => {
    expect(PRODUCTO_PORTADA.nombre).toMatch(/^\p{Lu}/u);
    expect(PRODUCTO_PORTADA.nombre.trim()).toBe(PRODUCTO_PORTADA.nombre);
    expect(PRODUCTO_PORTADA.nombre).not.toBe(PRODUCTO_PORTADA.slug);
    expect(PRODUCTO_PORTADA.nombre).not.toMatch(/-/);
  });
});

describe('lecturaPrecio', () => {
  it('la mitad se pagó entre p25 y p75, de la unidad con más compras, con el nombre a mano', () => {
    const l = lecturaPrecio(PRODUCTO, REPO)!;
    expect(l.conclusion).toBe('Impresora multifuncional: la mitad se pagó entre $150.921 y $240.000');
    expect(l.conclusion).not.toContain(PRODUCTO.firma);
  });

  it('el pie: compras, compradores, periodo y unidad; y que el gráfico muestra sólo los 10 que más compran', () => {
    expect(lecturaPrecio(PRODUCTO, REPO)!.pie).toBe(
      '46 compras de 40 compradores, nov 2025 a oct 2026, precio por unidad. ' +
        'Cada punto es lo que pagó uno de los 10 que más compran (su mediana); la franja, la mitad central de las compras.',
    );
  });

  it('con todos los compradores en el gráfico, «cada punto es lo que pagó un comprador»', () => {
    expect(lecturaPrecio(conBanda({ compradores: 10 }), REPO)!.pie).toMatch(
      /^46 compras de 10 compradores, .*\. Cada punto es lo que pagó un comprador \(su mediana\)/,
    );
  });

  it('la conclusión lleva al producto; el pie, a cómo se calcula, la API y el código', () => {
    const { enlace, enlaces } = lecturaPrecio(PRODUCTO, REPO)!;
    expect(enlace).toBe(rutaProducto(PRODUCTO_PORTADA.slug));
    expect(enlaces).toEqual([
      { texto: 'Cómo se calcula', href: rutaComoSeCalcula(METODO_PRECIO.guia!), externo: false },
      { texto: 'Ver en la API', href: `${BASE_API_PUBLICA}/publico/productos/${PRODUCTO_PORTADA.slug}`, externo: true },
      { texto: 'Código', href: `${REPO}/blob/main/etl/analytics/product_price_bands.py`, externo: true },
    ]);
    expect(textos(lecturaPrecio(PRODUCTO, null)!.enlaces)).not.toContain('Código');
  });

  it('un punto por comprador de la unidad, y el texto para quien no ve el gráfico', () => {
    const l = lecturaPrecio(PRODUCTO, REPO)!;
    expect(l.grafico.puntos).toHaveLength(10);
    expect(l.accesible).toEqual(['Percentil 25: $150.921', 'Percentil 75: $240.000', '40 compradores']);
  });

  it('los compradores de otra unidad no son puntos (es otro envase), y el pie lo cuenta bien', () => {
    const mezcla = [...DIEZ.slice(0, 3), comprador(5_000, 'caja', 7), comprador(6_000, 'Caja', 8)];
    const l = lecturaPrecio(conBanda({}, mezcla), REPO)!;
    expect(l.grafico.puntos).toHaveLength(3);
    expect(l.pie).toMatch(/uno de los 3 que más compran/);
  });

  it('puntos que coinciden se apilan sin solaparse', () => {
    const iguales = Array.from({ length: 4 }, (_, i) => comprador(190_000, 'unidad', i));
    expect(lecturaPrecio(conBanda({}, iguales), REPO)!.grafico.puntos.map((p) => p.fila)).toEqual([0, -1, 1, -2]);
  });

  it('P25 = P75 con varios compradores: «la mitad se pagó a $X», y la franja es una línea', () => {
    const l = lecturaPrecio(conBanda({ p10: 15_000, p25: 16_850, p50: 16_850, p75: 16_850, p90: 18_000 }), REPO)!;
    expect(l.conclusion).toBe('Impresora multifuncional: la mitad se pagó a $16.850');
    expect(l.grafico.franja!.desde).toBe(l.grafico.franja!.hasta);
    expect(l.pie).toMatch(/la línea, el precio de la mitad central de las compras\.$/);
  });

  it('P25 y P75 distintos pero escritos igual: también «se pagó a»', () => {
    expect(lecturaPrecio(conBanda({ p25: 1_500_000, p75: 1_600_000 }), REPO)!.conclusion).toBe(
      'Impresora multifuncional: la mitad se pagó a $2 millones',
    );
  });

  it('sin compradores en la lista: la franja sola, y el pie no habla de puntos', () => {
    const l = lecturaPrecio(conBanda({}, []), REPO)!;
    expect(l.grafico.puntos).toEqual([]);
    expect(l.pie).toMatch(/precio por unidad\. La franja, la mitad central de las compras\.$/);
  });

  it('con otra ficha, su nombre y su enlace: nunca los de la constante', () => {
    const l = lecturaPrecio({ ...PRODUCTO, slug: 'otro-producto' }, REPO, 'Otro producto')!;
    expect(l.conclusion).toMatch(/^Otro producto: /);
    expect(l.enlace).toBe(rutaProducto('otro-producto'));
  });

  it('sin el dato de compradores (backend anterior), sólo las compras', () => {
    expect(lecturaPrecio(conBanda({ compradores: undefined }), REPO)!.pie).toMatch(/^46 compras, nov 2025/);
  });

  it('una sola compra, en singular; la unidad en minúsculas', () => {
    expect(lecturaPrecio(conBanda({ n: 1, compradores: null }), REPO)!.pie).toMatch(/^1 compra, /);
    expect(lecturaPrecio(conBanda({ unidad: ' KILOGRAMO ' }, []), REPO)!.pie).toMatch(/precio por kilogramo\./);
  });

  it.each([
    ['sin ficha (404 o backend caído)', null],
    ['no indexable', { ...PRODUCTO, indexable: false }],
    ['sin unidades', { ...PRODUCTO, unidades: [] }],
    ['sin p25', conBanda({ p25: null })],
    ['sin p75', conBanda({ p75: null })],
    ['con p75 bajo p25', conBanda({ p25: 7000, p75: 4000 })],
    ['unidad nula', conBanda({ unidad: null })],
    ['«sin unidad declarada»', conBanda({ unidad: '  Sin  Unidad Declarada ' })],
    ['predictibilidad baja', conBanda({ predictibilidad: 'baja' })],
    ['predictibilidad nula', conBanda({ predictibilidad: null })],
    // Un precio «del Estado» necesita varios compradores (indexables.py, `de_mercado`).
    ['de un solo comprador', conBanda({ compradores: 1, cuota_mayor: 1, de_mercado: false })],
    ['sin decir si es de mercado (backend anterior)', conBanda({ de_mercado: undefined })],
    ['p25 en $0', conBanda({ p10: 0, p25: 0 })],
    ['p25 bajo $1', conBanda({ p10: 0.0005, p25: 0.0017 })],
    ['sin periodo (backend anterior)', { ...PRODUCTO, periodo: undefined }],
    ['con periodo nulo', { ...PRODUCTO, periodo: null }],
    ['sin ventana_desde', { ...PRODUCTO, periodo: { ventana_desde: null, ventana_hasta: '2026-09-30' } }],
    ['con una ventana de fecha imposible', { ...PRODUCTO, periodo: { ventana_desde: '2025-99-01', ventana_hasta: '2026-09-30' } }],
  ])('%s: se oculta', (_, producto) => {
    expect(lecturaPrecio(producto as ProductoPublico | null, REPO)).toBeNull();
  });

  it('predictibilidad media también vale, y la comparación no mira mayúsculas', () => {
    expect(lecturaPrecio(conBanda({ predictibilidad: ' Media ' }), REPO)).not.toBeNull();
  });
});

describe('precioDeBanda (la ficha de producto: sin el filtro de la portada)', () => {
  it('con un solo comprador: «todas las compras son de» él, un punto y sin franja', () => {
    const banda = { ...BANDA, compradores: 1, cuota_mayor: 1, de_mercado: false, p25: 16_850, p50: 16_850, p75: 16_850 };
    const l = precioDeBanda({
      producto: { ...PRODUCTO, compradores: [{ ...comprador(16_850), nombre: ' Hospital de Prueba ' }] },
      banda,
      nombre: 'Por unidad',
      repositorio: null,
    })!;
    expect(l.conclusion).toBe('Por unidad: todas las compras son de Hospital de Prueba');
    expect(l.grafico.franja).toBeNull();
    expect(l.grafico.puntos).toHaveLength(1);
    expect(l.pie).toBe('46 compras de 1 comprador, nov 2025 a oct 2026, precio por unidad. El punto es su mediana.');
    expect(l.accesible).toEqual(['Precio mediano: $16.850']);
    expect(textos(l.enlaces)).toEqual(['Cómo se calcula', 'Ver en la API']);
    expect(l.enlace).toBeNull();
  });

  it('un solo comprador que no viene en la lista: «un solo comprador»', () => {
    const banda = { ...BANDA, compradores: 1 };
    const l = precioDeBanda({ producto: { ...PRODUCTO, compradores: [] }, banda, nombre: 'Por unidad', repositorio: null })!;
    expect(l.conclusion).toBe('Por unidad: todas las compras son de un solo comprador');
  });

  it('sin periodo, el pie no lo inventa', () => {
    const l = precioDeBanda({ producto: { ...PRODUCTO, periodo: null }, banda: BANDA, nombre: 'Por unidad', repositorio: null })!;
    expect(l.pie).toMatch(/^46 compras de 40 compradores, precio por unidad\. /);
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
    expect(esProductoPortada({ ...PRODUCTO, compradores: [comprador(null)] })).toBe(true);
  });

  it.each([
    ['null', null],
    ['sin unidades', { ...PRODUCTO, unidades: undefined }],
    ['una unidad nula', { ...PRODUCTO, unidades: [null] }],
    ['una unidad de número', { ...PRODUCTO, unidades: [{ ...BANDA, unidad: 3 }] }],
    ['n de texto', { ...PRODUCTO, unidades: [{ ...BANDA, n: '184' }] }],
    ['p25 de texto', { ...PRODUCTO, unidades: [{ ...BANDA, p25: '4200' }] }],
    ['un precio negativo', { ...PRODUCTO, unidades: [{ ...BANDA, p90: -1 }] }],
    ['compradores de la banda con decimales', { ...PRODUCTO, unidades: [{ ...BANDA, compradores: 2.5 }] }],
    ['una predictibilidad de número', { ...PRODUCTO, unidades: [{ ...BANDA, predictibilidad: 1 }] }],
    ['sin la lista de compradores', { ...PRODUCTO, compradores: undefined }],
    ['un comprador nulo', { ...PRODUCTO, compradores: [null] }],
    ['un comprador sin nombre', { ...PRODUCTO, compradores: [{ ...comprador(1), nombre: null }] }],
    ['un comprador con mediana de texto', { ...PRODUCTO, compradores: [{ ...comprador(1), p50: '1' }] }],
    ['indexable de texto', { ...PRODUCTO, indexable: 'sí' }],
    ['un slug nulo', { ...PRODUCTO, slug: null }],
    ['un periodo que no es objeto', { ...PRODUCTO, periodo: 'oct 2025' }],
    ['una ventana con mes imposible', { ...PRODUCTO, periodo: { ventana_desde: '2025-13-01', ventana_hasta: '2026-09-30' } }],
  ])('rechaza %s', (_, datos) => {
    expect(esProductoPortada(datos)).toBe(false);
  });
});

// ── Lectura 2: qué cierra pronto ────────────────────────────────────────────

const CIERRES: ResumenPortada = {
  licitaciones_abiertas: 4409,
  compra_agil_abiertas: 2409,
  actualizado_en: '2026-10-16T11:06:00-03:00',
  compra_agil_por_cierre: { hoy: 1160, manana: 202, dos_tres_dias: 782, despues: 265 },
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
    ['el caso de producción del 16-10', 1362, 2409, '6 de cada 10 Compras Ágiles abiertas cierran hoy o mañana'],
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

describe('decimosDe: la barra cuenta lo mismo que la frase', () => {
  it.each([
    [0, 15, 0],
    // «Menos de 1 de cada 10»: ninguna celda llena, como el redondeo de la frase.
    [4, 100, 0],
    [5, 100, 1],
    [1362, 2409, 6],
    [94, 100, 9],
    // «Casi todas»: las diez llenas.
    [95, 100, 10],
    [5, 5, 10],
  ])('%d de %d → %d celdas', (pronto, abiertas, celdas) => {
    expect(decimosDe(pronto, abiertas)).toBe(celdas);
    const frase = fraseCierres(pronto, abiertas);
    if (celdas >= 2 && celdas <= 9) expect(frase).toMatch(new RegExp(`^${celdas} de cada 10`));
  });
});

describe('diaYHora', () => {
  it('con el día y en hora de Chile, aunque llegue en UTC', () => {
    expect(diaYHora('2026-10-16T11:06:00-03:00')).toBe('el viernes 16 de octubre a las 11:06');
    expect(diaYHora('2026-10-16T14:06:00Z')).toBe('el viernes 16 de octubre a las 11:06');
  });

  it('sin hora legible, nada', () => {
    expect(diaYHora(null)).toBeNull();
    expect(diaYHora('ayer a las once')).toBeNull();
  });
});

describe('lecturaCierres', () => {
  it('la frase, los décimos, los cuatro tramos (hoy y mañana en negrita) y el pie con su hora', () => {
    const l = lecturaCierres(CIERRES, REPO)!;
    expect(l.conclusion).toBe('6 de cada 10 Compras Ágiles abiertas cierran hoy o mañana');
    expect(l.decimos).toBe(6);
    expect(l.tramos).toEqual([
      { nombre: 'Hoy', valor: '1.160', destacada: true },
      { nombre: 'Mañana', valor: '202', destacada: true },
      { nombre: 'En 2 o 3 días', valor: '782', destacada: false },
      { nombre: 'Después', valor: '265', destacada: false },
    ]);
    expect(l.pie).toBe('Contadas el viernes 16 de octubre a las 11:06, por día de cierre en hora de Chile.');
  });

  it('los enlaces: las que cierran primero, la API y el código', () => {
    expect(lecturaCierres(CIERRES, REPO)!.enlaces).toEqual([
      {
        texto: 'Las que cierran primero',
        href: urlCatalogoAbiertas('compra_agil', [], { sort_by: 'fecha_cierre', sort_order: 'asc' }),
        externo: false,
      },
      { texto: 'Ver en la API', href: `${BASE_API_PUBLICA}/publico/portada`, externo: true },
      { texto: 'Código', href: `${REPO}/blob/main/backend/app/repositories/licitaciones.py`, externo: true },
    ]);
  });

  it('con r = 0 no hay nada en negrita ni celdas llenas', () => {
    const l = lecturaCierres(conTramos(0, 0, 10, 5), REPO)!;
    expect(l.conclusion).toBe('Ninguna Compra Ágil abierta cierra hoy ni mañana');
    expect(l.decimos).toBe(0);
    expect(l.tramos.map((t) => t.destacada)).toEqual([false, false, false, false]);
  });

  it('el pie no repite el total de abiertas: la tira de cifras lo dice al lado', () => {
    expect(lecturaCierres(CIERRES, REPO)!.pie).not.toMatch(/2\.409|abiertas/);
  });

  it.each([
    ['sin resumen (el backend falló)', null],
    ['con 0 abiertas', conTramos(0, 0, 0, 0)],
    ['sin tramos (backend anterior)', { ...CIERRES, compra_agil_por_cierre: undefined }],
    ['con los tramos nulos', { ...CIERRES, compra_agil_por_cierre: null }],
    ['con un tramo de texto', { ...CIERRES, compra_agil_por_cierre: { ...CIERRES.compra_agil_por_cierre, hoy: '312' } }],
    ['con un tramo negativo', { ...CIERRES, compra_agil_por_cierre: { ...CIERRES.compra_agil_por_cierre, hoy: -1 } }],
    ['con tramos que no suman las abiertas', { ...CIERRES, compra_agil_abiertas: 2410 }],
    ['sin hora', { ...CIERRES, actualizado_en: null }],
    ['con una hora que no se puede leer', { ...CIERRES, actualizado_en: 'ayer a las once' }],
  ])('%s: se oculta', (_, resumen) => {
    expect(lecturaCierres(resumen as unknown as ResumenPortada | null, REPO)).toBeNull();
  });
});

// ── Lectura 3: la última nota ───────────────────────────────────────────────

const NOTA: Nota = {
  slug: 'precio-unitario-dividido-dos-veces',
  titulo: 'Dividíamos el precio unitario dos veces',
  fecha: '2026-10-16',
  resumen: 'Cada línea ya trae el precio de una unidad.',
  estado: 'arreglado',
  medido_sobre: 'Órdenes de compra de octubre de 2025 a marzo de 2026. Medido el 16 de octubre de 2026.',
  fuentes: ['CLAUDE.md: «x»'],
  cambio: 'https://github.com/cris-middleton/tordo/pull/10',
  script: 'etl/tests/test_precio_unitario.py',
  antes_despues: { rotulo: 'Bandas con predictibilidad alta', antes: { etiqueta: 'Antes', valor: 33 }, despues: { etiqueta: 'Después', valor: 82 } },
  cuerpo: [],
};

describe('lecturaNota', () => {
  it('la fecha, el título, el resumen, el antes y después, y el pie con lo que se midió', () => {
    const l = lecturaNota(NOTA, REPO)!;
    expect(l.antetitulo).toBe('Nota de datos, 16 de octubre de 2026');
    expect(l.titulo).toBe(NOTA.titulo);
    expect(l.resumen).toBe(NOTA.resumen);
    expect(l.antesDespues).toEqual(NOTA.antes_despues);
    expect(l.pie).toBe(NOTA.medido_sobre);
    expect(l.enlaces).toEqual([
      { texto: 'Leer la nota', href: '/notas/precio-unitario-dividido-dos-veces', externo: false },
      { texto: 'El script', href: `${REPO}/blob/main/etl/tests/test_precio_unitario.py`, externo: true },
      { texto: 'El cambio', href: NOTA.cambio, externo: true },
    ]);
  });

  it('sin script, sin cambio o sin repositorio, esos enlaces no salen', () => {
    expect(textos(lecturaNota({ ...NOTA, script: null, cambio: null }, REPO)!.enlaces)).toEqual(['Leer la nota']);
    expect(textos(lecturaNota(NOTA, null)!.enlaces)).toEqual(['Leer la nota', 'El cambio']);
  });

  it('sin notas, no hay lectura', () => {
    expect(lecturaNota(undefined, REPO)).toBeNull();
  });
});

describe('notaDeLaPortada: la más reciente con gráfico', () => {
  const sinGrafico = (slug: string, fecha = '2026-10-16'): Nota => ({ ...NOTA, slug, fecha, antes_despues: null });

  it('salta las más recientes sin `antes_despues` y toma la primera que lo trae', () => {
    const notas = [sinGrafico('uf'), { ...NOTA, slug: 'con-grafico' }, sinGrafico('vieja', '2026-08-16')];
    expect(notaDeLaPortada(notas)?.slug).toBe('con-grafico');
  });

  it('si ninguna trae `antes_despues`, la más reciente', () => {
    expect(notaDeLaPortada([sinGrafico('nueva'), sinGrafico('vieja', '2026-08-16')])?.slug).toBe('nueva');
  });

  it('sin notas, ninguna', () => {
    expect(notaDeLaPortada([])).toBeUndefined();
  });
});

describe('lecturasDeLaPortada: las dos primeras en el orden precio → cierres → nota', () => {
  const precio = { conclusion: 'precio' } as never;
  const cierres = { conclusion: 'cierres' } as never;
  const nota = { titulo: 'nota' } as never;
  it.each([
    ['las tres: precio y cierres; la nota se queda en «Notas de datos»', { precio, cierres, nota }, ['precio', 'cierres']],
    ['falta el precio: cierres y la nota', { precio: null, cierres, nota }, ['cierres', 'nota']],
    ['faltan los cierres: precio y la nota', { precio, cierres: null, nota }, ['precio', 'nota']],
    ['faltan precio y cierres (el backend caído): sólo la nota', { precio: null, cierres: null, nota }, ['nota']],
    ['precio y cierres sin nota', { precio, cierres, nota: null }, ['precio', 'cierres']],
    ['sólo el precio', { precio, cierres: null, nota: null }, ['precio']],
    ['ninguna', { precio: null, cierres: null, nota: null }, []],
  ])('%s', (_, lecturas, esperado) => {
    const elegidas = lecturasDeLaPortada(lecturas);
    expect(elegidas.map((e) => e.tipo)).toEqual(esperado);
    // Cada una lleva su lectura, no una copia ni otra.
    for (const e of elegidas) expect(e.lectura).toBe(lecturas[e.tipo]);
  });

  it('nunca más de dos', () => {
    expect(lecturasDeLaPortada({ precio, cierres, nota })).toHaveLength(2);
  });
});
