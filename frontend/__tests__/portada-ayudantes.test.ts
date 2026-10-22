/**
 * Los ayudantes puros de la portada (spec del rediseño §6.3). Los nombres de la
 * búsqueda (`EJEMPLOS_BUSQUEDA`, `rutaBuscar`, límites) viven en `lib/buscar.ts`
 * desde PR 5; aquí se vigila lo que la portada exige de ellos.
 * Puros a propósito: las variables de servidor llegan como argumento desde
 * `app/page.tsx`, así que todo se prueba sin tocar el entorno.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EJEMPLOS_BUSQUEDA,
  MAXIMO_CARACTERES_BUSCAR,
  MINIMO_LETRAS_BUSCAR,
  PARAMETRO_BUSCAR,
  rutaBuscar,
} from '@/lib/buscar';
import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import { PRODUCTO_PORTADA } from '@/lib/lecturasPortada';
import { HORAS_HABILES } from '@/lib/compraAgil';
import * as moduloPortada from '@/lib/portada';
import {
  baseDeLaFicha,
  franjaDeLaPortada,
  PLACEHOLDER_BUSCADOR,
  SE_ACTUALIZA,
  SUBTITULO_PORTADA,
  tiraDeLaPortada,
  vigenciaDelResumen,
} from '@/lib/portada';
import { MAXIMO_BUSQUEDA_PRODUCTOS, MINIMO_BUSQUEDA_PRODUCTOS } from '@/lib/queries';
import type { ResumenPortada } from '@/types/publico';

const RESUMEN: ResumenPortada = {
  licitaciones_abiertas: 4232,
  compra_agil_abiertas: 2714,
  actualizado_en: '2026-10-14T11:00:00-03:00',
};

describe('los ejemplos de búsqueda', () => {
  it('son los verificados en producción el 2026-10-16, en su orden (spec PORTADA_V7 §3.8)', () => {
    expect([...EJEMPLOS_BUSQUEDA]).toEqual([
      'lápiz pasta',
      'cloro',
      'agua mineral',
      'impresora',
      'pendón',
      'cambio de aceite',
    ]);
  });

  it.each([...EJEMPLOS_BUSQUEDA])('«%s» no depende de lo que la búsqueda descarta', (ejemplo) => {
    // La firma tira las palabras de menos de tres letras y las que llevan
    // dígitos: un ejemplo hecho sólo de eso («pc», «A4», «3M») no encontraría nada.
    expect(ejemplo).not.toMatch(/\d/);
    expect(ejemplo.split(/\s+/).some((p) => p.length >= MINIMO_LETRAS_BUSCAR)).toBe(true);
    expect(ejemplo.length).toBeLessThanOrEqual(MAXIMO_CARACTERES_BUSCAR);
  });
});

describe('rutaBuscar', () => {
  it('lleva el término en `q` y vuelve entero al leerlo', () => {
    expect(PARAMETRO_BUSCAR).toBe('q');
    expect(rutaBuscar('guantes de nitrilo')).toBe('/buscar?q=guantes+de+nitrilo');
    for (const ejemplo of EJEMPLOS_BUSQUEDA) {
      const url = new URL(rutaBuscar(ejemplo), 'https://tordo.prueba');
      expect(url.pathname).toBe('/buscar');
      expect(url.searchParams.get('q')).toBe(ejemplo);
    }
  });

  it('quita los espacios de los bordes', () => {
    expect(rutaBuscar('  tóner ')).toBe(rutaBuscar('tóner'));
  });
});

describe('los límites del buscador', () => {
  it('son los de /productos (copias: lib/queries.ts es un módulo cliente)', () => {
    expect(MINIMO_LETRAS_BUSCAR).toBe(MINIMO_BUSQUEDA_PRODUCTOS);
    expect(MAXIMO_CARACTERES_BUSCAR).toBe(MAXIMO_BUSQUEDA_PRODUCTOS);
  });
});

describe('tiraDeLaPortada', () => {
  it('dos cifras, cada una al catálogo con el filtro que la cuenta, y su hora con el día', () => {
    const tira = tiraDeLaPortada(RESUMEN);
    expect(tira).not.toBeNull();
    expect(tira!.cifras).toEqual([
      { numero: '4.232', etiqueta: 'licitaciones abiertas', href: urlCatalogoAbiertas('licitaciones') },
      { numero: '2.714', etiqueta: 'Compras Ágiles abiertas', href: urlCatalogoAbiertas('compra_agil') },
    ]);
    // 11:00 en Santiago, con el día: la portada se cachea media hora. La tira no
    // la pinta (va en la franja), pero sin hora legible no hay tira.
    expect(tira!.actualizado).toBe('mié 14 oct, 11:00');
  });

  it('en singular cuando hay una, y con el cero dicho', () => {
    const tira = tiraDeLaPortada({ ...RESUMEN, licitaciones_abiertas: 1, compra_agil_abiertas: 0 });
    expect(tira!.cifras.map((c) => `${c.numero} ${c.etiqueta}`)).toEqual(['1 licitación abierta', '0 Compras Ágiles abiertas']);
  });

  it.each([
    ['sin resumen (el backend falló)', null],
    ['sin hora', { ...RESUMEN, actualizado_en: null }],
    ['con la hora vacía', { ...RESUMEN, actualizado_en: '' }],
    ['con una hora que no se puede leer', { ...RESUMEN, actualizado_en: 'ayer a las once' }],
  ])('%s, no hay tira: una cifra viva sin hora no se publica', (_, resumen) => {
    expect(tiraDeLaPortada(resumen as ResumenPortada | null)).toBeNull();
  });
});

describe('lo que se fue de la portada (spec PORTADA_V7 V11)', () => {
  it('«Úsalo como quieras»: la salida a API, MCP y CSV es una, la de la cabecera y el pie', () => {
    expect(moduloPortada).not.toHaveProperty('usosAbiertos');
  });
});

describe('el lema', () => {
  it('se fue de la portada: lo que decía está en la ficha y en los enlaces de la cabecera', () => {
    expect(moduloPortada).not.toHaveProperty('lemaPortada');
  });
});

describe('los textos fijos de la portada', () => {
  it('el subtítulo dice qué responde la búsqueda (spec PORTADA_V7 §3.8)', () => {
    expect(SUBTITULO_PORTADA).toBe(
      'Escribe lo que vendes. Te mostramos a qué precio lo compró el Estado, quién lo compra y dónde postular hoy.',
    );
  });

  it('el campo no repite los ejemplos, que ya están debajo', () => {
    // No empieza con «Escribe», como el subtítulo de arriba.
    expect(PLACEHOLDER_BUSCADOR).toBe('Un producto o un servicio');
    for (const ejemplo of EJEMPLOS_BUSQUEDA) expect(PLACEHOLDER_BUSCADOR).not.toContain(ejemplo);
  });

  it('«se actualiza» sale del horario del cron frecuente, no se escribe', () => {
    expect(SE_ACTUALIZA).toBe(
      'Licitaciones y Compras Ágiles, hasta 4 veces al día. Precios y mercados, cada domingo.',
    );
    expect(HORAS_HABILES).toHaveLength(4);
  });
});

describe('baseDeLaFicha (spec PORTADA_V7 §3.5, V6): la escala del dato, calculada', () => {
  const sector = (sector: string, n_oc: number | null | undefined, desde = '2023-11-01', hasta = '2026-10-31') => ({
    sector,
    monto_total: 1e12,
    n_oc,
    ventana_desde: desde,
    ventana_hasta: hasta,
  });

  it('la suma de n_oc de todos los sectores, en millones con dos decimales, y la ventana', () => {
    const sectores = { disponible: true, sectores: [sector('Salud', 3_000_000), sector('Municipalidades', 2_480_123)] };
    expect(baseDeLaFicha(sectores)).toBe('5,48 millones de órdenes de compra, nov 2023 a oct 2026');
  });

  it('la ventana es la mínima y la máxima de sus filas', () => {
    const sectores = {
      disponible: true,
      sectores: [sector('Salud', 10, '2024-01-01', '2026-09-30'), sector('FFAA', 20, '2023-11-01', '2026-08-31')],
    };
    expect(baseDeLaFicha(sectores)).toBe('30 órdenes de compra, nov 2023 a sep 2026');
  });

  it('bajo un millón, el número entero; justo un millón, en singular', () => {
    expect(baseDeLaFicha({ disponible: true, sectores: [sector('Salud', 950_000)] })).toMatch(/^950\.000 órdenes de compra, /);
    expect(baseDeLaFicha({ disponible: true, sectores: [sector('Salud', 1_000_000)] })).toMatch(/^1 millón de órdenes de compra, /);
    expect(baseDeLaFicha({ disponible: true, sectores: [sector('Salud', 1)] })).toMatch(/^1 orden de compra, /);
  });

  it.each([
    ['sin respuesta (503: FEATURE_ANALYTICS apagada)', null],
    ['la tabla no está', { disponible: false }],
    ['sin sectores', { disponible: true, sectores: [] }],
    ['una fila sin n_oc (backend anterior: la suma mentiría)', { disponible: true, sectores: [sector('Salud', 10), sector('FFAA', undefined)] }],
    ['todo en 0', { disponible: true, sectores: [sector('Salud', 0)] }],
    ['sin ventana', { disponible: true, sectores: [{ sector: 'Salud', monto_total: 1, n_oc: 10 }] }],
  ])('%s: la fila no sale', (_, sectores) => {
    expect(baseDeLaFicha(sectores as never)).toBeNull();
  });
});

describe('vigenciaDelResumen', () => {
  const RESUMEN_ISO = '2026-10-20T19:13:00-03:00';
  const en = (iso: string) => vigenciaDelResumen(RESUMEN_ISO, Date.parse(iso));

  it('la misma tarde, al día y del mismo día', () => {
    expect(en('2026-10-20T21:00:00-03:00')).toEqual({ alDia: true, mismoDia: true });
  });

  it('a la mañana siguiente antes de la corrida de las 10: al día, pero de ayer', () => {
    expect(en('2026-10-21T09:00:00-03:00')).toEqual({ alDia: true, mismoDia: false });
  });

  it('el 21-10 por la noche, sin ninguna corrida del día (Railway caído): atrasado y de ayer', () => {
    expect(en('2026-10-21T22:28:00-03:00')).toEqual({ alDia: false, mismoDia: false });
  });

  it('sin hora legible, nada es vigente', () => {
    expect(vigenciaDelResumen('ayer', Date.parse('2026-10-21T09:00:00-03:00'))).toEqual({ alDia: false, mismoDia: false });
    expect(vigenciaDelResumen(null, Date.parse('2026-10-21T09:00:00-03:00'))).toEqual({ alDia: false, mismoDia: false });
  });
});

describe('tiraDeLaPortada atrasada', () => {
  it('al día no dice de cuándo; atrasada, sí', () => {
    expect(tiraDeLaPortada(RESUMEN)?.atrasado).toBeNull();
    expect(tiraDeLaPortada(RESUMEN, { alDia: false, mismoDia: false })?.atrasado).toBe('el miércoles 14 de octubre a las 11:00');
  });
});

describe('franjaDeLaPortada', () => {
  const CON_HOY: ResumenPortada = {
    ...RESUMEN,
    publicadas_hoy: 612,
    mas_publica_hoy: 'SERVICIO DE SALUD METROPOLITANO SUR',
  };

  it('publicadas hoy, quién más publica (como en «Lo mejor de hoy») y la hora con el día', () => {
    expect(franjaDeLaPortada(CON_HOY)).toEqual({
      publicadasHoy: '612 licitaciones y Compras Ágiles',
      masPublicaHoy: 'Servicio de Salud Metropolitano Sur',
      actualizado: 'mié 14 oct, 11:00',
      rotuloPublicadas: 'Publicadas hoy',
      rotuloMasPublica: 'Más publica hoy',
    });
  });

  it('con el conteo de otro día, los rótulos dicen de qué día y no «hoy»', () => {
    const franja = franjaDeLaPortada(CON_HOY, { alDia: false, mismoDia: false });
    expect(franja?.rotuloPublicadas).toBe('Publicadas el mié 14 oct');
    expect(franja?.rotuloMasPublica).toBe('Más publicó ese día');
  });

  it('con 0 publicadas hoy (cada madrugada) se ocultan las dos celdas; la hora sigue', () => {
    expect(franjaDeLaPortada({ ...CON_HOY, publicadas_hoy: 0 })).toEqual({
      publicadasHoy: null,
      masPublicaHoy: null,
      actualizado: 'mié 14 oct, 11:00',
      rotuloPublicadas: 'Publicadas hoy',
      rotuloMasPublica: 'Más publica hoy',
    });
  });

  it('sin nombre que poner primero (todas sin nombre), sólo el conteo', () => {
    expect(franjaDeLaPortada({ ...CON_HOY, mas_publica_hoy: null })?.masPublicaHoy).toBeNull();
    expect(franjaDeLaPortada({ ...CON_HOY, mas_publica_hoy: '   ' })?.masPublicaHoy).toBeNull();
    expect(franjaDeLaPortada({ ...CON_HOY, mas_publica_hoy: null })?.publicadasHoy).toBe('612 licitaciones y Compras Ágiles');
    expect(franjaDeLaPortada({ ...CON_HOY, publicadas_hoy: 1 })?.publicadasHoy).toBe('1 licitación o Compra Ágil');
  });

  it('un backend sin los campos nuevos: sólo la hora', () => {
    expect(franjaDeLaPortada(RESUMEN)).toMatchObject({ publicadasHoy: null, masPublicaHoy: null, actualizado: 'mié 14 oct, 11:00' });
  });

  it.each([
    ['de texto', '612'],
    ['con decimales', 6.5],
    ['negativo', -3],
  ])('publicadas_hoy %s no se publica', (_, valor) => {
    const franja = franjaDeLaPortada({ ...CON_HOY, publicadas_hoy: valor } as unknown as ResumenPortada);
    expect(franja?.publicadasHoy).toBeNull();
    expect(franja?.masPublicaHoy).toBeNull();
  });

  it.each([
    ['sin resumen', null],
    ['sin hora', { ...CON_HOY, actualizado_en: null }],
    ['con una hora que no se puede leer', { ...CON_HOY, actualizado_en: 'ayer a las once' }],
  ])('%s, no hay franja: una cifra viva sin hora no se publica', (_, resumen) => {
    expect(franjaDeLaPortada(resumen as ResumenPortada | null)).toBeNull();
  });
});

describe('la copia de los ejemplos en scripts/verificar-produccion.sh', () => {
  const script = readFileSync(join(__dirname, '..', '..', 'scripts', 'verificar-produccion.sh'), 'utf8');
  const inicio = script.indexOf('# ── Los ejemplos de la portada');
  const fin = script.indexOf('# ── El límite cuenta por la IP real');
  const seccion = script.slice(inicio, fin);

  it('la sección existe, antes de la del límite por IP', () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
  });

  it('pide exactamente los ejemplos de la portada, en su orden', () => {
    const pedidos = [...seccion.matchAll(/^ejemplo '([^']+)'$/gm)].map((m) => m[1]);
    expect(pedidos).toEqual([...EJEMPLOS_BUSQUEDA]);
  });

  it('uno a uno y espaciados: ningún bucle contra producción', () => {
    expect(seccion).not.toMatch(/^\s*(for|while|until)\b/m);
    expect(seccion).toMatch(/^\s*sleep 1$/m);
  });

  it('comprueba también que la portada trae su buscador', () => {
    expect(script).toContain('action="/buscar"');
  });
});

describe('la copia de PRODUCTO_PORTADA en scripts/verificar-produccion.sh', () => {
  const script = readFileSync(join(__dirname, '..', '..', 'scripts', 'verificar-produccion.sh'), 'utf8');
  const inicio = script.indexOf('# ── El producto de la portada');
  const fin = script.indexOf('# ── El límite cuenta por la IP real');
  const seccion = script.slice(inicio, fin);

  it('la sección existe, después de los ejemplos y antes del límite por IP', () => {
    expect(inicio).toBeGreaterThan(script.indexOf('# ── Los ejemplos de la portada'));
    expect(fin).toBeGreaterThan(inicio);
  });

  it('pide exactamente el slug de PRODUCTO_PORTADA', () => {
    const copias = [...seccion.matchAll(/^PRODUCTO_PORTADA='([^']+)'$/gm)].map((m) => m[1]);
    expect(copias).toEqual([PRODUCTO_PORTADA.slug]);
  });

  it('una sola petición, espaciada y sin bucles: nada en ráfaga contra producción', () => {
    expect(seccion.match(/\bpedir "/g)).toHaveLength(1);
    expect(seccion).not.toMatch(/^\s*(for|while|until)\b/m);
    expect(seccion).toMatch(/^\s*sleep 1$/m);
  });

  it('exige p75 ≥ p25, como lecturaPrecio: P25 = P75 ya no oculta la lectura (portada v7 §3.2)', () => {
    expect(seccion).toMatch(/1 <= p25 <= p75/);
    expect(seccion).not.toMatch(/plata\(p25\) != plata\(p75\)/);
  });

  it('exige un precio de mercado (`de_mercado` de la API), como lecturaPrecio', () => {
    expect(seccion).toMatch(/u\.get\("de_mercado"\) is True/);
  });

  it('mira lo que la lectura necesita: indexable, el filtro de calidad, p25, p75 y periodo', () => {
    for (const campo of ['indexable', 'unidad', 'sin unidad declarada', 'predictibilidad', 'p25', 'p75', 'ventana_desde', 'ventana_hasta']) {
      expect(seccion).toContain(campo);
    }
  });
});
