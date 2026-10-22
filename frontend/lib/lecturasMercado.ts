/**
 * Las lecturas de mercado de la portada: cuánto compra el Estado mes a mes, por
 * sector, y cuánto se lo lleva un solo proveedor. Salen de `GET /publico/mercado`
 * (las tablas `analytics.time_series` y `analytics.market_concentration`).
 *
 * Como en `lib/lecturasPortada.ts`: **cada frase sale del dato con una regla**,
 * fijada en `__tests__/lecturas-mercado.test.ts`, y **una lectura sin su dato se
 * oculta entera**. `esMercadoPortada` valida la forma: un 200 mal formado oculta
 * las lecturas en vez de tumbar la portada.
 */

import type { ConcentracionMercados, GastoMensual, MercadoPortada } from '@/types/publico';

import { monto } from './formato';
import { graficoGasto, veces, type GraficoGasto } from './graficoGasto';
import { esFechaOAusente } from './lecturasPortada';
import { rangoDeMeses } from './periodo';
import { enlacesDeMetodo, METODO_CONCENTRACION, METODO_GASTO, type EnlaceMetodo } from './metodo';
import { entero } from './publico';

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function esFilaGasto(f: unknown): f is GastoMensual {
  return (
    esObjeto(f) &&
    Number.isInteger(f.anio) &&
    Number.isInteger(f.mes) &&
    typeof f.sector === 'string' &&
    esNumero(f.monto)
  );
}

function esConcentracion(c: unknown): c is ConcentracionMercados {
  return (
    esObjeto(c) &&
    esNumero(c.mercados) &&
    esNumero(c.sobre_la_mitad) &&
    esNumero(c.un_proveedor) &&
    esNumero(c.monto_total) &&
    esNumero(c.monto_sobre_la_mitad) &&
    Array.isArray(c.tramos) &&
    c.tramos.every((t) => esObjeto(t) && esNumero(t.desde) && esNumero(t.hasta) && esNumero(t.mercados) && esNumero(t.monto)) &&
    esFechaOAusente(c.ventana_desde) &&
    esFechaOAusente(c.ventana_hasta)
  );
}

/** La forma de `GET /publico/mercado`. Cada bloque puede ser `null` (sin su tabla). */
export function esMercadoPortada(datos: unknown): datos is MercadoPortada {
  if (!esObjeto(datos)) return false;
  const { gasto_mensual: g, concentracion: c } = datos;
  return (g === null || (Array.isArray(g) && g.every(esFilaGasto))) && (c === null || esConcentracion(c));
}

// ── Gasto mensual ───────────────────────────────────────────────────────────

/** Desde cuántas veces un mes típico se dice que un mes «sobresale». */
export const VECES_PICO = 1.25;

export interface LecturaGasto {
  conclusion: string;
  grafico: GraficoGasto;
  pie: string;
  enlaces: EnlaceMetodo[];
}

/**
 * «El Estado compró $31,7 billones en 36 meses. Diciembre de 2025 fue el mes más
 * alto: 1,6 veces un mes típico.» El mes típico es la mediana de los meses. Si
 * ningún mes llega a `VECES_PICO` veces el típico, se dice que compra parejo.
 */
export function fraseGasto(g: GraficoGasto): string {
  const primera = `El Estado compró ${monto(g.total)} en ${g.meses.length} meses.`;
  if (g.veces >= VECES_PICO) {
    const mes = g.pico.largo.charAt(0).toUpperCase() + g.pico.largo.slice(1);
    return `${primera} ${mes} fue el mes más alto: ${veces(g.veces)} un mes típico.`;
  }
  return `${primera} Compra parejo: ningún mes pasa de ${veces(g.veces)} un mes típico.`;
}

