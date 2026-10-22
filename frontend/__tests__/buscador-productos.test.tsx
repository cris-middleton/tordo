/**
 * El buscador de `/productos`: la puerta a las fichas de producto que no están
 * en el sitemap.
 *
 * Se fija:
 *   1. el retardo — no se busca con cada tecla, sólo cuando el texto se queda
 *      quieto, y nunca con menos de tres (la búsqueda del backend ignora
 *      las palabras más cortas, así que dos letras nunca encuentran nada);
 *   2. que cada resultado enlaza por el `slug` del backend, indexable o no;
 *   3. los estados sin resultados y con error, en una línea y sin caja de error;
 *   4. que el término vive en la URL (`?q=`): se lee al montar —sin esperar el
 *      retardo— y se escribe con `replaceState`, nunca con `pushState`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PaginaProductos from '@/app/(publico)/productos/page';
import { BuscadorProductos } from '@/components/publico/BuscadorProductos';
import { PRODUCTOS_ESCALERA } from '@/lib/escaleraPrecios';
import { PARAMETRO_BUSQUEDA_PRODUCTOS, rutaBusquedaProductos } from '@/lib/publico';

let estado: {
  isPending: boolean;
  isError: boolean;
  isSuccess?: boolean;
  isPlaceholderData?: boolean;
  data?: unknown;
};
let sugerencia: string | null = null;
const sugerenciasPedidas: Array<[string, boolean]> = [];
const pedidas: string[] = [];
let urlInicial = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => urlInicial,
}));

vi.mock('@/lib/queries', () => ({
  MINIMO_BUSQUEDA_PRODUCTOS: 3,
  MAXIMO_BUSQUEDA_PRODUCTOS: 100,
  useBuscarProductosPublicos: (texto: string) => {
    pedidas.push(texto);
    return estado;
  },
  useSugerencia: (texto: string, habilitada: boolean) => {
    sugerenciasPedidas.push([texto, habilitada]);
    return habilitada ? sugerencia : null;
  },
}));

const RESULTADOS = [
  {
    slug: 'guante-latex-nitrilo',
    firma: 'guante latex nitrilo',
    descripcion: 'GUANTE DE LÁTEX Y NITRILO',
    n: 120,
    indexable: true,
  },
  { slug: 'guante-quirurgico-raro', firma: 'guante quirurgico raro', n: 3, indexable: false },
];

let replaceState: ReturnType<typeof vi.spyOn>;
let pushState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  pedidas.length = 0;
  sugerenciasPedidas.length = 0;
  sugerencia = null;
  urlInicial = new URLSearchParams();
  estado = { isPending: false, isError: false, data: RESULTADOS };
  replaceState = vi.spyOn(window.history, 'replaceState');
  pushState = vi.spyOn(window.history, 'pushState');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** El último destino escrito en la URL. */
function ultimaUrl(): string {
  return String(replaceState.mock.calls.at(-1)?.[2]);
}

function escribir(texto: string) {
  fireEvent.change(screen.getByLabelText(/buscar un producto/i), { target: { value: texto } });
}

