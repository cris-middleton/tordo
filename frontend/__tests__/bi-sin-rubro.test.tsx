/**
 * «No hay datos de este rubro» y «no has elegido rubro» son cosas distintas.
 *
 * Las secciones de BI decían lo primero en los dos casos: «No se encontraron
 * oportunidades para este rubro», «No hay datos de tendencias para este rubro»,
 * «Datos de resumen insuficientes para este rubro»… sobre un rubro que el
 * usuario todavía no había elegido. Se lee como que su mercado está vacío
 * cuando lo que falta es decir cuál es, y la acción que lo arregla —el selector
 * de arriba— no aparecía por ninguna parte.
 *
 * Se ve al entrar por «Explorar sin configurar» con el catálogo de rubros
 * vacío, que es el estado de cualquier despliegue cuyo pipeline de analytics
 * todavía no se ha materializado: `/bi/rubros` responde `disponible: false`, no
 * hay ningún rubro por defecto que elegir, y la pantalla entera se pinta sin él.
 *
 * `PanoramaRubro` era la única que lo distinguía. Este test fija que las cuatro
 * digan lo mismo: una sola frase, con la salida dentro.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarketSummaryCard } from '@/app/dashboard/bi/components/MarketSummaryCard';
import { OportunidadesSection } from '@/app/dashboard/bi/components/OportunidadesSection';
import { PanoramaRubro } from '@/components/bi/PanoramaRubro';

/** Lo que tiene que aparecer: qué falta y dónde se arregla. */
const INVITACION = /elige un rubro arriba/i;

/** Lo que NO puede aparecer: un vacío atribuido a un rubro que no existe. */
const CULPA_AL_RUBRO = /para este rubro/i;

describe('sin rubro elegido, las secciones de BI invitan a elegirlo', () => {
  it('Panorama', () => {
    render(<PanoramaRubro panorama={null} cargando={false} rubro="" />);
    expect(screen.getByText(INVITACION)).toBeInTheDocument();
  });

  it('Resumen de mercado', () => {
    render(<MarketSummaryCard resumen={null} loading={false} rubro="" />);
    expect(screen.getByText(INVITACION)).toBeInTheDocument();
    expect(screen.queryByText(CULPA_AL_RUBRO)).not.toBeInTheDocument();
  });

  it('Oportunidades', () => {
    render(<OportunidadesSection oportunidades={[]} loading={false} rubro="" />);
    expect(screen.getByText(INVITACION)).toBeInTheDocument();
    // Ésta es la frase que sobraba: decía que se buscó y no había.
    expect(screen.queryByText(/no se encontraron oportunidades/i)).not.toBeInTheDocument();
  });
});

describe('CON rubro elegido se conserva el mensaje de «no hay datos»', () => {
  it('Oportunidades distingue el vacío real del rubro sin elegir', () => {
    // El otro lado de la moneda, y el que se rompe al arreglar el primero:
    // cuando SÍ hay rubro y no hay resultados, decirlo sigue siendo correcto —
    // y la pista de bajar el score mínimo es accionable.
    render(<OportunidadesSection oportunidades={[]} loading={false} rubro="Servicios de aseo" />);
    expect(screen.getByText(/no se encontraron oportunidades/i)).toBeInTheDocument();
    expect(screen.queryByText(INVITACION)).not.toBeInTheDocument();
  });
});
