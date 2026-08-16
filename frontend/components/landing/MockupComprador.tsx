'use client';

import { BrowserChrome } from './BrowserChrome';
import { useRotatingExample } from './useRotatingExample';

/**
 * El perfil del comprador.
 *
 * Estaba construido en `services/bi/comprador.py`, tenía su panel en la
 * aplicación, y en la landing **no aparecía ni una vez** — pese a que el
 * subtítulo de beneficios prometía «qué tan confiable es el comprador». Es el
 * segundo diferenciador después de las bandas de precio y llevaba meses
 * invisible.
 *
 * Lo que enseña es lo que un dueño de PYME no puede averiguar de otra forma sin
 * haber trabajado ya con ese organismo: a cuántos días paga y con qué frecuencia
 * declara desierto lo que llama.
 */

interface CompradorEjemplo {
  nombre: string;
  sector: string;
  diasPago: number;
  diasPagoNota: string;
  desierta: number;
  desiertaNota: string;
  oferentes: string;
  veredicto: string;
}

const EJEMPLOS: CompradorEjemplo[] = [
  {
    nombre: 'Hospital Regional de Concepción',
    sector: 'Salud',
    diasPago: 32,
    diasPagoNota: 'bajo el promedio del sector (48)',
    desierta: 8,
    desiertaNota: 'llama en serio: casi todo lo adjudica',
    oferentes: '4 a 6 ofertas por llamado',
    veredicto: 'Paga rápido y adjudica. Vale la pena preparar bien esta oferta.',
  },
  {
    nombre: 'Municipalidad de Los Ángeles',
    sector: 'Municipal',
    diasPago: 74,
    diasPagoNota: 'sobre el promedio del sector (52)',
    desierta: 31,
    desiertaNota: 'uno de cada tres llamados queda desierto',
    oferentes: '1 a 2 ofertas por llamado',
    veredicto: 'Poca competencia, pero paga lento y suele declarar desierto. Cuida el flujo de caja.',
  },
  {
    nombre: 'Servicio de Salud Ñuble',
    sector: 'Salud',
    diasPago: 45,
    diasPagoNota: 'en línea con el sector',
    desierta: 14,
    desiertaNota: 'adjudica la mayoría de lo que llama',
    oferentes: '3 a 5 ofertas por llamado',
    veredicto: 'Comprador estable. Compite por precio, no por plazo.',
  },
];

function Metrica({
  etiqueta,
  valor,
  nota,
  alerta = false,
}: {
  etiqueta: string;
  valor: string;
  nota: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wider text-subtle">{etiqueta}</p>
      <p
        className={`cifra mt-0.5 text-xl font-bold ${alerta ? 'text-warning' : 'text-text'}`}
        style={{ fontFamily: 'var(--font-display, system-ui)' }}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">{nota}</p>
    </div>
  );
}

export function MockupComprador() {
  const { activeIndex, setActiveIndex, containerRef, handleMouseEnter, handleMouseLeave } =
    useRotatingExample({ count: EJEMPLOS.length, intervalMs: 5200 });
  const c = EJEMPLOS[activeIndex];

  return (
    <div ref={containerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <BrowserChrome url="tordo.cl/dashboard/bi · comprador">
      <div className="space-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-subtle">{c.sector}</p>
          <p
            className="text-sm font-bold leading-snug text-text sm:text-base"
            style={{ fontFamily: 'var(--font-display, system-ui)' }}
          >
            {c.nombre}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metrica
            etiqueta="Paga a"
            valor={`${c.diasPago} días`}
            nota={c.diasPagoNota}
            alerta={c.diasPago > 60}
          />
          <Metrica
            etiqueta="Declara desierto"
            valor={`${c.desierta}%`}
            nota={c.desiertaNota}
            alerta={c.desierta > 25}
          />
          <div className="col-span-2 sm:col-span-1">
            <Metrica etiqueta="Competencia" valor={c.oferentes.split(' ')[0] + '–' + c.oferentes.split(' ')[2]} nota="ofertas por llamado" />
          </div>
        </div>

        <div className="rounded-lg border border-accent/25 bg-accent/[0.06] p-3">
          <p className="text-xs leading-relaxed text-text">{c.veredicto}</p>
        </div>

        {/* Los puntos son control, no adorno: en móvil la rotación automática
            está apagada (`hover: none`), así que sin ellos sólo se vería el
            primer comprador de los tres. */}
        <div className="flex justify-center gap-1.5 pt-0.5">
          {EJEMPLOS.map((e, i) => (
            <button
              key={e.nombre}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`Ver ${e.nombre}`}
              aria-current={i === activeIndex}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIndex ? 'w-5 bg-accent' : 'w-1.5 bg-border hover:bg-subtle'
              }`}
            />
          ))}
        </div>
      </div>
      </BrowserChrome>
    </div>
  );
}
