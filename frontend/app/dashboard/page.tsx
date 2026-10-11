import { redirect } from 'next/navigation';

/**
 * `/dashboard` ya no tiene pantalla propia: el panel era el resumen de una
 * cuenta, y el pivote a sitio público retiró las cuentas. Se manda al catálogo,
 * que es lo que un visitante viene a ver.
 *
 * Redirección temporal (307) a propósito: la URL pública definitiva llega en el
 * paso 10 del pivote, y una 308 se quedaría guardada en los navegadores.
 */
export default function DashboardPage() {
  redirect('/dashboard/tenders');
}
