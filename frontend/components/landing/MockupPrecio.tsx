// frontend/components/landing/MockupPrecio.tsx
'use client';

import { BrowserChrome } from './BrowserChrome';
import { useRotatingExample } from './useRotatingExample';

interface Adjudicacion {
  comprador: string;
  fecha: string;
  monto: string;
}

interface PrecioExample {
  producto: string;
  unidad: string;
  mediana: string;
  medianaRaw: number;
  minStr: string;
  maxStr: string;
  minRaw: number;
  maxRaw: number;
  cotizacion: string;
  cotizacionRaw: number;
  target: string;
  tendencia: string;
  adjudicaciones: Adjudicacion[];
  insight: string;
}

const PRECIO_EXAMPLES: PrecioExample[] = [
  {
    producto: 'Servicio aseo terminal recinto salud',
    unidad: 'mes',
    mediana: '$2.8M',
    medianaRaw: 2_800_000,
    minStr: '$2.1M',
    maxStr: '$3.6M',
    minRaw: 2_100_000,
    maxRaw: 3_600_000,
    cotizacion: '$3.2M',
    cotizacionRaw: 3_200_000,
    target: '$2.9M',
    tendencia: '↑ 3%',
    adjudicaciones: [
      { comprador: 'Hospital San Juan de Dios', fecha: 'Nov 2025', monto: '$2.9M' },
      { comprador: 'CESFAM Peñalolén',          fecha: 'Oct 2025', monto: '$2.6M' },
      { comprador: 'Hospital Militar',           fecha: 'Sep 2025', monto: '$3.1M' },
    ],
    insight:
      'Este comprador adjudica típicamente en el rango medio. Puedes ganar sin ofrecer el precio más bajo.',
  },
  {
    producto: 'Notebook corporativo Intel i5',
    unidad: 'unidad',
    mediana: '$680.000',
    medianaRaw: 680_000,
    minStr: '$580K',
    maxStr: '$820K',
    minRaw: 580_000,
    maxRaw: 820_000,
    cotizacion: '$760.000',
    cotizacionRaw: 760_000,
    target: '$695.000',
    tendencia: '↓ 2%',
    adjudicaciones: [
      { comprador: 'Ministerio de Hacienda', fecha: 'Dic 2025', monto: '$640.000' },
      { comprador: 'SUBDERE',                fecha: 'Nov 2025', monto: '$695.000' },
      { comprador: 'Servicio Civil',          fecha: 'Oct 2025', monto: '$620.000' },
    ],
    insight:
      'Este comprador adjudica casi siempre cerca del precio mínimo. Conviene afilar la cotización al máximo.',
  },
  {
    producto: 'Resma papel carta 75g',
    unidad: 'unidad',
    mediana: '$2.450',
    medianaRaw: 2_450,
    minStr: '$2.100',
    maxStr: '$2.900',
    minRaw: 2_100,
    maxRaw: 2_900,
    cotizacion: '$2.700',
    cotizacionRaw: 2_700,
    target: '$2.500',
    tendencia: '↑ 1%',
    adjudicaciones: [
      { comprador: 'Municipalidad de La Florida', fecha: 'Ene 2026', monto: '$2.380' },
      { comprador: 'Mun. de Maipú',               fecha: 'Dic 2025', monto: '$2.420' },
      { comprador: 'Gob. Regional RM',             fecha: 'Nov 2025', monto: '$2.510' },
    ],
    insight:
      'Este comprador adjudica casi siempre al precio más bajo. Compite en costo o mira mejores licitaciones.',
  },
  {
    producto: 'Uniforme escolar kit básico',
    unidad: 'kit',
    mediana: '$18.000',
    medianaRaw: 18_000,
    minStr: '$15K',
    maxStr: '$22K',
    minRaw: 15_000,
    maxRaw: 22_000,
    cotizacion: '$20.000',
    cotizacionRaw: 20_000,
    target: '$18.500',
    tendencia: '↑ 5%',
    adjudicaciones: [
      { comprador: 'JUNAEB Región Metropolitana', fecha: 'Feb 2026', monto: '$17.800' },
      { comprador: 'Mun. de Pudahuel',             fecha: 'Ene 2026', monto: '$19.200' },
      { comprador: 'Mun. de San Bernardo',          fecha: 'Dic 2025', monto: '$18.500' },
    ],
    insight: 'Este comprador adjudica en un rango amplio. Hay margen para no ser el más barato.',
  },
  {
    producto: 'Reparación de veredas municipales',
    unidad: 'proyecto',
    mediana: '$12M',
    medianaRaw: 12_000_000,
    minStr: '$9M',
    maxStr: '$16M',
    minRaw: 9_000_000,
    maxRaw: 16_000_000,
    cotizacion: '$14M',
    cotizacionRaw: 14_000_000,
    target: '$12.5M',
    tendencia: '↑ 4%',
    adjudicaciones: [
      { comprador: 'SERVIU Región del Maule', fecha: 'Mar 2026', monto: '$11.8M' },
      { comprador: 'Mun. de Talca',            fecha: 'Feb 2026', monto: '$13.2M' },
      { comprador: 'Mun. de Curicó',           fecha: 'Ene 2026', monto: '$10.9M' },
    ],
    insight:
      'Este comprador adjudica en el rango alto. No tienes que ser el más barato para ganar acá.',
  },
  {
    producto: 'Suministro alimentación JUNAEB',
    unidad: 'ración',
    mediana: '$1.850',
    medianaRaw: 1_850,
    minStr: '$1.650',
    maxStr: '$2.200',
    minRaw: 1_650,
    maxRaw: 2_200,
    cotizacion: '$2.050',
    cotizacionRaw: 2_050,
    target: '$1.900',
    tendencia: '↑ 6%',
    adjudicaciones: [
      { comprador: 'JUNAEB Bío Bío',      fecha: 'Mar 2026', monto: '$1.780' },
      { comprador: 'JUNAEB La Araucanía', fecha: 'Feb 2026', monto: '$1.920' },
      { comprador: 'JUNAEB Valparaíso',   fecha: 'Ene 2026', monto: '$1.840' },
    ],
    insight:
      'Este comprador adjudica típicamente en el rango medio-alto. No bajes al mínimo solo por ganar.',
  },
];

