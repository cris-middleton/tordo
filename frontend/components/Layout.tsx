'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TordoLogo from '@/components/TordoLogo';
import {
  LayoutDashboard,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  Star,
  ClipboardList,
  ChevronRight,
  Users,
  Briefcase,
  Receipt,
  Radar,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'Operaciones',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Licitaciones', href: '/dashboard/tenders', icon: Briefcase },
      { name: 'Órdenes de compra', href: '/dashboard/orders', icon: Receipt },
      { name: 'Postulaciones', href: '/dashboard/postulaciones', icon: ClipboardList },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { name: 'Inteligencia de Mercado', href: '/dashboard/bi', icon: Radar, badge: 'Pro' },
    ],
  },
  {
    label: 'Cuenta',
    items: [
      { name: 'Mi Empresa', href: '/dashboard/empresa', icon: Users },
      { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
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

  const allNavItems = navSections.flatMap((s) => s.items);

  useEffect(() => {
    // Read avatar on mount and listen for changes from the profile page
    setAvatar(localStorage.getItem('user_avatar'));
    const handleAvatarChange = () => setAvatar(localStorage.getItem('user_avatar'));
    window.addEventListener('avatar_changed', handleAvatarChange);
    return () => window.removeEventListener('avatar_changed', handleAvatarChange);
  }, []);

  // Routes that exist but are not listed in the sidebar nav
  const extraRouteNames: Record<string, string> = {
    '/dashboard/alerts': 'Alertas',
    '/dashboard/billing': 'Facturación',
    '/dashboard/calendario': 'Calendario',
    '/dashboard/documentos': 'Documentos',
  };

  const currentPage =
    allNavItems.find((n) => isActive(n.href))?.name ??
    Object.entries(extraRouteNames).find(([path]) => pathname.startsWith(path))?.[1] ??
    'Dashboard';

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
      {/* Sidebar — deep background with subtle top accent glow for brand identity */}
      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-64 flex-col border-r border-border shadow-sidebar transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'linear-gradient(180deg, var(--color-sidebar-from) 0%, var(--color-sidebar-to) 35%)' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-borderLight">
          <button
            onClick={() => navigate('/dashboard')}
            className="group flex items-center gap-2.5 focus-visible:outline-none"
          >
            <TordoLogo size={24} />
            <span
              className="font-brand font-bold text-primary block transition-colors group-hover:text-primaryLight leading-none tracking-tight"
              style={{ fontSize: '1.375rem' }}
            >
              Tordo
            </span>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-primary lg:hidden"
          >
            <X className="h-5 w-5" />
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
                      {item.badge ? (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <Star size={9} />
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
            <button
              onClick={() => navigate('/dashboard/empresa')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white text-sm font-medium hover:ring-2 hover:ring-primary/40 hover:ring-offset-1 hover:ring-offset-background transition-all"
              title="Mi perfil"
            >
              {avatar ? <span className="text-xl leading-none">{avatar}</span> : initials}
            </button>
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
        {/* Top bar — command center header with live status indicator */}
        <header className="sticky top-0 z-30 border-b border-border backdrop-blur-md"
          style={{ background: 'var(--color-header-bg)' }}
        >
          <div className="flex h-14 items-center gap-4 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-primary/8 hover:text-primary lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => navigate('/dashboard')}
                className="font-brand font-bold text-subtle hidden sm:block tracking-tighter hover:text-primary transition-colors"
              >
                Tordo
              </button>
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

        {/* Main content with subtle grid texture for depth */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
