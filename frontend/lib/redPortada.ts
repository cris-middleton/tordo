/**
 * La red de la portada: los compradores que más compran y sus proveedores, unidos
 * por lo que se compraron. Sale del bloque `red` de `GET /publico/mercado`
 * (`analytics.competitors_by_market`, agregado en Postgres).
 *
 * Aquí vive todo lo que no es React: la forma del dato (`esRed`), la frase que
 * sale de él con una regla (`fraseRed`), la disposición de los nodos y el pie.
 * La disposición es una **simulación de fuerzas que corre en el servidor**, una vez
 * por regeneración de la portada: el gráfico llega dibujado en el HTML, y el
 * navegador sólo lo mueve (`components/graficos/RedProveedores.tsx`). Es
 * determinista —mismas entradas, mismas posiciones— para que el servidor y el
 * cliente pinten lo mismo y la captura del E2E no cambie entre corridas.
 *
 * Lo fija `__tests__/red-portada.test.ts`.
 */

import type { RedPortada } from '@/types/publico';

import { monto } from './formato';
import { enlacesDeMetodo, METODO_RED, type EnlaceMetodo } from './metodo';
import { normalizeText } from './nombresChile';
import { rangoDeMeses } from './periodo';
import { entero } from './publico';
import { sectorConColor, SECTORES_CON_COLOR, type SectorConColor } from './sectores';

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const esFechaOAusente = (v: unknown) => v == null || (typeof v === 'string' && Number.isFinite(Date.parse(v)));

/** La forma del bloque. Uno mal formado oculta la red, no la portada. */
export function esRed(r: unknown): r is RedPortada {
  return (
    esObjeto(r) &&
    Array.isArray(r.compradores) &&
    r.compradores.every((c) => esObjeto(c) && esTexto(c.codigo) && esTexto(c.nombre) && esNumero(c.monto)) &&
    Array.isArray(r.proveedores) &&
    r.proveedores.every(
      (p) => esObjeto(p) && esTexto(p.codigo) && esTexto(p.nombre) && esNumero(p.monto) && esNumero(p.compradores),
    ) &&
    Array.isArray(r.enlaces) &&
    r.enlaces.every((e) => esObjeto(e) && esTexto(e.comprador) && esTexto(e.proveedor) && esNumero(e.monto)) &&
    esNumero(r.monto_total) &&
    esNumero(r.monto_compradores) &&
    esNumero(r.proveedores_total) &&
    esNumero(r.a_la_mitad_o_mas) &&
    esFechaOAusente(r.ventana_desde) &&
    esFechaOAusente(r.ventana_hasta)
  );
}

// ── La disposición ──────────────────────────────────────────────────────────

/** El lienzo, en unidades del `viewBox`. Más ancho que alto: va al lado del titular. */
export const ANCHO = 640;
export const ALTO = 420;

export interface Lienzo {
  ancho: number;
  alto: number;
}

/** Desde `lg`, al lado del titular: apaisado. */
export const LIENZO_ANCHO: Lienzo = { ancho: ANCHO, alto: ALTO };
/**
 * En el teléfono, casi cuadrado: el apaisado medía 358 × 235 px a 390 de ancho y los
 * proveedores eran puntos de un píxel. Es la misma red, dispuesta otra vez.
 */
export const LIENZO_MOVIL: Lienzo = { ancho: 400, alto: 380 };
/** Lo que se deja libre alrededor de la red. */
const MARGEN = 14;

/**
 * Hasta dónde llegan los proveedores, en fracción del anillo de los compradores. Con
 * 0,86 los proveedores de un solo comprador quedaban pegados a él y el anillo no se leía.
 */
const DENTRO = 0.8;

/** Con menos no hay red que mirar: se oculta. */
export const MINIMO_COMPRADORES = 8;

