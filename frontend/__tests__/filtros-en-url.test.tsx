/**
 * Una búsqueda del catálogo = una URL.
 *
 * Los filtros vivían sólo en `useState`: recargar los perdía y no había forma
 * de compartir, guardar ni seguir una búsqueda por RSS. Se fija:
 *   1. que leer y escribir la URL son inversos, y que un valor basura no rompe;
 *   2. que la pantalla arranca con los filtros de la URL y se los pide a la API;
 *   3. que al cambiar un filtro la URL se reescribe (con `replaceState`).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FILTROS_POR_DEFECTO,
  describirBusqueda,
  escribirFiltros,
  leerFiltros,
  paramsDeApi,
  soloFiltros,
} from '@/lib/filtrosCatalogo';

import { instalarAlmacenDePrueba } from './ayudas/almacenDePrueba';

let urlInicial = new URLSearchParams();
const pedidas: Record<string, unknown>[] = [];

vi.mock('next/navigation', () => ({
  useSearchParams: () => urlInicial,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/licitaciones',
}));

vi.mock('@/lib/queries', () => ({
  useLicitaciones: (params: Record<string, unknown>) => {
    pedidas.push(params);
    return { data: { items: [], total: 0, pages: 1 }, isFetching: false };
  },
  usePanelLicitacion: () => ({ data: null, isFetching: false, error: null }),
}));

describe('filtros ↔ URL', () => {
  it('leer(escribir(f)) = f', () => {
    const f = {
      ...FILTROS_POR_DEFECTO,
      terminos: ['válvulas', 'acero'],
      region: 'Región del Biobío',
      tipo_convocatoria: 'compra_agil',
      min_amount: '1000000',
      sort_by: 'monto_estimado' as const,
      sort_order: 'asc' as const,
      limit: 50,
      page: 3,
    };
    expect(leerFiltros(escribirFiltros(f))).toEqual(f);
  });

  it('los filtros por defecto dan una URL vacía', () => {
    expect(escribirFiltros(FILTROS_POR_DEFECTO).toString()).toBe('');
  });

  it('con términos y sin orden explícito, ordena por relevancia', () => {
    const f = leerFiltros(new URLSearchParams('search=zafiro'));
    expect(f.sort_by).toBe('relevance');
    expect(escribirFiltros(f).toString()).toBe('search=zafiro');
  });

  it('un valor basura vale lo de por defecto, sin romper', () => {
    const f = leerFiltros(
      new URLSearchParams('sort_by=DROP&sort_order=x&limit=9999&page=-2&min_amount=abc'),
    );
    expect(f.sort_by).toBe('fecha_publicacion');
    expect(f.sort_order).toBe('desc');
    expect(f.limit).toBe(20);
    expect(f.page).toBe(1);
    expect(f.min_amount).toBe('');
  });

  it('a la API va la página como offset', () => {
    const p = paramsDeApi({ ...FILTROS_POR_DEFECTO, page: 3, limit: 50 });
    expect(p.offset).toBe(100);
  });

  it('una búsqueda guardada sólo lleva los filtros, en orden fijo', () => {
    const q = soloFiltros(new URLSearchParams('page=4&region=X&utm_source=y&search=agua&sort_by=nombre'));
    expect(q.toString()).toBe('search=agua&region=X');
  });

  it('describe una búsqueda en una línea', () => {
    expect(describirBusqueda('search=agua+potable&tipo_convocatoria=compra_agil')).toBe(
      '«agua potable» · Compra Ágil',
    );
    expect(describirBusqueda('')).toBe('Todas las licitaciones');
  });
});

describe('la pantalla del catálogo', () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    instalarAlmacenDePrueba();
    pedidas.length = 0;
    replaceState = vi.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function montar() {
    const { default: TendersPage } = await import('@/app/(panel)/licitaciones/page');
    return render(<TendersPage />);
  }

  it('arranca con los filtros de la URL', async () => {
    urlInicial = new URLSearchParams('search=zafiro&region=Región del Biobío&page=2');
    await montar();

    expect(screen.getByText('zafiro')).toBeInTheDocument();
    const ultima = pedidas.at(-1)!;
    expect(ultima.search).toBe('zafiro');
    expect(ultima.region).toBe('Región del Biobío');
    expect(ultima.offset).toBe(20);
    expect(ultima.sort_by).toBe('relevance');
  });

  it('al buscar, la URL se reescribe', async () => {
    urlInicial = new URLSearchParams();
    await montar();

    const buscador = screen.getByPlaceholderText(/Nombre, organismo o descripción/i);
    fireEvent.change(buscador, { target: { value: 'válvulas' } });
    fireEvent.keyDown(buscador, { key: 'Enter' });

    const url = String(replaceState.mock.calls.at(-1)?.[2]);
    expect(new URLSearchParams(url.replace(/^\?/, '')).get('search')).toBe('válvulas');
    expect(pedidas.at(-1)!.search).toBe('válvulas');
  });

  it('«Guardar esta búsqueda» la guarda con sus filtros', async () => {
    urlInicial = new URLSearchParams('search=zafiro&page=3');
    await montar();

    fireEvent.click(screen.getByRole('button', { name: /guardar esta búsqueda/i }));

    const guardadas = JSON.parse(window.localStorage.getItem('tordo_busquedas_v1') ?? '[]');
    expect(guardadas.map((b: { consulta: string }) => b.consulta)).toEqual(['search=zafiro']);
    expect(screen.getByRole('link', { name: /búsqueda guardada/i })).toBeInTheDocument();
  });
});
