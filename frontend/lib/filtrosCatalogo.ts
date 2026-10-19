/**
 * Los filtros del catálogo de licitaciones, como URL.
 *
 * **Una búsqueda = una URL.** Antes los filtros vivían sólo en `useState`:
 * recargar la página los perdía y no había forma de compartir ni de guardar una
 * búsqueda. Ahora la URL es la fuente al montar y se reescribe al cambiar.
 *
 * Los nombres de los parámetros son **los mismos que entiende el backend**
 * (`GET /tenders/`), a propósito: así la URL del catálogo, la de una búsqueda
 * guardada y la del RSS (`/rss/licitaciones`) dicen lo mismo con las mismas
 * palabras, y no hay una traducción que se desincronice.
 *
 * Funciones puras: no tocan `window` ni React.
 */

import { TIPOS_CONVOCATORIA } from './constantesChile';
import { shortRegion } from './nombresChile';

/**
 * Lo que dice el catálogo bajo su título, y su descripción para buscadores.
 * Dice que hay Compras Ágiles y cerradas: la lista por defecto las trae.
 */
export const SUBTITULO_CATALOGO =
  'Licitaciones y Compras Ágiles de Mercado Público, abiertas y recién cerradas.';

export const ORDENES = ['relevance', 'fecha_publicacion', 'fecha_cierre', 'monto_estimado', 'nombre'] as const;
export type Orden = (typeof ORDENES)[number];

/**
 * El orden del catálogo en UN desplegable: cada opción es un par (campo,
 * sentido). Antes eran dos desplegables de 12 px —«Cierre» y «↓ Mayor»— que
 * había que combinar en la cabeza. Están los nueve pares que la URL puede
 * traer, así que ninguna URL antigua queda sin su opción.
 */
export const OPCIONES_ORDEN: ReadonlyArray<{ sort_by: Orden; sort_order: 'asc' | 'desc'; etiqueta: string }> = [
  { sort_by: 'relevance', sort_order: 'desc', etiqueta: 'Más parecidas' },
  { sort_by: 'fecha_publicacion', sort_order: 'desc', etiqueta: 'Más recientes' },
  { sort_by: 'fecha_publicacion', sort_order: 'asc', etiqueta: 'Más antiguas' },
  { sort_by: 'fecha_cierre', sort_order: 'asc', etiqueta: 'Cierran antes' },
  { sort_by: 'fecha_cierre', sort_order: 'desc', etiqueta: 'Cierran más tarde' },
  { sort_by: 'monto_estimado', sort_order: 'desc', etiqueta: 'Mayor monto' },
  { sort_by: 'monto_estimado', sort_order: 'asc', etiqueta: 'Menor monto' },
  { sort_by: 'nombre', sort_order: 'asc', etiqueta: 'Nombre, de la A a la Z' },
  { sort_by: 'nombre', sort_order: 'desc', etiqueta: 'Nombre, de la Z a la A' },
];

/** La clave de un orden en el desplegable. La relevancia no tiene sentido inverso: siempre es una. */
export function claveOrden(f: Pick<FiltrosCatalogo, 'sort_by' | 'sort_order'>): string {
  return f.sort_by === 'relevance' ? 'relevance:desc' : `${f.sort_by}:${f.sort_order}`;
}

/** Lo inverso de `claveOrden`. Una clave desconocida vale el orden por defecto. */
export function ordenDeClave(clave: string): Pick<FiltrosCatalogo, 'sort_by' | 'sort_order'> {
  const opcion = OPCIONES_ORDEN.find((o) => claveOrden(o) === clave);
  return opcion
    ? { sort_by: opcion.sort_by, sort_order: opcion.sort_order }
    : { sort_by: FILTROS_POR_DEFECTO.sort_by, sort_order: FILTROS_POR_DEFECTO.sort_order };
}

export const TAMANOS_PAGINA = [10, 20, 50, 100] as const;

export interface FiltrosCatalogo {
  estado: string;
  tipo_convocatoria: string;
  region: string;
  min_amount: string;
  max_amount: string;
  /** Sólo lo que se puede postular ahora (`esta_abierta` en el backend). En la URL, `abiertas=1`. */
  abiertas: boolean;
  /** Cada término es un chip; en la URL van juntos en `search`, separados por espacio. */
  terminos: string[];
  sort_by: Orden;
  sort_order: 'asc' | 'desc';
  limit: number;
  page: number;
}

export const FILTROS_POR_DEFECTO: FiltrosCatalogo = {
  estado: '',
  tipo_convocatoria: '',
  region: '',
  min_amount: '',
  max_amount: '',
  abiertas: false,
  terminos: [],
  sort_by: 'fecha_publicacion',
  sort_order: 'desc',
  limit: 20,
  page: 1,
};

