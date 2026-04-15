// frontend/components/landing/BrowserChrome.tsx

export function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-[#1A1F2C] bg-[#0A0C10] shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0F1117] border-b border-[#1A1F2C]">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F85149]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#00C896]/80" />
        </div>
        <div className="ml-2 flex-1 rounded-md bg-[#0A0C10] border border-[#1A1F2C] px-3 py-1 text-[10px] text-[#94A3B8] font-mono truncate">
          {url}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
