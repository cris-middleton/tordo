import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { CODIGO_VALVULAS } from './datos';

/**
 * Accesibilidad con axe sobre el DOM pintado: lo que el test de tokens
 * (`__tests__/contraste-wcag.test.ts`) no ve —contraste de texto sobre un fondo
 * compuesto, nombres accesibles, estructura de encabezados, ARIA mal puesto—.
 *
 * Reglas de WCAG 2.0 y 2.1, niveles A y AA, en cada página del sitio que lee un
 * visitante, en claro y en oscuro, a 1440 y a 390 px. Una violación hace fallar
 * el test con la regla, el elemento y lo que axe midió.
 *
 * **Si axe marca algo, se arregla en el componente** (o en el token, si es
 * contraste). Una exclusión va en `EXCLUSIONES`, con la regla, el selector
 * EXACTO del elemento y el motivo: nunca una regla entera para todo el sitio.
 */

const ESCRITORIO = { width: 1440, height: 900 };
const MOVIL = { width: 390, height: 844 };

const ETIQUETAS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const PAGINAS: { ruta: string; nombre: string; estado?: number }[] = [
  { ruta: '/', nombre: 'portada' },
  { ruta: '/licitaciones', nombre: 'licitaciones' },
  { ruta: `/licitaciones/${CODIGO_VALVULAS}`, nombre: 'una licitación' },
  { ruta: '/compra-agil', nombre: 'compra ágil' },
  // No está en la lista del encargo, pero es la pantalla con más controles del sitio.
  { ruta: '/mercado', nombre: 'mercados' },
  { ruta: '/productos', nombre: 'productos' },
  { ruta: '/notas', nombre: 'notas' },
  { ruta: '/notas/precio-unitario-dividido-dos-veces', nombre: 'una nota' },
  { ruta: '/guias', nombre: 'guías' },
  { ruta: '/guias/como-leer-una-banda-de-precio', nombre: 'una guía' },
  { ruta: '/acerca', nombre: 'acerca' },
  { ruta: '/apoyar', nombre: 'apoyar' },
  { ruta: '/abierto', nombre: 'abierto' },
  { ruta: '/no-existe-e2e', nombre: '404', estado: 404 },
];

/**
 * Lo que axe marca y no se arregla, cada cosa con su motivo. Vacía a propósito
 * mientras no haga falta: una entrada nueva necesita la regla, el selector tal
 * como lo imprime axe y por qué no es un fallo real.
 */
const EXCLUSIONES: { regla: string; selector: string; motivo: string }[] = [];

function excluida(regla: string, selector: string): boolean {
  return EXCLUSIONES.some((e) => e.regla === regla && e.selector === selector);
}

async function analizar(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(ETIQUETAS_WCAG).analyze();
  const fallos: string[] = [];
  for (const v of violations) {
    for (const nodo of v.nodes) {
      const selector = nodo.target.join(' ');
      if (excluida(v.id, selector)) continue;
      fallos.push(`[${v.id}] ${v.help}\n    ${selector}\n    ${nodo.failureSummary?.replace(/\n/g, '\n    ') ?? ''}`);
    }
  }
  return fallos;
}

for (const tema of ['claro', 'oscuro'] as const) {
  for (const viewport of [ESCRITORIO, MOVIL]) {
    for (const { ruta, nombre, estado } of PAGINAS) {
      test(`axe: ${nombre} (${ruta}) a ${viewport.width} px en tema ${tema}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        if (tema === 'oscuro') {
          await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
        }
        const respuesta = await page.goto(ruta);
        expect(respuesta?.status()).toBe(estado ?? 200);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
        await page.waitForLoadState('networkidle');
        if (tema === 'oscuro') await expect(page.locator('html')).toHaveClass(/\bdark\b/);
        else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

        const fallos = await analizar(page);
        expect(fallos, `axe encontró ${fallos.length}:\n${fallos.join('\n')}`).toEqual([]);
      });
    }
  }
}
