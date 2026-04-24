'use client';

import Link from 'next/link';
import { Search, Upload, Calendar, Bell } from 'lucide-react';

const ACTIONS = [
  { href: '/dashboard/tenders', icon: Search, label: 'Buscar licitaciones' },
  { href: '/dashboard/documentos', icon: Upload, label: 'Subir documento' },
  { href: '/dashboard/calendario', icon: Calendar, label: 'Ver calendario' },
  { href: '/dashboard/alerts', icon: Bell, label: 'Configurar alertas' },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="card p-4 flex flex-col items-center justify-center gap-1.5 hover:border-primary/30 transition-colors"
        >
          <a.icon size={18} className="text-primary" />
          <span className="text-xs font-medium text-text text-center">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}
