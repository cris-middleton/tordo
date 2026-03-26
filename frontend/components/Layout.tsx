'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';
import {
  LayoutDashboard,
  FileText,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  BarChart3,
  Star,
  FolderOpen,
  ClipboardList,
  CreditCard,
  ChevronRight,
  Calendar,
  Users,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Licitaciones', href: '/dashboard/tenders', icon: FileText },
  { name: 'Postulaciones', href: '/dashboard/postulaciones', icon: ClipboardList },
  { name: 'Calendario', href: '/dashboard/calendario', icon: Calendar },
  { name: 'Documentos', href: '/dashboard/documentos', icon: FolderOpen },
  { name: 'Mi Empresa', href: '/dashboard/empresa', icon: Users },
  { name: 'Inteligencia BI', href: '/dashboard/bi', icon: BarChart3, badge: 'Pro' },
  { name: 'Alertas', href: '/dashboard/alerts', icon: Bell },
  { name: 'Facturación', href: '/dashboard/billing', icon: CreditCard },
  { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
];

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const navigate = (href: string) => {
    router.push(href);
    setSidebarOpen(false);
  };

  const currentPage = navigation.find((n) => isActive(n.href))?.name ?? 'Dashboard';

  const initials = user?.full_name
    ? user.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.username?.slice(0, 2).toUpperCase() ?? 'U';

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-primary/20 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Sidebar ─── */}
      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-64 flex-col border-r border-border bg-surface shadow-sidebar transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-borderLight">
          <button
            onClick={() => navigate('/dashboard')}
            className="group flex items-center gap-3 focus-visible:outline-none"
          >
            <div className="relative h-9 w-9 shrink-0">
              <Image
                src="/images/TORDO_logo.png"
                alt="TORDO"
                fill
                sizes="36px"
                className="object-contain transition-opacity duration-300 absolute group-hover:opacity-0"
                priority
              />
              <Image
                src="/images/TORDO_logo_openwings.png"
                alt="TORDO"
                fill
                sizes="36px"
                className="object-contain transition-opacity duration-300 absolute opacity-0 group-hover:opacity-100"
                priority
              />
            </div>
            <div className="leading-none">
              <span className="font-display text-lg font-bold tracking-tight text-primary">
                TORDO
              </span>
              <p className="text-[10px] font-medium tracking-widest text-muted uppercase mt-0.5">
                Mercado Público
              </p>
            </div>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-primary lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 scrollbar-thin">
          <p className="px-3 mb-2 text-[10px] font-bold tracking-widest text-subtle uppercase">
            Menú principal
          </p>
          {navigation.map((item, idx) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.href)}
                style={{ animationDelay: `${idx * 40}ms` }}
                className={`group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 animate-slide-in-left ${
                  active
                    ? 'bg-primary/8 text-primary font-semibold shadow-[inset_3px_0_0_#0F2942]'
                    : 'text-muted font-medium hover:bg-primary/6 hover:text-primary'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`shrink-0 transition-colors ${
                      active ? 'text-primary' : 'text-subtle group-hover:text-primary'
                    }`}
                    strokeWidth={active ? 2.5 : 2}
                    size={17}
                  />
                  <span>{item.name}</span>
                </div>
                {item.badge ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold text-white">
                    <Star size={9} />
                    {item.badge}
                  </span>
                ) : active ? (
                  <ChevronRight className="h-3.5 w-3.5 text-primary/50" />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-borderLight px-4 py-4">
          {user?.plan_tier && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-background px-3 py-2">
              <div className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="text-xs font-medium text-muted">
                Plan{' '}
                <span className="font-bold text-text capitalize">
                  {user.plan_tier === 'pro' ? 'Pro' : user.plan_tier === 'starter' ? 'Starter' : 'Free'}
                </span>
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white text-sm font-bold font-display">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">
                {user?.full_name || user?.username}
              </p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-all hover:bg-danger/8 hover:text-danger"
          >
            <LogOut size={15} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ─── Main content ─── */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
          <div className="flex h-14 items-center gap-4 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-primary/8 hover:text-primary lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-subtle hidden sm:block">TORDO</span>
              <ChevronRight className="h-3.5 w-3.5 text-subtle hidden sm:block" />
              <span className="font-semibold text-text">{currentPage}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => navigate('/dashboard/alerts')}
              className="relative rounded-lg p-2 text-muted transition-colors hover:bg-primary/8 hover:text-primary"
              title="Alertas"
            >
              <Bell size={17} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
