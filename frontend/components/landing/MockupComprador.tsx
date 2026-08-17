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
 * haber trabajado ya con ese organismo: cuánto de lo que llama termina
 * adjudicando, cuánto compra por trato directo y contra cuántos compite.
 *
 * **La métrica «Paga a N días» se retiró.** No es un recorte de diseño: en el
 * dato de ChileCompra no existe ninguna fecha de pago, y el campo que la
 * alimentaba mide `FechaEnvio → FechaAceptacion` —lo que tarda el proveedor en
 * aceptar la orden, mediana real 1,4 días—. El panel real
 * (`BuyerProfilePanel`) ya la había cambiado por trato directo y el correo la
 * había dejado de mandar; este mockup era el último sitio que la prometía. Los
 * tres KPI de aquí son los mismos que pinta el panel.
 */

interface CompradorEjemplo {
  nombre: string;
  sector: string;
  tratoDirecto: number;
  tratoDirectoNota: string;
  desierta: number;
  desiertaNota: string;
  oferentes: string;
  veredicto: string;
}

const EJEMPLOS: CompradorEjemplo[] = [
  {
    nombre: 'Hospital regional',
    sector: 'Salud',
    tratoDirecto: 12,
    tratoDirectoNota: 'casi todo lo saca a competir',
    desierta: 8,
    desiertaNota: 'llama en serio: casi todo lo adjudica',
    oferentes: '4 a 6 ofertas por llamado',
    veredicto: 'Adjudica lo que llama y compra en competencia. Vale la pena preparar bien esta oferta.',
  },
  {
    nombre: 'Municipalidad mediana',
    sector: 'Municipal',
    tratoDirecto: 44,
    tratoDirectoNota: 'casi la mitad no llega a licitarse',
    desierta: 31,
    desiertaNota: 'uno de cada tres llamados queda desierto',
    oferentes: '1 a 2 ofertas por llamado',
    veredicto: 'Poca competencia, pero se cae uno de cada tres llamados. No le dediques tu mejor semana.',
  },
  {
    nombre: 'Servicio de salud regional',
    sector: 'Salud',
    tratoDirecto: 19,
    tratoDirectoNota: 'en línea con el sector',
    desierta: 14,
    desiertaNota: 'adjudica la mayoría de lo que llama',
    oferentes: '3 a 5 ofertas por llamado',
    veredicto: 'Comprador parejo y predecible. Acá se compite por precio.',
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
            etiqueta="Trato directo"
            valor={`${c.tratoDirecto}%`}
            nota={c.tratoDirectoNota}
            alerta={c.tratoDirecto > 35}
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
