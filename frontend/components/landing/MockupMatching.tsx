// frontend/components/landing/MockupMatching.tsx
'use client';

import { Search } from 'lucide-react';
import { BrowserChrome } from './BrowserChrome';
import { useRotatingExample } from './useRotatingExample';

interface MatchResult {
  titulo: string;
  comprador: string;
  monto: string;
  diasCierre: number;
  calce: number; // 70-100
}

interface MatchingExample {
  rubro: string;
  resultados: MatchResult[];
  insight: string;
}

const MATCHING_EXAMPLES: MatchingExample[] = [
  {
    rubro: 'Limpieza hospitalaria',
    resultados: [
      { titulo: 'Aseo terminal recinto salud',      comprador: 'Hospital Metropolitano', monto: '$3.2M', diasCierre: 12, calce: 96 },
      { titulo: 'Sanitización áreas UCI',           comprador: 'Clínica Familiar Ñuñoa', monto: '$1.8M', diasCierre: 8,  calce: 89 },
      { titulo: 'Desinfección clínica ambulatoria', comprador: 'CESFAM Peñalolén',       monto: '$960K', diasCierre: 20, calce: 82 },
    ],
    insight: 'Con una búsqueda por palabras exactas, habrías visto 1 de estas 3 licitaciones.',
  },
  {
    rubro: 'Computadores corporativos',
    resultados: [
      { titulo: "Notebook 14'' Intel i5",               comprador: 'Ministerio de Hacienda', monto: '$2.1M', diasCierre: 9,  calce: 94 },
      { titulo: 'Laptop ejecutivo empresarial',          comprador: 'CORFO',                  monto: '$1.4M', diasCierre: 15, calce: 87 },
      { titulo: 'Equipo portátil usuarios funcionarios', comprador: 'SII',                    monto: '$3.8M', diasCierre: 7,  calce: 78 },
    ],
    insight: "Con una búsqueda por 'computadores', te habrías perdido el 67% de estas.",
  },
  {
    rubro: 'Papelería oficina',
    resultados: [
      { titulo: 'Resmas papel 75g',                  comprador: 'Mun. de La Florida',     monto: '$480K', diasCierre: 6,  calce: 92 },
      { titulo: 'Insumos escritorio administrativo', comprador: 'Gob. Regional RM',        monto: '$720K', diasCierre: 11, calce: 84 },
      { titulo: 'Suministros oficina ministerio',     comprador: 'Ministerio de Economía', monto: '$1.1M', diasCierre: 18, calce: 76 },
    ],
    insight: "Solo la primera aparecería si buscas 'resmas'. Las otras 2 pasan desapercibidas.",
  },
  {
    rubro: 'Construcción vial menor',
    resultados: [
      { titulo: 'Reparación veredas comuna',   comprador: 'Mun. de Talca',  monto: '$8.4M', diasCierre: 22, calce: 91 },
      { titulo: 'Bacheo calles urbanas',        comprador: 'SERVIU Maule',   monto: '$12M',  diasCierre: 14, calce: 85 },
      { titulo: 'Reposición aceras peatonales', comprador: 'Mun. de Curicó', monto: '$5.2M', diasCierre: 30, calce: 80 },
    ],
    insight: "Buscando 'veredas' te pierdes 'bacheo' y 'aceras' — 2 de 3 oportunidades.",
  },
];

function calceColor(pct: number): string {
  if (pct >= 90) return '#00C896';
  if (pct >= 80) return '#00C896BB';
  return '#00C89688';
}

export function MockupMatching() {
  const { activeIndex, setActiveIndex, containerRef, handleMouseEnter, handleMouseLeave } =
    useRotatingExample({ count: MATCHING_EXAMPLES.length, intervalMs: 5000 });
  const ex = MATCHING_EXAMPLES[activeIndex];

  return (
    <div ref={containerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Ejemplo ${activeIndex + 1} de ${MATCHING_EXAMPLES.length}: rubro ${ex.rubro}`}
      </div>

      <BrowserChrome url="tordo.cl/dashboard/tenders">
        <div key={activeIndex} className="animate-fade-in">
          {/* Search bar */}
          <div className="flex items-center gap-2 rounded-lg bg-[#0F1117] border border-[#1A1F2C] px-3 py-2 mb-1">
            <Search className="h-3 w-3 flex-shrink-0 text-[#94A3B8]" />
            <span className="text-[11px] text-[#E2E8F0] font-medium">{ex.rubro}</span>
          </div>
          <p className="text-[9px] text-[#94A3B8] mb-3">
            {ex.resultados.length} licitaciones que calzan con lo que vendes:
          </p>

          {/* Result cards */}
          <div className="space-y-2 mb-3">
            {ex.resultados.map((r, i) => (
              <div
                key={i}
                className="relative rounded-lg bg-[#0F1117] border border-[#1A1F2C] px-3 py-2"
              >
                {/* Calce badge */}
                <span
                  className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold text-[#0A0C10]"
                  style={{ background: calceColor(r.calce) }}
                >
                  {r.calce}%
                </span>
                <p className="text-[10px] font-semibold text-[#E2E8F0] pr-10 mb-0.5 truncate">
                  {r.titulo}
                </p>
                <div className="flex items-center gap-2 text-[8px] text-[#94A3B8]">
                  <span className="truncate">{r.comprador}</span>
                  <span>·</span>
                  <span>{r.monto}</span>
                  <span>·</span>
                  <span className="text-[#F59E0B] flex-shrink-0">{r.diasCierre}d</span>
                </div>
              </div>
            ))}
          </div>

          {/* Insight */}
          <div className="rounded-lg bg-[#0EAD69]/10 border border-[#0EAD69]/20 px-3 py-2">
            <p className="text-[10px] text-[#E2E8F0]">💡 {ex.insight}</p>
          </div>
        </div>
      </BrowserChrome>

      {/* Dots navigation */}
      <div
        className="flex justify-center gap-1.5 mt-3"
        role="tablist"
        aria-label="Ejemplos de matching semántico"
      >
        {MATCHING_EXAMPLES.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Ejemplo ${i + 1}: ${MATCHING_EXAMPLES[i].rubro}`}
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0EAD69] ${
              i === activeIndex ? 'w-4 bg-[#0EAD69]' : 'w-1.5 bg-[#94A3B8]/40 hover:bg-[#94A3B8]'
            }`}
          />
        ))}
      </div>

      {/* Mobile arrows */}
      <div className="flex justify-center items-center gap-4 mt-2 md:hidden">
        <button
          onClick={() =>
            setActiveIndex(
              (activeIndex - 1 + MATCHING_EXAMPLES.length) % MATCHING_EXAMPLES.length,
            )
          }
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Ejemplo anterior"
        >
          ‹
        </button>
        <span className="text-[10px] text-[#94A3B8]">
          {activeIndex + 1} / {MATCHING_EXAMPLES.length}
        </span>
        <button
          onClick={() => setActiveIndex((activeIndex + 1) % MATCHING_EXAMPLES.length)}
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Siguiente ejemplo"
        >
          ›
        </button>
      </div>
    </div>
  );
}
