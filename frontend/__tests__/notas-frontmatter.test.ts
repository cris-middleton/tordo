/**
 * Las notas de datos (`content/notas/*.mdx`, spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §5)
 * son contenido, y este test fija lo que la página, el feed y la portada van a leer:
 *
 * - el frontmatter de la spec (`titulo`, `fecha`, `resumen` ≤ 220, `estado`,
 *   `medido_sobre`, `fuentes`, y opcionales `cambio`, `script`, `antes_despues`),
 *   sin claves de más;
 * - `cambio` es un PR de este repositorio público, `script` existe en el repo y
 *   `arreglado` exige `cambio` (decir «arreglado» sin el cambio no se puede revisar);
 * - **cada fuente cita un fragmento literal de un fichero del repo** (`ruta:
 *   «fragmento»`), y el fragmento sigue ahí. Si alguien corrige la cifra en el
 *   documento, la nota se queda sin respaldo y el test falla, como `costos.test.ts`;
 * - **toda cifra de «En corto» está en esos fragmentos**: lo que más se lee no
 *   puede llevar un número que no salga del repo;
 * - las secciones fijas, en su orden, y «Reprodúcelo» sólo si hay `script`;
 * - sólo enlaza a rutas del sitio o al repositorio, y sin `{` ni `<` fuera del
 *   código (MDX los leería como JSX).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bloques, destinos } from '@/lib/markdown';
import {
  MAXIMO_RESUMEN,
  PREFIJO_CAMBIO,
  SECCIONES_NOTA,
  SECCION_REPRODUCELO,
  citaDeFuente,
  separarNota,
  textoPlano,
  titulosDeSeccion,
  validarNota,
  type ObjetoYaml,
} from '@/lib/notas';

const RAIZ_REPO = join(__dirname, '..', '..');
const DIRECTORIO = join(__dirname, '..', 'content', 'notas');

const ARCHIVOS = readdirSync(DIRECTORIO)
  .filter((f) => f.endsWith('.mdx'))
  .sort();

const CLAVES = new Set([
  'titulo',
  'fecha',
  'resumen',
  'estado',
  'medido_sobre',
  'fuentes',
  'cambio',
  'script',
  'antes_despues',
]);

/** Rutas a las que una nota puede enlazar. */
const RUTAS_PERMITIDAS = ['/guias/', '/notas/', '/productos', '/compradores/', '/rubros/', '/mercado', '/licitaciones', '/compra-agil'];

/**
 * El texto de un fichero, para buscar un fragmento: sin las marcas de negrita ni
 * de cita de Markdown (que parten una frase) y con los espacios colapsados (los
 * documentos se escriben en líneas de ~95 caracteres).
 */