export interface NodoRed {
  /** `c:<codigo>` o `p:<codigo>`: un comprador y un proveedor pueden tener el mismo código. */
  id: string;
  tipo: 'comprador' | 'proveedor';
  nombre: string;
  monto: number;
  /** «$1,2 billones». */
  texto: string;
  /** Comprador: de cuántos de estos proveedores compra. Proveedor: a cuántos de estos compradores les vende. */
  vecinos: number;
  /** Comprador: su sector, con su color. Proveedor: null. */
  sector: SectorConColor | null;
  /** Proveedor que le vende a la mitad o más de los compradores: lo que nombra la conclusión. */
  amplio: boolean;
  x: number;
  y: number;
  r: number;
}

export interface EnlaceRed {
  /** Índices en `nodos`. */
  a: number;
  b: number;
  monto: number;
}

/** El radio por área: el doble de monto, el doble de tinta. */
function radios(montos: number[], minimo: number, maximo: number): number[] {
  const mayor = Math.max(...montos, 1);
  return montos.map((m) => minimo + (maximo - minimo) * Math.sqrt(m / mayor));
}

/**
 * Las posiciones. **Los compradores van fijos en un anillo** (una elipse que llena
 * el lienzo), agrupados por sector en el orden de `lib/sectores.ts` y, dentro de
 * cada sector, de mayor a menor. **Los proveedores se acomodan adentro** con una
 * simulación de fuerzas como la de d3-force (sin la dependencia): un resorte hacia
 * cada comprador al que le venden, repulsión entre ellos y choque por radio. Así
 * el que le vende a muchos queda al centro, tirado desde todos lados, y el que le
 * vende a uno solo queda pegado a él, en el borde: la forma ya dice la conclusión.
 *
 * ~110 proveedores y ~550 enlaces son unos pocos millones de cuentas: decenas de
 * ms, una vez por regeneración. Determinista: arranca del promedio de sus
 * compradores, sin azar.
 */
