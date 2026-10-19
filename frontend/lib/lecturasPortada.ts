/**
 * Las lecturas de la portada (spec docs/PORTADA_V7_Y_NOTAS_2026-10.md §3.2–§3.4):
 * a qué precio se compró, qué cierra pronto y la última nota de datos. Salen dos
 * como mucho, las dos primeras disponibles en ese orden (`lecturasDeLaPortada`).
 *
 * **Cada frase sale del dato, con reglas** (D8 de la identidad). Las reglas viven
 * aquí y las fija `__tests__/lecturas-portada.test.ts` con sus bordes. Cada lectura
 * trae además su pie de método (V3): de qué base sale, de qué periodo, y sus
 * enlaces (`lib/metodo.ts`).
 *
 * Funciones puras, sin React y sin secretos: el repositorio llega como argumento.
 * Los validadores (`esSectores`, `esProductoPortada`) los usa `lib/publicoServidor.ts`:
 * un 200 mal formado oculta la lectura en vez de tumbar la portada. Las lecturas
 * devuelven además `null` ante cualquier dato que no se pueda pintar con verdad.
 * **Si una lectura no tiene dato, se oculta entera** (principio 4 del rediseño).
 *
 * Sin signos de exclamación en ningún texto (voz del sitio).
 */

import type { SectoresBI } from '@/types/bi';
import type { BandaUnidad, CompraAgilPorCierre, ProductoPublico, ResumenPortada } from '@/types/publico';

import { urlCatalogoAbiertas } from './filtrosCatalogo';
import { graficoPrecio, type GraficoPrecio } from './graficoPrecio';
import { enlacesDeMetodo, METODO_CIERRES, METODO_PRECIO, type EnlaceMetodo } from './metodo';
import { fechaLarga, rutaNota, type AntesDespues, type Nota } from './notas';
import { rangoDeMeses } from './periodo';
import { entero, plata, rutaProducto, unidadDeclarada } from './publico';
import { urlEnRepositorio } from './repositorio';

// ── Comunes ─────────────────────────────────────────────────────────────────

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esMonto(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
}

/**
 * Un entero no negativo. Exportado para `lib/publicoServidor.ts` y `lib/portada.ts`:
 * una sola definición de «conteo» entre los validadores.
 */
export function esConteo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

/**
 * Ausente, nula o «AAAA-MM-DD…» **que existe en el calendario**. La forma sola no
 * basta: «2023-99-01» pasaba, y el formateador de meses lanzaba `RangeError`.
 */
export function esFechaOAusente(valor: unknown): boolean {
  if (valor == null) return true;
  if (typeof valor !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

const esTextoONulo = (valor: unknown) => valor === null || typeof valor === 'string';

// ── La base de la ficha: GET /bi/sector ─────────────────────────────────────

/**
 * La forma de `GET /bi/sector` que lee la ficha (fila «Base», spec §3.5): cada
 * sector con nombre, monto, `n_oc` (conteo, o ausente en un backend anterior) y su
 * ventana. Ya no hay lectura de sectores (V2): de aquí sale la escala del dato.
 */
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
        (f.n_oc == null || esConteo(f.n_oc)) &&
        esFechaOAusente(f.ventana_desde) &&
        esFechaOAusente(f.ventana_hasta),
    )
  );
}

// ── Lectura 1: a qué precio (§3.2) ──────────────────────────────────────────

/**
 * El producto de la lectura de precio. **El nombre va escrito a mano**: la firma
 * son sus palabras ordenadas y sin relleno («impresora multifuncional» por
 * suerte se lee bien; «higiénico jumbo papel» no) y la descripción del comprador
 * puede traer marca o medidas.
 *
 * Elegido el 2026-10-16 con el precio unitario corregido y la regla de precio
 * de mercado (≥ 3 compradores, ninguno con más de la mitad; ver
 * `backend/app/services/publico/indexables.py`). En la copia local: 46 compras de
 * 40 organismos, el mayor con el 4 %, $150.921–$240.000 por unidad,
 * predictibilidad alta. Genérico, sin marca, y algo que una PYME vende. El
 * anterior, «Papel higiénico jumbo», salió porque 88 de sus 90 compras eran de
 * un solo comprador y, corregido el precio, su banda era p25 = p75 = $16.850.
 *
 * **El slug tiene copia literal en `scripts/verificar-produccion.sh`**, que
 * comprueba tras desplegar que sigue indexable y pasando el filtro;
 * `__tests__/portada-ayudantes.test.ts` falla si las dos copias se separan.
 */