/**
 * Los parámetros que FILTRAN (no los que ordenan ni paginan). Es la lista
 * blanca de lo que se guarda en una búsqueda y de lo que el RSS reenvía al
 * backend: cualquier otro parámetro de la URL se descarta.
 */
export const PARAMS_FILTRO = [
  'search',
  'estado',
  'tipo_convocatoria',
  'region',
  'min_amount',
  'max_amount',
  'abiertas',
] as const;

const NUMERO = /^\d+(\.\d+)?$/;

/** Lo que vale «verdadero» en un booleano de la URL. Se escribe siempre `1`. */
const VERDADERO = ['1', 'true'];

/**
 * Pone los mecanismos de un `tipo_convocatoria` con varios valores en el orden
 * de `TIPOS_CONVOCATORIA`. El desplegable compara el texto entero, y una URL
 * armada a mano con los mismos tres tipos en otro orden filtraba bien pero
 * pintaba «Todos los mecanismos». Un valor desconocido va al final, tal cual.
 */
function ordenarMecanismos(valor: string): string {
  if (!valor.includes(',')) return valor;
  const posicion = (t: string) => {
    const i = TIPOS_CONVOCATORIA.findIndex((x) => x.value === t);
    return i === -1 ? TIPOS_CONVOCATORIA.length : i;
  };
  return valor
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => posicion(a) - posicion(b))
    .join(',');
}

function entero(valor: string | null, min: number, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min ? n : porDefecto;
}

/** Lee los filtros de una URL. Un valor inválido vale lo de por defecto, nunca rompe. */
export function leerFiltros(params: URLSearchParams | { get(nombre: string): string | null }): FiltrosCatalogo {
  const terminos = (params.get('search') ?? '').split(/\s+/).filter(Boolean);
  const sortBy = params.get('sort_by');
  const limite = Number(params.get('limit'));
  const minimo = params.get('min_amount') ?? '';
  const maximo = params.get('max_amount') ?? '';
  return {
    estado: params.get('estado') ?? '',
    tipo_convocatoria: ordenarMecanismos(params.get('tipo_convocatoria') ?? ''),
    region: params.get('region') ?? '',
    min_amount: NUMERO.test(minimo) ? minimo : '',
    max_amount: NUMERO.test(maximo) ? maximo : '',
    abiertas: VERDADERO.includes(params.get('abiertas') ?? ''),
    terminos,
    // Con términos y sin orden explícito se ordena por relevancia, como al
    // escribir el primer término en el buscador.
    sort_by: (ORDENES as readonly string[]).includes(sortBy ?? '')
      ? (sortBy as Orden)
      : terminos.length
        ? 'relevance'
        : FILTROS_POR_DEFECTO.sort_by,
    sort_order: params.get('sort_order') === 'asc' ? 'asc' : 'desc',
    limit: (TAMANOS_PAGINA as readonly number[]).includes(limite) ? limite : FILTROS_POR_DEFECTO.limit,
    page: entero(params.get('page'), 1, 1),
  };
}

/**
 * Los filtros con que abre el catálogo. **Entrar sin nada en la URL** (desde la
 * cabecera o un enlace a secas) **abre en «Sólo abiertas»**: es lo que busca
 * quien llega a postular, y la lista entera mezclaba 29.000 filas de abiertas y
 * cerradas. Una URL con cualquier parámetro se lee tal cual, así que un enlace
 * compartido, una búsqueda guardada o un RSS significan lo mismo que el día en
 * que se crearon: ahí `abiertas` sólo vale si está escrito.
 */
export function filtrosIniciales(params: URLSearchParams | { get(nombre: string): string | null; toString(): string }): FiltrosCatalogo {
  if (!params.toString()) return { ...FILTROS_POR_DEFECTO, abiertas: true };
  return leerFiltros(params);
}

/** La URL de unos filtros. Omite lo que vale lo de por defecto: URLs cortas. */
export function escribirFiltros(f: FiltrosCatalogo): URLSearchParams {
  const p = new URLSearchParams();
  if (f.terminos.length) p.set('search', f.terminos.join(' '));
  if (f.estado) p.set('estado', f.estado);
  if (f.tipo_convocatoria) p.set('tipo_convocatoria', f.tipo_convocatoria);
  if (f.region) p.set('region', f.region);
  if (f.min_amount) p.set('min_amount', f.min_amount);
  if (f.max_amount) p.set('max_amount', f.max_amount);
  if (f.abiertas) p.set('abiertas', '1');
  const ordenImplicito = f.terminos.length ? 'relevance' : FILTROS_POR_DEFECTO.sort_by;
  if (f.sort_by !== ordenImplicito) p.set('sort_by', f.sort_by);
  if (f.sort_order !== 'desc') p.set('sort_order', f.sort_order);
  if (f.limit !== FILTROS_POR_DEFECTO.limit) p.set('limit', String(f.limit));
  if (f.page > 1) p.set('page', String(f.page));
  return p;
}

