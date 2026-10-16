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
  franjaDeLaPortada,
  PLACEHOLDER_BUSCADOR,
  SE_ACTUALIZA,
  SUBTITULO_PORTADA,
  tiraDeLaPortada,
  usosAbiertos,
} from '@/lib/portada';
import { MAXIMO_BUSQUEDA_PRODUCTOS, MINIMO_BUSQUEDA_PRODUCTOS } from '@/lib/queries';
import type { ResumenPortada } from '@/types/publico';

const RESUMEN: ResumenPortada = {
  licitaciones_abiertas: 4232,
  compra_agil_abiertas: 2714,
  actualizado_en: '2026-10-14T11:00:00-03:00',
};

describe('los ejemplos de búsqueda', () => {
  it('son los verificados en producción el 2026-10-15, en su orden', () => {
    expect([...EJEMPLOS_BUSQUEDA]).toEqual([
      'guantes de nitrilo',
      'papel higiénico',
      'jabón líquido',
      'tóner',
      'resma de papel carta',
      'agua purificada en bidones',
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
    expect(tira!.actualizado).toBe('mié, 14 oct, 11:00');
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

describe('usosAbiertos', () => {
  it('sin repositorio: API, MCP, CSV y RSS, cada uno a su sección de /abierto', () => {
    expect(usosAbiertos(null)).toEqual([
      { nombre: 'API', href: '/abierto#api' },
      { nombre: 'MCP para Claude y ChatGPT', href: '/abierto#mcp' },
      { nombre: 'CSV', href: '/abierto#datos' },
      { nombre: 'RSS', href: '/abierto#datos' },
    ]);
  });

  it('con repositorio, también «Código», fuera del sitio', () => {
    expect(usosAbiertos('https://github.com/x/tordo').at(-1)).toEqual({
      nombre: 'Código',
      href: 'https://github.com/x/tordo',
      externo: true,
    });
  });
});

describe('el lema', () => {
  it('se fue de la portada: lo que decía está en la ficha y en los enlaces de la cabecera', () => {
    expect(moduloPortada).not.toHaveProperty('lemaPortada');
  });
});

describe('los textos fijos de la portada', () => {
  it('el subtítulo dice qué hace la búsqueda (spec §6.2)', () => {
    expect(SUBTITULO_PORTADA).toBe(
      'Escribe lo que vendes. Te mostramos cuánto ha pagado el Estado, quién lo compra y qué está abierto hoy.',
    );
  });

  it('el campo no repite los ejemplos, que ya están debajo', () => {
    expect(PLACEHOLDER_BUSCADOR).toBe('Un producto o un servicio');
    for (const ejemplo of EJEMPLOS_BUSQUEDA) expect(PLACEHOLDER_BUSCADOR).not.toContain(ejemplo);
  });

  it('«se actualiza» sale del horario del cron frecuente, no se escribe', () => {
    expect(SE_ACTUALIZA).toBe(`${HORAS_HABILES.length} veces cada día hábil; el análisis, cada semana`);
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
      publicadasHoy: '612',
      masPublicaHoy: 'Servicio De Salud Metropolitano Sur',
      actualizado: 'mié, 14 oct, 11:00',
    });
  });

  it('con 0 publicadas hoy (cada madrugada) se ocultan las dos celdas; la hora sigue', () => {
    expect(franjaDeLaPortada({ ...CON_HOY, publicadas_hoy: 0 })).toEqual({
      publicadasHoy: null,
      masPublicaHoy: null,
      actualizado: 'mié, 14 oct, 11:00',
    });
  });

  it('sin nombre que poner primero (todas sin nombre), sólo el conteo', () => {
    expect(franjaDeLaPortada({ ...CON_HOY, mas_publica_hoy: null })?.masPublicaHoy).toBeNull();
    expect(franjaDeLaPortada({ ...CON_HOY, mas_publica_hoy: '   ' })?.masPublicaHoy).toBeNull();
    expect(franjaDeLaPortada({ ...CON_HOY, mas_publica_hoy: null })?.publicadasHoy).toBe('612');
  });

  it('un backend sin los campos nuevos: sólo la hora', () => {
    expect(franjaDeLaPortada(RESUMEN)).toEqual({ publicadasHoy: null, masPublicaHoy: null, actualizado: 'mié, 14 oct, 11:00' });
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

  it('exige p75 > p25 estricto, como lecturaPrecio', () => {
    expect(seccion).toMatch(/1 <= p25 < p75/);
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
