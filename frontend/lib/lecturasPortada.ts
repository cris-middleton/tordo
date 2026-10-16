/**
 * Las tres lecturas del panel de la portada (spec docs/IDENTIDAD_Y_PORTADA_2026-10.md
 * §3.2–§3.5): quién compra, a qué precio y qué cierra pronto.
 *
 * **Cada frase sale del dato, con reglas** (D8). Las reglas viven aquí y las fija
 * `__tests__/lecturas-portada.test.ts` con sus bordes.
 *
 * Funciones puras, sin React y sin secretos. Los validadores (`esSectores`,
 * `esProductoPortada`) los usa `lib/publicoServidor.ts`: un 200 mal formado
 * oculta la lectura en vez de tumbar la portada. Las lecturas devuelven además `null` ante cualquier dato
 * que no se pueda pintar con verdad. **Si una lectura no tiene dato, se oculta
 * entera** (principio 4 del rediseño).
 *
 * Sin signos de exclamación en ningún texto (voz del sitio, spec §6.1).
 */

import type { SectoresBI } from '@/types/bi';
import type { CompraAgilPorCierre, ProductoPublico, ResumenPortada } from '@/types/publico';

import { urlCatalogoAbiertas } from './filtrosCatalogo';
import { textoPeriodo } from './periodo';
import { entero, plata, rutaProducto } from './publico';

// ── Comunes ─────────────────────────────────────────────────────────────────