describe('buscador de productos', () => {
  it('espera a que el texto se quede quieto antes de buscar', () => {
    render(<BuscadorProductos />);
    escribir('gu');
    escribir('guan');
    escribir('guante');
    expect(pedidas.at(-1)).toBe('');
    act(() => vi.advanceTimersByTime(300));
    expect(pedidas.at(-1)).toBe('guante');
    expect(pedidas).not.toContain('gu');
    expect(pedidas).not.toContain('guan');
  });

  it('lo de `inicio` (las fichas para empezar de la página) sale sin búsqueda y se va al buscar', () => {
    render(<BuscadorProductos inicio={<p>Fichas para empezar</p>} />);
    expect(screen.getByText('Fichas para empezar')).toBeInTheDocument();
    escribir('guante');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByText('Fichas para empezar')).toBeNull();
  });

  it('la página, sin búsqueda, enlaza la búsqueda de las seis cosas de la escalera sin pedir nada al backend', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(<PaginaProductos />);
    const lista = screen.getByRole('list', { name: 'Búsquedas para empezar' });
    // A su búsqueda y no a su ficha: una ficha escrita a mano puede dejar de existir.
    expect([...lista.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(
      PRODUCTOS_ESCALERA.map((p) => rutaBusquedaProductos(p.nombre.replace(/\s*\(.*\)$/, ''))),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('con menos de tres letras pide escribir más, sin resultados', () => {
    render(<BuscadorProductos />);
    escribir('pc');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText(/al menos tres letras/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('enlaza cada producto por su slug, también los no indexables', () => {
    render(<BuscadorProductos />);
    escribir('guante');
    act(() => vi.advanceTimersByTime(300));
    // Titulado como lo escribe el comprador, no con la firma (palabras ordenadas).
    expect(screen.getByRole('link', { name: /Guante de látex y nitrilo/ })).toHaveAttribute(
      'href',
      '/productos/guante-latex-nitrilo',
    );
    expect(screen.queryByText('guante latex nitrilo')).not.toBeInTheDocument();
    // Sin descripción, la firma con mayúscula.
    const raro = screen.getByRole('link', { name: /Guante quirurgico raro/ });
    expect(raro).toHaveAttribute('href', '/productos/guante-quirurgico-raro');
    expect(raro).toHaveTextContent(/orientativo/);
  });

  it('sin resultados lo dice', () => {
    estado = { isPending: false, isError: false, data: [] };
    render(<BuscadorProductos />);
    escribir('xyzzy');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText(/ningún producto coincide con «xyzzy»/i)).toBeInTheDocument();
    expect(screen.getByText(/menos de tres letras y los números no cuentan/i)).toBeInTheDocument();
  });

  it('un error es una línea, no una caja, y se puede reintentar', () => {
    const refetch = vi.fn();
    estado = { isPending: false, isError: true, refetch } as typeof estado;
    render(<BuscadorProductos />);
    escribir('guante');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText(/no pudimos buscar ahora/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('el término vive en la URL', () => {
  it('abre con el término de la URL, sin escribir ni esperar', () => {
    urlInicial = new URLSearchParams('q=resma');
    render(<BuscadorProductos />);
    // Sin avanzar los temporizadores: la primera petición ya es la de la URL.
    expect(pedidas[0]).toBe('resma');
    expect(screen.getByLabelText(/buscar un producto/i)).toHaveValue('resma');
    expect(screen.getByRole('link', { name: /Guante de látex y nitrilo/ })).toBeInTheDocument();
  });

  it('una URL con tildes y espacios abre con el término intacto', () => {
    urlInicial = new URLSearchParams('q=jab%C3%B3n+l%C3%ADquido');
    render(<BuscadorProductos />);
    expect(pedidas[0]).toBe('jabón líquido');
    expect(screen.getByLabelText(/buscar un producto/i)).toHaveValue('jabón líquido');
  });

  it('escribe en la URL el término retardado, con replaceState', () => {
    render(<BuscadorProductos />);
    escribir('ton');
    escribir('toner');
    expect(ultimaUrl()).not.toContain('toner');
    act(() => vi.advanceTimersByTime(300));
    expect(ultimaUrl()).toBe(rutaBusquedaProductos('toner'));
    expect(replaceState.mock.calls.map((c: unknown[]) => String(c[2]))).not.toContain(
      rutaBusquedaProductos('ton'),
    );
    expect(pushState).not.toHaveBeenCalled();
  });

  it('borrar el término limpia la URL', () => {
    urlInicial = new URLSearchParams('q=resma');
    render(<BuscadorProductos />);
    escribir('');
    act(() => vi.advanceTimersByTime(300));
    expect(ultimaUrl()).toBe('/productos');
  });

  it('un término por debajo del mínimo no va a la URL ni se busca', () => {
    urlInicial = new URLSearchParams(`${PARAMETRO_BUSQUEDA_PRODUCTOS}=gu`);
    render(<BuscadorProductos />);
    expect(ultimaUrl()).toBe('/productos');
    expect(screen.getByText(/al menos tres letras/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('el largo del término tiene tope (el del backend: 100)', () => {
  it('un ?q= de 150 caracteres abre truncado a 100, y se pide con 100', () => {
    urlInicial = new URLSearchParams(`q=${'a'.repeat(150)}`);
    render(<BuscadorProductos />);
    expect(screen.getByLabelText(/buscar un producto/i)).toHaveValue('a'.repeat(100));
    expect(pedidas[0]).toBe('a'.repeat(100));
    expect(Math.max(...pedidas.map((t) => t.length))).toBeLessThanOrEqual(100);
  });

  it('el campo no deja escribir más de 100', () => {
    render(<BuscadorProductos />);
    expect(screen.getByLabelText(/buscar un producto/i)).toHaveAttribute('maxlength', '100');
  });
});

describe('la URL de una búsqueda de productos', () => {
  it('lleva el término en ?q=, codificado', () => {
    expect(rutaBusquedaProductos('resma')).toBe('/productos?q=resma');
    expect(rutaBusquedaProductos('jabón líquido')).toBe('/productos?q=jab%C3%B3n+l%C3%ADquido');
  });

  it('recorta los bordes, y sin término es /productos', () => {
    expect(rutaBusquedaProductos('  toner  ')).toBe('/productos?q=toner');
    expect(rutaBusquedaProductos('   ')).toBe('/productos');
    expect(rutaBusquedaProductos('')).toBe('/productos');
  });

  it('ida y vuelta: lo que se escribe es lo que se lee', () => {
    const ruta = rutaBusquedaProductos('guante de nitrilo & talla M');
    const leida = new URL(ruta, 'https://tordo.cl').searchParams.get(PARAMETRO_BUSQUEDA_PRODUCTOS);
    expect(leida).toBe('guante de nitrilo & talla M');
  });
});

describe('«¿Quisiste decir…?»', () => {
  it('sin resultados propone la búsqueda corregida, y pulsarla la busca', () => {
    estado = { isPending: false, isError: false, isSuccess: true, data: [] };
    sugerencia = 'computador';
    urlInicial = new URLSearchParams({ [PARAMETRO_BUSQUEDA_PRODUCTOS]: 'computdor' });
    render(<BuscadorProductos />);
    fireEvent.click(screen.getByRole('button', { name: '«computador»' }));
    expect(screen.getByLabelText(/buscar un producto/i)).toHaveValue('computador');
  });

  it('sólo la pide cuando la búsqueda respondió vacía', () => {
    estado = { isPending: false, isError: false, isSuccess: true, data: RESULTADOS };
    sugerencia = 'computador';
    urlInicial = new URLSearchParams({ [PARAMETRO_BUSQUEDA_PRODUCTOS]: 'guante' });
    render(<BuscadorProductos />);
    expect(screen.queryByText(/quisiste decir/i)).toBeNull();
    expect(sugerenciasPedidas.every(([, habilitada]) => !habilitada)).toBe(true);
  });

  it('no la pide con el vacío del término anterior mientras llega el nuevo', () => {
    // `placeholderData` deja `isSuccess` y el `[]` de «computdor» mientras se pide
    // «impresora»: sin mirar `isPlaceholderData` se pedía la sugerencia de un
    // término que sí encuentra, una llamada más al límite por IP.
    estado = {
      isPending: false,
      isError: false,
      isSuccess: true,
      isPlaceholderData: true,
      data: [],
    };
    urlInicial = new URLSearchParams({ [PARAMETRO_BUSQUEDA_PRODUCTOS]: 'impresora' });
    render(<BuscadorProductos />);
    expect(sugerenciasPedidas.every(([, habilitada]) => !habilitada)).toBe(true);
  });
});
