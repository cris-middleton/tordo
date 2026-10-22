/**
 * La escalera de precios de «Para empezar»: lo que pagó el Estado por seis cosas
 * que compra todo el mundo, cada una en su fila con su rango escrito, y la franja
 * de la mitad de las compras dibujada contra su propia mediana. Reemplaza en la portada a la lectura de un solo producto
 * (`lecturaPrecio`): una impresora le habla a quien vende impresoras; un lápiz, un
 * cloro y una resma, a cualquiera, y puestos juntos se ve de una vez cuánto se
 * mueve el precio de cada uno.
 *
 * Cada fila pasa el mismo filtro que la lectura de un producto (precio de
 * mercado, predictibilidad alta o media, p25 ≥ 1, p75 ≥ p25) sobre **la unidad
 * escrita aquí** (los guantes se compran por caja). Una fila sin su ficha o que
 * no pasa, no sale; con menos de `MINIMO_FILAS`, la escalera tampoco, y la
 * portada vuelve a la lectura de un producto.
 *
 * **Los slugs tienen copia literal en `scripts/verificar-produccion.sh`**:
 * `__tests__/escalera-precios.test.ts` falla si se separan. Elegidos el
 * 2026-10-22 en producción: los seis eran indexables, de mercado y de
 * predictibilidad alta o media en esa unidad.
 */

import type { BandaUnidad, ProductoPublico } from '@/types/publico';

import { decimal } from './formato';
import { esFechaOAusente } from './lecturasPortada';
import { enlacesDeMetodo, METODO_PRECIO, type EnlaceMetodo } from './metodo';
import { rangoDeMeses } from './periodo';
import { entero, plata, rutaProducto } from './publico';

export interface ProductoEscalera {
  slug: string;
  /** Cómo se escribe en la fila. */
  nombre: string;
  /** Con su artículo, para la conclusión: «El lápiz pasta azul». */
  conArticulo: string;
  /** La unidad de la banda que se dibuja (normalizada: minúsculas, sin tildes). */
  unidad: string;
}

/** De lo más barato a lo más caro: así se lee de arriba abajo como una escalera. */
export const PRODUCTOS_ESCALERA: readonly ProductoEscalera[] = [
  { slug: 'azul-lapiz-pasta', nombre: 'Lápiz pasta azul', conArticulo: 'El lápiz pasta azul', unidad: 'unidad' },
  { slug: 'agua-gas-mineral-sin', nombre: 'Agua mineral sin gas', conArticulo: 'El agua mineral sin gas', unidad: 'unidad' },
  { slug: 'cloro-gel', nombre: 'Cloro gel', conArticulo: 'El cloro gel', unidad: 'unidad' },
  { slug: 'carta-papel-resma', nombre: 'Resma de papel carta', conArticulo: 'La resma de papel carta', unidad: 'unidad' },
  { slug: 'guantes-nitrilo-talla', nombre: 'Guantes de nitrilo (caja)', conArticulo: 'La caja de guantes de nitrilo', unidad: 'caja' },
  { slug: 'impresora-multifuncional', nombre: 'Impresora multifuncional', conArticulo: 'La impresora multifuncional', unidad: 'unidad' },
];

/** Con menos filas no es una escalera: la portada vuelve a la lectura de un producto. */
export const MINIMO_FILAS = 4;

const PREDICTIBILIDAD_CREIBLE: ReadonlySet<string> = new Set(['alta', 'media']);

