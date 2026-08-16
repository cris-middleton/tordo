'use client';

/**
 * El aviso por correo — el elemento firma de la landing.
 *
 * **Por qué el correo y no un panel.** El producto de descubrimiento se juega en
 * el correo: es donde el usuario se entera, y es lo único que ve los días que no
 * entra a la aplicación. Cualquiera puede mandar «esta licitación calza con tu
 * perfil»; lo que no puede copiarse sin dieciséis años de órdenes de compra
 * procesadas son las tres líneas de abajo. Enseñar el correo de verdad, con esas
 * líneas resaltadas, es el argumento competitivo completo en una sola imagen.
 *
 * Las cifras salen de la forma real del `contexto_bi` que compone
 * `services/notificaciones.py`, no de un diseño inventado: si el correo cambia,
 * esto tiene que cambiar con él.
 */

const LINEAS_BI = [
  'Este comprador paga entre $2.400.000 y $3.900.000 por esto',
  '3 proveedores habituales en este comprador',
  'Paga a 32 días en promedio',
];

export function MockupAviso() {
  return (
    <div className="rounded-xl overflow-hidden border border-borderLight bg-surface shadow-2xl">
      {/* Cabecera de cliente de correo. Deliberadamente sobria: lo que tiene que
          destacar es el contenido, no el marco. */}
      <div className="border-b border-border bg-background px-4 py-3 sm:px-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Para: ti</p>
        <p
          className="mt-1 text-sm font-bold text-text sm:text-base"
          style={{ fontFamily: 'var(--font-display, system-ui)' }}
        >
          TORDO · 3 oportunidades que calzan contigo
        </p>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <p className="text-sm text-muted">
          Hola Ana, esto apareció hoy en Mercado Público y calza con lo que vendes.
        </p>

        {/* La tarjeta destacada: una licitación con su contexto. */}
        <div className="rounded-lg border border-border bg-background p-3.5">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
            <span className="text-sm font-semibold leading-snug text-text">
              Mantención de equipos de refrigeración
            </span>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
              encaje 78%
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Hospital Regional de Concepción · cierra en 7 días
          </p>

          {/* Estas tres líneas son el producto. Van con un filete a la
              izquierda para que se lean como un bloque aparte del aviso. */}
          <ul className="mt-3 space-y-1.5 border-l-2 border-accent/40 pl-3">
            {LINEAS_BI.map((linea) => (
              <li key={linea} className="cifra text-xs leading-relaxed text-text">
                {linea}
              </li>
            ))}
          </ul>
        </div>

        {/* Las otras dos, colapsadas: sostiene que el correo agrupa en vez de
            mandar uno por licitación, que es la diferencia entre un producto y
            una regla de filtro en Gmail. */}
        <div className="space-y-1.5 opacity-60">
          {[
            ['Insumos de aseo para recintos de salud', 'Servicio de Salud Ñuble'],
            ['Repuestos de climatización', 'Municipalidad de Talcahuano'],
          ].map(([titulo, comprador]) => (
            <div key={titulo} className="rounded-lg border border-border px-3.5 py-2">
              <p className="truncate text-xs font-medium text-text">{titulo}</p>
              <p className="truncate text-[11px] text-subtle">{comprador}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
