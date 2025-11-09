'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Licitaciones', href: '/dashboard/tenders', icon: FileText },
    { name: 'Órdenes de Compra', href: '/dashboard/orders', icon: ShoppingCart },
    { name: 'Alertas', href: '/dashboard/alerts', icon: Bell },
    { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
  ];

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href;

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 border-r border-border bg-surface shadow-sm transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <button
              onClick={() => {
                router.push('/dashboard');
                setSidebarOpen(false);
              }}
              className="flex items-center gap-3"
            >
              <Image
                src="/LicitApp_logo.png"
                alt="LicitUp isotipo"
                width={40}
                height={40}
                className="h-10 w-10 rounded-full border border-border bg-white object-contain shadow-sm"
              />
              <span className="text-xl font-semibold tracking-tight text-[#333333]">LicitUp</span>
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-muted transition-colors duration-200 hover:text-primary lg:hidden"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-2 px-4 py-5">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={() => {
                    router.push(item.href);
                    setSidebarOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </button>
              );
            })}
          </nav>

          {/* User section */}
          <div className="border-t border-border px-5 py-4">
            <div className="mb-4">
              <p className="text-sm font-semibold text-text">{user?.full_name || user?.username}</p>
              <p className="text-xs text-muted">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm font-semibold text-muted transition-colors duration-200 hover:border-primary/40 hover:text-primary"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-muted transition-colors duration-200 hover:text-primary lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex-1" />
          </div>
        </header>

        {/* Page content */}
        <main className="bg-background p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

