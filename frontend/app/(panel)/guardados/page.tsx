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
          Se guardan en este navegador, sin cuenta: no los verás desde otro equipo, y se borran si
          borras los datos del sitio.
        </p>
      </div>

      <Seccion titulo="Búsquedas">
        <BusquedasGuardadas />
      </Seccion>

      <Seccion titulo="Licitaciones guardadas">
        <LicitacionesGuardadas
          coleccion="saved"
          vacio="Ninguna todavía. Usa el marcador de cada licitación en el catálogo."
        />
      </Seccion>

      <Seccion titulo="Marcadas como postuladas">
        <LicitacionesGuardadas coleccion="applied" vacio="Ninguna todavía." />
      </Seccion>

      <Seccion id="rss" titulo="Cómo seguir una búsqueda por RSS">
        <div className="card space-y-3 text-sm text-text">
          <p>
            Un feed RSS te avisa de lo nuevo sin tener que volver a mirar: cada vez que se publique
            una licitación que cumpla tu búsqueda, aparece en tu lector.
          </p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Arma la búsqueda en{' '}
              <Link href="/licitaciones" className="enlace">
                Licitaciones
              </Link>{' '}
              y pulsa «Guardar esta búsqueda».
            </li>
            <li>Aquí arriba, pulsa «Copiar URL de RSS».</li>
            <li>
              Pégala en tu lector de RSS —Feedly, Inoreader, NetNewsWire, Thunderbird o el que uses—
              como una suscripción nueva. Muchos clientes de correo y Slack también aceptan feeds.
            </li>
          </ol>
          <p className="text-muted">
            El feed trae las 50 licitaciones más recientes de la búsqueda y se renueva cada media
            hora. «Lo mejor de hoy en Compra Ágil» tiene su propio feed:{' '}
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
