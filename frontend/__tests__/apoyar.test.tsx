/**
 * `/apoyar` y `GET /api/apoyar/transferencia` (paso 12 del pivote).
 *
 * Se fija:
 *   1. cada medio sale de su variable de servidor, y sólo con `https://`;
 *   2. sin ninguno, la página lo dice en vez de enseñar botones muertos;
 *   3. **los datos bancarios no están en el HTML de la página**: se piden con
 *      un clic, a una ruta `no-store` + `noindex` que no se prerenderiza;
 *   4. ningún componente cliente importa `lib/donaciones.ts` (lee variables de
 *      servidor). `check:secreto` lo comprueba además sobre el build real.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getDatosTransferencia = vi.fn();
vi.mock('@/lib/api', () => ({
  apiClient: { getDatosTransferencia: () => getDatosTransferencia() },
}));

import PaginaApoyar from '@/app/(publico)/apoyar/page';
import { GET, dynamic } from '@/app/api/apoyar/transferencia/route';
import { COSTOS, COSTO_MENSUAL_APROXIMADO, TOTAL, USO_INCLUIDO_EN_EL_PLAN, USO_RAILWAY_PROYECTADO } from '@/lib/costos';
import { datosTransferencia, mediosDeDonacion, urlSegura } from '@/lib/donaciones';

const DATOS = 'Banco de Prueba\nCuenta Vista 000-111-222\nRUT 11.111.111-1\nhola@ejemplo.cl';
const VARIABLES = ['DONAR_MERCADO_PAGO_URL', 'DONAR_GITHUB_SPONSORS_URL', 'DONAR_TRANSFERENCIA'];

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <PaginaApoyar />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const v of VARIABLES) delete process.env[v];
  getDatosTransferencia.mockReset();
});
afterEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});

describe('medios de donación', () => {
  it('sólo acepta URL https', () => {
    expect(urlSegura('https://link.mercadopago.cl/tordo')).toBe('https://link.mercadopago.cl/tordo');
    expect(urlSegura('  https://github.com/sponsors/x  ')).toBe('https://github.com/sponsors/x');
    expect(urlSegura('http://link.mercadopago.cl/tordo')).toBeNull();
    expect(urlSegura('javascript:alert(1)')).toBeNull();
    expect(urlSegura('no es una url')).toBeNull();
    expect(urlSegura('')).toBeNull();
    expect(urlSegura(undefined)).toBeNull();
  });

  it('Mercado Pago primero; un medio sin variable no aparece', () => {
    expect(mediosDeDonacion({})).toEqual({ enlaces: [], transferencia: false });
    const m = mediosDeDonacion({
      DONAR_GITHUB_SPONSORS_URL: 'https://github.com/sponsors/x',
      DONAR_MERCADO_PAGO_URL: 'https://link.mercadopago.cl/tordo',
      DONAR_TRANSFERENCIA: '   ',
    });
    expect(m.enlaces.map((e) => e.id)).toEqual(['mercado-pago', 'github-sponsors']);
    expect(m.transferencia).toBe(false);
  });

  it('la transferencia conserva los saltos de línea', () => {
    expect(datosTransferencia({ DONAR_TRANSFERENCIA: 'a\r\nb\n' })).toBe('a\nb');
  });
});

describe('la página', () => {
  it('sin variables dice que todavía no hay medios', () => {
    renderizar();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/todavía no hay medios de aporte habilitados/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /mercado pago/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /transferir/i })).toBeNull();
  });

  it('con variables enlaza cada medio y explica que es una donación', () => {
    process.env.DONAR_MERCADO_PAGO_URL = 'https://link.mercadopago.cl/tordo';
    process.env.DONAR_GITHUB_SPONSORS_URL = 'http://github.com/sponsors/x'; // sin https: fuera
    renderizar();
    const mp = screen.getByRole('link', { name: /aportar con mercado pago/i });
    expect(mp).toHaveAttribute('href', 'https://link.mercadopago.cl/tordo');
    expect(mp).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.queryByRole('link', { name: /github sponsors/i })).toBeNull();
    expect(screen.getByText(new RegExp(`${COSTO_MENSUAL_APROXIMADO.replace('$', '\\$')} al mes`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /términos de uso/i })).toHaveAttribute('href', '/terminos');
    expect(screen.getByRole('link', { name: /política de privacidad/i })).toHaveAttribute('href', '/privacidad');
  });

  it('desglosa el costo en #costos, con cada concepto y el total', () => {
    const { container } = renderizar();
    const seccion = container.querySelector('section#costos') as HTMLElement;
    expect(seccion).not.toBeNull();
    const tabla = within(seccion).getByRole('table', { name: /costo mensual/i });
    for (const c of COSTOS) {
      expect(within(tabla).getByRole('rowheader', { name: c.concepto })).toBeInTheDocument();
    }
    expect(within(tabla).getByText(TOTAL.monto)).toBeInTheDocument();
    // La prosa sale de las constantes: si el total cambia, esta frase cambia con él.
    const prosa = within(seccion).getByText(/El plan de Railway cuesta/).textContent ?? '';
    expect(prosa).toContain(`cuesta ${USO_INCLUIDO_EN_EL_PLAN} e incluye ${USO_INCLUIDO_EN_EL_PLAN} de uso`);
    expect(prosa).toContain(`proyecta ${USO_RAILWAY_PROYECTADO} al mes`);
    expect(prosa).toContain(`el total queda en ${COSTO_MENSUAL_APROXIMADO}`);
    expect(within(seccion).getByText(/Es una proyección, no una factura/)).toBeInTheDocument();
    expect(within(seccion).getAllByText(/^Estimado\.$/).length).toBe(
      COSTOS.filter((c) => c.base === 'estimado').length,
    );
  });

  it('los datos bancarios NO están en el HTML; llegan tras el clic', async () => {
    process.env.DONAR_TRANSFERENCIA = DATOS;
    getDatosTransferencia.mockResolvedValue({ texto: DATOS });
    const { container } = renderizar();

    expect(container.innerHTML).not.toContain('000-111-222');
    expect(getDatosTransferencia).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /ver datos para transferir/i }));
    expect(await screen.findByText(/Cuenta Vista 000-111-222/)).toBeInTheDocument();
    expect(getDatosTransferencia).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/apoyar/transferencia', () => {
  it('no se prerenderiza en el build', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('sin variable, 404', async () => {
    const r = GET();
    expect(r.status).toBe(404);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('con variable, el texto, sin caché y noindex', async () => {
    process.env.DONAR_TRANSFERENCIA = DATOS;
    const r = GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ texto: DATOS });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Robots-Tag')).toMatch(/noindex/);
  });
});

describe('lib/donaciones.ts no llega al navegador', () => {
  const RAIZ = join(__dirname, '..');
  function tsx(dir: string): string[] {
    return readdirSync(dir).flatMap((e) => {
      const r = join(dir, e);
      if (statSync(r).isDirectory()) return tsx(r);
      return /\.tsx?$/.test(r) ? [r] : [];
    });
  }
  const clientes = ['app', 'components', 'hooks', 'lib']
    .flatMap((d) => tsx(join(RAIZ, d)))
    .filter((r) => /^\s*['"]use client['"]/.test(readFileSync(r, 'utf-8')));

  it('hay componentes cliente que revisar', () => {
    expect(clientes.length).toBeGreaterThanOrEqual(10);
  });

  it('ningún componente cliente lo importa', () => {
    const infractores = clientes.filter((r) => /from\s+['"][^'"]*\/donaciones['"]/.test(readFileSync(r, 'utf-8')));
    expect(infractores).toEqual([]);
  });
});