const normalizar = (texto: string | null | undefined) =>
  (texto ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** La banda de la unidad pedida, si se puede creer como precio de mercado; si no, null. */
export function bandaDeLaEscalera(ficha: ProductoPublico | null, unidad: string): BandaUnidad | null {
  if (!ficha || ficha.indexable !== true || !Array.isArray(ficha.unidades)) return null;
  const banda = ficha.unidades.find((u) => normalizar(u?.unidad) === unidad);
  if (!banda) return null;
  const { p25, p50, p75 } = banda;
  if (!esNumero(p25) || !esNumero(p50) || !esNumero(p75) || !(p25 >= 1) || !(p75 >= p25)) return null;
  if (banda.de_mercado !== true || !PREDICTIBILIDAD_CREIBLE.has(normalizar(banda.predictibilidad))) return null;
  return banda;
}

export interface FilaEscalera {
  slug: string;
  nombre: string;
  href: string;
  p25: number;
  p50: number;
  p75: number;
  /** «$83 a $134», o «$100» si los dos se escriben igual. */
  rango: string;
  /** «$100». */
  mediana: string;
  /** «293 compras de 125 compradores». */
  base: string;
  /** p75 / p25: cuánto se mueve el precio dentro de la mitad de las compras. */
  veces: number;
  /** Dónde empiezan y terminan la franja y la raya, en % del ancho (escala logarítmica, relativa a la mediana). */
  desde: number;
  hasta: number;
  medio: number;
  /** Es la fila que nombra la conclusión: va en `dato`. */
  destacada: boolean;
}

export interface MarcaEscalera {
  /** «la mitad», «la mediana», «el doble». */
  texto: string;
  x: number;
}

export interface GraficoEscalera {
  filas: FilaEscalera[];
  marcas: MarcaEscalera[];
}

export interface LecturaEscalera {
  conclusion: string;
  grafico: GraficoEscalera;
  pie: string;
  enlaces: EnlaceMetodo[];
}

/** Los bordes del eje, relativo a la mediana: el doble y la mitad, o más si alguna franja se sale. */
const TOPES = [
  { veces: 2, abajo: 'la mitad', arriba: 'el doble' },
  { veces: 3, abajo: 'un tercio', arriba: 'el triple' },
  { veces: 4, abajo: 'un cuarto', arriba: '4 veces' },
] as const;

/** «el doble del», «1,9 veces el»: cuánto se mueve el precio, en la conclusión (sigue «más bajo»). */
function cuanto(veces: number): string {
  const redondo = Math.round(veces * 10) / 10;
  if (redondo === 2) return 'el doble del';
  if (redondo === 3) return 'el triple del';
  return `${decimal(redondo, 1)} veces el`;
}

/**
 * «La impresora multifuncional es lo que más varía: en la mitad de sus compras,
 * el precio más alto es 1,9 veces el más bajo.» Sale de la regla: la fila con el
 * mayor p75/p25. Si ninguna pasa de 1,25, se dice que el precio es parejo.
 */
export function fraseEscalera(filas: FilaEscalera[], productos: readonly ProductoEscalera[] = PRODUCTOS_ESCALERA): string {
  const mayor = filas.reduce((a, f) => (f.veces > a.veces ? f : a), filas[0]);
  const producto = productos.find((p) => p.slug === mayor.slug);
  const quien = producto?.conArticulo ?? mayor.nombre;
  if (mayor.veces < 1.25) return `Por estas ${filas.length} cosas, el Estado paga casi siempre lo mismo.`;
  return `${quien} es lo que más varía: en la mitad de sus compras, el precio más alto es ${cuanto(mayor.veces)} más bajo.`;
}

/**
 * La escalera, o null si no hay `MINIMO_FILAS` filas que se puedan creer. Las
 * fichas llegan en el orden de `PRODUCTOS_ESCALERA`; una `null` (404, caída o mal
 * formada) es una fila menos.
 */
export function lecturaEscalera(
  fichas: (ProductoPublico | null)[],
  repositorio: string | null,
  productos: readonly ProductoEscalera[] = PRODUCTOS_ESCALERA,
): LecturaEscalera | null {
  const crudas = productos.flatMap((p, i) => {
    const ficha = fichas[i] ?? null;
    const banda = bandaDeLaEscalera(ficha, p.unidad);
    return banda && ficha ? [{ p, banda, ficha }] : [];
  });
  if (crudas.length < MINIMO_FILAS) return null;

  // **La escala es relativa a la mediana de cada cosa**, en logaritmo: un lápiz de
  // $100 y una impresora de $214.000 se comparan por cuánto se mueve su precio, que
  // es lo que dice la conclusión. Sobre los pesos (de $10 a $1 millón) cada franja
  // medía un 4 % del ancho y no se veía nada. Los pesos van escritos en cada fila.
  // El tope es el doble (y la mitad); si alguna franja se sale, el triple o el cuádruple.
  const extremo = Math.max(...crudas.map((c) => Math.max(c.banda.p75! / c.banda.p50!, c.banda.p50! / c.banda.p25!)));
  const tope = TOPES.find((t) => t.veces >= extremo) ?? TOPES[TOPES.length - 1];
  const x = (razon: number) => Math.min(100, Math.max(0, ((Math.log(razon) / Math.log(tope.veces) + 1) / 2) * 100));

  const filas: FilaEscalera[] = crudas.map(({ p, banda }) => {
    // `bandaDeLaEscalera` ya comprobó que los tres son números.
    const p25 = banda.p25 as number;
    const p50 = banda.p50 as number;
    const p75 = banda.p75 as number;
    const { n, compradores } = banda;
    const a = plata(p25);
    const b = plata(p75);
    return {
      slug: p.slug,
      nombre: p.nombre,
      href: rutaProducto(p.slug),
      p25,
      p50,
      p75,
      rango: a === b ? a : `${a} a ${b}`,
      mediana: plata(p50),
      base: `${entero(n)} ${n === 1 ? 'compra' : 'compras'}${compradores ? ` de ${entero(compradores)} compradores` : ''}`,
      veces: p75 / p25,
      desde: x(p25 / p50),
      hasta: x(p75 / p50),
      medio: 50,
      destacada: false,
    };
  });
  const mayor = filas.reduce((a, f) => (f.veces > a.veces ? f : a), filas[0]);
  if (mayor.veces >= 1.25) mayor.destacada = true;

  const marcas: MarcaEscalera[] = [
    { texto: tope.abajo, x: 0 },
    { texto: 'la mediana', x: 50 },
    { texto: tope.arriba, x: 100 },
  ];

  const periodos = crudas.map((c) => c.ficha.periodo).filter((p) => p && esFechaOAusente(p.ventana_desde));
  const periodo = periodos.length ? rangoDeMeses(periodos[0]!.ventana_desde, periodos[0]!.ventana_hasta) : null;
  const compras = crudas.reduce((s, c) => s + (c.banda.n ?? 0), 0);

  return {
    conclusion: fraseEscalera(filas, productos),
    grafico: { filas, marcas },
    pie:
      `${entero(compras)} compras${periodo ? ` de ${periodo}` : ''}, precio por unidad (los guantes, por caja). ` +
      'La franja es la mitad de las compras de cada cosa, medida contra su propia mediana (la raya): así se comparan un lápiz y una impresora.',
    enlaces: enlacesDeMetodo(METODO_PRECIO, {
      primero: { texto: 'Buscar otro producto', href: '/productos', externo: false },
      api: `/publico/productos/${mayor.slug}`,
      repositorio,
    }),
  };
}
