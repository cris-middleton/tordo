import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BuyerProfilePanel } from '@/components/BuyerProfilePanel';
import { CompraAgilDelComprador } from '@/components/publico/CompraAgilDelComprador';
import { MesesDeCompra } from '@/components/publico/MesesDeCompra';
import {
  CabeceraFicha,
  Dato,
  FranjaDatos,
  Seccion,
  TablaEnlaces,
} from '@/components/publico/Piezas';
import {
  entero,
  fechaCorta,
  metadataComprador,
  nombreDeComprador,
  panelDesdePerfil,
  plata,
  rutaRubro,
  senalesDelComprador,
} from '@/lib/publico';
import { esCodigoComprador } from '@/lib/parametrosPublicos';
import { pedirPublico, segmento } from '@/lib/publicoServidor';
import type { CompradorPublico } from '@/types/publico';
import { TITULO_DESTACADAS } from '@/lib/compraAgil';
import { decimal } from '@/lib/formato';
import { normalizeText } from '@/lib/nombresChile';
import { fraseProveedorPrincipal, ofertasPorLicitacion } from '@/lib/comprador';
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
 * escribe como en el resto del sitio (`nombreDeComprador`) en el título, los
 * metadatos y el perfil, y sin nombre la ficha se titula con el código.
 */
async function obtener(codigo: string): Promise<CompradorPublico> {
  // Un código con otra forma no existe: 404 sin llamar al backend (`lib/parametrosPublicos.ts`).
  if (!esCodigoComprador(codigo)) notFound();
  const comprador = await pedirPublico<CompradorPublico>(`/compradores/${segmento(codigo)}`);
  if (!comprador) notFound();
  return { ...comprador, nombre: nombreDeComprador(comprador.nombre, comprador.codigo) };
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
  const ofertas = ofertasPorLicitacion(perfil.volumen?.prom_oferentes);
  const desde = fechaCorta(periodo.ventana_desde);
  const hasta = fechaCorta(periodo.ventana_hasta);

  return (
    <article>
      <CabeceraFicha
        titulo={c.nombre}
        subtitulo={
          <>
            Código <span className="font-mono">{c.codigo}</span> en Mercado Público
            {desde && hasta ? `. Sus compras del ${desde} al ${hasta}.` : '.'}
          </>
        }
      />

      {/* Cómo compra y cuánto, en un solo bloque: antes eran dos franjas seguidas
          que repetían las órdenes de compra. */}
      <BuyerProfilePanel
        comprador={{ ...panelDesdePerfil(perfil, c.nombre), nombre: c.nombre }}
        senales="ocultar"
        extra={
          perfil.volumen
            ? [
                { etiqueta: 'Órdenes de compra', valor: entero(perfil.volumen.n_oc_total) },
                { etiqueta: 'Meses con compras', valor: entero(perfil.volumen.n_meses_activo) },
                // Sobre `MAXIMO_OFERTAS_CREIBLE` no sale (`lib/comprador.ts`): «299,4» no se cree.
                ...(ofertas != null
                  ? [{ etiqueta: 'Ofertas por licitación, en promedio', valor: decimal(ofertas, 1) }]
                  : []),
                { etiqueta: 'Licitaciones', valor: entero(perfil.transparencia?.n_lic_total) },
              ]
            : undefined
        }
      />

      {senales.length > 0 && (
        <Seccion
          titulo="Señales en su historial"
          descripcion="Conviene saberlo antes de postular."
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
          descripcion={`Sus órdenes por Compra Ágil de los últimos ${MESES_COMPRA_AGIL} meses.`}
        >
          <FranjaDatos>
            <Dato etiqueta="Órdenes" valor={entero(ca.ordenes)} />
            <Dato etiqueta={etiquetaPublicadas(periodo.ventana_hasta)} valor={entero(ca.publicadas)} />
            <Dato etiqueta="Proveedores que le vendieron" valor={entero(ca.proveedores_distintos)} />
            <Dato etiqueta="Monto mediano por orden" valor={plata(ca.monto_mediana)} />
          </FranjaDatos>
          {/* La cuota del proveedor principal va en una frase: como celda
              («Su proveedor principal: 2% de las órdenes») se leía al revés. */}
          {(ca.cuota_lider_pct != null || (ca.monto_p25 != null && ca.monto_p75 != null)) && (
            <p className="mt-3 text-sm text-muted">
              {ca.cuota_lider_pct != null && `${fraseProveedorPrincipal(ca.cuota_lider_pct)} `}
              {ca.monto_p25 != null &&
                ca.monto_p75 != null &&
                `La mitad de sus órdenes por Compra Ágil fue de entre ${plata(ca.monto_p25)} y ${plata(ca.monto_p75)}.`}
            </p>
          )}
        </Seccion>
      )}

      <Seccion
        titulo="Compras Ágiles abiertas de este comprador"
        descripcion={`Las que todavía reciben cotizaciones, ordenadas como en «${TITULO_DESTACADAS}».`}
      >
        <CompraAgilDelComprador codigo={c.codigo} />
      </Seccion>

      <Seccion titulo="Qué compra" descripcion="Los diez rubros en que más gastó en el periodo.">
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

      <MesesDeCompra meses={c.meses_de_compra} />

    </article>
  );
}
