import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BuyerProfilePanel } from '@/components/BuyerProfilePanel';
import { CompraAgilDelComprador } from '@/components/publico/CompraAgilDelComprador';
import {
  CabeceraFicha,
  Dato,
  EnlacePanel,
  FranjaDatos,
  Seccion,
  TablaEnlaces,
} from '@/components/publico/Piezas';
import {
  entero,
  fechaCorta,
  metadataComprador,
  panelDesdePerfil,
  plata,
  rutaRubro,
  senalesDelComprador,
} from '@/lib/publico';
import { pedirPublico, segmento } from '@/lib/publicoServidor';
import type { CompradorPublico } from '@/types/publico';
import { TITULO_DESTACADAS } from '@/lib/compraAgil';
import { decimal } from '@/lib/formato';
import { normalizeText } from '@/lib/nombresChile';
import { etiquetaPublicadas, MESES_COMPRA_AGIL } from '@/lib/periodo';

/**
 * `/compradores/{codigo}` — la ficha pública de un comprador del Estado.
 *
 * ISR: nada se construye en el deploy (`generateStaticParams` vacío) y cada
 * ficha se genera la primera vez que alguien la pide; luego queda en caché
 * una semana o hasta que el cron semanal la revalida (`lib/publicoServidor.ts`).
 *
 * «Compras Ágiles abiertas de este comprador» va aparte, en el cliente
 * (`CompraAgilDelComprador`): cambia en horas y la ficha se cachea una semana.
 */

export const dynamicParams = true;

export function generateStaticParams(): { codigo: string }[] {
  return [];
}

type Props = { params: Promise<{ codigo: string }> };

/**
 * El nombre llega en MAYÚSCULAS desde analytics («I MUNICIPALIDAD DE AYSEN»): se
 * escribe como en el resto del sitio (`normalizeText`) en el título, los
 * metadatos y el perfil.
 */
async function obtener(codigo: string): Promise<CompradorPublico> {
  const comprador = await pedirPublico<CompradorPublico>(`/compradores/${segmento(codigo)}`);
  if (!comprador) notFound();
  return { ...comprador, nombre: normalizeText(comprador.nombre) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  return metadataComprador(await obtener(codigo));
}

export default async function PaginaComprador({ params }: Props) {
  const { codigo } = await params;
  const c = await obtener(codigo);
  const { perfil, compra_agil: ca, periodo } = c;
  const senales = senalesDelComprador(perfil);
  const desde = fechaCorta(periodo.ventana_desde);
  const hasta = fechaCorta(periodo.ventana_hasta);

  return (
    <article>
      <CabeceraFicha
        titulo={c.nombre}
        subtitulo={
          <>
            Código <span className="font-mono">{c.codigo}</span> en Mercado Público
            {desde && hasta ? `. Datos del ${desde} al ${hasta}.` : '.'}
          </>
        }
      />

      <BuyerProfilePanel comprador={{ ...panelDesdePerfil(perfil, c.nombre), nombre: c.nombre }} />

      {perfil.volumen && (
        <div className="mt-4">
          <FranjaDatos>
            <Dato etiqueta="Órdenes de compra" valor={entero(perfil.volumen.n_oc_total)} />
            <Dato etiqueta="Meses con compras" valor={entero(perfil.volumen.n_meses_activo)} />
            <Dato
              etiqueta="Ofertas por licitación"
              valor={
                perfil.volumen.prom_oferentes != null
                  ? decimal(perfil.volumen.prom_oferentes, 1)
                  : '—'
              }
            />
            <Dato etiqueta="Licitaciones" valor={entero(perfil.transparencia?.n_lic_total)} />
          </FranjaDatos>
        </div>
      )}

      {senales.length > 0 && (
        <Seccion
          titulo="Señales en su historial"
          descripcion="Conviene saberlo antes de ofertar."
        >
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            {senales.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Seccion>
      )}

      {ca && (
        <Seccion
          titulo="Cómo compra por Compra Ágil"
          descripcion={`Sus órdenes por Compra Ágil en los últimos ${MESES_COMPRA_AGIL} meses: cuántas, a cuántos proveedores y de qué monto.`}
        >
          <FranjaDatos>
            <Dato etiqueta="Órdenes" valor={entero(ca.ordenes)} />
            <Dato etiqueta={etiquetaPublicadas(periodo.ventana_hasta)} valor={entero(ca.publicadas)} />
            <Dato etiqueta="Proveedores distintos" valor={entero(ca.proveedores_distintos)} />
            <Dato
              etiqueta="Cuota del proveedor principal"
              valor={ca.cuota_lider_pct != null ? `${Math.round(ca.cuota_lider_pct)}%` : '—'}
            />
            <Dato etiqueta="Monto mediano" valor={plata(ca.monto_mediana)} />
          </FranjaDatos>
          {ca.monto_p25 != null && ca.monto_p75 != null && (
            <p className="mt-3 text-sm text-muted">
              La mitad de sus órdenes por Compra Ágil va de {plata(ca.monto_p25)} a{' '}
              {plata(ca.monto_p75)}.
            </p>
          )}
        </Seccion>
      )}

      <Seccion
        titulo="Compras Ágiles abiertas de este comprador"
        descripcion={`Las que siguen recibiendo cotizaciones, en el orden de «${TITULO_DESTACADAS}».`}
      >
        <CompraAgilDelComprador codigo={c.codigo} />
      </Seccion>

      <Seccion titulo="Qué compra" descripcion="Sus diez rubros con más monto en el periodo.">
        <TablaEnlaces
          encabezados={['Rubro', 'Monto', 'Órdenes']}
          vacio="Todavía no hay rubros con datos para este comprador."
          filas={c.rubros.map((r) => ({
            clave: r.slug ?? r.nombre,
            href: r.slug ? rutaRubro(r.slug) : null,
            nombre: r.nombre,
            celdas: [plata(r.monto), entero(r.ordenes)],
          }))}
        />
      </Seccion>

      <EnlacePanel href="/compra-agil">Ver las Compras Ágiles abiertas hoy</EnlacePanel>
    </article>
  );
}
