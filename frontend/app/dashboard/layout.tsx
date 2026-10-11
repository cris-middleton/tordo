import Layout from '@/components/Layout';

/**
 * Sin guarda de sesión: desde el pivote a sitio público no hay cuentas, y el
 * catálogo y la analítica los ve cualquiera.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}
