/**
 * Lo mecánico de la guía de gráficos (`docs/GUIA_GRAFICOS.md`).
 *
 * La guía distingue **reglas** (las fija este test) de **criterios** (se revisan
 * leyendo). Aquí van sólo las que se comprueban sin falsos positivos:
 *
 * 1. **Todo fichero que dibuja datos está declarado.** Un fichero de `app/` o
 *    `components/` con un `<svg>`, una marca en `dato-tenue`, Recharts o una geometría en línea
 *    proporcional (`width: \`${…}%\``) tiene que estar en `PROPIOS`, en `DEUDA` o
 *    en `NO_SON_GRAFICOS`, con su motivo. Un gráfico nuevo hace fallar el test
 *    hasta que alguien decida si cumple la guía.
 * 2. **Los propios sólo pintan con tokens**: `dato` lo que nombra la conclusión,
 *    `dato-tenue` el resto, las series (`serie-1…5`, `serie-otros`) cuando se
 *    comparan categorías, y tintas y bordes neutros para ejes y rótulos. Ni un
 *    color crudo, ni `accent`, ni `primary`.
 * 3. **Sin adornos**: ni degradados, ni sombras, ni filtros, ni animaciones, ni
 *    leyendas (la etiqueta va junto al dato).
 * 4. **Texto de 12 px como mínimo** dentro del gráfico.
 * 5. **El dibujo es `aria-hidden` y los valores van en texto**: cada marca en
 *    `dato` o `dato-tenue` cuelga de un `aria-hidden`, y quien usa un gráfico que
 *    no escribe sus valores los pone al lado (una lista `sr-only` o una tabla).
 * 6. **La escala logarítmica se declara** en el propio gráfico.
 * 7. **Recharts sólo vive en la deuda**, y la deuda sólo encoge.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { RangoMonto } from '@/components/compraAgil/RangoMonto';
import { BarrasHorizontales } from '@/components/graficos/BarrasHorizontales';
import { Columnas } from '@/components/graficos/Columnas';
import { Concentracion } from '@/components/graficos/Concentracion';
import { EscaleraPrecios } from '@/components/graficos/EscaleraPrecios';
import { GastoMensual } from '@/components/graficos/GastoMensual';
import { RedProveedores } from '@/components/graficos/RedProveedores';
import { AntesDespues } from '@/components/notas/AntesDespues';
import { BarraCierres } from '@/components/portada/BarraCierres';
import { GraficoPrecio } from '@/components/precio/GraficoPrecio';
import { graficoGasto } from '@/lib/graficoGasto';
import { graficoPrecio } from '@/lib/graficoPrecio';
import { graficoRed } from '@/lib/redPortada';
import { lecturaConcentracion } from '@/lib/lecturasMercado';
import { rangoMonto } from '@/lib/rangoMonto';
import type { BandaUnidad } from '@/types/publico';

const RAIZ = join(__dirname, '..');

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const r = join(dir, e);
    if (statSync(r).isDirectory()) return fuentes(r);
    return /\.tsx$/.test(r) ? [r] : [];
  });
}

const rel = (ruta: string) => relative(RAIZ, ruta).split('\\').join('/');
const ARCHIVOS = ['app', 'components'].flatMap((d) => fuentes(join(RAIZ, d))).map(rel);
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

/** Lo que delata que un fichero dibuja datos. */
const DIBUJA = /<svg\b|(?:bg|fill|stroke)-dato-tenue|from 'recharts'|(?:width|height|left):\s*`\$\{/;

const BANDA: BandaUnidad = {
  unidad: 'unidad',
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

const MEDIANAS = [118_000, 151_000, 175_500, 199_000, 239_990, 289_000];
const DATOS_PRECIO = graficoPrecio(
  BANDA,
  MEDIANAS.map((p50, i) => ({ codigo: `c${i}`, nombre: `Comprador ${i}`, unidad: 'unidad', n: 4, p50 })),
);

const DATOS_GASTO = graficoGasto(
  Array.from({ length: 12 }, (_, i) =>
    ['Salud', 'Municipalidades', 'Otros'].map((sector, j) => ({
      anio: 2025,
      mes: i + 1,
      sector,
      monto: (j + 1) * 1e11 * (i === 11 ? 1.6 : 1),
    })),
  ).flat(),
)!;

const DATOS_CONCENTRACION = lecturaConcentracion(
  {
    gasto_mensual: null,
    concentracion: {
      mercados: 100,
      sobre_la_mitad: 50,
      un_proveedor: 5,
      monto_total: 1e12,
      monto_sobre_la_mitad: 5e11,
      tramos: Array.from({ length: 10 }, (_, i) => ({ desde: i * 10, hasta: i * 10 + 10, mercados: 10, monto: 1e11 })),
    },
  },
  null,
)!.grafico;

const DATOS_RED = graficoRed({
  compradores: Array.from({ length: 9 }, (_, i) => ({ codigo: String(i), nombre: `ORGANISMO ${i}`, sector: i % 2 ? 'Salud' : 'FFAA', monto: 1e11 * (9 - i) })),
  proveedores: [
    { codigo: 'p1', nombre: 'PROVEEDOR UNO SPA', monto: 5e10, compradores: 9 },
    { codigo: 'p2', nombre: 'PROVEEDOR DOS SPA', monto: 2e10, compradores: 1 },
  ],
  enlaces: [
    ...Array.from({ length: 9 }, (_, i) => ({ comprador: String(i), proveedor: 'p1', monto: 1e9 })),
    { comprador: '0', proveedor: 'p2', monto: 2e10 },
  ],
  monto_total: 1e12,
  monto_compradores: 5e11,
  proveedores_total: 40,
  a_la_mitad_o_mas: 1,
})!;

const DATOS_ESCALERA = {
  filas: [
    { slug: 'a', nombre: 'Lápiz', href: '/productos/a', p25: 83, p50: 100, p75: 134, rango: '$83 a $134', mediana: '$100', base: '293 compras', veces: 1.6, desde: 10, hasta: 20, medio: 15, destacada: true },
    { slug: 'b', nombre: 'Cloro', href: '/productos/b', p25: 791, p50: 955, p75: 1200, rango: '$791 a $1.200', mediana: '$955', base: '662 compras', veces: 1.5, desde: 40, hasta: 50, medio: 45, destacada: false },
  ],
  marcas: [
    { texto: '$10', x: 0 },
    { texto: '$10 mil', x: 100 },
  ],
};

interface Propio {
  que: string;
  /** Un render con datos de verdad, para las reglas que se miran en el DOM. */
  ejemplo: () => ReactElement;
  /** El gráfico no escribe sus valores: quien lo usa los pone al lado, en una lista `sr-only` o en una tabla. */
  valoresFuera?: boolean;
  escalaLog?: boolean;
}

/** Los gráficos que siguen la guía. Uno nuevo se añade aquí con su ejemplo. */
const PROPIOS: Record<string, Propio> = {
  'components/precio/GraficoPrecio.tsx': {
    que: 'el precio: franja P25–P75 y un punto por comprador (portada y ficha de producto)',
    ejemplo: () => <GraficoPrecio datos={DATOS_PRECIO!} />,
    valoresFuera: true,
    escalaLog: true,
  },
  'components/notas/AntesDespues.tsx': {
    que: 'el antes y el después de una nota',
    ejemplo: () => (
      <AntesDespues
        datos={{ rotulo: 'Bandas de un solo comprador', antes: { etiqueta: 'Antes', valor: 58 }, despues: { etiqueta: 'Después', valor: 12 } }}
      />
    ),
  },
  'components/portada/BarraCierres.tsx': {
    que: 'los diez décimos de la lectura de cierres de la portada',
    ejemplo: () => <BarraCierres decimos={6} />,
    valoresFuera: true,
  },
  'components/graficos/BarrasHorizontales.tsx': {
    que: 'barras horizontales con etiqueta y valor: sectores (con su color) y proveedores en /mercado',
    ejemplo: () => (
      <BarrasHorizontales
        etiqueta="Monto por sector"
        filas={[
          { clave: 'a', etiqueta: 'Salud', valor: 3e12, texto: '$3 billones' },
          { clave: 'b', etiqueta: 'Municipalidades', valor: 2.9e12, texto: '$2,9 billones', detalle: '366 organismos', relleno: 'bg-serie-2' },
        ]}
      />
    ),
  },
  'components/graficos/GastoMensual.tsx': {
    que: 'el gasto mensual por sector de la portada: columnas apiladas con el color fijo de cada sector, globo y leyenda con cifras',
    ejemplo: () => <GastoMensual datos={DATOS_GASTO} />,
  },
  'components/graficos/Concentracion.tsx': {
    que: 'la concentración de los mercados de la portada: diez tramos, globo, y la tabla de valores en sr-only',
    ejemplo: () => <Concentracion datos={DATOS_CONCENTRACION} />,
  },
  'components/graficos/RedProveedores.tsx': {
    que: 'la red de la portada: compradores en un anillo con el color de su sector, proveedores adentro, globo y tabla sr-only',
    ejemplo: () => <RedProveedores datos={DATOS_RED} accesible={[{ nombre: 'Proveedor uno', vecinos: 9, texto: '$50 mil millones' }]} />,
  },
  'components/graficos/EscaleraPrecios.tsx': {
    que: 'la escalera de precios de la portada: varias cosas comunes en filas sobre una escala logarítmica, con su rango escrito',
    ejemplo: () => <EscaleraPrecios datos={DATOS_ESCALERA} />,
    escalaLog: true,
  },
  'components/compraAgil/RangoMonto.tsx': {
    que: 'el monto de una Compra Ágil contra lo que suele gastar su unidad de compra: franja P25–P75, mediana y un punto (filas con historia)',
    ejemplo: () => (
      <RangoMonto
        rango={
          rangoMonto({
            monto_estimado: 3_000_000,
            monto_es_tope: false,
            comprador: {
              ordenes: 120,
              publicadas: null,
              proveedores_distintos: 45,
              cuota_lider_pct: 12,
              monto_mediana: 850_000,
              monto_p25: 400_000,
              monto_p75: 1_500_000,
              percentil_ordenes: 0.84,
            },
          })!
        }
      />
    ),
  },
  'components/graficos/Columnas.tsx': {
    que: 'columnas por mes o por año: estacionalidad y serie anual en /mercado',
    ejemplo: () => (
      <Columnas
        etiqueta="Años en que compró cada mes"
        columnas={[
          { clave: '1', etiqueta: 'ene', valor: 0.12, texto: '12%' },
          { clave: '2', etiqueta: 'feb', valor: 0.38, texto: '38%', destacada: true },
        ]}
      />
    ),
  },
};

/**
 * Lo que dibuja datos y todavía no sigue la guía. **Sólo encoge**: quien arregle
 * uno lo pasa a `PROPIOS`. Está también en `docs/GUIA_GRAFICOS.md` («Deuda»).
 */
const DEUDA: Record<string, string> = {
};

/** Ficheros que el detector ve pero no dibujan datos. */
const NO_SON_GRAFICOS: Record<string, string> = {
  'app/opengraph-image.tsx': 'la tarjeta de vista previa: Satori, sin CSS',
  'components/cascara/PajaroMarca.tsx': 'el pájaro de la marca',
};

/** Clases de color que puede usar un gráfico propio. */
const COLOR_PERMITIDO = new Set([
  'dato',
  'dato-tenue',
  'serie-1',
  'serie-2',
  'serie-3',
  'serie-4',
  'serie-5',
  'serie-otros',
  'border-light',
  'text',
  'muted',
  'subtle',
  'border',
  'surface',
  'surface-elevated',
]);
/** `text-sm`, `border-t`… no son colores. */
const NO_ES_COLOR = /^(?:xs|sm|base|lg|xl|\d?xl|left|right|center|[trblxy]-\d+|[trblxy]|\d+|\[.*\]|none|collapse|separate|opacity-\d+|solid|dashed)$/;

describe('guía de gráficos: todo lo que dibuja datos está declarado', () => {
  const detectados = ARCHIVOS.filter((r) => DIBUJA.test(leer(r)));

  it('el detector encuentra gráficos (guarda contra comprobar el vacío)', () => {
    // Eran 13 con la deuda; sin ella (octubre de 2026) quedan 8: los seis propios
    // y los dos que no son gráficos. Bajó con su motivo, no se borró. Con la portada
    // de gráficos (gasto mensual y concentración), 10.
    expect(detectados.length).toBeGreaterThanOrEqual(9);
  });

  it('cada fichero que dibuja está en PROPIOS, DEUDA o NO_SON_GRAFICOS', () => {
    const sueltos = detectados.filter((r) => !(r in PROPIOS) && !(r in DEUDA) && !(r in NO_SON_GRAFICOS));
    expect(sueltos, 'Gráfico nuevo sin declarar: decide si cumple docs/GUIA_GRAFICOS.md').toEqual([]);
  });

  it('las listas no nombran ficheros que ya no dibujan (la deuda sólo encoge)', () => {
    const declarados = [...Object.keys(PROPIOS), ...Object.keys(DEUDA), ...Object.keys(NO_SON_GRAFICOS)];
    expect(declarados.filter((r) => !detectados.includes(r))).toEqual([]);
  });

  it('Recharts sólo aparece en la deuda', () => {
    const fuera = ARCHIVOS.filter((r) => /from 'recharts'/.test(leer(r)) && !(r in DEUDA));
    expect(fuera).toEqual([]);
  });
});

describe.each(Object.entries(PROPIOS))('gráfico propio %s', (ruta, propio) => {
  const fuente = leer(ruta);

  it('no usa colores crudos', () => {
    expect(fuente.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(\s*\d/g) ?? []).toEqual([]);
  });

  it('pinta sólo con dato, dato-tenue y tintas neutras', () => {
    const clases = [...fuente.matchAll(/(?<![\w-])(?:bg|fill|stroke|text|border(?:-[trblxy])?)-([a-zA-Z][\w-]*(?:\/\d+)?)/g)].map((m) => m[1]);
    const ajenas = clases.filter((c) => !NO_ES_COLOR.test(c) && !COLOR_PERMITIDO.has(c));
    expect(ajenas, propio.que).toEqual([]);
  });

  it('sin degradados, sombras, filtros, animaciones ni leyendas', () => {
    const adornos = fuente.match(/linearGradient|radialGradient|<filter\b|drop-shadow|\bshadow-|\banimate-|\btransition|\bLegend\b/g);
    expect(adornos ?? []).toEqual([]);
  });

  it('ningún texto de menos de 12 px', () => {
    const chicos = [...fuente.matchAll(/text-\[(\d+(?:\.\d+)?)px\]|fontSize[=:]\s*\{?\s*(\d+)/g)]
      .map((m) => Number(m[1] ?? m[2]))
      .filter((px) => px < 12);
    expect(chicos).toEqual([]);
  });

  it('cada marca de dato cuelga de un aria-hidden, y los svg también', () => {
    const { container } = render(propio.ejemplo());
    const marcas = [...container.querySelectorAll('[class*="dato"], [class*="serie-"]')];
    expect(marcas.length, 'el ejemplo no dibujó nada').toBeGreaterThan(0);
    expect(marcas.filter((m) => !m.closest('[aria-hidden="true"]')).map((m) => m.outerHTML.slice(0, 80))).toEqual([]);
    expect([...container.querySelectorAll('svg')].filter((s) => s.getAttribute('aria-hidden') !== 'true')).toEqual([]);
  });

  it(propio.valoresFuera ? 'quien lo usa pone sus valores en texto al lado' : 'escribe sus valores como texto', () => {
    if (propio.valoresFuera) {
      const nombre = ruta.split('/').at(-1)!.replace('.tsx', '');
      const usuarios = ARCHIVOS.filter((r) => r !== ruta && new RegExp(`<${nombre}\\b`).test(leer(r)));
      expect(usuarios.length).toBeGreaterThan(0);
      expect(usuarios.filter((r) => !/sr-only|<table\b/.test(leer(r)))).toEqual([]);
    } else {
      const { container } = render(propio.ejemplo());
      const visible = [...container.querySelectorAll('*')]
        .filter((e) => !e.closest('[aria-hidden="true"]') && e.children.length === 0)
        .map((e) => e.textContent ?? '')
        .join(' ');
      expect(visible.trim().length).toBeGreaterThan(0);
    }
  });

  if (propio.escalaLog) {
    it('declara la escala logarítmica', () => {
      const { container } = render(propio.ejemplo());
      expect(container.textContent).toContain('escala logarítmica');
    });
  }
});

describe('tokens de color en estilos en línea', () => {
  /**
   * Los tokens son tripletes («84 99 122»), así que `var(--color-x)` sin `rgb()`
   * no es un color: el navegador descarta la declaración. Así salía sin fondo el
   * tooltip de `PriceBandChart`, con un `var(--color-surface, #1E293B)` cuyo
   * respaldo nunca se usaba (la variable existe; es su valor el que no sirve).
   * Las copias `-hex` (`--color-text-hex`…) sí son colores y se usan solas.
   */
  it('ningún var(--color-*) fuera de rgb() en app/ ni components/', () => {
    const sueltos = ARCHIVOS.flatMap((r) =>
      leer(r)
        .split('\n')
        .flatMap((linea, i) => (/(?<!rgb\()var\(--color-(?![\w-]*-hex\b)/.test(linea) ? [`${r}:${i + 1}`] : [])),
    );
    expect(sueltos).toEqual([]);
  });
});
