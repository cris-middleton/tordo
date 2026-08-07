// frontend/components/landing/BrowserChrome.tsx
import type { ReactNode } from 'react';

export function BrowserChrome({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-[#1E2736] bg-[#080B11] shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0E131C] border-b border-[#1E2736]">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#B91C1C]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#96590A]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3DB9BB]/80" />
        </div>
        <div className="ml-2 flex-1 rounded-md bg-[#080B11] border border-[#1E2736] px-3 py-1 text-[10px] text-[#5F7089] font-mono truncate">
          {url}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
