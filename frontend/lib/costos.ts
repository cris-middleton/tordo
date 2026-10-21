/**
 * Lo que cuesta mantener el sitio, por concepto (`/apoyar#costos`, spec del
 * rediseño R6). Lo libre se demuestra con el costo, no con adjetivos.
 *
 * **Ninguna cifra se escribe aquí sin su fuente en el repositorio**: cada fila
 * cita un fragmento LITERAL de un documento, y `__tests__/costos.test.ts`
 * comprueba que sigue ahí y que contiene la cifra. Las rutas son para quien
 * mantiene el código; la página muestra cómo se sabe cada cifra (`base`).
 *
 * - `medido`: en producción o con datos reales. Las filas de uso de Railway (API,
 *   tareas, base) salen de la lectura de *Usage* del 2026-10-15, anotada con su
 *   método y sus límites en `docs/DESPLIEGUE.md` §13.2.
 * - `estimado`: sin medición en el repositorio (hoy, sólo el dominio).
 * - `tarifa`: el precio del plan de pago.
 * - `gratuito`: un plan sin costo.
 *
 * **El total es una PROYECCIÓN de ~US$30–31, no una factura.** El plan Hobby de
 * Railway cuesta US$5 e INCLUYE US$5 de uso, así que se paga max(5, uso), no
 * 5 + uso. El uso medido es mayor que los US$5 incluidos (~US$9–10 al mes,
 * proyectado de los primeros ~2 días), así que Railway cobra el uso; Vercel Pro
 * (US$20, desde el 2026-10-20) y el dominio (~US$1) van aparte. Si Railway factura otra cosa, se anota en
 * docs/DESPLIEGUE.md (§13.2) y se cita aquí.
 *
 * **Las cifras medidas salen de los primeros 1,95 días del periodo**, con las
 * muertes por OOM del 14-10 y la primera corrida semanal dentro: por eso el
 * total se rotula proyección.
 */

export type BaseCosto = 'medido' | 'estimado' | 'tarifa' | 'gratuito';
export type IdCosto = 'railway-plan' | 'api' | 'cron' | 'postgres' | 'r2' | 'vercel' | 'dominio' | 'sentry';

export interface FuenteCosto {
  /** Ruta desde la raíz del repositorio. */
  archivo: string;
  /** Fragmento literal (los espacios y saltos de línea se normalizan al comparar). */
  cita: string;
}

export interface Costo {
  id: IdCosto;
  concepto: string;
  /** Como se muestra: «US$5», «~US$1», «< US$1». */
  monto: string;
  base: BaseCosto;
  detalle: string;
  /** La primera contiene la cifra; las demás, el detalle. */
  fuentes: [FuenteCosto, ...FuenteCosto[]];
}

const PIVOTE = 'docs/PIVOTE_PUBLICO_2026-10.md';
const DESPLIEGUE = 'docs/DESPLIEGUE.md';
const CLAUDE = 'CLAUDE.md';

export const ETIQUETA_BASE: Record<BaseCosto, string> = {
  medido: 'Medido',
  estimado: 'Estimado',
  tarifa: 'Tarifa del plan',
  gratuito: 'Plan gratuito',
};

