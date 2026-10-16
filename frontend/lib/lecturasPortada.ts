/**
 * Las tres lecturas del panel de la portada (spec docs/IDENTIDAD_Y_PORTADA_2026-10.md
 * §3.2–§3.5): quién compra, a qué precio y qué cierra pronto.
 *
 * **Cada frase sale del dato, con reglas** (D8). Las reglas viven aquí y las fija
 * `__tests__/lecturas-portada.test.ts` con sus bordes.
 *
 * Funciones puras, sin React y sin secretos. Los validadores (`esSectores`)
 * los usa `lib/publicoServidor.ts`: un 200 mal formado oculta la lectura en vez
 * de tumbar la portada. Las lecturas devuelven además `null` ante cualquier dato
 * que no se pueda pintar con verdad. **Si una lectura no tiene dato, se oculta
 * entera** (principio 4 del rediseño).
 *
 * Sin signos de exclamación en ningún texto (voz del sitio, spec §6.1).
 */

import type { SectoresBI } from '@/types/bi';

import { textoPeriodo } from './periodo';
import { plata } from './publico';

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

/** Ausente, nula o «AAAA-MM-DD…». */
function esFechaOAusente(valor: unknown): boolean {
  return valor == null || (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor));
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
export const SECTORES_SIN_BARRA: ReadonlySet<string> = new Set(['Otros', 'NA']);

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
    .filter((s) => !SECTORES_SIN_BARRA.has(s.sector.trim()))
    .slice(0, BARRAS_SECTOR);
  const [a, b] = visibles;
  if (!a || a.monto_total <= 0) return null;
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