export const PRODUCTO_PORTADA = {
  slug: 'impresora-multifuncional',
  nombre: 'Impresora multifuncional',
} as const;

/** Bandas que se pueden creer: con predictibilidad baja el precio no decide. */
const PREDICTIBILIDAD_CREIBLE: ReadonlySet<string> = new Set(['alta', 'media']);

/** Minúsculas, sin tildes y con un solo espacio entre palabras. */
const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');

const CLAVES_PRECIO = ['p10', 'p25', 'p50', 'p75', 'p90'] as const;

/**
 * La forma de `GET /publico/productos/{slug}` que la lectura lee, campo por
 * campo: las bandas y los compradores (cada punto del gráfico). Una unidad o una
 * predictibilidad nulas son forma válida (el backend las permite): las descarta
 * después el filtro de calidad de `lecturaPrecio`.
 */
export function esProductoPortada(datos: unknown): datos is ProductoPublico {
  if (!esObjeto(datos)) return false;
  const { periodo, unidades, compradores } = datos;
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
        (u.compradores == null || esConteo(u.compradores)) &&
        CLAVES_PRECIO.every((k) => u[k] == null || esMonto(u[k])),
    ) &&
    Array.isArray(compradores) &&
    compradores.every(
      (c) =>
        esObjeto(c) &&
        typeof c.nombre === 'string' &&
        esTextoONulo(c.unidad) &&
        (c.p50 == null || esMonto(c.p50)),
    )
  );
}

/** Una lectura de precio: la de la portada y la de la ficha de producto, con el mismo gráfico. */
export interface LecturaPrecio {
  conclusion: string;
  /**
   * A dónde lleva la conclusión («Ver el producto» es la conclusión misma: spec
   * §3.2), o `null` donde ya se está en el producto. Así el pie lleva sólo el método.
   */
  enlace: string | null;
  grafico: GraficoPrecio;
  /** La base y el método: «46 compras de 40 compradores, nov 2025 a oct 2026, precio por unidad. Cada punto…». */
  pie: string;
  enlaces: EnlaceMetodo[];
  /** Lo que el gráfico dice, en texto, para quien no lo ve: P25, P75 y cuántos compradores. */
  accesible: string[];
}

/** Los compradores de la banda que el gráfico dibuja: los de su unidad, con mediana. */
function compradoresDeLaBanda(producto: ProductoPublico, banda: BandaUnidad) {
  const unidad = unidadDeclarada(banda.unidad);
  return producto.compradores.filter((c) => unidadDeclarada(c.unidad) === unidad && c.p50 != null && c.p50 > 0);
}

/**
 * La lectura de una banda, sin filtro: lo que dice la frase, el gráfico y el pie.
 *
 * - «{nombre}: la mitad se pagó entre {p25} y {p75}», cierta por definición del
 *   rango intercuartílico;
 * - si P25 y P75 se escriben igual con `plata()`, «la mitad se pagó a {p25}» (y la
 *   franja del gráfico es una línea);
 * - con un solo comprador, «todas las compras son de {comprador}»: no hay franja
 *   que comparar.
 *
 * El pie dice de cuántas compras y de cuántos compradores sale, de cuándo y por
 * qué unidad; y si el gráfico no los dibuja a todos (la API trae los 10 que más
 * compran), lo dice.
 */
