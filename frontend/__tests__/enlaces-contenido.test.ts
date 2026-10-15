import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Los enlaces dentro de un texto corrido van subrayados, con la clase `.enlace`
 * (docs/REDISENO_PUBLICO_2026-10.md §5.2): es la señal más fuerte de «hipertexto,
 * no aplicación», y sin subrayado un enlace en un párrafo sólo se distingue por
 * el color (WCAG 1.4.1). La navegación, las tarjetas y los botones NO llevan
 * subrayado.
 *
 * Cómo se reconoce un enlace «en texto corrido»: Prettier escribe el espacio
 * que lo separa de la palabra anterior como `{' '}`, al final de la línea de
 * antes o justo delante en la misma. Un enlace sin `className` vale: lo pinta su
 * contenedor (`DocumentoLegal` subraya todo `a` de su cuerpo).
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

/** Enlaces en texto corrido que no son contenido, y por qué. Clave: fichero + un trozo de la línea. */
const EXCEPCIONES: { archivo: string; contiene: string; motivo: string }[] = [
  {
    archivo: "components/portada/Portada.tsx",
    contiene: "CORREO_CONTACTO",
    motivo:
      "el «Contacto» del pie: navegación. Se va con el pie único (PR 4 del rediseño).",
  },
];

const ESPACIO = /\{' '\}\s*$/;
const ENLACE = /^\s*<(Link|a)(?:[\s>]|$)/;
const MISMA_LINEA = /\{' '\}<(Link|a)(?:[\s>]|$)/;

type Enlace = {
  donde: string;
  archivo: string;
  linea: string;
  etiqueta: string;
};

/** La etiqueta de apertura entera —Prettier la parte en varias líneas—, hasta su `>` (no el de `=>`). */
function etiquetaDeApertura(
  lineas: string[],
  i: number,
  desde: number,
): string {
  let texto = "";
  for (let j = i; j < Math.min(lineas.length, i + 15); j++) {
    texto += (j === i ? lineas[j].slice(desde) : lineas[j]) + "\n";
    const cierre = texto.search(/(?<!=)>/);
    if (cierre !== -1) return texto.slice(0, cierre + 1);
  }
  return texto;
}

/** Los enlaces en texto corrido de un fichero. Separada del disco para poder probarla con un texto. */
function enlacesDe(archivo: string, fuente: string): Enlace[] {
  const salida: Enlace[] = [];
  const lineas = fuente.split("\n");
  lineas.forEach((linea, i) => {
    const mismaLinea = MISMA_LINEA.exec(linea);
    const aparte = i > 0 && ESPACIO.test(lineas[i - 1]) && ENLACE.test(linea);
    if (!mismaLinea && !aparte) return;
    const desde = mismaLinea ? linea.indexOf("<", mismaLinea.index) : 0;
    salida.push({
      donde: `${archivo}:${i + 1}`,
      archivo,
      linea,
      etiqueta: etiquetaDeApertura(lineas, i, desde),
    });
  });
  return salida;
}

function enlacesEnTexto(): Enlace[] {
  return ["app", "components"]
    .flatMap((c) => archivosTsx(join(RAIZ, c)))
    .flatMap((ruta) =>
      enlacesDe(relative(RAIZ, ruta), readFileSync(ruta, "utf8")),
    );
}

/** Con `className` y sin la clase `enlace`: lo que el test exige corregir. */
const sinClaseEnlace = (e: Enlace) =>
  /className=/.test(e.etiqueta) &&
  !/className="[^"]*\benlace\b/.test(e.etiqueta);

describe("enlaces del contenido", () => {
  it("guarda: el recorrido encuentra los enlaces en texto corrido", () => {
    // Medido el 2026-10-14: diez. Si baja de ocho, la heurística dejó de reconocerlos.
    expect(enlacesEnTexto().length).toBeGreaterThanOrEqual(8);
  });

  it("todo enlace en texto corrido lleva la clase enlace (o ninguna clase)", () => {
    const infractores = enlacesEnTexto()
      .filter(
        (e) =>
          !EXCEPCIONES.some(
            (x) => x.archivo === e.archivo && e.linea.includes(x.contiene),
          ),
      )
      .filter(sinClaseEnlace)
      .map((e) => e.donde);
    expect(
      infractores,
      `Usa className="enlace":\n  ${infractores.join("\n  ")}`,
    ).toEqual([]);
  });

  it("lee la etiqueta de apertura entera, también partida en varias líneas", () => {
    const partido = [
      "<p>",
      "  Lee la guía{' '}",
      "  <Link",
      '    href="/guias/x"',
      '    className="font-medium text-primary hover:underline"',
      "  >",
      "    aquí",
      "  </Link>",
      "</p>",
    ].join("\n");
    const [e, ...resto] = enlacesDe("fixture.tsx", partido);
    expect(resto).toEqual([]);
    expect(sinClaseEnlace(e)).toBe(true);
    expect(
      sinClaseEnlace(
        enlacesDe(
          "fixture.tsx",
          partido.replace("font-medium text-primary hover:underline", "enlace"),
        )[0],
      ),
    ).toBe(false);
    // y en la misma línea
    const unaLinea = `<p>Mira{' '}<a href="/x" className="text-primary">esto</a></p>`;
    expect(sinClaseEnlace(enlacesDe("fixture.tsx", unaLinea)[0])).toBe(true);
  });

  it("los enlaces de las guías usan la clase enlace", () => {
    const markdown = readFileSync(
      join(RAIZ, "components", "guias", "Markdown.tsx"),
      "utf8",
    );
    expect(markdown).toMatch(/const clase = 'enlace';/);
  });

  it(".enlace subraya", () => {
    const css = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.enlace\s*\{[^}]*@apply[^;}]*\bunderline(?![-\w])/);
  });
});