export function MockupPrecio() {
  const { activeIndex, setActiveIndex, containerRef, handleMouseEnter, handleMouseLeave } =
    useRotatingExample({ count: PRECIO_EXAMPLES.length, intervalMs: 5000 });
  const ex = PRECIO_EXAMPLES[activeIndex];
  const range = ex.maxRaw - ex.minRaw;
  const medianPct = (((ex.medianaRaw - ex.minRaw) / range) * 100).toFixed(1);
  const quotePct = (((ex.cotizacionRaw - ex.minRaw) / range) * 100).toFixed(1);
  const trendUp = ex.tendencia.startsWith('↑');

  return (
    <div ref={containerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Ejemplo ${activeIndex + 1} de ${PRECIO_EXAMPLES.length}: ${ex.producto}`}
      </div>

      <BrowserChrome url="tordo.cl/dashboard/bi">
        <div key={activeIndex} className="animate-fade-in">
          {/* Header */}
          <p className="text-[10px] text-[#94A3B8] mb-1 truncate">{ex.producto}</p>

          {/* Mediana XL + tendencia */}
          <div className="flex items-baseline gap-2 mb-0.5">
            <span
              className="text-2xl font-bold text-[#E2E8F0]"
              style={{ fontFamily: 'var(--font-outfit, system-ui)' }}
            >
              {ex.mediana}
            </span>
            <span className="text-[9px] text-[#94A3B8]">/ {ex.unidad}</span>
            <span
              className={`ml-auto text-[9px] font-semibold ${trendUp ? 'text-[#00C896]' : 'text-[#F85149]'}`}
            >
              {ex.tendencia} vs hace 12 m.
            </span>
          </div>
          <p className="text-[8px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">
            Mediana de adjudicación
          </p>

          {/* Range bar */}
          <div className="relative h-1.5 bg-[#1A1F2C] rounded-full mb-1">
            {/* Mediana marker (green) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[#00C896] border-2 border-[#0A0C10]"
              style={{ left: `${medianPct}%` }}
            />
            {/* Cotización marker (yellow) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[#F59E0B] border-2 border-[#0A0C10]"
              style={{ left: `${quotePct}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-[#94A3B8] mb-3">
            <span>{ex.minStr} Mín</span>
            <span className="text-[#00C896]">{ex.mediana} Med.</span>
            <span className="text-[#F59E0B]">{ex.cotizacion} Tu cot.</span>
            <span>{ex.maxStr} Máx</span>
          </div>

          {/* Callout simulador */}
          <div className="rounded-lg bg-[#0EAD69]/10 border border-[#0EAD69]/20 px-3 py-2 mb-3">
            <p className="text-[10px] text-[#E2E8F0] leading-relaxed">
              💡 Tu cotización de <strong>{ex.cotizacion}</strong> está sobre 3 de cada 4
              adjudicaciones. Si bajas a <strong>{ex.target}</strong>, te acercas al precio que
              suele ganar.
            </p>
          </div>

          {/* Tabla adjudicaciones */}
          <div className="rounded-lg bg-[#0F1117] border border-[#1A1F2C] overflow-hidden mb-2">
            <div className="grid grid-cols-[1.8fr_0.9fr_0.8fr] px-3 py-1.5 text-[8px] font-semibold text-[#94A3B8] uppercase tracking-wider border-b border-[#1A1F2C]">
              <span>Comprador</span>
              <span>Fecha</span>
              <span>Monto</span>
            </div>
            {ex.adjudicaciones.map((adj, i) => (
              <div
                key={i}
                className={`grid grid-cols-[1.8fr_0.9fr_0.8fr] px-3 py-1.5 items-center ${
                  i < ex.adjudicaciones.length - 1 ? 'border-b border-[#1A1F2C]' : ''
                }`}
              >
                <span className="text-[9px] text-[#E2E8F0] truncate">{adj.comprador}</span>
                <span className="text-[8px] text-[#94A3B8]">{adj.fecha}</span>
                <span className="text-[9px] font-semibold text-[#00C896]">{adj.monto}</span>
              </div>
            ))}
          </div>

          {/* Footer insight */}
          <p className="text-[9px] text-[#94A3B8] leading-relaxed">📌 {ex.insight}</p>
        </div>
      </BrowserChrome>

      {/* Dots navigation */}
      <div
        className="flex justify-center gap-1.5 mt-3"
        role="tablist"
        aria-label="Ejemplos de análisis de precio"
      >
        {PRECIO_EXAMPLES.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Ejemplo ${i + 1}: ${PRECIO_EXAMPLES[i].producto}`}
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0EAD69] ${
              i === activeIndex ? 'w-4 bg-[#0EAD69]' : 'w-1.5 bg-[#94A3B8]/40 hover:bg-[#94A3B8]'
            }`}
          />
        ))}
      </div>

      {/* Mobile arrows (hidden on md+) */}
      <div className="flex justify-center items-center gap-4 mt-2 md:hidden">
        <button
          onClick={() =>
            setActiveIndex((activeIndex - 1 + PRECIO_EXAMPLES.length) % PRECIO_EXAMPLES.length)
          }
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Ejemplo anterior"
        >
          ‹
        </button>
        <span className="text-[10px] text-[#94A3B8]">
          {activeIndex + 1} / {PRECIO_EXAMPLES.length}
        </span>
        <button
          onClick={() => setActiveIndex((activeIndex + 1) % PRECIO_EXAMPLES.length)}
          className="text-[#94A3B8] hover:text-[#E2E8F0] px-2 py-1 text-lg leading-none"
          aria-label="Siguiente ejemplo"
        >
          ›
        </button>
      </div>
    </div>
  );
}