export interface EnlaceLectura {
  texto: string;
  href: string;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esMonto(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
}

/**
 * Un entero no negativo. Exportado para `lib/publicoServidor.ts`: una sola
 * definición de «conteo» entre los validadores.
 */
export function esConteo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

/**
 * Ausente, nula o «AAAA-MM-DD…» **que existe en el calendario**. La forma sola no
 * basta: «2023-99-01» pasaba, y `textoPeriodo` lanzaba `RangeError` al formatearla.
 * Lo comparte la lectura de sectores y la de precio.
 */
function esFechaOAusente(valor: unknown): boolean {
  if (valor == null) return true;
  if (typeof valor !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

const unDecimal = (x: number) => Math.round(x * 10) / 10;

// ── Lectura 1: quién compra (§3.3) ──────────────────────────────────────────

/** Se pintan los cuatro primeros sectores por monto. */
export const BARRAS_SECTOR = 4;

/** Si el segundo está a menos de esto del primero, «compran casi lo mismo». */
export const UMBRAL_EMPATE = 0.05;

/**
 * Sectores que no le dicen nada a quien vende: no ocupan barra, y si caen entre
 * los cuatro primeros entra el siguiente. Sí cuentan en el total del reparto.
 * «NA» no está en el mapa de la spec: aparece en el fixture del golden (lo que
 * materializa `make e2e`) y una barra «NA» dice todavía menos que una «Otros».
 */
export const SECTORES_SIN_BARRA: ReadonlySet<string> = new Set(['otros', 'na']);

/** Un nombre para la barra y otro para la frase. Fuera del mapa, tal cual. */
const NOMBRES_SECTOR: Readonly<Record<string, { barra: string; frase: string }>> = {
  Municipalidades: { barra: 'Municipalidades', frase: 'municipios' },
  'Gob. Central, Universidades': { barra: 'Gob. central', frase: 'Gob. central' },
  'Obras Públicas': { barra: 'Obras públicas', frase: 'Obras públicas' },
};

export function nombreSector(sector: string): { barra: string; frase: string } {
  const limpio = sector.trim();
  return NOMBRES_SECTOR[limpio] ?? { barra: limpio, frase: limpio };
}

export interface BarraSector {
  nombre: string;
  /** «$2,9 billones», con `plata()`, el formato de las páginas públicas. */
  monto: string;
  /** Ancho de la barra en %, relativo al primero, con un decimal. */
  ancho: number;
  /** En `dato` si la conclusión la nombra; si no, `dato-tenue`. */
  destacada: boolean;
}

export interface LecturaSectores {
  conclusion: string;
  pie: string;
  enlace: EnlaceLectura;
  barras: BarraSector[];
}

/** La forma de `GET /bi/sector` que la lectura lee, campo por campo. */
export function esSectores(datos: unknown): datos is SectoresBI {
  if (!esObjeto(datos) || typeof datos.disponible !== 'boolean') return false;
  if (!datos.disponible) return true;
  return (
    Array.isArray(datos.sectores) &&
    datos.sectores.every(
      (f) =>
        esObjeto(f) &&
        typeof f.sector === 'string' &&
        f.sector.trim() !== '' &&
        esMonto(f.monto_total) &&
        esFechaOAusente(f.ventana_desde) &&
        esFechaOAusente(f.ventana_hasta),
    )
  );
}

/**
 * «Salud y municipios compran casi lo mismo» si el segundo está a menos del 5 %
 * del primero; si no, «Salud gasta $P de cada $100 en órdenes de compra», con P
 * sobre la suma de TODOS los sectores de la respuesta. **Sin ventana, nada**: una
 * cifra sin periodo se lee como «de siempre».
 */
export function lecturaSectores(datos: SectoresBI | null): LecturaSectores | null {
  if (!datos?.disponible || !datos.sectores?.length) return null;
  const ordenados = [...datos.sectores].sort((x, y) => y.monto_total - x.monto_total);
  const visibles = ordenados
    .filter((s) => !SECTORES_SIN_BARRA.has(s.sector.trim().toLowerCase()))
    .slice(0, BARRAS_SECTOR);
  const [a, b] = visibles;
  if (!a || a.monto_total <= 0) return null;
  if (!esFechaOAusente(a.ventana_desde) || !esFechaOAusente(a.ventana_hasta)) return null;
  const periodo = textoPeriodo({ desde: a.ventana_desde, hasta: a.ventana_hasta });
  if (!periodo) return null;

  const empate = b !== undefined && (a.monto_total - b.monto_total) / a.monto_total < UMBRAL_EMPATE;
  const total = datos.sectores.reduce((suma, s) => suma + s.monto_total, 0);
  const conclusion =
    empate && b
      ? `${nombreSector(a.sector).frase} y ${nombreSector(b.sector).frase} compran casi lo mismo`
      : `${nombreSector(a.sector).frase} gasta $${Math.round((a.monto_total / total) * 100)} de cada $100 en órdenes de compra`;
  const pintadas = empate ? 2 : 1;

  return {
    conclusion: capitalizar(conclusion),
    pie: `Órdenes de compra, ${periodo}`,
    enlace: { texto: 'Ver mercados', href: '/mercado' },
    barras: visibles.map((s, i) => ({
      nombre: nombreSector(s.sector).barra,
      monto: plata(s.monto_total),
      ancho: unDecimal((s.monto_total / a.monto_total) * 100),
      destacada: i < pintadas,
    })),
  };
}

// ── Lectura 2: a qué precio (§3.4) ──────────────────────────────────────────

/**
 * El producto de la lectura de precio. **El nombre va escrito a mano**: la firma
 * son sus palabras ordenadas y sin relleno («higiénico jumbo papel») y no se lee
 * como un nombre.
 *
 * Elegido en producción el 2026-10-16 recorriendo `EJEMPLOS_BUSQUEDA` desde el
 * primero, con peticiones espaciadas: las dos fichas de guantes de nitrilo
 * miradas tenían predictibilidad baja, y la primera de papel higiénico, una
 * marca con los cinco percentiles iguales. Ésta es genérica, sin marca, y pasa
 * el filtro (paquete, 90 compras, predictibilidad media, $842–$2.106, periodo).
 *
 * **El slug tiene copia literal en `scripts/verificar-produccion.sh`**, que
 * comprueba tras desplegar que sigue indexable y pasando el filtro;
 * `__tests__/portada-ayudantes.test.ts` falla si las dos copias se separan.
 */
export const PRODUCTO_PORTADA = {
  slug: 'higienico-jumbo-papel',
  nombre: 'Papel higiénico jumbo',
} as const;

/**
 * La unidad ausente, tal como la escribe el pipeline
 * (`etl/analytics/normalizacion.py`, `UNIDAD_SIN_DECLARAR`).
 */
const UNIDAD_SIN_DECLARAR = 'sin unidad declarada';

/** Bandas que se pueden creer: con predictibilidad baja el precio no decide. */
const PREDICTIBILIDAD_CREIBLE: ReadonlySet<string> = new Set(['alta', 'media']);

/** Minúsculas, sin tildes y con un solo espacio entre palabras. */
const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');

export interface MarcaPrecio {
  /** «$4.200». */
  valor: string;
  /** Dónde cae en el riel, en % con un decimal. */
  posicion: number;
}

export interface LecturaPrecio {
  conclusion: string;
  pie: string;
  enlace: EnlaceLectura;
  /**
   * Extremos del riel; sin ellos, el riel va de p25 a p75. **No llevan rótulo**
   * (spec §3.4): con precios sesgados los cinco se pisaban.
   */
  p10: MarcaPrecio | null;
  /** Rotulado debajo de la banda. */
  p25: MarcaPrecio;
  /** Rotulado encima de su marca: «mediana $5.390». */
  p50: MarcaPrecio | null;
  /** Rotulado debajo de la banda. */
  p75: MarcaPrecio;
  p90: MarcaPrecio | null;
}

const CLAVES_PRECIO = ['p10', 'p25', 'p50', 'p75', 'p90'] as const;

const esTextoONulo = (valor: unknown) => valor === null || typeof valor === 'string';

/**
 * La forma de `GET /publico/productos/{slug}` que la lectura lee, campo por
 * campo. Una unidad o una predictibilidad nulas son forma válida (el backend las
 * permite): las descarta después el filtro de calidad de `lecturaPrecio`.
 */
export function esProductoPortada(datos: unknown): datos is ProductoPublico {
  if (!esObjeto(datos)) return false;
  const { periodo, unidades } = datos;
  const periodoValido =
    periodo == null ||
    (esObjeto(periodo) && esFechaOAusente(periodo.ventana_desde) && esFechaOAusente(periodo.ventana_hasta));
  return (
    typeof datos.slug === 'string' &&
    typeof datos.firma === 'string' &&
    typeof datos.indexable === 'boolean' &&
    periodoValido &&
    Array.isArray(unidades) &&
    unidades.every(
      (u) =>
        esObjeto(u) &&
        esTextoONulo(u.unidad) &&
        esTextoONulo(u.predictibilidad ?? null) &&
        esConteo(u.n) &&
        CLAVES_PRECIO.every((k) => u[k] == null || esMonto(u[k])),
    )
  );
}

/**
 * Dónde cae un rótulo a efectos de decidir si p25 y p75 se pisan
 * (`rotulosDeBanda`): cerca de un borde, el rótulo se corre hacia el centro, así
 * que se cuenta como si estuviera entre el 12 y el 88 %. **No es dónde se pinta**:
 * eso lo acota su propio ancho (`izquierdaDeRotulo`). Sin posición (`NaN`), al
 * centro: «left: NaN%» lo dejaría donde el navegador quisiera.
 */
export function posicionDeRotulo(posicion: number): number {
  if (Number.isNaN(posicion)) return 50;
  return Math.min(88, Math.max(12, posicion));
}

/**
 * El `left` de un rótulo centrado en su marca (con `-translate-x-1/2`) que
 * **no se sale del riel por mucho que mida**: su centro no baja de media
 * anchura ni sube de 100 % menos media anchura, y entre medias se queda sobre
 * su marca. Un tope fijo no sirve: a 320 px (256 px de riel) el 12–88 % se
 * quedaba corto para «mediana $5.390» (~77 px, su mitad ~15 % del riel), y a
 * 1440 px alejaba de su marca un rótulo que cabía. Sin posición (`NaN`), al centro.
 *
 * **La anchura se cuenta en `ch`, un `ch` por carácter.** Medido con Archivo en
 * negrita (la variable no está fuera del build): un rótulo de cifras ocupa
 * 0,84–0,92 `ch` por carácter, así que el cálculo sobra un poco y nunca falta,
 * **siempre que el `ch` sea el del peso más grueso del rótulo**: el elemento
 * que lleva este `left` lleva también su peso, y lo más fino va dentro.
 */
export function izquierdaDeRotulo(posicion: number, texto: string): string {
  const media = `${[...texto].length / 2}ch`;
  return `clamp(${media}, ${sinNaN(posicion)}%, calc(100% - ${media}))`;
}

const sinNaN = (posicion: number) => (Number.isNaN(posicion) ? 50 : posicion);

/**
 * Menos que esto, en % del riel, entre p25 y p75 (ya acotados), y sus dos
 * rótulos se pisan: a 320 px el 18 % son ~46 px, y «$4.200» mide ~36.
 */
export const SEPARACION_MINIMA_ROTULOS = 18;

/** Dónde van los rótulos de debajo de la banda: uno bajo cada cuartil, o uno solo en el medio. */
export type RotulosBanda = { juntos: false; p25: number; p75: number } | { juntos: true; centro: number };

/**
 * Con la cola larga a un lado la banda se aprieta contra un extremo, y sus dos
 * rótulos, corridos hacia dentro, caen casi en el mismo sitio: entonces va uno
 * solo, «$p25 – $p75», centrado entre los dos. **La distancia se mide acotada**
 * (`posicionDeRotulo`); las posiciones que devuelve, no: cada rótulo se queda
 * tan cerca de su marca como quepa, y eso lo decide `izquierdaDeRotulo`.
 */
export function rotulosDeBanda(p25: MarcaPrecio, p75: MarcaPrecio): RotulosBanda {
  const a = sinNaN(p25.posicion);
  const b = sinNaN(p75.posicion);
  if (posicionDeRotulo(b) - posicionDeRotulo(a) < SEPARACION_MINIMA_ROTULOS) {
    return { juntos: true, centro: unDecimal((a + b) / 2) };
  }
  return { juntos: false, p25: a, p75: b };
}

/**
 * «{nombre}: la mitad se pagó entre {p25} y {p75}», de la unidad con
 * más compras (`unidades[0]`: la API ya las ordena por `n`). Cierta por
 * definición del rango intercuartílico. **No se muestran mínimo ni máximo**: son
 * lo que el Tukey de las bandas ya trata como atípico.
 *
 * **Sólo una banda que se pueda creer** (spec §3.4): unidad declarada,
 * predictibilidad alta o media, `p25 ≥ 1`, `p75 > p25`, que se escriban distinto
 * con `plata()` y periodo. Si no, nada: mejor ninguna banda que «entre $0 y $0»,
 * «entre $1.150 y $1.150» o «entre $2 millones y $2 millones».
 *
 * `nombre` es el escrito a mano junto al slug; por defecto, el de
 * `PRODUCTO_PORTADA`.
 */
export function lecturaPrecio(
  producto: ProductoPublico | null,
  nombre: string = PRODUCTO_PORTADA.nombre,
): LecturaPrecio | null {
  if (!producto?.indexable) return null;
  const u = producto.unidades[0];
  // p75 > p25 estricto: «entre $1.150 y $1.150» no dice nada.
  if (!u || u.p25 == null || u.p75 == null || u.p25 < 1 || u.p75 <= u.p25) return null;
  // Distintos en el dato pero escritos igual tras redondear: lo mismo.
  if (plata(u.p25) === plata(u.p75)) return null;
  const unidad = normalizar(u.unidad ?? '');
  if (!u.unidad || !unidad || unidad === UNIDAD_SIN_DECLARAR) return null;
  if (!PREDICTIBILIDAD_CREIBLE.has(normalizar(u.predictibilidad ?? ''))) return null;
  if (!esFechaOAusente(producto.periodo?.ventana_desde) || !esFechaOAusente(producto.periodo?.ventana_hasta)) {
    return null;
  }
  const periodo = textoPeriodo({ desde: producto.periodo?.ventana_desde, hasta: producto.periodo?.ventana_hasta });
  if (!periodo) return null;

  const desde = Math.min(u.p10 ?? u.p25, u.p25);
  const hasta = Math.max(u.p90 ?? u.p75, u.p75);
  // hasta ≥ p75 > p25 ≥ desde: el riel nunca tiene ancho cero.
  const posicion = (v: number) => unDecimal(((v - desde) / (hasta - desde)) * 100);
  const marca = (v: number): MarcaPrecio => ({ valor: plata(v), posicion: posicion(v) });
  const compras = u.n === 1 ? '1 compra' : `${entero(u.n)} compras`;

  return {
    conclusion: `${nombre}: la mitad se pagó entre ${plata(u.p25)} y ${plata(u.p75)}`,
    pie: `Precio por ${u.unidad.trim().toLowerCase()}, ${compras}, ${periodo}`,
    enlace: { texto: 'Ver el producto', href: rutaProducto(producto.slug) },
    p10: u.p10 == null ? null : marca(u.p10),
    p25: marca(u.p25),
    p50: u.p50 == null ? null : marca(u.p50),
    p75: marca(u.p75),
    p90: u.p90 == null ? null : marca(u.p90),
  };
}

// ── Lectura 3: qué cierra pronto (§3.5) ─────────────────────────────────────

/** «Ver las que cierran primero»: el catálogo por cierre ascendente. */
export const ORDEN_POR_CIERRE = { sort_by: 'fecha_cierre', sort_order: 'asc' } as const;

export interface ColumnaCierre {
  nombre: string;
  /** «1.105». */
  valor: string;
  /** Alto de la barra en %, relativo a la mayor; 0 sólo si no hay ninguna. */
  alto: number;
  destacada: boolean;
}

export interface LecturaCierres {
  conclusion: string;
  pie: string;
  enlace: EnlaceLectura;
  columnas: ColumnaCierre[];
}

function esPorCierre(valor: unknown): valor is CompraAgilPorCierre {
  return (
    esObjeto(valor) &&
    esConteo(valor.hoy) &&
    esConteo(valor.manana) &&
    esConteo(valor.dos_tres_dias) &&
    esConteo(valor.despues)
  );
}

/**
 * Con r = (hoy + mañana) / abiertas y N = r × 10 redondeado: los cinco casos de
 * §3.5 más N = 1, que va en singular. «Ninguna» y «todas» se dicen con palabras;
 * los bordes del redondeo, con «menos de 1» y «casi todas», para no decir 0 ni 10
 * de algo que no lo es.
 */
export function fraseCierres(pronto: number, abiertas: number): string {
  const r = pronto / abiertas;
  const n = Math.round(r * 10);
  if (r === 0) return 'Ninguna Compra Ágil abierta cierra hoy ni mañana';
  if (r === 1) return 'Todas las Compras Ágiles abiertas cierran hoy o mañana';
  if (n === 0) return 'Menos de 1 de cada 10 Compras Ágiles abiertas cierra hoy o mañana';
  if (n === 1) return '1 de cada 10 Compras Ágiles abiertas cierra hoy o mañana';
  if (n === 10) return 'Casi todas las Compras Ágiles abiertas cierran hoy o mañana';
  return `${n} de cada 10 Compras Ágiles abiertas cierran hoy o mañana`;
}

const NOMBRES_CIERRE = ['Hoy', 'Mañana', 'En 2 o 3 días', 'Después'] as const;

/**
 * Las Compras Ágiles abiertas por día de cierre. Los cuatro tramos salen de la
 * misma pasada que `compra_agil_abiertas` y suman lo mismo (lo exige un test del
 * backend): **si no suman, la respuesta no cuadra y no se publica**.
 */
export function lecturaCierres(resumen: ResumenPortada | null): LecturaCierres | null {
  if (!resumen) return null;
  const tramos = resumen.compra_agil_por_cierre;
  const abiertas = resumen.compra_agil_abiertas;
  if (!esPorCierre(tramos) || !esConteo(abiertas) || abiertas === 0) return null;
  const valores = [tramos.hoy, tramos.manana, tramos.dos_tres_dias, tramos.despues];
  if (valores.reduce((suma, n) => suma + n, 0) !== abiertas) return null;

  const pronto = tramos.hoy + tramos.manana;
  const mayor = Math.max(...valores);
  const alto = (n: number) => (n === 0 ? 0 : Math.max(4, Math.round((n / mayor) * 100)));

  return {
    conclusion: fraseCierres(pronto, abiertas),
    pie: `${entero(abiertas)} ${abiertas === 1 ? 'abierta' : 'abiertas'}, por día de cierre`,
    enlace: { texto: 'Ver las que cierran primero', href: urlCatalogoAbiertas('compra_agil', [], ORDEN_POR_CIERRE) },
    columnas: valores.map((n, i) => ({
      nombre: NOMBRES_CIERRE[i],
      valor: entero(n),
      alto: alto(n),
      destacada: pronto > 0 && i < 2,
    })),
  };
}
