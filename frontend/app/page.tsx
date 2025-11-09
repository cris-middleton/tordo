'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, loading, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <Image
        src="/LicitApp_logo.png"
        alt="LicitUp logo"
        width={96}
        height={96}
        className="h-24 w-24 rounded-full border border-border object-contain shadow-sm"
        priority
      />
      <h1 className="text-3xl font-semibold text-[#333333]">LicitUp</h1>
      <p className="max-w-md text-sm text-muted">
        Plataforma moderna LicitUp para explorar licitaciones públicas, órdenes de compra y alertas
        clave para tu organización.
      </p>
    </div>
  );
}

