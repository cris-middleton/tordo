'use client';

import { Target } from 'lucide-react';

interface BIOnboardingProps {
  onConfigurarRubros: () => void;
  onExplorarSinConfigurar: () => void;
}

export function BIOnboarding({ onConfigurarRubros, onExplorarSinConfigurar }: BIOnboardingProps) {
  return (
    <div className="card flex flex-col items-center gap-4 py-12 text-center max-w-xl mx-auto">
      <div className="rounded-full bg-primary/15 p-4">
        <Target className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-text">Primera vez aquí</h2>
        <p className="mt-2 text-sm text-muted max-w-md">
          Para mostrarte el mercado que te interesa, dinos a qué se dedica tu empresa.
        </p>
      </div>
      <ul className="text-sm text-text space-y-1 text-left">
        <li>✓ Selecciona 2-3 rubros</li>
        <li>✓ Verás oportunidades, competencia y compradores ajustados a ti</li>
      </ul>
      <div className="flex flex-col sm:flex-row gap-2 mt-2">
        <button onClick={onConfigurarRubros} className="btn-primary">
          Seleccionar mis rubros →
        </button>
        <button onClick={onExplorarSinConfigurar} className="btn-ghost text-sm">
          Explorar sin configurar
        </button>
      </div>
    </div>
  );
}
