/**
 * Qué incluye cada plan, dicho una vez.
 *
 * Recibe el tier EFECTIVO (`usePlanActual().data?.tier`), nunca el contratado:
 * durante el trial se paga `basico` y se tiene `pro`.
 */
export function incluyePro(tier: string | undefined): boolean {
  return tier === 'pro' || tier === 'enterprise';
}
