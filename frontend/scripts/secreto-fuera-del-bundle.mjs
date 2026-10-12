#!/usr/bin/env node
/**
 * El secreto del proxy no llega al navegador (Foco de revisión nº 2 del pivote).
 *
 *   PROXY_SECRETO=<centinela> npm run build
 *   PROXY_SECRETO=<centinela> npm run check:secreto
 *
 * `PROXY_SECRETO` es lo que exime al servidor de Next del límite por IP del
 * backend. Si acaba en el bundle, cualquiera lo lee en las herramientas del
 * navegador y se salta el límite. Y la forma de que acabe ahí no rompe nada:
 * basta con renombrarlo a `NEXT_PUBLIC_…`, declararlo en el bloque `env` de
 * `next.config.js` o importar `lib/backendServidor.ts` desde un componente
 * cliente. Por eso se mira el resultado del build, no el código.
 *
 * Se busca en todo lo que se sirve tal cual al navegador: `.next/static/**` y
 * las páginas prerenderizadas (`.next/server/app/**` en .html/.rsc/.body).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;
const centinela = process.env.PROXY_SECRETO ?? '';

if (centinela.length < 16) {
  console.error(
    'PROXY_SECRETO tiene que traer el centinela con que se construyó (≥16 caracteres).\n' +
      'Con un valor corto o vacío la búsqueda no demostraría nada.',
  );
  process.exit(2);
}

function* ficheros(dir, filtro = () => true) {
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    return;
  }
  for (const nombre of entradas) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) yield* ficheros(ruta, filtro);
    else if (filtro(ruta)) yield ruta;
  }
}

const servidos = [
  ...ficheros(join(RAIZ, '.next', 'static')),
  ...ficheros(join(RAIZ, '.next', 'server', 'app'), (r) => /\.(html|rsc|body)$/.test(r)),
];

// Guarda: sin build, o con el build en otro sitio, «no aparece» sería verdad
// sobre cero ficheros. Un build real deja cientos.
const MINIMO = 20;
if (servidos.length < MINIMO) {
  console.error(
    `Sólo ${servidos.length} ficheros servidos en .next/ (se esperaban ≥${MINIMO}). ` +
      '¿Corrió `npm run build` antes?',
  );
  process.exit(2);
}

const buscado = Buffer.from(centinela);
const filtrados = servidos.filter((r) => readFileSync(r).includes(buscado));

if (filtrados.length) {
  console.error('PROXY_SECRETO aparece en lo que se sirve al navegador:');
  for (const r of filtrados) console.error(`  ${r.slice(RAIZ.length)}`);
  process.exit(1);
}
console.log(`PROXY_SECRETO no aparece en ${servidos.length} ficheros servidos al navegador.`);
