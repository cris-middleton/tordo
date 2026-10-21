/**
 * Lo que publica `/abierto` (spec del rediseño §6.5): dónde está la API, el
 * servidor MCP, cómo se conecta cada cliente y bajo qué licencias.
 *
 * **La dirección pública de la API vive aquí y sólo aquí** (`ORIGEN_API_PUBLICA`;
 * `__tests__/abierto.test.tsx` falla si aparece en otro fichero). No sale de
 * `API_URL` a propósito: esa variable es a dónde habla el proxy de Next —en E2E,
 * `http://…:8000`— y publicarla enseñaría una dirección interna. Tampoco es una
 * variable nueva: la URL del MCP es CANÓNICA —la copian los usuarios, va
 * codificada en el enlace de Cursor y en los registros MCP—, y una variable
 * olvidada en un build la cambiaría sin que nada falle. Si el dominio de la API
 * cambia, cambia aquí, en `MCP_HOSTS_PERMITIDOS` y en los registros
 * (docs/DESPLIEGUE.md).
 *
 * Funciones puras, sin `Buffer` (usa `btoa`): sirven en servidor y en cliente.
 */
import { API } from './versionApi';

export const ORIGEN_API_PUBLICA = 'https://api.tordo.cl';
export const BASE_API_PUBLICA = `${ORIGEN_API_PUBLICA}${API}`;
export const URL_DOCS_API = `${ORIGEN_API_PUBLICA}/docs`;
/**
 * **Con barra final, siempre**: es la forma canónica (spec §6.5) y la que los
 * registros de servidores MCP copian. Desde #161 `/mcp` también se sirve sin
 * barra, sin redirigir, así que ya no es cuestión de que un cliente conecte o
 * no: es publicar una sola URL, la misma en todas partes.
 */
export const URL_MCP = `${ORIGEN_API_PUBLICA}/mcp/`;
/** Espeja `LIMITE_POR_MINUTO` de la API (por defecto 60; docs/API_PUBLICA.md, «Límites»). */
export const LIMITE_POR_MINUTO = 60;

/**
 * Spec §7.1, R7 (confirmada el 2026-10-14), con la variante «o posterior» (D5 del plan del
 * PR 7, 2026-10-15). `spdx` es la misma cadena que `pyproject.toml` y `package.json`
 * (`backend/tests/test_archivos_publicos.py`).
 */
export const LICENCIA_CODIGO = {
  nombre: 'AGPL-3.0 o posterior',
  spdx: 'AGPL-3.0-or-later',
  url: 'https://www.gnu.org/licenses/agpl-3.0.html',
} as const;
export const LICENCIA_DATOS = {
  nombre: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/deed.es',
} as const;

/**
 * Las herramientas del MCP, una línea cada una. **Espejo a mano de
 * `backend/app/mcp/servidor.py`**: `backend/tests/test_mcp.py` compara estos
 * nombres con el `tools/list` real y falla si divergen.
 */
export const HERRAMIENTAS_MCP = [
  {
    nombre: 'panel_de_licitacion',
    descripcion:
      'Lo que necesitas para decidir si postular a una licitación, en una llamada: quién compra, cuánto plazo da, quién suele competir y a qué precio se compraron sus productos.',
  },
  {
    nombre: 'precio_de_producto',
    descripcion:
      'A qué precio se compró un producto, por su código ONU (el del catálogo de Mercado Público), con cuántas compras hay detrás y qué tan confiable es.',
  },
  {
    nombre: 'perfil_de_comprador',
    descripcion:
      'Cómo compra un comprador del Estado: cuánto de lo que licita termina adjudicando y qué señales de riesgo tiene.',
  },
  {
    nombre: 'buscar_productos',
    descripcion:
      'Del nombre de un producto («guantes», «resma») a su código ONU, con cuántas compras tiene cada uno.',
  },
] as const;

export interface InstalacionMcp {
  id: 'claude-code' | 'claude' | 'chatgpt' | 'cursor' | 'vscode';
  cliente: string;
  pasos: string[];
  /** Lo que se copia, en monoespaciada. */
  codigo?: string;
  enlace?: { texto: string; href: string };
}

/** El nombre con el que el cliente guarda el servidor: el del sitio, en minúsculas y sin tildes. */
export function idServidorMcp(nombre: string): string {
  const id = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id || 'mcp';
}

/** `{"url": URL_MCP}` en base64, como lo pide el enlace profundo de Cursor. */
export function configCursorBase64(): string {
  return btoa(JSON.stringify({ url: URL_MCP }));
}

export function enlaceCursor(nombre: string): string {
  const consulta = new URLSearchParams({ name: nombre, config: configCursorBase64() });
  return `cursor://anysphere.cursor-deeplink/mcp/install?${consulta}`;
}

/** Una caja por cliente (spec §6.5; el MCP de data.gouv.fr como referencia). */
export function instalacionesMcp(nombre: string): InstalacionMcp[] {
  const id = idServidorMcp(nombre);
  return [
    {
      id: 'claude-code',
      cliente: 'Claude Code',
      pasos: ['En una terminal:'],
      codigo: `claude mcp add --transport http ${id} ${URL_MCP}`,
    },
    {
      id: 'claude',
      cliente: 'Claude.ai y Claude Desktop',
      pasos: [
        'Abre Settings → Connectors y elige «Add custom connector».',
        'Pega la URL. No pide clave.',
      ],
      codigo: URL_MCP,
    },
    {
      id: 'chatgpt',
      cliente: 'ChatGPT',
      pasos: [
        'Activa el modo desarrollador y crea un conector personalizado.',
        'Pega la URL y elige «sin autenticación».',
      ],
      codigo: URL_MCP,
    },
    {
      id: 'cursor',
      cliente: 'Cursor',
      pasos: ['Con Cursor instalado, este enlace añade el servidor:'],
      enlace: { texto: `Añadir ${nombre} a Cursor`, href: enlaceCursor(nombre) },
    },
    {
      id: 'vscode',
      cliente: 'VS Code y otros clientes',
      pasos: ['En la configuración MCP del cliente (en VS Code, .vscode/mcp.json):'],
      codigo: JSON.stringify({ servers: { [id]: { type: 'http', url: URL_MCP } } }, null, 2),
    },
  ];
}

/** Un `curl` que funciona tal cual: la colección lleva barra final, como en el catálogo. */
export function ejemploCurl(): string {
  return `curl "${BASE_API_PUBLICA}/tenders/?tipo_convocatoria=compra_agil&limit=5"`;
}