export function disponer(nodos: NodoRed[], enlaces: EnlaceRed[], { ancho, alto }: Lienzo = LIENZO_ANCHO, vueltas = 300): void {
  const cx = ancho / 2;
  const cy = alto / 2;
  const compradores = nodos
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.tipo === 'comprador')
    .sort((a, b) => {
      const sa = SECTORES_CON_COLOR.findIndex((s) => s.clave === a.d.sector?.clave);
      const sb = SECTORES_CON_COLOR.findIndex((s) => s.clave === b.d.sector?.clave);
      return sa - sb || b.d.monto - a.d.monto || a.d.id.localeCompare(b.d.id);
    });
  const radioMayor = Math.max(...compradores.map(({ d }) => d.r), 0);
  const rx = ancho / 2 - MARGEN - radioMayor;
  const ry = alto / 2 - MARGEN - radioMayor;
  // Empieza arriba y gira en el sentido del reloj; medio paso de desfase para que no
  // quede un comprador clavado en el eje.
  compradores.forEach(({ d }, k) => {
    const angulo = -Math.PI / 2 + ((k + 0.5) / compradores.length) * 2 * Math.PI;
    d.x = cx + rx * Math.cos(angulo);
    d.y = cy + ry * Math.sin(angulo);
  });

  const fijo = nodos.map((d) => d.tipo === 'comprador');
  const suyos = nodos.map(() => [] as number[]);
  for (const e of enlaces) {
    suyos[e.b].push(e.a);
    suyos[e.a].push(e.b);
  }
  // Cada proveedor arranca en el promedio de sus compradores, encogido hacia el centro.
  nodos.forEach((d, i) => {
    if (fijo[i]) return;
    const vs = suyos[i];
    const mx = vs.reduce((a, j) => a + nodos[j].x, 0) / (vs.length || 1);
    const my = vs.reduce((a, j) => a + nodos[j].y, 0) / (vs.length || 1);
    d.x = cx + (mx - cx) * 0.8;
    d.y = cy + (my - cy) * 0.8;
  });

  const n = nodos.length;
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  let alfa = 1;
  const decaimiento = 1 - Math.pow(0.001, 1 / vueltas);
  for (let vuelta = 0; vuelta < vueltas; vuelta++) {
    alfa += (0 - alfa) * decaimiento;
    // Resortes: cada proveedor quiere quedar cerca de sus compradores; con muchos, el
    // tirón se reparte y queda al medio.
    for (const e of enlaces) {
      const p = fijo[e.a] ? e.b : e.a;
      const c = fijo[e.a] ? e.a : e.b;
      if (fijo[p]) continue;
      const largo = nodos[p].r + nodos[c].r + 10;
      const dx = nodos[c].x - nodos[p].x;
      const dy = nodos[c].y - nodos[p].y;
      const l = Math.sqrt(dx * dx + dy * dy) || 1e-3;
      const fuerza = ((l - largo) / l) * alfa * (0.35 / suyos[p].length);
      vx[p] += dx * fuerza;
      vy[p] += dy * fuerza;
    }
    // Repulsión entre todos los que se mueven, y de los compradores hacia ellos.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (fijo[i] && fijo[j]) continue;
        const dx = nodos[j].x - nodos[i].x;
        const dy = nodos[j].y - nodos[i].y;
        const d2 = Math.max(dx * dx + dy * dy, 4);
        const carga = (-14 - 1.5 * (nodos[i].r + nodos[j].r)) * alfa;
        if (!fijo[i]) {
          vx[i] += (dx * carga) / d2;
          vy[i] += (dy * carga) / d2;
        }
        if (!fijo[j]) {
          vx[j] -= (dx * carga) / d2;
          vy[j] -= (dy * carga) / d2;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (fijo[i]) continue;
      vx[i] *= 0.6;
      vy[i] *= 0.6;
      nodos[i].x += vx[i];
      nodos[i].y += vy[i];
      // Nadie se sale del anillo: un proveedor queda dentro de la elipse, con aire
      // entre él y los compradores para que el anillo se lea como anillo.
      const ex = (nodos[i].x - cx) / (rx * DENTRO - nodos[i].r);
      const ey = (nodos[i].y - cy) / (ry * DENTRO - nodos[i].r);
      const fuera = ex * ex + ey * ey;
      if (fuera > 1) {
        const k = 1 / Math.sqrt(fuera);
        nodos[i].x = cx + (nodos[i].x - cx) * k;
        nodos[i].y = cy + (nodos[i].y - cy) * k;
      }
    }
    // Choque: ningún círculo encima de otro.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (fijo[i] && fijo[j]) continue;
        const dx = nodos[j].x - nodos[i].x;
        const dy = nodos[j].y - nodos[i].y;
        const minimo = nodos[i].r + nodos[j].r + 1.5;
        const d2 = dx * dx + dy * dy;
        if (d2 < minimo * minimo) {
          const d = Math.sqrt(d2) || 1e-3;
          const empuje = (minimo - d) / d;
          const [pi, pj] = fijo[i] ? [0, 1] : fijo[j] ? [1, 0] : [0.5, 0.5];
          nodos[i].x -= dx * empuje * pi;
          nodos[i].y -= dy * empuje * pi;
          nodos[j].x += dx * empuje * pj;
          nodos[j].y += dy * empuje * pj;
        }
      }
    }
  }
  for (const d of nodos) {
    d.x = Math.round(d.x * 10) / 10;
    d.y = Math.round(d.y * 10) / 10;
    d.r = Math.round(d.r * 10) / 10;
  }
}

// ── La lectura ──────────────────────────────────────────────────────────────

export interface GraficoRed {
  /** El lienzo en que se dispuso: el `viewBox`. */
  ancho: number;
  alto: number;
  nodos: NodoRed[];
  enlaces: EnlaceRed[];
  /** Los sectores que aparecen, en el orden fijo de `lib/sectores.ts`: la leyenda. */
  sectores: SectorConColor[];
  /** Cuántos compradores: el «30» de la conclusión. */
  compradores: number;
  /** Desde cuántos compradores un proveedor «le vende a la mitad o más». */
  mitad: number;
}