/** Los parámetros de `GET /tenders/` para unos filtros. */
export function paramsDeApi(f: FiltrosCatalogo): Record<string, unknown> {
  const params: Record<string, unknown> = {
    offset: (f.page - 1) * f.limit,
    limit: f.limit,
    // Sin términos no hay relevancia que calcular.
    sort_by: f.sort_by === 'relevance' && !f.terminos.length ? 'fecha_publicacion' : f.sort_by,
    sort_order: f.sort_order,
  };
  if (f.estado) params.estado = f.estado;
  if (f.tipo_convocatoria) params.tipo_convocatoria = f.tipo_convocatoria;
  if (f.region) params.region = f.region;
  if (f.min_amount) params.min_amount = parseFloat(f.min_amount);
  if (f.max_amount) params.max_amount = parseFloat(f.max_amount);
  if (f.abiertas) params.abiertas = true;
  if (f.terminos.length) params.search = f.terminos.join(' ');
  return params;
}

/**
 * Sólo los parámetros que filtran, en orden fijo. Es lo que identifica una
 * búsqueda guardada y lo que va en su URL de RSS: dos búsquedas que sólo
 * difieren en la página o el orden son la misma búsqueda.
 */
export function soloFiltros(params: URLSearchParams): URLSearchParams {
  const salida = new URLSearchParams();
  for (const nombre of PARAMS_FILTRO) {
    const valor = params.get(nombre)?.trim();
    if (valor) salida.set(nombre, valor);
  }
  return salida;
}

function clp(valor: string) {
  return `$${Number(valor).toLocaleString('es-CL')}`;
}

/** Una búsqueda en una línea legible: «válvulas, Compra Ágil, Biobío, desde $1.000.000». */
export function describirBusqueda(consulta: string): string {
  const f = leerFiltros(new URLSearchParams(consulta));
  const partes: string[] = [];
  if (f.terminos.length) partes.push(`«${f.terminos.join(' ')}»`);
  if (f.tipo_convocatoria) {
    partes.push(
      f.tipo_convocatoria
        .split(',')
        .map((t) => TIPOS_CONVOCATORIA.find((x) => x.value === t)?.label ?? t)
        .join(', '),
    );
  }
  if (f.estado) partes.push(f.estado);
  if (f.region) partes.push(shortRegion(f.region));
  if (f.min_amount && f.max_amount) partes.push(`${clp(f.min_amount)} a ${clp(f.max_amount)}`);
  else if (f.min_amount) partes.push(`desde ${clp(f.min_amount)}`);
  else if (f.max_amount) partes.push(`hasta ${clp(f.max_amount)}`);
  if (f.abiertas) partes.push('Sólo abiertas');
  return partes.length ? partes.join(', ') : 'Todas las licitaciones';
}

/**
 * Todo mecanismo menos Compra Ágil: lo que `GET /publico/portada` cuenta como
 * «licitaciones abiertas» (`contar_abiertas`). Sale de la lista de mecanismos,
 * no se escribe a mano. Un mecanismo nuevo hay que añadirlo a
 * `TIPOS_CONVOCATORIA` (y al backend: `test_tipos_convocatoria_del_frontend.py`
 * falla si las dos listas se separan); recién entonces entra aquí.
 */
export const TIPOS_SIN_COMPRA_AGIL = TIPOS_CONVOCATORIA.filter((t) => t.value !== 'compra_agil')
  .map((t) => t.value)
  .join(',');

/**
 * El catálogo con las abiertas de un mecanismo. Es el enlace de cada cifra de
 * la portada, del bloque «abiertas ahora» de `/buscar` y de «Ver las que cierran
 * primero»: **el mismo filtro que la cuenta**, para que el número que se lee sea
 * el total que se encuentra. `orden` es opcional; sin él, el orden implícito
 * (relevancia con términos, publicación sin ellos).
 */
export function urlCatalogoAbiertas(
  mecanismo: 'licitaciones' | 'compra_agil',
  terminos: string[] = [],
  orden?: { sort_by: Orden; sort_order: 'asc' | 'desc' },
): string {
  const consulta = escribirFiltros({
    ...FILTROS_POR_DEFECTO,
    abiertas: true,
    tipo_convocatoria: mecanismo === 'compra_agil' ? 'compra_agil' : TIPOS_SIN_COMPRA_AGIL,
    terminos,
    sort_by: orden?.sort_by ?? (terminos.length ? 'relevance' : FILTROS_POR_DEFECTO.sort_by),
    sort_order: orden?.sort_order ?? FILTROS_POR_DEFECTO.sort_order,
  });
  return `/licitaciones?${consulta}`;
}
