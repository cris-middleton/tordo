import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Todo `<select>` tiene nombre accesible (WCAG 4.1.2). Un lector de pantalla
 * anuncia «cuadro combinado, Publicación» sin decir que eso es el orden. Lo
 * encontró axe (`e2e/accesibilidad.spec.ts`) en los tres selectores del
 * catálogo; este test cubre también los que axe no ve porque no se pintan al
 * abrir la página (las pestañas de herramientas de `/mercado`).
 *
 * Vale `aria-label`, `aria-labelledby` o un `id` al que apunte un
 * `<label htmlFor>` del mismo fichero. Un `<label>` sin `htmlFor` al lado no
 * vale: queda junto al campo en pantalla, pero no lo nombra.
 */

const RAIZ = join(__dirname, "..");

function archivosTsx(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosTsx(ruta));
    else if (ruta.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

/** La etiqueta de apertura, hasta su `>` (no el de `=>`). */
function etiqueta(texto: string, desde: number): string {
  const resto = texto.slice(desde);
  const cierre = resto.search(/(?<!=)>/);
  return cierre === -1 ? resto : resto.slice(0, cierre + 1);
}

function sinNombre(): string[] {
  const malos: string[] = [];
  for (const archivo of [...archivosTsx(join(RAIZ, "app")), ...archivosTsx(join(RAIZ, "components"))]) {
    const texto = readFileSync(archivo, "utf8");
    for (const m of texto.matchAll(/<select\b/g)) {
      const tag = etiqueta(texto, m.index!);
      if (/\saria-label(ledby)?=/.test(tag)) continue;
      const id = tag.match(/\sid=(\{[^}]+\}|"[^"]+")/)?.[1];
      if (id && texto.includes(`htmlFor=${id}`)) continue;
      const linea = texto.slice(0, m.index).split("\n").length;
      malos.push(`${relative(RAIZ, archivo)}:${linea}`);
    }
  }
  return malos;
}

describe("los selectores", () => {
  it("tienen nombre accesible", () => {
    expect(sinNombre()).toEqual([]);
  });

  it("el recorrido encuentra los selectores (guarda contra comprobar el vacío)", () => {
    const total = [...archivosTsx(join(RAIZ, "app")), ...archivosTsx(join(RAIZ, "components"))]
      .map((a) => readFileSync(a, "utf8").match(/<select\b/g)?.length ?? 0)
      .reduce((a, b) => a + b, 0);
    // 12 el 2026-10-17: tres en el catálogo y nueve en /mercado.
    expect(total).toBeGreaterThanOrEqual(10);
  });
});