export interface LecturaRed {
  conclusion: string;
  /**
   * Lo que la conclusión le dice a quien vende: cuánto les vendieron, en total, los del
   * centro. «La mitad de ellos les vendió menos de $46,8 millones en total.» Con menos
   * de tres, null.
   */
  detalle: string | null;
  grafico: GraficoRed;
  /** La misma red, dispuesta en el lienzo del teléfono (`LIENZO_MOVIL`). */
  graficoMovil: GraficoRed;
  pie: string;
  /** Los proveedores que le venden a más compradores, para la tabla `sr-only`. */
  accesible: { nombre: string; vecinos: number; texto: string }[];
  enlaces: EnlaceMetodo[];
}

const cuantos = (n: number, una: string, varias: string) => `${n === 1 ? 'Uno' : entero(n)} ${n === 1 ? una : varias}`;

/**
 * «40 proveedores le venden a la mitad o más de los 30 compradores que más
 * compran.» «Comprador», no «organismo» (docs/VOZ.md §4). Una frase, y lo que
 * dice es lo que se dibuja en tinta: si el backend
 * cortó la lista (`dibujados` < `a_la_mitad_o_mas`), lo dice. Antes eran dos
 * frases y decía 40 sobre un dibujo con 12.
 */
export function fraseRed(
  r: Pick<RedPortada, 'a_la_mitad_o_mas'>,
  compradores: number,
  dibujados: number = r.a_la_mitad_o_mas,
): string {
  const quienes = `los ${entero(compradores)} compradores que más compran`;
  const n = r.a_la_mitad_o_mas;
  if (n === 0) return `Ningún proveedor le vende a la mitad de ${quienes}.`;
  const sujeto = n === 1 ? 'Un proveedor le vende' : `${entero(n)} proveedores le venden`;
  const frase = `${sujeto} a la mitad o más de ${quienes}.`;
  return dibujados < n ? `${frase} En tinta, los ${entero(dibujados)} que más venden.` : frase;
}

/**
 * La segunda frase de la red, la que sirve a una PYME: los que le venden a muchos
 * compradores, ¿son empresas enormes? La mediana de lo que les vendieron, en total, lo
 * dice. Con menos de tres en el centro no hay mediana que valga.
 */
export function detalleRed(g: Pick<GraficoRed, 'nodos'>): string | null {
  const montos = g.nodos
    .filter((d) => d.amplio)
    .map((d) => d.monto)
    .sort((a, b) => a - b);
  if (montos.length < 3) return null;
  const m = Math.floor(montos.length / 2);
  const mediana = montos.length % 2 ? montos[m] : (montos[m - 1] + montos[m]) / 2;
  // «de esos 40» y no «de ellos»: con «ellos» y «les» en la misma frase había que releer quién era quién.
  return `La mitad de esos ${entero(montos.length)} les vendió menos de ${monto(mediana)} en total.`;
}

/** Siglas por las que se conoce a los compradores más grandes, para su rótulo en el dibujo. */
const SIGLAS: [RegExp, string][] = [
  [/^Central de Abastecimiento/i, 'Cenabast'],
  [/^Junta Nacional de Auxilio Escolar/i, 'Junaeb'],
  [/^Junta Nacional de Jardines Infantiles/i, 'Junji'],
];

/**
 * El nombre corto de un comprador, para rotularlo junto a su nodo: su sigla si es
 * de los conocidos, «Municipalidad de X» sin el «Ilustre», y como mucho
 * `LARGO_ROTULO` caracteres cortados en una palabra. El nombre entero va en el globo.
 */
export const LARGO_ROTULO = 30;
export function nombreCorto(n: string): string {
  const sigla = SIGLAS.find(([patron]) => patron.test(n));
  if (sigla) return sigla[1];
  const limpio = n.replace(/^(I\.?|Ilustre)\s+Municipalidad/i, 'Municipalidad').trim();
  if (limpio.length <= LARGO_ROTULO) return limpio;
  const corte = limpio.slice(0, LARGO_ROTULO + 1).replace(/\s+\S*$/, '');
  return `${corte.replace(/\s+(de|del|la|las|los|y|e)$/i, '')}…`;
}

