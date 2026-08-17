// frontend/components/landing/MockupScore.tsx
'use client';

import { BrowserChrome } from './BrowserChrome';
import { useRotatingExample } from './useRotatingExample';

interface ScoreComponent {
  label: string;
  value: number; // 1-10
}

interface ScoreExample {
  licitacion: string;
  comprador: string;
  monto: string;
  diasCierre: number;
  score: number;
  verdict: string;
  components: ScoreComponent[];
  insight: string;
}

const SCORE_EXAMPLES: ScoreExample[] = [
  {
    licitacion: 'Suministro aseo terminal',
    comprador: 'Hospital San Juan de Dios',
    monto: '$4.8M',
    diasCierre: 14,
    score: 82,
    verdict: 'Postula ya',
    components: [
      { label: 'Rango de precio saludable', value: 9 },
      { label: 'Calce con tu rubro',        value: 8 },
      { label: 'Calidad del comprador',     value: 8 },
      { label: 'Plazo de preparación',      value: 7 },
    ],
    insight: 'Ganaste 2 licitaciones similares en los últimos 12 meses.',
  },
  {
    licitacion: 'Resmas papel y toners',
    comprador: 'Municipalidad de La Florida',
    monto: '$1.2M',
    diasCierre: 8,
    score: 58,
    verdict: 'Míralo bien',
    components: [
      { label: 'Rango de precio saludable', value: 6 },
      { label: 'Calce con tu rubro',        value: 7 },
      { label: 'Calidad del comprador',     value: 5 },
      { label: 'Plazo de preparación',      value: 4 },
    ],
    insight: 'Este comprador adjudicó 4 contratos similares en el último año.',
  },
  {
    licitacion: 'Reparación de veredas',
    comprador: 'SERVIU Región del Maule',
    monto: '$11.2M',
    diasCierre: 5,
    score: 24,
    verdict: 'Déjala pasar',
    components: [
      { label: 'Rango de precio saludable', value: 3 },
      { label: 'Calce con tu rubro',        value: 2 },
      { label: 'Calidad del comprador',     value: 6 },
      { label: 'Plazo de preparación',      value: 2 },
    ],
    insight: 'Sólo 1 de cada 3 licitaciones de este tipo termina adjudicándose.',
  },
];

function scoreColor(score: number): string {
  if (score >= 70) return '#3DB9BB';
  if (score >= 40) return '#96590A';
  return '#B91C1C';
}

export function MockupScore() {
  const { activeIndex, setActiveIndex, containerRef, handleMouseEnter, handleMouseLeave } =
    useRotatingExample({ count: SCORE_EXAMPLES.length, intervalMs: 6000 });
  const ex = SCORE_EXAMPLES[activeIndex];
  const color = scoreColor(ex.score);

  return (
    <div ref={containerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Ejemplo ${activeIndex + 1} de ${SCORE_EXAMPLES.length}: ${ex.licitacion}, score ${ex.score}`}
      </div>

      <BrowserChrome url="tordo.cl/dashboard/bi">
        <div key={activeIndex} className="animate-fade-in">
          {/* Header: licitación title */}
          <p className="text-[11px] font-semibold text-text mb-0.5 truncate">
            {ex.licitacion}
          </p>
          {/* Meta-info */}
          <div className="flex items-center gap-2 text-[8px] text-muted mb-3">
            <span className="truncate">{ex.comprador}</span>
            <span>·</span>
            <span>{ex.monto}</span>
            <span>·</span>
            <span className="text-gold">Cierra en {ex.diasCierre}d</span>
          </div>

          {/* Score XL + verdict */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border-2"
              style={{
                borderColor: color,
                background: `${color}18`,
              }}
            >
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color, fontFamily: 'var(--font-display, system-ui)' }}
              >
                {ex.score}
              </span>
            </div>
            <div>
              <p className="text-[8px] text-muted uppercase tracking-wider">Score</p>
              <p
                className="text-sm font-bold"
                style={{ color, fontFamily: 'var(--font-display, system-ui)' }}
              >
                {ex.verdict}
              </p>
            </div>
          </div>

          {/* Component breakdown bars */}
          <div className="space-y-2 mb-3">
            {ex.components.map((comp) => (
              <div key={comp.label} className="flex items-center gap-2">
                <span className="w-[120px] flex-shrink-0 text-[9px] text-muted truncate">
                  {comp.label}
                </span>
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${comp.value * 10}%`,
                      background: `linear-gradient(90deg, ${color}88, ${color})`,
                    }}
                  />
                </div>
                <span
                  className="w-6 text-right text-[9px] font-semibold tabular-nums"
                  style={{ color }}
                >
                  {comp.value}/10
                </span>
              </div>
            ))}
          </div>

          {/* Insight */}
          <div className="rounded-lg bg-surface border border-border px-3 py-2">
            <p className="text-[10px] text-text">💡 {ex.insight}</p>
          </div>
        </div>
      </BrowserChrome>

      {/* Dots navigation */}
      <div
        className="flex justify-center gap-1.5 mt-3"
        role="tablist"
        aria-label="Ejemplos de score de oportunidad"
      >
        {SCORE_EXAMPLES.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Ejemplo ${i + 1}: ${SCORE_EXAMPLES[i].licitacion}`}
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              i === activeIndex ? 'w-4 bg-accent' : 'w-1.5 bg-muted/40 hover:bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Mobile arrows */}
      <div className="flex justify-center items-center gap-4 mt-2 md:hidden">
        <button
          onClick={() =>
            setActiveIndex((activeIndex - 1 + SCORE_EXAMPLES.length) % SCORE_EXAMPLES.length)
          }
          className="text-muted hover:text-text px-2 py-1 text-lg leading-none"
          aria-label="Ejemplo anterior"
        >
          ‹
        </button>
        <span className="text-[10px] text-muted">
          {activeIndex + 1} / {SCORE_EXAMPLES.length}
        </span>
        <button
          onClick={() => setActiveIndex((activeIndex + 1) % SCORE_EXAMPLES.length)}
          className="text-muted hover:text-text px-2 py-1 text-lg leading-none"
          aria-label="Siguiente ejemplo"
        >
          ›
        </button>
      </div>
    </div>
  );
}
