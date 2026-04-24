const KEY = 'tordo_empresa_activa_id';

export function getEmpresaActiva(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setEmpresaActiva(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, id);
}

export function clearEmpresaActiva(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
