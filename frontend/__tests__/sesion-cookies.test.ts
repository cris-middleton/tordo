import { describe, expect, it, vi } from 'vitest';

/**
 * Las opciones de las cookies de sesión.
 *
 * Todo el valor del proxy depende de una palabra: `httpOnly`. Sin ella la cookie
 * es legible por JavaScript y estamos donde estábamos —el token en el
 * navegador— pero con la falsa sensación de haberlo arreglado.
 *
 * Es el tipo de detalle que se pierde en un refactor sin que nada falle, así que
 * se fija aquí.
 */

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

describe('cookies de sesión', () => {
  it('el acceso y el refresco son httpOnly', async () => {
    const { guardarSesion } = await import('@/lib/servidor/sesion');
    const { NextResponse } = await import('next/server');

    const res = guardarSesion(NextResponse.json({}), 'acceso-x', 'refresco-y');

    expect(res.cookies.get('tordo_acceso')?.httpOnly).toBe(true);
    expect(res.cookies.get('tordo_refresco')?.httpOnly).toBe(true);
  });

  it('van con sameSite lax, no strict', async () => {
    // Con `strict` la cookie no viaja al volver de Google y el callback deja de
    // funcionar. Es un fallo que sólo aparece con OAuth, así que se fija.
    const { guardarSesion } = await import('@/lib/servidor/sesion');
    const { NextResponse } = await import('next/server');

    const res = guardarSesion(NextResponse.json({}), 'a', 'b');
    expect(res.cookies.get('tordo_acceso')?.sameSite).toBe('lax');
  });

  it('el acceso caduca con el token y el refresco dura más', async () => {
    const { guardarSesion } = await import('@/lib/servidor/sesion');
    const { NextResponse } = await import('next/server');

    const res = guardarSesion(NextResponse.json({}), 'a', 'b');
    // 30 min: una cookie que sobreviva al JWT sólo sirve para producir 401.
    expect(res.cookies.get('tordo_acceso')?.maxAge).toBe(30 * 60);
    expect(res.cookies.get('tordo_refresco')?.maxAge).toBe(30 * 24 * 60 * 60);
  });

  it('sin refresco no escribe esa cookie', async () => {
    // Es el caso de Google: el backend sólo manda el token de acceso.
    const { guardarSesion } = await import('@/lib/servidor/sesion');
    const { NextResponse } = await import('next/server');

    const res = guardarSesion(NextResponse.json({}), 'solo-acceso');
    expect(res.cookies.get('tordo_acceso')?.value).toBe('solo-acceso');
    expect(res.cookies.get('tordo_refresco')).toBeUndefined();
  });

  it('borrar la sesión vacía las dos cookies', async () => {
    const { borrarSesion } = await import('@/lib/servidor/sesion');
    const { NextResponse } = await import('next/server');

    const res = borrarSesion(NextResponse.json({}));
    expect(res.cookies.get('tordo_acceso')?.value).toBe('');
    expect(res.cookies.get('tordo_acceso')?.maxAge).toBe(0);
    expect(res.cookies.get('tordo_refresco')?.maxAge).toBe(0);
  });
});
