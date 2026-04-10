'use client';

interface DataFreshnessBarProps {
  lastUpdated?: string | null;
}

function getHoursAgo(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 3_600_000;
}

function formatRelativeTime(isoDate: string): string {
  const hours = getHoursAgo(isoDate);
  if (hours < 1) return 'hace menos de 1 hora';
  if (hours < 24) {
    const h = Math.floor(hours);
    return `hace ${h} hora${h !== 1 ? 's' : ''}`;
  }
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days !== 1 ? 's' : ''}`;
}

export function DataFreshnessBar({ lastUpdated }: DataFreshnessBarProps) {
  if (!lastUpdated) return null;

  let hoursAgo: number;
  try {
    hoursAgo = getHoursAgo(lastUpdated);
  } catch {
    return null;
  }

  if (hoursAgo <= 48) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-gold/30 bg-gold/8 px-4 py-3 animate-slide-up">
      <span className="status-dot-warn shrink-0" />
      <p className="text-sm text-gold">
        Datos de BI desactualizados — última sincronización {formatRelativeTime(lastUpdated)}
      </p>
    </div>
  );
}
