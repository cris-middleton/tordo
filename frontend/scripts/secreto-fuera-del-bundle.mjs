#!/usr/bin/env node
/**
 * Los secretos de servidor no llegan al navegador (Foco de revisión nº 2 del pivote).
 *
 *   PROXY_SECRETO=<c1> REVALIDAR_SECRETO=<c2> DONAR_TRANSFERENCIA=<c3> npm run build
 *   PROXY_SECRETO=<c1> REVALIDAR_SECRETO=<c2> DONAR_TRANSFERENCIA=<c3> npm run check:secreto
 *
 * `REVALIDAR_SECRETO` (paso 10) protege `POST /api/revalidar`: con él, cualquiera
 * vaciaría la caché de las páginas públicas y mandaría cada visita al backend.
 * Es opcional AQUÍ sólo para no romper un CI que todavía construya sin él: si
 * no viene se avisa y se busca sólo el del proxy.
 *
 * `DONAR_TRANSFERENCIA` (paso 12) no es una credencial, pero son datos
 * bancarios del dueño: `/apoyar` los pide con un clic a
 * `GET /api/apoyar/transferencia` y no los lleva en su HTML. Si la página
 * pasara a leerlos en el render, o la ruta se prerenderizara en el build,
 * acabarían en `.next/server/app/` — y aquí se ve.
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
const OBLIGATORIOS = ['PROXY_SECRETO', 'REVALIDAR_SECRETO', 'DONAR_TRANSFERENCIA'];
const OPCIONALES = [];

const secretos = [];
for (const nombre of [...OBLIGATORIOS, ...OPCIONALES]) {
  const valor = process.env[nombre] ?? '';
  if (!valor && OPCIONALES.includes(nombre)) {
    console.warn(`${nombre} no viene: no se busca (constrúyelo con un centinela para comprobarlo).`);
    continue;
  }
  if (valor.length < 16) {
    console.error(
      `${nombre} tiene que traer el centinela con que se construyó (≥16 caracteres).\n` +
        'Con un valor corto o vacío la búsqueda no demostraría nada.',
    );
    process.exit(2);
  }
  secretos.push([nombre, Buffer.from(valor)]);
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

let filtrado = false;
const contenidos = servidos.map((r) => [r, readFileSync(r)]);
for (const [nombre, buscado] of secretos) {
  const donde = contenidos.filter(([, datos]) => datos.includes(buscado)).map(([r]) => r);
  if (donde.length) {
    filtrado = true;
    console.error(`${nombre} aparece en lo que se sirve al navegador:`);
    for (const r of donde) console.error(`  ${r.slice(RAIZ.length)}`);
  } else {
    console.log(`${nombre} no aparece en ${servidos.length} ficheros servidos al navegador.`);
  }
}
if (filtrado) process.exit(1);
