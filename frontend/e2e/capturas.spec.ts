import { expect, test, type Page } from '@playwright/test';

/**
 * Regresión visual: la portada y `/licitaciones` a 1440 y 390 px en tema claro,
 * comparadas contra una captura guardada (`capturas.spec.ts-snapshots/`).
 * `cascara.spec.ts` y `portada.spec.ts` sacan capturas para mirarlas; esta las
 * compara, y «ya no se ve como antes» pasa a ser un fallo.
 *
 * **Sólo corre en Linux.** Playwright guarda una línea base por plataforma
 * (`-chromium-linux.png`) y el texto se rasteriza distinto en macOS. Las líneas
 * base son las del runner de CI (x86-64, Chromium instalado con
 * `playwright install --with-deps`), y salen de ahí: cómo rehacerlas está en
 * CLAUDE.md («Tests de extremo a extremo»).
 *
 * **Lo que cambia con el reloj se fija antes de capturar.** La semilla pone las
 * fechas relativas a cuando corre (`sembrar_e2e.py`), así que fechas, horas y
 * días de la semana cambian de una corrida a otra. Se reescriben en el DOM con
 * valores fijos —no se tapan: un texto más ancho puede partir una línea y mover
 * todo lo de abajo—.
 */

const ESCRITORIO = { width: 1440, height: 900 };
const MOVIL = { width: 390, height: 844 };

const PANTALLAS = [
  { ruta: '/', nombre: 'portada', listo: (p: Page) => p.getByRole('heading', { level: 1 }) },
  {
    ruta: '/licitaciones',
    nombre: 'licitaciones',
    listo: (p: Page) => p.locator('a[href^="/licitaciones/E2E-"]').first(),
  },
];

/** Reescribe en el DOM lo que depende del día y la hora en que corre la semilla. */
async function fijarElReloj(page: Page): Promise<void> {
  await page.evaluate(() => {
    const MES = '(?:ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)[a-záéíóú]*\\.?';
    const reglas: [RegExp, string][] = [
      [/\b\d{1,2}:\d{2}\b/g, '10:00'],
      [new RegExp(`\\b\\d{1,2}( de)? ${MES}`, 'gi'), '17$1 oct'],
      [/\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b/gi, 'viernes'],
      [/(^|\s)(lun|mar|mié|jue|vie|sáb|dom),/gi, '$1vie,'],
      [/\b20\d\d\b/g, '2026'],
    ];
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
      let texto = n.nodeValue ?? '';
      for (const [regla, fijo] of reglas) texto = texto.replace(regla, fijo);
      if (texto !== n.nodeValue) n.nodeValue = texto;
    }
  });
}

for (const viewport of [ESCRITORIO, MOVIL]) {
  for (const { ruta, nombre, listo } of PANTALLAS) {
    test(`captura de ${nombre} a ${viewport.width} px en tema claro`, async ({ page }) => {
      test.skip(process.platform !== 'linux', 'las líneas base son de Linux (ver la cabecera)');
      await page.setViewportSize(viewport);
      await page.goto(ruta);
      await expect(listo(page)).toBeVisible({ timeout: 15_000 });
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await fijarElReloj(page);

      await expect(page).toHaveScreenshot(`${nombre}-${viewport.width}.png`, {
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
      });
    });
  }
}
