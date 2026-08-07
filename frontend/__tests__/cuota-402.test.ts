/**
 * El 402 del backend tiene que llegar al banner de plan.
 *
 * `PlanUpgradeBanner` escuchaba `plan-upgrade-needed` y **nadie lo emitía**:
 * todos los topes —asientos, cuota de BI, documentos, alertas— se topaban en
 * silencio y el usuario veía una acción que no hacía nada. Es el tipo de fallo
 * que no rompe ningún test porque no rompe nada: sólo no ocurre.
 *
 * Se prueba contra el interceptor real de axios, que es donde vive la
 * traducción, en vez de contra una función suelta que podría dejar de estar
 * conectada sin que nadie se entere.
 */

import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mensajeDeError } from '@/lib/errores';

/** El detalle exacto que construye `_quota_error` en `core/plan_limits.py`. */
const DETALLE_402 = {
  bloqueada_por_plan: true,
  mensaje: 'El plan Básico incluye 1 usuario. Actualiza la suscripción para sumar más miembros.',
  plan_actual: 'basico',
  limite: 1,
  usado: 1,
  upgrade_sugerido: 'pyme',
};

async function provocar(status: number, data: unknown): Promise<void> {
  vi.spyOn(axios, 'create').mockReturnValue(
    axios as unknown as ReturnType<typeof axios.create>,
  );
  vi.resetModules();
  const { apiClient } = await import('@/lib/api');

  // El adaptador de axios es el punto donde se inyecta la respuesta sin red.
  const cliente = (apiClient as unknown as { client: typeof axios }).client;
  cliente.defaults.adapter = async (config) => {
    const error = new Error('respuesta simulada') as Error & { response?: unknown };
    error.response = { status, data, config, headers: {}, statusText: '' };
    throw error;
  };

  await apiClient.getEmpresas().catch(() => undefined);
}

describe('402 de cuota → banner de plan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emite plan-upgrade-needed con el detalle del backend', async () => {
    const oyente = vi.fn();
    window.addEventListener('plan-upgrade-needed', oyente);

    await provocar(402, { detail: DETALLE_402 });

    expect(oyente).toHaveBeenCalledTimes(1);
    const evento = oyente.mock.calls[0][0] as CustomEvent;
    // El banner pinta `mensaje` y `upgrade_sugerido`: si el detalle no viaja
    // entero, sale una tarjeta vacía sin sitio a donde ir.
    expect(evento.detail).toEqual(DETALLE_402);

    window.removeEventListener('plan-upgrade-needed', oyente);
  });

  it('no emite nada si el 402 no viene marcado por plan', async () => {
    const oyente = vi.fn();
    window.addEventListener('plan-upgrade-needed', oyente);

    await provocar(402, { detail: 'Pago requerido por otro motivo' });

    expect(oyente).not.toHaveBeenCalled();
    window.removeEventListener('plan-upgrade-needed', oyente);
  });

  it('no emite nada en un error corriente', async () => {
    const oyente = vi.fn();
    window.addEventListener('plan-upgrade-needed', oyente);

    await provocar(500, { detail: 'Error interno' });

    expect(oyente).not.toHaveBeenCalled();
    window.removeEventListener('plan-upgrade-needed', oyente);
  });
});

describe('mensajeDeError', () => {
  it('saca el texto del objeto de cuota, que es el que lee una persona', () => {
    const error = { response: { data: { detail: DETALLE_402 } } };
    expect(mensajeDeError(error)).toBe(DETALLE_402.mensaje);
  });

  it('acepta el detail en cadena de los errores normales', () => {
    const error = { response: { data: { detail: 'Ya eres miembro de esta empresa' } } };
    expect(mensajeDeError(error)).toBe('Ya eres miembro de esta empresa');
  });

  it('cae al respaldo cuando no hay nada legible', () => {
    expect(mensajeDeError(new Error('network'), 'No se pudo')).toBe('No se pudo');
  });
});
