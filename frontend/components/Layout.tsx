'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import TordoLogo from '@/components/TordoLogo';
import SelectorTema from '@/components/SelectorTema';
import { PieAtribucion } from '@/components/legal/PieAtribucion';
import { Menu, X, ChevronRight, Briefcase, Radar } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

/* «Inteligencia de mercado» va con mayúscula sólo en la primera palabra: la
   mayúscula en cada palabra es una convención del inglés.

   Desde el pivote a sitio público el menú sólo lleva lo que ve un visitante
   anónimo. Panel, Postulaciones, Órdenes y el grupo «Cuenta» se fueron con las
   cuentas. */
const navSections: NavSection[] = [
  {
    label: 'Explorar',
    items: [{ name: 'Licitaciones', href: '/dashboard/tenders', icon: Briefcase }],
  },
  {
    label: 'Análisis',
    items: [{ name: 'Inteligencia de mercado', href: '/dashboard/bi', icon: Radar }],
  },
];

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (href: string) => pathname.startsWith(href);

  const navigate = (href: string) => {
    router.push(href);
    setSidebarOpen(false);
  };

  const allNavItems = navSections.flatMap((s) => s.items);

  const currentPage = allNavItems.find((n) => isActive(n.href))?.name ?? 'Licitaciones';

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-primary/20 backdrop-blur-sm lg:hidden animate-fade-in"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Sidebar ─── */}
      {/* Sidebar — deep background with subtle top accent glow for brand identity */}
      <aside
        id="nav-lateral"
        aria-label="Navegación principal"
        className={`fixed top-0 left-0 z-50 flex h-full w-64 flex-col border-r border-border shadow-sidebar transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'linear-gradient(180deg, var(--color-sidebar-from) 0%, var(--color-sidebar-to) 35%)' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-borderLight">
          <button
            onClick={() => navigate('/')}
            className="group flex items-center gap-2.5 focus-visible:outline-none"
          >
            <TordoLogo size={24} />
            <span
              className="font-brand font-bold text-primary block transition-colors group-hover:text-accent leading-none tracking-tight"
              style={{ fontSize: '1.375rem' }}
            >
              Tordo
            </span>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-primary lg:hidden"
            aria-label="Cerrar menú de navegación"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4 scrollbar-thin">
          {navSections.map((section, sIdx) => (
            <div key={section.label}>
              <p className="px-3 mb-2 text-[10px] font-bold tracking-widest text-subtle uppercase">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item, idx) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <button
                      key={item.name}
                      onClick={() => navigate(item.href)}
                      style={{ animationDelay: `${(sIdx * 3 + idx) * 40}ms` }}
                      className={`relative group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 animate-slide-in-left ${
                        active
                          ? 'bg-primary/8 text-primary font-semibold'
                          : 'text-muted font-medium hover:bg-primary/6 hover:text-primary'
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-primary" />
                      )}
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon
                          className={`shrink-0 transition-colors ${
                            active ? 'text-primary' : 'text-subtle group-hover:text-primary'
                          }`}
                          strokeWidth={active ? 2.5 : 2}
                          size={17}
                        />
                        <span className="truncate">{item.name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Apariencia: vivía en Configuración, que se fue con las cuentas. */}
        <div className="border-t border-borderLight px-4 py-4">
          <p className="mb-2 px-1 text-[10px] font-bold tracking-widest text-subtle uppercase">
            Apariencia
          </p>
          <SelectorTema />
        </div>
      </aside>

      {/* ─── Main content ─── */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Top bar — command center header with live status indicator */}
        <header className="sticky top-0 z-30 border-b border-border backdrop-blur-md"
          style={{ background: 'var(--color-header-bg)' }}
        >
          <div className="flex h-14 items-center gap-4 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-primary/8 hover:text-primary lg:hidden"
              aria-label="Abrir menú de navegación"
              aria-expanded={sidebarOpen}
              aria-controls="nav-lateral"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => navigate('/')}
                className="font-brand font-bold text-subtle hidden sm:block tracking-tighter hover:text-primary transition-colors"
              >
                Tordo
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-subtle hidden sm:block" />
              <span className="font-semibold text-text">{currentPage}</span>
            </div>
            <div className="flex-1" />
          </div>
        </header>

        {/* Main content with subtle grid texture for depth */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in">
          {children}
        </main>

        {/* Dentro de la columna de contenido y no en el layout raíz: a ancho
            completo, la barra lateral fija lo taparía. La cita de la fuente es
            una condición de uso de los datos — ver `PieAtribucion`. */}
        <footer className="border-t border-border px-4 py-6 sm:px-6 lg:px-8">
          <PieAtribucion />
        </footer>
      </div>
    </div>
  );
}