/** Dónde va el rótulo de un comprador, en unidades del lienzo: el punto de anclaje y hacia dónde crece la caja. */
export type Rotulo = { id: string; texto: string; x: number; y: number; lado: 'izquierda' | 'derecha' | 'arriba' };

/** Lo que mide un rótulo en el lienzo (12 px; el dibujo se ve a escala casi 1:1 desde `sm`). */
const ANCHO_LETRA = 6.6;
const ALTO_ROTULO = 16;

type Caja = { x0: number; x1: number; y0: number; y1: number };
const seCruzan = (a: Caja, b: Caja) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Los rótulos de los `cuantos` compradores de más monto, sin pisarse. Cada uno va del
 * lado de adentro de su nodo; si ahí choca con uno ya puesto o se sale del lienzo,
 * prueba encima del nodo, y si tampoco cabe se queda sin rótulo (el nombre sigue en
 * el globo). Con los datos de producción del 2026-10-22, Cenabast y el Fondo Nacional
 * de Salud quedaban uno al lado del otro arriba y sus nombres se montaban.
 */
export function rotularCompradores(nodos: NodoRed[], { ancho, alto }: Lienzo, cuantos: number): Rotulo[] {
  const puestas: Caja[] = [];
  const rotulos: Rotulo[] = [];
  const candidatos = nodos.filter((d) => d.tipo === 'comprador').sort((a, b) => b.monto - a.monto);
  for (const d of candidatos) {
    if (rotulos.length === cuantos) break;
    const texto = nombreCorto(d.nombre);
    const w = texto.length * ANCHO_LETRA + 8;
    const derecha = d.x > ancho / 2;
    const opciones: { r: Rotulo; caja: Caja }[] = [
      derecha
        ? {
            r: { id: d.id, texto, x: d.x - d.r - 3, y: d.y, lado: 'izquierda' },
            caja: { x0: d.x - d.r - 3 - w, x1: d.x - d.r - 3, y0: d.y - ALTO_ROTULO / 2, y1: d.y + ALTO_ROTULO / 2 },
          }
        : {
            r: { id: d.id, texto, x: d.x + d.r + 3, y: d.y, lado: 'derecha' },
            caja: { x0: d.x + d.r + 3, x1: d.x + d.r + 3 + w, y0: d.y - ALTO_ROTULO / 2, y1: d.y + ALTO_ROTULO / 2 },
          },
      {
        r: { id: d.id, texto, x: d.x, y: d.y - d.r - 2, lado: 'arriba' },
        caja: { x0: d.x - w / 2, x1: d.x + w / 2, y0: d.y - d.r - 2 - ALTO_ROTULO, y1: d.y - d.r - 2 },
      },
    ];
    const cabe = opciones.find(
      ({ caja }) =>
        caja.x0 >= 0 && caja.x1 <= ancho && caja.y0 >= 0 && caja.y1 <= alto && !puestas.some((p) => seCruzan(p, caja)),
    );
    if (!cabe) continue;
    puestas.push(cabe.caja);
    rotulos.push(cabe.r);
  }
  return rotulos;
}

/** El nombre tal como llega de Mercado Público, legible (`normalizeText`). */
const nombre = (texto: string) => normalizeText(texto.trim());

