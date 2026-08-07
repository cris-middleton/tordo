import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de extremo a extremo.
 *
 * Prueban lo que ninguna otra capa puede: que un navegador de verdad, con su
 * propio almacenamiento y sus cookies, no pueda leer la sesión. El resto de la
 * suite comprueba que el servidor pone `httpOnly` — sólo un navegador comprueba
 * que eso sirve para algo.
 *
 * **No levanta nada**: la pila entera —Postgres, migraciones, semilla, backend y
 * Next— la monta `scripts/e2e.sh`. Que Playwright arrancara el servidor no
 * serviría de mucho aquí, porque el navegador corre dentro de un contenedor
 * (`mcr.microsoft.com/playwright`) y no puede lanzar procesos del host.
 *
 * El contenedor evita depender de librerías del sistema —`playwright install
 * --with-deps` pide sudo— y de paso fija la misma versión de navegador en local
 * y en CI, que es la mitad de "en mi máquina pasa".
 */

const PUERTO = Number(process.env.E2E_PUERTO_FRONT ?? 3210);

// `localhost` y no el nombre del host: las cookies de sesión son `Secure`, y un
// navegador las DESCARTA en un origen que no considera de confianza.
// `http://localhost` es la excepción que la especificación reconoce como
// potencialmente segura; `http://host.docker.internal` no lo es — con ella el
// login devuelve 200, no se guarda nada y el test falla sin decir por qué.
//
// Por eso el servidor de Next corre DENTRO del mismo contenedor que el
// navegador. Es también lo que evita tener que montar un terminador TLS o
// pasarle a Chrome banderas que relajan su modelo de seguridad justo en los
// tests que existen para comprobarlo.
const BASE = `http://localhost:${PUERTO}`;

export default defineConfig({
  testDir: './e2e',
  // Sin paralelismo entre ficheros: comparten una sola base sembrada, y dos
  // tests invitando al mismo colega a la vez se pisan.
  workers: 1,
  fullyParallel: false,
  // En CI un `.only` olvidado haría pasar la suite ejecutando un solo test.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE,
    // Sólo al reintentar: en verde no sirven de nada y ocupan.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // El servidor STANDALONE, no `next dev` ni `next start`:
    //
    //  - En dev, Next compila cada ruta al primer acceso y el primer test se
    //    come el timeout.
    //  - `next start` ignora `-H` y escucha sólo en `::`.
    //  - Y es, literalmente, lo que corre la imagen de producción.
    //
    // El build lo hace `scripts/e2e.sh` fuera del contenedor; aquí sólo se
    // arranca lo ya construido.
    command: `HOSTNAME=0.0.0.0 PORT=${PUERTO} node .next/standalone/server.js`,
    url: `${BASE}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    // El backend sí vive en el host: esta llamada la hace el servidor de Next,
    // no el navegador, así que no tiene nada que ver con el origen.
    env: { API_URL: process.env.API_URL ?? 'http://host.docker.internal:8210' },
  },
});
