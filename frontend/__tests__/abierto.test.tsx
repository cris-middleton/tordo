/**
 * `/abierto` (spec del rediseño §6.5). Esta parte fija `lib/abierto.ts`:
 *   1. la URL del MCP lleva SIEMPRE la barra final, en cada caja de instalación;
 *   2. el enlace profundo de Cursor lleva el base64 exacto de {"url": URL_MCP};
 *   3. la dirección pública de la API se escribe en UN solo fichero.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HERRAMIENTAS_MCP,
  LIMITE_POR_MINUTO,
  URL_DOCS_API,
  URL_MCP,
  configCursorBase64,
  ejemploCurl,
  enlaceCursor,
  idServidorMcp,
  instalacionesMcp,
} from '@/lib/abierto';
import { Cabecera } from '@/components/cascara/Cabecera';
import { PieSitio } from '@/components/cascara/PieSitio';
import PaginaAbierto, { metadata } from '@/app/(publico)/abierto/page';
import PaginaPrivacidad from '@/app/privacidad/page';
import PaginaTerminos from '@/app/terminos/page';
import { PAGINAS_FIJAS } from '@/lib/publico';

vi.mock('next/navigation', () => ({
  usePathname: () => '/licitaciones',
}));

const BASE64 = 'eyJ1cmwiOiJodHRwczovL2FwaS50b3Jkby5jbC9tY3AvIn0=';

describe('lib/abierto', () => {
  it('la URL del MCP es la canónica, con barra final', () => {
    expect(URL_MCP).toBe('https://api.tordo.cl/mcp/');
    expect(URL_DOCS_API).toBe('https://api.tordo.cl/docs');
  });

  it('el identificador del servidor sale del nombre del sitio', () => {
    expect(idServidorMcp('Tordo')).toBe('tordo');
    expect(idServidorMcp('Tórdo Chile')).toBe('tordo-chile');
  });

  it('Cursor: base64 exacto y escapado en la URL', () => {
    expect(configCursorBase64()).toBe(BASE64);
    expect(JSON.parse(atob(configCursorBase64()))).toEqual({ url: URL_MCP });
    expect(enlaceCursor('Tordo')).toBe(
      `cursor://anysphere.cursor-deeplink/mcp/install?name=Tordo&config=${BASE64.replace('=', '%3D')}`,
    );
  });

  it('cada caja, con la URL con barra', () => {
    const cajas = instalacionesMcp('Tordo');
    expect(cajas.map((c) => c.id)).toEqual(['claude-code', 'claude', 'chatgpt', 'cursor', 'vscode']);
    const porId = Object.fromEntries(cajas.map((c) => [c.id, c]));
    expect(porId['claude-code'].codigo).toBe('claude mcp add --transport http tordo https://api.tordo.cl/mcp/');
    expect(porId.claude.codigo).toBe(URL_MCP);
    expect(porId.chatgpt.codigo).toBe(URL_MCP);
    expect(porId.cursor.enlace?.href).toBe(enlaceCursor('Tordo'));
    expect(JSON.parse(porId.vscode.codigo!)).toEqual({
      servers: { tordo: { type: 'http', url: 'https://api.tordo.cl/mcp/' } },
    });
    for (const caja of cajas) {
      const texto = [caja.codigo ?? '', ...caja.pasos].join('\n');
      expect(texto).not.toMatch(/api\.tordo\.cl\/mcp(?!\/)/);
    }
  });

  it('las cuatro herramientas, con su línea', () => {
    expect(HERRAMIENTAS_MCP.map((h) => h.nombre)).toEqual([
      'panel_de_licitacion',
      'precio_de_producto',
      'perfil_de_comprador',
      'buscar_productos',
    ]);
    for (const h of HERRAMIENTAS_MCP) expect(h.descripcion.length).toBeGreaterThan(20);
  });

  it('el curl de ejemplo va a la API versionada y con barra en la colección', () => {
    expect(ejemploCurl()).toBe(
      'curl "https://api.tordo.cl/api/v1/tenders/?tipo_convocatoria=compra_agil&limit=5"',
    );
  });
});

describe('la dirección pública de la API, en un solo sitio', () => {
  const RAIZ = join(__dirname, '..');
  function fuentes(dir: string): string[] {
    return readdirSync(dir).flatMap((e) => {
      const r = join(dir, e);
      if (statSync(r).isDirectory()) return fuentes(r);
      return /\.(tsx?|mdx?)$/.test(r) ? [r] : [];
    });
  }

  it('sólo lib/abierto.ts escribe api.tordo.cl', () => {
    const todos = ['app', 'components', 'hooks', 'lib', 'content'].flatMap((d) => fuentes(join(RAIZ, d)));
    expect(todos.length).toBeGreaterThan(50);
    const conLaDireccion = todos
      .filter((r) => readFileSync(r, 'utf-8').includes('api.tordo.cl'))
      .map((r) => relative(RAIZ, r).split('\\').join('/'));
    expect(conLaDireccion).toEqual(['lib/abierto.ts']);
  });
});

describe('la página /abierto', () => {
  afterEach(() => {
    delete process.env.REPOSITORIO_URL;
  });

  it('es indexable, con canonical y en el sitemap', () => {
    expect(metadata.alternates?.canonical).toBe('/abierto');
    expect(metadata.robots).toBeUndefined();
    expect(PAGINAS_FIJAS).toContain('/abierto');
  });

  it('un h1 y las cinco anclas', () => {
    const { container } = render(<PaginaAbierto />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const ancla of ['api', 'mcp', 'datos', 'codigo', 'licencias']) {
      expect(container.querySelector(`section#${ancla}`)).not.toBeNull();
    }
  });

  it('la URL del MCP, siempre con barra; las cuatro herramientas', () => {
    const { container } = render(<PaginaAbierto />);
    expect(screen.getByLabelText('URL del servidor MCP')).toHaveTextContent('https://api.tordo.cl/mcp/');
    expect(container.innerHTML).not.toMatch(/api\.tordo\.cl\/mcp(?!\/)/);
    const mcp = container.querySelector('section#mcp') as HTMLElement;
    for (const h of HERRAMIENTAS_MCP) expect(within(mcp).getByText(h.nombre)).toBeInTheDocument();
    expect(within(mcp).getByRole('link', { name: /añadir .* a cursor/i })).toHaveAttribute(
      'href',
      enlaceCursor(process.env.NEXT_PUBLIC_APP_NAME || 'Tordo'),
    );
  });

  it('la API: documentación, límite y curl', () => {
    render(<PaginaAbierto />);
    expect(screen.getByRole('link', { name: URL_DOCS_API })).toHaveAttribute('href', URL_DOCS_API);
    expect(screen.getAllByText(/60 peticiones por minuto/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Ejemplo con curl')).toHaveTextContent(ejemploCurl());
  });

  it('sin REPOSITORIO_URL, «Código» no enlaza nada y lo dice', () => {
    const { container } = render(<PaginaAbierto />);
    const codigo = container.querySelector('section#codigo') as HTMLElement;
    expect(within(codigo).getByText(/todavía no está publicado/i)).toBeInTheDocument();
    expect(within(codigo).queryByRole('link', { name: /github|repositorio/i })).toBeNull();
  });

  it('con REPOSITORIO_URL https, lo enlaza; con http, no', () => {
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    const { container, unmount } = render(<PaginaAbierto />);
    const codigo = container.querySelector('section#codigo') as HTMLElement;
    expect(within(codigo).getByRole('link', { name: 'https://github.com/x/tordo' })).toHaveAttribute(
      'href',
      'https://github.com/x/tordo',
    );
    unmount();

    process.env.REPOSITORIO_URL = 'http://github.com/x/tordo';
    const otra = render(<PaginaAbierto />).container.querySelector('section#codigo') as HTMLElement;
    expect(within(otra).queryByRole('link', { name: /github\.com/ })).toBeNull();
  });

  it('licencias: CC BY 4.0 para lo derivado, AGPL-3.0 para el código, el catálogo de ChileCompra', () => {
    const { container } = render(<PaginaAbierto />);
    const lic = container.querySelector('section#licencias') as HTMLElement;
    expect(within(lic).getByRole('link', { name: /creative commons atribución 4\.0/i })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/deed.es',
    );
    expect(within(lic).getAllByText(/AGPL-3\.0 o posterior/).length).toBeGreaterThan(0);
    expect(within(lic).getByText(/condiciones de ChileCompra/)).toBeInTheDocument();
  });

  it('licencias: sin repositorio publicado, el código se licencia en futuro (como en #codigo)', () => {
    const { container } = render(<PaginaAbierto />);
    const lic = container.querySelector('section#licencias') as HTMLElement;
    expect(within(lic).getByText(/Cuando se publique, será libre para usar, estudiar y modificar/)).toBeInTheDocument();
    expect(within(lic).queryByText(/^Libre para usar/)).toBeNull();
  });

  it('el MCP: título sin marca ajena y los clientes en una lista con filetes, sin rejilla', () => {
    const { container } = render(<PaginaAbierto />);
    const mcp = container.querySelector('section#mcp') as HTMLElement;
    expect(within(mcp).getByRole('heading', { level: 2 })).toHaveTextContent('Pregúntale a tu asistente');
    const lista = mcp.querySelector('ul.divide-y') as HTMLElement;
    expect(lista).not.toBeNull();
    expect(lista.children).toHaveLength(instalacionesMcp('Tordo').length);
    expect(mcp.querySelector('.grid-cols-2, [class*="sm:grid-cols-2"]')).toBeNull();
    // Las líneas largas se parten, y cada bloque ocupa el ancho de su columna.
    for (const pre of container.querySelectorAll('pre')) {
      expect(pre.className).toMatch(/\bwhitespace-pre-wrap\b/);
      expect(pre.className).toMatch(/overflow-wrap:anywhere/);
      expect(pre.className).toMatch(/\bmax-w-none\b/);
    }
  });

  it('cada fragmento tiene su botón «Copiar», que copia el texto y dice «Copiado»', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = render(<PaginaAbierto />);
    const bloques = container.querySelectorAll('pre');
    const botones = screen.getAllByRole('button', { name: /^Copiar: / });
    expect(botones).toHaveLength(bloques.length);

    const curl = screen.getByRole('button', { name: 'Copiar: Ejemplo con curl' });
    fireEvent.click(curl);
    await waitFor(() => expect(curl).toHaveTextContent('Copiado'));
    expect(writeText).toHaveBeenCalledWith(ejemploCurl());
  });

  it('sin permiso de portapapeles, lo dice en vez de fallar callado', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<PaginaAbierto />);
    const url = screen.getByRole('button', { name: 'Copiar: URL del servidor MCP' });
    fireEvent.click(url);
    await waitFor(() => expect(url).toHaveTextContent('Cópialo a mano'));
  });

  it('las herramientas del MCP: tras los dos puntos, minúscula', () => {
    for (const h of HERRAMIENTAS_MCP) expect(h.descripcion.charAt(0), h.nombre).toMatch(/\p{Ll}/u);
  });

  it('el MCP dice que comparte con la API el límite por IP', () => {
    const { container } = render(<PaginaAbierto />);
    const mcp = container.querySelector('section#mcp') as HTMLElement;
    expect(mcp.textContent).toContain(
      `Comparte con la API el límite por IP (${LIMITE_POR_MINUTO} peticiones por minuto)`,
    );
  });

  it('las personas naturales no salen en lo que se licencia, y lo dice', () => {
    const { container } = render(<PaginaAbierto />);
    const lic = container.querySelector('section#licencias') as HTMLElement;
    const nota = within(lic).getByText(/no aparecen con su nombre ni su RUT/);
    expect(nota).toHaveTextContent(/«Persona natural»/);
    expect(nota).toHaveTextContent(/seudónimo que cambia en cada actualización/);
    expect(nota).not.toHaveTextContent(/se omiten/);
    expect(within(lic).getByRole('link', { name: /política de privacidad/i })).toHaveAttribute(
      'href',
      '/privacidad',
    );
  });

  it('los términos dicen lo mismo que /abierto y que /privacidad sobre las personas naturales', () => {
    const { container } = render(<PaginaTerminos />);
    const texto = container.textContent ?? '';
    expect(texto).toMatch(/no aparecen con su nombre ni su RUT/);
    expect(texto).toMatch(/seudónimo que cambia en cada actualización/);
    expect(texto).not.toMatch(/se omiten y se muestran/);
  });

  it('los términos: sin repositorio dicen «cuando se publique»; con él, lo enlazan', () => {
    const sin = render(<PaginaTerminos />);
    expect(sin.container.textContent).toMatch(/cuando se publique, su dirección estará en/);
    sin.unmount();

    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    const con = render(<PaginaTerminos />);
    expect(con.container.textContent).not.toMatch(/cuando se publique/);
    expect(within(con.container).getByRole('link', { name: 'https://github.com/x/tordo' })).toHaveAttribute(
      'href',
      'https://github.com/x/tordo',
    );
  });

  it('los bloques de código son un grupo con nombre, y con el teclado se llega a su botón', () => {
    render(<PaginaAbierto />);
    const grupos = screen.getAllByRole('group');
    expect(grupos.length).toBeGreaterThanOrEqual(6);
    for (const g of grupos) {
      expect(g.tagName).toBe('PRE');
      expect(g).toHaveAccessibleName();
      // Ya no se desplaza (las líneas se parten): el foco va al botón, no al bloque.
      expect(g).not.toHaveAttribute('tabindex');
      const boton = g.parentElement?.querySelector('button') as HTMLButtonElement;
      expect(boton).toHaveAccessibleName(`Copiar: ${g.getAttribute('aria-label')}`);
      expect(boton.tabIndex).toBe(0);
    }
  });

  it('ninguna petición a terceros: sin imágenes, scripts ni marcos externos, sin badges', () => {
    process.env.REPOSITORIO_URL = 'https://github.com/x/tordo';
    const { container } = render(<PaginaAbierto />);
    expect(container.querySelectorAll('img, script, iframe, link[rel="stylesheet"]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/shields\.io|buttons\.github\.io|badge/i);
  });
});

describe('se llega a /abierto', () => {
  it('desde la cabecera única, en escritorio y en el menú móvil', () => {
    render(<Cabecera />);
    for (const nombre of ['Secciones', 'Menú de secciones']) {
      const nav = screen.getByRole('navigation', { name: nombre, hidden: true });
      expect(within(nav).getByRole('link', { name: 'API y MCP', hidden: true })).toHaveAttribute(
        'href',
        '/abierto',
      );
    }
  });
});

describe('el pie y los términos', () => {
  it('el pie enlaza el costo', () => {
    render(<PieSitio />);
    expect(screen.getByRole('link', { name: 'Cuánto cuesta' })).toHaveAttribute('href', '/apoyar#costos');
  });

  it('los términos dicen la licencia de lo derivado y enlazan las licencias', () => {
    render(<PaginaTerminos />);
    expect(screen.getAllByText(/CC BY 4\.0/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'licencias' })).toHaveAttribute('href', '/abierto#licencias');
  });

  it('los términos piden citar al sitio Y conservar la cita de ChileCompra, y nombran la licencia del código', () => {
    const { container } = render(<PaginaTerminos />);
    const texto = container.textContent ?? '';
    expect(texto).toMatch(/cita también este sitio/);
    expect(texto).toMatch(/conservando la cita de la fuente/);
    expect(texto).toMatch(/se licencia bajo AGPL-3\.0 o posterior/);
    expect(texto).not.toMatch(/se publica bajo licencia AGPL/);
    expect(texto).toMatch(/cuando se publique, su dirección estará en \/abierto/);
    expect(texto).toMatch(/sus CSV y esas mismas cifras en la API y el servidor MCP/);
    expect(texto).toMatch(/indica si hiciste cambios/);
    expect(texto).toMatch(/siguen bajo las condiciones de ChileCompra/);
  });
});

describe('/privacidad dice lo mismo que su sección 3', () => {
  it('el resumen reemplaza, no omite', () => {
    const { container } = render(<PaginaPrivacidad />);
    const texto = container.textContent ?? '';
    expect(texto).toMatch(/reemplazamos el nombre y el RUT de los proveedores que son personas naturales por «Persona natural» \(y, en los análisis, por un seudónimo\)/);
    expect(texto).not.toMatch(/omitimos a los proveedores/);
    expect(texto).not.toMatch(/ante la duda, se omite/);
    expect(texto).toMatch(/Vigente desde 15 de octubre de 2026/);
  });
});
