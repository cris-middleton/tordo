import type { Metadata } from 'next';
import Link from 'next/link';

import { Seccion } from '@/components/cascara/Seccion';
import BusquedasGuardadas from '@/components/guardados/BusquedasGuardadas';
import LicitacionesGuardadas from '@/components/guardados/LicitacionesGuardadas';

export const metadata: Metadata = {
  title: 'Guardados',
  description: 'Búsquedas y licitaciones guardadas en este navegador, y cómo seguirlas por RSS.',
};

/**
 * Lo guardado: búsquedas, licitaciones y la ayuda del RSS.
 *
 * Sin cuentas, todo vive en `localStorage` **de este navegador**: otro equipo
 * u otro navegador no lo ve, y borrar los datos del sitio lo borra. La página
 * lo dice, porque es lo primero que alguien no esperaría.
 */
export default function GuardadosPage() {
  return (
    <div className="max-w-3xl">
      <div>
        <h1 className="page-title">Guardados</h1>
        <p className="mt-2 text-sm text-muted">
          Se guardan en este navegador, sin cuenta: desde otro equipo no los verás, y se borran si
          borras los datos del sitio.
        </p>
      </div>

      <Seccion titulo="Búsquedas">
        <BusquedasGuardadas />
      </Seccion>

      <Seccion titulo="Licitaciones guardadas">
        <LicitacionesGuardadas
          coleccion="saved"
          vacio="Ninguna todavía. Guárdalas con el marcador que tiene cada licitación del catálogo."
        />
      </Seccion>

      <Seccion titulo="Licitaciones a las que postulaste">
        <LicitacionesGuardadas
          coleccion="applied"
          vacio="Ninguna todavía. En la ficha de cada licitación está el botón «Marcar que postulé»."
        />
      </Seccion>

      <Seccion id="rss" titulo="Cómo seguir una búsqueda por RSS">
        <div className="lectura space-y-3 text-text">
          <p>
            RSS es un formato que leen las apps de noticias y muchos programas de correo. Con él,
            cada licitación nueva que cumpla tu búsqueda aparece en tu lector, sin que tengas que
            volver aquí a mirar.
          </p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Arma la búsqueda en{' '}
              <Link href="/licitaciones" className="enlace">
                Licitaciones
              </Link>{' '}
              y pulsa «Guardar búsqueda».
            </li>
            <li>Aquí arriba, pulsa «Copiar URL de RSS».</li>
            <li>
              Pégala como suscripción nueva en tu lector de RSS (Feedly, Inoreader, NetNewsWire,
              Thunderbird o el que uses). Slack también los acepta.
            </li>
          </ol>
          <p className="text-muted">
            Cada feed trae las 50 licitaciones más recientes de su búsqueda y se renueva cada media
            hora. «Lo mejor de hoy en Compra Ágil» tiene el suyo:{' '}
            <a href="/rss/compra-agil" className="enlace">
              /rss/compra-agil
            </a>
            .
          </p>
        </div>
      </Seccion>
    </div>
  );
}