export function graficoRed(r: RedPortada, lienzo: Lienzo = LIENZO_ANCHO): GraficoRed | null {
  if (r.compradores.length < MINIMO_COMPRADORES || r.enlaces.length === 0) return null;
  const mitad = Math.ceil(r.compradores.length / 2);
  const rc = radios(
    r.compradores.map((c) => c.monto),
    7,
    17,
  );
  const rp = radios(
    r.proveedores.map((p) => p.monto),
    2.5,
    11,
  ).map((radio, i) => (r.proveedores[i].compradores >= mitad ? Math.max(radio, 5) : radio));
  const vecinos = new Map<string, number>();
  for (const e of r.enlaces) vecinos.set(`c:${e.comprador}`, (vecinos.get(`c:${e.comprador}`) ?? 0) + 1);

  const nodos: NodoRed[] = [
    ...r.compradores.map((c, i) => ({
      id: `c:${c.codigo}`,
      tipo: 'comprador' as const,
      nombre: nombre(c.nombre),
      monto: c.monto,
      texto: monto(c.monto),
      vecinos: vecinos.get(`c:${c.codigo}`) ?? 0,
      sector: sectorConColor(c.sector),
      amplio: false,
      x: 0,
      y: 0,
      r: rc[i],
    })),
    ...r.proveedores.map((p, i) => ({
      id: `p:${p.codigo}`,
      tipo: 'proveedor' as const,
      nombre: nombre(p.nombre),
      monto: p.monto,
      texto: monto(p.monto),
      vecinos: p.compradores,
      sector: null,
      amplio: p.compradores >= mitad,
      x: 0,
      y: 0,
      r: rp[i],
    })),
  ];
  const indice = new Map(nodos.map((d, i) => [d.id, i]));
  const enlaces: EnlaceRed[] = r.enlaces
    .map((e) => ({ a: indice.get(`c:${e.comprador}`) ?? -1, b: indice.get(`p:${e.proveedor}`) ?? -1, monto: e.monto }))
    .filter((e) => e.a >= 0 && e.b >= 0);
  if (enlaces.length === 0) return null;
  // Un proveedor sin ningún enlace a estos compradores flotaría suelto: fuera.
  const conEnlace = new Set(enlaces.flatMap((e) => [e.a, e.b]));
  const quedan = nodos.filter((_, i) => conEnlace.has(i));
  const nuevo = new Map(nodos.map((d, i) => [i, quedan.indexOf(d)]));
  const enlacesFinales = enlaces.map((e) => ({ ...e, a: nuevo.get(e.a)!, b: nuevo.get(e.b)! }));

  disponer(quedan, enlacesFinales, lienzo);
  const presentes = new Set(quedan.flatMap((d) => (d.sector ? [d.sector.clave] : [])));
  return {
    ancho: lienzo.ancho,
    alto: lienzo.alto,
    nodos: quedan,
    enlaces: enlacesFinales,
    sectores: SECTORES_CON_COLOR.filter((s) => presentes.has(s.clave)),
    compradores: r.compradores.length,
    mitad,
  };
}

export function lecturaRed(mercado: { red?: unknown } | null, repositorio: string | null): LecturaRed | null {
  const r = mercado?.red;
  if (!esRed(r)) return null;
  const grafico = graficoRed(r);
  const graficoMovil = graficoRed(r, LIENZO_MOVIL);
  if (!grafico || !graficoMovil) return null;
  const periodo = rangoDeMeses(r.ventana_desde, r.ventana_hasta);
  const parte = r.monto_total > 0 ? Math.round((r.monto_compradores / r.monto_total) * 100) : null;
  const proveedores = grafico.nodos.filter((d) => d.tipo === 'proveedor');
  return {
    conclusion: fraseRed(r, grafico.compradores, grafico.nodos.filter((d) => d.amplio).length),
    detalle: detalleRed(grafico),
    grafico,
    graficoMovil,
    pie:
      `Los ${grafico.compradores} compradores que más compraron${periodo ? ` de ${periodo}` : ''}` +
      `${parte != null ? ` (${parte} % de lo que compró el Estado)` : ''} le compraron a ${entero(r.proveedores_total)} proveedores. ` +
      'Aquí, los cuatro más grandes de cada uno y los que le venden a más de ellos. El tamaño es lo que compró o vendió. ' +
      'Sin personas naturales.',
    accesible: [...proveedores]
      .sort((a, b) => b.vecinos - a.vecinos || b.monto - a.monto)
      .slice(0, 12)
      .map((d) => ({ nombre: d.nombre, vecinos: d.vecinos, texto: d.texto })),
    enlaces: enlacesDeMetodo(METODO_RED, {
      primero: { texto: 'Los mercados por rubro', href: '/mercado', externo: false },
      api: '/publico/mercado',
      repositorio,
    }),
  };
}