export function precioDeBanda({
  producto,
  banda,
  nombre,
  repositorio,
  enlace = null,
}: {
  producto: ProductoPublico;
  banda: BandaUnidad;
  nombre: string;
  repositorio: string | null;
  enlace?: string | null;
}): LecturaPrecio | null {
  const grafico = graficoPrecio(banda, producto.compradores);
  if (!grafico || banda.p25 == null || banda.p75 == null) return null;
  const suyos = compradoresDeLaBanda(producto, banda);
  const k = banda.compradores;
  const unSolo = k === 1;
  const igual = plata(banda.p25) === plata(banda.p75);

  const conclusion = unSolo
    ? `${nombre}: todas las compras son de ${suyos.length === 1 ? suyos[0].nombre.trim() : 'un solo comprador'}`
    : igual
      ? `${nombre}: la mitad se pagó a ${plata(banda.p25)}`
      : `${nombre}: la mitad se pagó entre ${plata(banda.p25)} y ${plata(banda.p75)}`;

  const compras = banda.n === 1 ? '1 compra' : `${entero(banda.n)} compras`;
  const deQuien = k == null ? '' : ` de ${entero(k)} ${k === 1 ? 'comprador' : 'compradores'}`;
  const periodo = rangoDeMeses(producto.periodo?.ventana_desde, producto.periodo?.ventana_hasta);
  const unidad = unidadDeclarada(banda.unidad);
  const base = [`${compras}${deQuien}`, periodo, unidad ? `precio por ${unidad}` : null].filter(Boolean).join(', ');

  const puntos = grafico.puntos.length;
  const cadaPunto =
    k != null && puntos < k ? `uno de los ${entero(puntos)} que más compran` : 'un comprador';
  const franja = igual ? 'la línea, el precio de la mitad central de las compras' : 'la franja, la mitad central de las compras';
  const metodo = unSolo
    ? 'El punto es su mediana.'
    : puntos === 0
      ? `${franja.charAt(0).toUpperCase()}${franja.slice(1)}.`
      : `Cada punto es lo que pagó ${cadaPunto} (su mediana); ${franja}.`;

  return {
    conclusion,
    enlace,
    grafico,
    pie: `${base}. ${metodo}`,
    enlaces: enlacesDeMetodo(METODO_PRECIO, {
      api: `/publico/productos/${encodeURIComponent(producto.slug)}`,
      repositorio,
    }),
    accesible: unSolo
      ? [`Precio mediano: ${plata(banda.p50 ?? banda.p25)}`]
      : [`Percentil 25: ${plata(banda.p25)}`, `Percentil 75: ${plata(banda.p75)}`, ...(k == null ? [] : [`${entero(k)} compradores`])],
  };
}

/**
 * La lectura de precio de la portada, de la unidad con más compras
 * (`unidades[0]`: la API ya las ordena por `n`). **Sólo una banda que se pueda
 * creer** (spec §3.2 de IDENTIDAD_Y_PORTADA y PR #14): un precio de mercado
 * (`de_mercado`, que decide el backend: ≥ 3 compradores y ninguno con más de la
 * mitad), unidad declarada, predictibilidad alta o media, `p25 ≥ 1`, `p75 ≥ p25`
 * y periodo. Si no, nada: mejor ninguna banda que «entre $0 y $0» o el precio del
 * contrato de un solo comprador presentado como el del Estado.
 *
 * P25 = P75 (o escritos igual) ya no oculta la lectura: con varios compradores es
 * un precio estable, y la frase dice «la mitad se pagó a $X» (spec PORTADA_V7 §3.2).
 *
 * `nombre` es el escrito a mano junto al slug; por defecto, el de `PRODUCTO_PORTADA`.
 */
export function lecturaPrecio(
  producto: ProductoPublico | null,
  repositorio: string | null,
  nombre: string = PRODUCTO_PORTADA.nombre,
): LecturaPrecio | null {
  if (!producto?.indexable) return null;
  const u = producto.unidades[0];
  if (!u || u.p25 == null || u.p75 == null || u.p25 < 1 || u.p75 < u.p25) return null;
  // Un precio «del Estado» necesita varios compradores. Sin el dato, tampoco.
  if (u.de_mercado !== true) return null;
  if (!unidadDeclarada(u.unidad)) return null;
  if (!PREDICTIBILIDAD_CREIBLE.has(normalizar(u.predictibilidad ?? ''))) return null;
  const { ventana_desde: desde, ventana_hasta: hasta } = producto.periodo ?? {};
  if (!esFechaOAusente(desde) || !esFechaOAusente(hasta) || !rangoDeMeses(desde, hasta)) return null;
  return precioDeBanda({
    producto,
    banda: u,
    nombre,
    repositorio,
    enlace: rutaProducto(producto.slug),
  });
}