function normalizar(texto: string): string {
  return texto
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** El cuerpo sin bloques de código ni código en línea, que MDX no interpreta. */
function sinCodigo(cuerpo: string): string {
  return cuerpo.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

/** Las cifras de un texto: «99,98», «2.106», «$843» → «843». */
const cifras = (texto: string) => texto.match(/\d+(?:[.,]\d+)*/g) ?? [];

describe('notas de datos', () => {
  it('guarda: hay notas que revisar', () => {
    expect(ARCHIVOS.length).toBeGreaterThanOrEqual(4);
  });

  it('no repiten título', () => {
    const titulos = ARCHIVOS.map((f) => separarNota(readFileSync(join(DIRECTORIO, f), 'utf8')).datos.titulo);
    expect(new Set(titulos).size).toBe(ARCHIVOS.length);
  });

  it('el detector de cifras y la normalización ven lo que tienen que ver', () => {
    expect(cifras('entre $843 y $2.106, el 99,98 %')).toEqual(['843', '2.106', '99,98']);
    expect(normalizar('a **b\n  c** d\n> e')).toBe('a b c d e');
  });

  describe.each(ARCHIVOS)('%s', (archivo) => {
    const fuente = readFileSync(join(DIRECTORIO, archivo), 'utf8');
    const { datos, markdown } = separarNota(fuente);
    const nota = validarNota(datos);
    const cuerpo = bloques(markdown);

    it('el nombre del archivo es un slug', () => {
      expect(archivo).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.mdx$/);
    });

    it('trae el frontmatter de la spec, sin claves de más', () => {
      for (const clave of ['titulo', 'fecha', 'resumen', 'estado', 'medido_sobre']) {
        expect(typeof datos[clave], clave).toBe('string');
      }
      expect(Object.keys(datos).filter((c) => !CLAVES.has(c))).toEqual([]);
    });

    it('fecha real, resumen corto y estado conocido', () => {
      expect(nota.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(nota.resumen.length).toBeLessThanOrEqual(MAXIMO_RESUMEN);
      expect(['arreglado', 'en-curso', 'medido']).toContain(nota.estado);
    });

    it('«cambio» es un PR de este repo y «arreglado» lo exige', () => {
      if (nota.cambio) expect(nota.cambio).toMatch(new RegExp(`^${PREFIJO_CAMBIO.replace(/[./]/g, '\\$&')}\\d+$`));
      if (nota.estado === 'arreglado') expect(nota.cambio).not.toBeNull();
    });

    it('«script» existe en el repo', () => {
      if (nota.script) expect(existsSync(join(RAIZ_REPO, nota.script)), nota.script).toBe(true);
    });

    it('cada fuente cita un fragmento que sigue en su fichero', () => {
      for (const f of nota.fuentes) {
        const cita = citaDeFuente(f);
        expect(cita, `«${f}» no tiene la forma ruta: «fragmento»`).not.toBeNull();
        const ruta = join(RAIZ_REPO, cita!.ruta);
        expect(existsSync(ruta), cita!.ruta).toBe(true);
        const sigue = normalizar(readFileSync(ruta, 'utf8')).includes(normalizar(cita!.fragmento));
        expect(sigue, `${cita!.ruta} ya no dice «${cita!.fragmento}»`).toBe(true);
      }
    });

    it('las secciones fijas, en su orden', () => {
      const esperadas = [...SECCIONES_NOTA, ...(nota.script ? [SECCION_REPRODUCELO] : [])];
      expect(titulosDeSeccion(cuerpo)).toEqual(esperadas);
    });

    it('«En corto» son tres viñetas y cada cifra suya sale de una fuente', () => {
      const i = cuerpo.findIndex((b) => b.t === 'titulo' && textoPlano(b.hijos) === 'En corto');
      const lista = cuerpo[i + 1];
      expect(lista?.t).toBe('lista');
      if (lista?.t !== 'lista') return;
      expect(lista.items).toHaveLength(3);
      const citado = nota.fuentes.map((f) => citaDeFuente(f)?.fragmento ?? '').join(' ');
      const numeros = lista.items.flatMap((item) => cifras(textoPlano(item)));
      expect(numeros.length, 'guarda: «En corto» lleva cifras').toBeGreaterThan(0);
      for (const n of numeros) expect(citado, `la cifra ${n} no está en ninguna fuente`).toContain(n);
    });

    it('sólo enlaza a rutas del sitio o al repositorio', () => {
      for (const destino of destinos(cuerpo)) {
        const permitido =
          destino.startsWith('https://github.com/cris-middleton/tordo/') ||
          RUTAS_PERMITIDAS.some((ruta) => destino === ruta || destino.startsWith(ruta));
        expect(permitido, destino).toBe(true);
      }
    });

    it('no tiene { ni < fuera del código: MDX los leería como JSX', () => {
      expect(sinCodigo(markdown)).not.toMatch(/[{<]/);
    });

    it('antes_despues, si está, va de 0 a 100', () => {
      if (!nota.antes_despues) return;
      for (const b of [nota.antes_despues.antes, nota.antes_despues.despues]) {
        expect(b.valor).toBeGreaterThanOrEqual(0);
        expect(b.valor).toBeLessThanOrEqual(100);
      }
    });
  });
});

describe('el validador rechaza lo que la spec no admite', () => {
  const base: ObjetoYaml = {
    titulo: 'T',
    fecha: '2026-10-16',
    resumen: 'R',
    estado: 'medido',
    medido_sobre: 'M',
    fuentes: ['CLAUDE.md: «x»'],
  };

  it('una nota mínima pasa', () => {
    expect(validarNota(base).cambio).toBeNull();
  });

  it.each<[string, ObjetoYaml]>([
    ['arreglado sin cambio', { ...base, estado: 'arreglado' }],
    ['un cambio que no es un PR de este repo', { ...base, cambio: 'https://github.com/otro/repo/pull/1' }],
    ['un cambio del repo privado', { ...base, cambio: 'https://github.com/cris-middleton/tordo-saas-privado/pull/81' }],
    ['un estado desconocido', { ...base, estado: 'en curso' }],
    ['una fecha que no es AAAA-MM-DD', { ...base, fecha: '16-10-2026' }],
    ['un resumen largo', { ...base, resumen: 'x'.repeat(MAXIMO_RESUMEN + 1) }],
    ['sin fuentes', { ...base, fuentes: [] }],
    ['sin medido_sobre', { ...base, medido_sobre: '' }],
    [
      'un antes_despues fuera de 0–100',
      { ...base, antes_despues: { rotulo: 'r', antes: { etiqueta: 'a', valor: 10 }, despues: { etiqueta: 'b', valor: 120 } } },
    ],
  ])('%s', (_, datos) => {
    expect(() => validarNota(datos)).toThrow();
  });

  it('el YAML mínimo lee listas, números y objetos por sangría, y rechaza lo demás', () => {
    const { datos } = separarNota(
      [
        '---',
        'titulo: "T"',
        'fuentes:',
        '  - "a: «b»"',
        'antes_despues:',
        '  rotulo: "R"',
        '  antes:',
        '    etiqueta: "Antes"',
        '    valor: 33',
        '  despues:',
        '    etiqueta: "Después"',
        '    valor: 82.5',
        'estado: "medido"',
        '---',
        'cuerpo',
      ].join('\n'),
    );
    expect(datos).toEqual({
      titulo: 'T',
      fuentes: ['a: «b»'],
      antes_despues: {
        rotulo: 'R',
        antes: { etiqueta: 'Antes', valor: 33 },
        despues: { etiqueta: 'Después', valor: 82.5 },
      },
      estado: 'medido',
    });
    expect(() => separarNota('---\ntitulo: sin comillas\n---\n')).toThrow();
    expect(() => separarNota('---\ntitulo: "a"\n  suelta: "b"\n---\n')).toThrow();
    expect(() => separarNota('---\nfuentes:\n---\n')).toThrow();
  });
});