export const COSTOS: Costo[] = [
  {
    id: 'railway-plan',
    concepto: 'Plan Hobby de Railway',
    monto: 'US$5',
    base: 'tarifa',
    detalle:
      'Incluye US$5 de uso, y Railway cobra lo que sea mayor: el plan o el uso. Las tres filas siguientes suman más de US$5, así que se paga el uso.',
    fuentes: [
      { archivo: PIVOTE, cita: 'el plan Hobby cuesta US$5 **e incluye US$5 de uso**' },
      { archivo: DESPLIEGUE, cita: 'como el uso pasa de los US$5 incluidos, la factura de Railway es el uso' },
    ],
  },
  {
    id: 'api',
    concepto: 'API (Railway)',
    monto: '~US$3,5',
    base: 'medido',
    detalle:
      'Proyectado con los primeros 2 días de uso, contando los reinicios por falta de memoria del 14 de octubre: 0,35 GB de memoria en promedio. Railway cobra la memoria que se usa.',
    fuentes: [
      { archivo: DESPLIEGUE, cita: '| api | 0,35 GB | US$0,23 | ~US$3,5 |' },
      { archivo: DESPLIEGUE, cita: 'Railway cobra la memoria **usada**, no el límite: bajarlo no ahorra.' },
    ],
  },
  {
    id: 'cron',
    concepto: 'Tareas programadas (Railway)',
    monto: '~US$1',
    base: 'medido',
    detalle:
      'Entre US$0,7 y 1,5 al mes. Una trae licitaciones y Compras Ágiles varias veces al día. La otra recalcula precios y mercados cada domingo, y la última vez tardó 15,5 minutos.',
    fuentes: [
      { archivo: DESPLIEGUE, cita: 'Las dos tareas suman ~US$1 al mes (US$0,7–1,5)' },
      { archivo: DESPLIEGUE, cita: '| cron-frecuente | 0,03 GB | US$0,02 | ~US$0,3 |' },
      { archivo: CLAUDE, cita: '7,23 GB de pico y 15,5 minutos' },
    ],
  },
  {
    id: 'postgres',
    concepto: 'Base de datos (Railway)',
    monto: '~US$4,5',
    base: 'medido',
    detalle:
      'Proyectado con los primeros 2 días de uso: 0,41 GB de memoria en promedio (~US$4,1) más el disco (~US$0,4). Guarda 1,4 GB de datos. Railway cobra unos US$10 al mes por cada GB de memoria.',
    fuentes: [
      { archivo: DESPLIEGUE, cita: '| Postgres | 0,41 GB | US$0,27 (+ US$0,03 de volumen) | ~US$4,5 |' },
      { archivo: DESPLIEGUE, cita: 'la base, **1,4 GB**' },
      { archivo: DESPLIEGUE, cita: 'Railway cobra la memoria usada (~US$10/GB-mes)' },
    ],
  },
  {
    id: 'r2',
    concepto: 'Archivos del análisis (Cloudflare R2)',
    monto: 'US$0',
    base: 'medido',
    detalle: 'Unos 4,5 GB de historia de compras, dentro de los 10 GB gratuitos.',
    fuentes: [
      { archivo: PIVOTE, cita: '| MinIO / R2 | ~$1 | $0 (≤ 10 GB) |' },
      {
        archivo: DESPLIEGUE,
        cita: 'los 39 meses, **~4,5 GB**. Cabe en la capa gratuita de 10 GB con margen.',
      },
    ],
  },
  {
    id: 'vercel',
    concepto: 'Sitio web (Vercel Pro)',
    monto: 'US$20',
    base: 'tarifa',
    detalle:
      'Incluye US$20 de uso. Lo pagamos desde el 20 de octubre de 2026: en el plan gratuito, los robots que recorren la web gastaron la cuota de caché y Vercel pausó el sitio.',
    fuentes: [
      { archivo: DESPLIEGUE, cita: 'El plan Pro de Vercel cuesta **US$20 al mes** e incluye US$20 de uso' },
      { archivo: DESPLIEGUE, cita: '### 13.4 La cuenta de Vercel, pausada por la caché (2026-10-19)' },
    ],
  },
  {
    id: 'dominio',
    concepto: 'Dominio .cl (NIC Chile)',
    monto: '~US$1',
    base: 'estimado',
    detalle: 'La dirección del sitio.',
    fuentes: [
      { archivo: PIVOTE, cita: '| Dominio .cl | — | ~$1 |' },
      { archivo: DESPLIEGUE, cita: 'Dominio `tordo.cl` registrado en NIC Chile.' },
    ],
  },
  {
    id: 'sentry',
    concepto: 'Registro de errores (Sentry)',
    monto: 'US$0',
    base: 'gratuito',
    detalle: 'Capa gratuita.',
    fuentes: [{ archivo: PIVOTE, cita: '**Sentry** (capa gratuita)' }],
  },
];

/** Lo que se dice en una frase («alrededor de US$30–31 al mes»). `/acerca` y `/apoyar` lo leen de aquí. */
export const COSTO_MENSUAL_APROXIMADO = 'US$30–31';

/** El uso de Railway proyectado (DESPLIEGUE §13.2); lo dice la fila «Total». */
export const USO_RAILWAY_PROYECTADO = 'US$9–10';

/** Lo que incluye el plan Hobby; lo dice la fila «Total». */
export const USO_INCLUIDO_EN_EL_PLAN = 'US$5';

export const TOTAL: { monto: string; detalle: string; fuentes: [FuenteCosto, ...FuenteCosto[]] } = {
  monto: `~${COSTO_MENSUAL_APROXIMADO}`,
  detalle: `Proyección con el uso de Railway de los primeros 2 días (${USO_RAILWAY_PROYECTADO} al mes, más que los ${USO_INCLUIDO_EN_EL_PLAN} que incluye el plan), más Vercel y el dominio. No es una factura completa.`,
  fuentes: [
    { archivo: DESPLIEGUE, cita: 'uso de Railway de ~US$9–10 al mes' },
    { archivo: DESPLIEGUE, cita: '**~US$30–31 al mes**' },
    { archivo: PIVOTE, cita: 'el plan Hobby cuesta US$5 **e incluye US$5 de uso**' },
  ],
};