// ── Lectura 2: qué cierra pronto (§3.3) ─────────────────────────────────────

/** «Las que cierran primero»: el catálogo por cierre ascendente. */
export const ORDEN_POR_CIERRE = { sort_by: 'fecha_cierre', sort_order: 'asc' } as const;

export interface TramoCierre {
  nombre: string;
  /** «1.105». */
  valor: string;
  /** Hoy y mañana, en negrita: lo que la conclusión nombra. */
  destacada: boolean;
}

export interface LecturaCierres {
  conclusion: string;
  /** Cuántas de las diez celdas van en `dato`: los décimos de «hoy o mañana», con el redondeo de la frase. */
  decimos: number;
  tramos: TramoCierre[];
  pie: string;
  enlaces: EnlaceMetodo[];
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

/** Los décimos de «hoy o mañana»: r × 10 al entero más cercano. La frase y la barra cuentan con este. */
export const decimosDe = (pronto: number, abiertas: number) => Math.round((pronto / abiertas) * 10);

/**
 * Con r = (hoy + mañana) / abiertas y N = `decimosDe`: los cinco casos de §3.5 de
 * la identidad más N = 1, que va en singular. «Ninguna» y «todas» se dicen con
 * palabras; los bordes del redondeo, con «menos de 1» y «casi todas», para no
 * decir 0 ni 10 de algo que no lo es.
 */
export function fraseCierres(pronto: number, abiertas: number): string {
  const r = pronto / abiertas;
  const n = decimosDe(pronto, abiertas);
  if (r === 0) return 'Ninguna Compra Ágil abierta cierra hoy ni mañana';
  if (r === 1) return 'Todas las Compras Ágiles abiertas cierran hoy o mañana';
  if (n === 0) return 'Menos de 1 de cada 10 Compras Ágiles abiertas cierra hoy o mañana';
  if (n === 1) return '1 de cada 10 Compras Ágiles abiertas cierra hoy o mañana';
  if (n === 10) return 'Casi todas las Compras Ágiles abiertas cierran hoy o mañana';
  return `${n} de cada 10 Compras Ágiles abiertas cierran hoy o mañana`;
}

const NOMBRES_CIERRE = ['Hoy', 'Mañana', 'En 2 o 3 días', 'Después'] as const;

/**
 * «el viernes 16 de octubre a las 11:06», en hora de Chile, o `null` si la hora
 * no se puede leer. Con el día: la portada se cachea.
 */
export function diaYHora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const instante = Date.parse(iso);
  if (!Number.isFinite(instante)) return null;
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(instante))
      .map((p) => [p.type, p.value]),
  );
  return `el ${partes.weekday} ${partes.day} de ${partes.month} a las ${partes.hour}:${partes.minute}`;
}

/**
 * Las Compras Ágiles abiertas por día de cierre. Los cuatro tramos salen de la
 * misma pasada que `compra_agil_abiertas` y suman lo mismo (lo exige un test del
 * backend): **si no suman, la respuesta no cuadra y no se publica**. Sin hora
 * legible, tampoco: el pie dice de cuándo son (principio 4).
 */
export function lecturaCierres(resumen: ResumenPortada | null, repositorio: string | null): LecturaCierres | null {
  if (!resumen) return null;
  const tramos = resumen.compra_agil_por_cierre;
  const abiertas = resumen.compra_agil_abiertas;
  if (!esPorCierre(tramos) || !esConteo(abiertas) || abiertas === 0) return null;
  const valores = [tramos.hoy, tramos.manana, tramos.dos_tres_dias, tramos.despues];
  if (valores.reduce((suma, n) => suma + n, 0) !== abiertas) return null;
  const cuando = diaYHora(resumen.actualizado_en);
  if (!cuando) return null;

  const pronto = tramos.hoy + tramos.manana;
  return {
    conclusion: fraseCierres(pronto, abiertas),
    decimos: decimosDe(pronto, abiertas),
    tramos: valores.map((n, i) => ({ nombre: NOMBRES_CIERRE[i], valor: entero(n), destacada: pronto > 0 && i < 2 })),
    // Sin el total de abiertas: la tira de cifras lo dice al lado.
    pie: `Contadas ${cuando}, por día de cierre en hora de Chile.`,
    enlaces: enlacesDeMetodo(METODO_CIERRES, {
      primero: {
        texto: 'Las que cierran primero',
        href: urlCatalogoAbiertas('compra_agil', [], ORDEN_POR_CIERRE),
        externo: false,
      },
      api: '/publico/portada',
      repositorio,
    }),
  };
}

