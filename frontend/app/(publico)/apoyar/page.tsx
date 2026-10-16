import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, Heart } from 'lucide-react';

import { TablaCostos } from '@/components/apoyar/TablaCostos';
import { VerTransferencia } from '@/components/apoyar/VerTransferencia';
import { CabeceraFicha, Seccion } from '@/components/publico/Piezas';
import { COSTO_MENSUAL_APROXIMADO, USO_INCLUIDO_EN_EL_PLAN, USO_RAILWAY_PROYECTADO } from '@/lib/costos';
import { mediosDeDonacion } from '@/lib/donaciones';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Tordo';

export const metadata: Metadata = {
  title: 'Apoyar el sitio',
  description: `${APP_NAME} se mantiene con aportes voluntarios. Aquí está lo que cuesta, concepto por concepto.`,
  alternates: { canonical: '/apoyar' },
};

/**
 * `/apoyar` — donaciones (spec del pivote §4).
 *
 * Tres enlaces y ninguna integración. Cada medio sale de una variable de
 * servidor (`lib/donaciones.ts`); el que no la tiene no se muestra, y sin
 * ninguno la página lo dice en vez de enseñar botones muertos.
 *
 * **Sin publicidad, y no por gusto**: en Vercel Hobby un anuncio convierte el
 * sitio en comercial; pedir donaciones no (spec §4.1).
 */
export default function PaginaApoyar() {
  const { enlaces, transferencia } = mediosDeDonacion();
  const hayAlguno = enlaces.length > 0 || transferencia;
  const [principal, ...otros] = enlaces;

  return (
    <article className="max-w-3xl">
      <CabeceraFicha
        titulo={`${APP_NAME} es gratis. Mantenerlo, casi.`}
        subtitulo="Lo sostienen los aportes de quienes lo usan."
      />

      <Seccion id="costos" titulo="Cuánto cuesta">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Tenerlo en línea cuesta{' '}
            <strong className="text-text">alrededor de {COSTO_MENSUAL_APROXIMADO} al mes</strong>: el
            servidor de la API, la base de datos, las tareas que traen los datos de ChileCompra varias
            veces al día y el dominio. La página web se aloja gratis.
          </p>
          <TablaCostos />
          <p>
            El plan de Railway cuesta {USO_INCLUIDO_EN_EL_PLAN} e incluye {USO_INCLUIDO_EN_EL_PLAN} de
            uso. El uso medido proyecta {USO_RAILWAY_PROYECTADO} al mes, más de lo incluido, así que se
            paga el uso; con el dominio, el total queda en {COSTO_MENSUAL_APROXIMADO}.
          </p>
          <p className="text-xs text-subtle">
            Es una proyección, no una factura: sale del uso que informó Railway en los primeros dos días
            de su periodo de facturación, con los reinicios por falta de memoria y la
            primera corrida del análisis dentro. Lo marcado como estimado no tiene medición; lo medido,
            sí.
          </p>
          <p>
            Un aporte es una <strong className="text-text">donación</strong>: no compra ningún
            servicio, no da acceso a nada que no tenga cualquier visitante y no obliga a mantener el
            sitio ni ninguna función por un plazo determinado. Está en los{' '}
            <Link href="/terminos" className="enlace">
              términos de uso
            </Link>
            .
          </p>
        </div>
      </Seccion>

      <Seccion titulo="Cómo aportar">
        {hayAlguno ? (
          <div className="space-y-6">
            {enlaces.length > 0 && (
              <ul className="flex flex-wrap gap-3">
                {principal && (
                  <li>
                    <a
                      href={principal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-accent"
                    >
                      <Heart className="h-4 w-4" aria-hidden="true" />
                      Aportar con {principal.nombre}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </li>
                )}
                {otros.map((m) => (
                  <li key={m.id}>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                      {m.nombre}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {transferencia && (
              <div>
                <p className="mb-2 text-sm text-muted">
                  O por transferencia bancaria, sin comisión para nadie.
                </p>
                <VerTransferencia />
              </div>
            )}
            <p className="text-xs text-subtle">
              El pago lo procesa cada plataforma bajo sus propias condiciones.
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            Todavía no hay medios de aporte habilitados. Mientras tanto, la mejor forma de apoyar
            es usarlo y contárselo a quien licite.
          </p>
        )}
      </Seccion>

      <Seccion titulo="Qué hacemos con tus datos">
        <p className="text-sm leading-relaxed text-muted">
          De la plataforma que elijas recibimos normalmente tu nombre, el monto y la fecha. Lo
          guardamos sólo para la contabilidad y no lo publicamos sin tu permiso. El detalle está en
          la{' '}
          <Link href="/privacidad" className="enlace">
            política de privacidad
          </Link>
          .
        </p>
      </Seccion>
    </article>
  );
}