export function lecturaGasto(
  mercado: MercadoPortada | null,
  repositorio: string | null,
  ahora?: number,
): LecturaGasto | null {
  const grafico = graficoGasto(mercado?.gasto_mensual, ahora);
  if (!grafico) return null;
  const desde = grafico.meses[0].etiqueta;
  const hasta = grafico.meses.at(-1)!.etiqueta;
  return {
    conclusion: fraseGasto(grafico),
    grafico,
    pie:
      // Sin el número de órdenes: `time_series` cuenta las órdenes únicas de cada rubro, y una
      // orden con líneas de dos rubros se contaba dos veces al sumar (7,1 millones contra los
      // 5,5 de la ficha). El monto no tiene ese problema: va repartido por línea.
      // «Por mes», sin decir de qué fecha: hasta la semanal del 25-10 es el mes de envío, y
      // desde ella el de creación (#57). Lo dice la guía de «Cómo se calcula».
      `Órdenes de compra de ${desde} a ${hasta}, por mes y sector del comprador. ` +
      'Un mes típico es la mediana: la mitad de los meses compró menos y la otra mitad, más. ' +
      'Las obras del MOP casi no pasan por órdenes de compra, así que aquí casi no están.',
    enlaces: enlacesDeMetodo(METODO_GASTO, {
      primero: { texto: 'Los mercados por rubro', href: '/mercado', externo: false },
      api: '/publico/mercado',
      repositorio,
    }),
  };
}

// ── Concentración ───────────────────────────────────────────────────────────

export interface TramoGrafico {
  desde: number;
  /** «Entre 50 % y 60 %». */
  rotulo: string;
  textoMonto: string;
  textoMercados: string;
  /** Alto de la columna, en % del tramo de más monto. */
  alto: number;
  /** El tramo está en la conclusión: el proveedor principal se lleva la mitad o más. */
  destacado: boolean;
}

export interface GraficoConcentracion {
  tramos: TramoGrafico[];
}

export interface LecturaConcentracion {
  conclusion: string;
  grafico: GraficoConcentracion;
  pie: string;
  enlaces: EnlaceMetodo[];
}

/** De cada 10 pesos, cuántos van a mercados donde un proveedor se lleva la mitad o más. Con el redondeo de la frase. */
export const pesosDeCadaDiez = (parte: number) => Math.round(parte * 10);

/**
 * «5 de cada 10 pesos se gastan en mercados donde un solo proveedor se lleva la
 * mitad o más.» Los bordes del redondeo con palabras, como en los cierres: nunca
 * «0 de cada 10» ni «10 de cada 10» de algo que no lo es.
 */
export function fraseConcentracion(parte: number): string {
  const n = pesosDeCadaDiez(parte);
  const cola = 'se gastan en mercados donde un solo proveedor se lleva la mitad o más';
  if (parte === 0) return 'Ningún mercado tiene un proveedor que se lleve la mitad o más';
  if (n === 0) return `Menos de 1 de cada 10 pesos ${cola}`;
  if (n === 10) return `Casi todo el monto ${cola.replace('se gastan', 'se gasta')}`;
  if (n === 1) return `1 de cada 10 pesos ${cola.replace('se gastan', 'se gasta')}`;
  return `${n} de cada 10 pesos ${cola}`;
}

export function lecturaConcentracion(mercado: MercadoPortada | null, repositorio: string | null): LecturaConcentracion | null {
  const c = mercado?.concentracion;
  if (!c || c.tramos.length === 0 || !(c.monto_total > 0) || c.mercados === 0) return null;
  const maximo = Math.max(...c.tramos.map((t) => t.monto));
  if (!(maximo > 0)) return null;
  const parte = c.monto_sobre_la_mitad / c.monto_total;
  const periodo = rangoDeMeses(c.ventana_desde, c.ventana_hasta);
  const tramos = [...c.tramos]
    .sort((a, b) => a.desde - b.desde)
    .map((t) => ({
      desde: t.desde,
      rotulo: `Entre ${entero(t.desde)} % y ${entero(t.hasta)} %`,
      textoMonto: monto(t.monto),
      textoMercados: entero(t.mercados),
      alto: (t.monto / maximo) * 100,
      destacado: t.desde >= 50,
    }));
  return {
    conclusion: fraseConcentracion(parte),
    grafico: { tramos },
    pie:
      `${entero(c.mercados)} mercados${periodo ? `, ${periodo}` : ''}: cada uno es lo que un comprador compra en un rubro. ` +
      `La altura es lo que se compró en ellos; el tramo, cuánto se lleva el proveedor que más vende. ` +
      `En ${entero(c.un_proveedor)} de ellos hay un solo proveedor.`,
    enlaces: enlacesDeMetodo(METODO_CONCENTRACION, {
      primero: { texto: 'Los mercados por rubro', href: '/mercado', externo: false },
      api: '/publico/mercado',
      repositorio,
    }),
  };
}