// ── Lectura 3: la última nota de datos (§3.4) ───────────────────────────────

export interface LecturaNota {
  /** «Nota de datos, 16 de octubre de 2026». */
  antetitulo: string;
  titulo: string;
  resumen: string;
  antesDespues: AntesDespues | null;
  /** El `medido_sobre` de la nota: sobre qué datos y cuándo. */
  pie: string;
  enlaces: EnlaceMetodo[];
}

/**
 * Qué nota va en la portada: **la más reciente que trae `antes_despues`** (una
 * lectura con gráfico, como las otras dos); si ninguna lo trae, la más reciente.
 * `notas` viene de la más nueva a la más vieja (`leerNotas()`). La lista «Notas de
 * datos» de más abajo no usa esta regla: enseña las últimas en su orden.
 */
export function notaDeLaPortada(notas: Nota[]): Nota | undefined {
  return notas.find((n) => n.antes_despues !== null) ?? notas[0];
}

/**
 * La lectura de una nota (la de `notaDeLaPortada`), o `null` si no hay ninguna. Contenido
 * estático: nunca falla. Enlaces: «Leer la nota», «El script» (si lo trae y hay
 * repositorio) y «El cambio» (si lo trae).
 */
export function lecturaNota(nota: Nota | undefined, repositorio: string | null): LecturaNota | null {
  if (!nota) return null;
  const enlaces: EnlaceMetodo[] = [{ texto: 'Leer la nota', href: rutaNota(nota.slug), externo: false }];
  const script = nota.script ? urlEnRepositorio(repositorio, nota.script) : null;
  if (script) enlaces.push({ texto: 'El script', href: script, externo: true });
  if (nota.cambio) enlaces.push({ texto: 'El cambio', href: nota.cambio, externo: true });
  return {
    antetitulo: `Nota de datos, ${fechaLarga(nota.fecha)}`,
    titulo: nota.titulo,
    resumen: nota.resumen,
    antesDespues: nota.antes_despues,
    pie: nota.medido_sobre,
    enlaces,
  };
}

// ── Cuáles salen ────────────────────────────────────────────────────────────

/** Las tres lecturas; cada una, `null` si no tiene dato que pintar con verdad. */
export interface Lecturas {
  precio: LecturaPrecio | null;
  cierres: LecturaCierres | null;
  nota: LecturaNota | null;
}

/** Una lectura elegida para la portada, con su tipo: cada una se pinta distinto. */
export type LecturaDeLaPortada =
  | { tipo: 'precio'; lectura: LecturaPrecio }
  | { tipo: 'cierres'; lectura: LecturaCierres }
  | { tipo: 'nota'; lectura: LecturaNota };

/** Cuántas lecturas caben a la derecha del buscador (spec PORTADA_V7, decisión del 2026-10-17). */
export const MAXIMO_LECTURAS_PORTADA = 2;

/**
 * Qué lecturas salen en la portada: **las dos primeras disponibles en el orden
 * precio → cierres → nota**. Con todo, precio y cierres (la nota sigue en «Notas de
 * datos», más abajo); si falta una de las vivas, entra la nota; con el backend caído,
 * sólo la nota; sin ninguna, nada. Nunca más de `MAXIMO_LECTURAS_PORTADA`.
 */
export function lecturasDeLaPortada({ precio, cierres, nota }: Lecturas): LecturaDeLaPortada[] {
  const disponibles: LecturaDeLaPortada[] = [];
  if (precio) disponibles.push({ tipo: 'precio', lectura: precio });
  if (cierres) disponibles.push({ tipo: 'cierres', lectura: cierres });
  if (nota) disponibles.push({ tipo: 'nota', lectura: nota });
  return disponibles.slice(0, MAXIMO_LECTURAS_PORTADA);
}
