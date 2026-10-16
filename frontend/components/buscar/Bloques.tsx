import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import TarjetaDestacada from '@/components/compraAgil/TarjetaDestacada';
import { BandaPrecio } from '@/components/publico/BandaPrecio';
import { Seccion } from '@/components/publico/Piezas';
import {
  COMPRADORES_EN_BUSCAR,
  COMPRAS_AGILES_EN_BUSCAR,
  EJEMPLOS_BUSQUEDA,
  LICITACIONES_EN_BUSCAR,
  PRODUCTOS_EN_BUSCAR,
  compradoresDistintos,
  montoNumerico,
  rutaBuscar,
  textoDeFallo,
} from '@/lib/buscar';
import { TITULO_DESTACADAS, mesesDeVentana, rutaCompraAgil } from '@/lib/compraAgil';
import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import { normalizeText, shortRegion } from '@/lib/licitacionEstado';
import {
  entero,
  fechaCorta,
  nombreProducto,
  plata,
  rutaBusquedaProductos,
  rutaComprador,
  rutaLicitacion,
  rutaProducto,
} from '@/lib/publico';
import type { Bloque, LicitacionesEncontradas, MotivoFallo } from '@/types/buscar';
import type { CompraAgilDestacadasResponse } from '@/types/compraAgil';
import type { Tender } from '@/types/licitacion';
import type { ProductoEncontrado, ProductoPublico } from '@/types/publico';

/**
 * Los bloques de `/buscar` (spec del rediseño §6.4). Componentes de servidor:
 * reciben lo que ya pidió `lib/buscarServidor.ts` y no piden nada.
 *
 * Cada bloque tiene tres estados y los tres se dicen: con resultados, vacío
 * («ningún … coincide») y fallido (una línea; el resto de la página sigue).
 * **Todo «ver todos» sale de un ayudante de rutas**: aquí no se arma ninguna URL.
 */

const LISTA = 'divide-y divide-border rounded-xl border border-border bg-surface';

function AvisoDeFallo({ que, motivo }: { que: string; motivo: MotivoFallo }) {
  return <p className="text-sm text-subtle">{textoDeFallo(que, motivo)}</p>;
}

function VerTodos({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold uppercase tracking-wider text-subtle">{children}</h3>;
}

// ── Ejemplos y sin resultados ────────────────────────────────────────────────

export function EjemplosBusqueda() {
  return (
    <div className="mt-4">
      <p className="text-sm text-muted">Prueba con:</p>
      <ul aria-label="Ejemplos de búsqueda" className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {EJEMPLOS_BUSQUEDA.map((ejemplo) => (
          <li key={ejemplo}>
            <Link href={rutaBuscar(ejemplo)} className="enlace">
              {ejemplo}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SinResultados({ termino }: { termino: string }) {
  return (
    <div className="mt-8 rounded-xl border border-border bg-surface px-5 py-6">
      <p className="text-sm text-text">
        No encontramos nada para «{termino}»: ni precios pagados, ni licitaciones o Compras Ágiles abiertas.
      </p>
      <p className="mt-1 text-sm text-muted">
        Las palabras de menos de tres letras y los números no cuentan en la búsqueda de precios.
      </p>
      <EjemplosBusqueda />
    </div>
  );
}

// ── 1. Cuánto ha pagado el Estado ────────────────────────────────────────────

function ProductoEnLista({ producto }: { producto: ProductoEncontrado }) {
  return (
    <Link
      href={rutaProducto(producto.slug)}
      className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-surface-elevated"
    >
      <span className="min-w-0 truncate font-medium text-primary">{nombreProducto(producto)}</span>
      <span className="cifra shrink-0 text-xs text-muted">
        {entero(producto.n)} compras{producto.indexable ? '' : ' · orientativo'}
      </span>
    </Link>
  );
}

function PreciosEncontrados({
  termino,
  productos,
  ficha,
}: {
  termino: string;
  productos: ProductoEncontrado[];
  ficha: Bloque<ProductoPublico> | null;
}) {
  const [primero, ...otros] = productos.slice(0, PRODUCTOS_EN_BUSCAR);
  // La banda de la unidad más comprada: el backend ordena `unidades` por n.
  const banda = ficha?.estado === 'ok' ? (ficha.datos.unidades[0] ?? null) : null;

  return (
    <div className="space-y-4">
      <div>
        <Link href={rutaProducto(primero.slug)} className="text-base font-semibold text-primary hover:underline">
          {nombreProducto(primero)}
        </Link>
        <p className="cifra text-xs text-muted">
          {entero(primero.n)} compras{primero.indexable ? '' : ' · orientativo'}
        </p>
      </div>

      {ficha?.estado === 'fallo' ? (
        <AvisoDeFallo que="la banda de precio de este producto" motivo={ficha.motivo} />
      ) : banda ? (
        <BandaPrecio banda={banda} />
      ) : (
        <p className="text-sm text-subtle">Todavía no hay compras suficientes para una banda.</p>
      )}

      {otros.length > 0 && (
        <ul aria-label="Otros productos que coinciden" className={LISTA}>
          {otros.map((p) => (
            <li key={p.slug}>
              <ProductoEnLista producto={p} />
            </li>
          ))}
        </ul>
      )}

      <VerTodos href={rutaBusquedaProductos(termino)}>Ver todos los productos que coinciden</VerTodos>
    </div>
  );
}

export function BloquePrecios({
  termino,
  productos,
  ficha,
}: {
  termino: string;
  productos: Bloque<ProductoEncontrado[]>;
  ficha: Bloque<ProductoPublico> | null;
}) {
  return (
    <Seccion
      id="precios"
      titulo="Cuánto ha pagado el Estado"
      descripcion="Precio unitario pagado en órdenes de compra, por producto."
    >
      {productos.estado === 'fallo' ? (
        <AvisoDeFallo que="los precios" motivo={productos.motivo} />
      ) : productos.datos.length === 0 ? (
        <div className="space-y-1 text-sm text-subtle">
          <p>Ningún producto coincide con «{termino}».</p>
          <p>Las palabras de menos de tres letras y los números no cuentan en la búsqueda de precios.</p>
        </div>
      ) : (
        <PreciosEncontrados termino={termino} productos={productos.datos} ficha={ficha} />
      )}
    </Seccion>
  );
}

// ── 2. Qué está abierto ahora ────────────────────────────────────────────────

function FilaLicitacion({ licitacion: t }: { licitacion: Tender }) {
  const monto = montoNumerico(t.monto_estimado);
  const cierre = fechaCorta(t.fecha_cierre);
  return (
    <li className="px-4 py-3">
      <Link href={rutaLicitacion(t.codigo_externo)} className="break-words font-medium text-primary hover:underline">
        {normalizeText(t.nombre)}
      </Link>
      <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
        <span className="font-mono">{t.codigo_externo}</span>
        {t.nombre_organismo && <span>{normalizeText(t.nombre_organismo)}</span>}
        {t.region && <span>{shortRegion(t.region)}</span>}
        {cierre && <span>Cierra el {cierre}</span>}
        {monto !== null && <span className="cifra">{plata(monto)}</span>}
      </p>
    </li>
  );
}

function Licitaciones({
  termino,
  terminos,
  bloque,
}: {
  termino: string;
  terminos: string[];
  bloque: Bloque<LicitacionesEncontradas>;
}) {
  if (bloque.estado === 'fallo') return <AvisoDeFallo que="las licitaciones abiertas" motivo={bloque.motivo} />;
  const { items, total } = bloque.datos;
  if (items.length === 0) {
    return <p className="text-sm text-subtle">Ninguna licitación abierta coincide con «{termino}».</p>;
  }
  return (
    <>
      <p className="text-sm text-muted">
        <span className="cifra font-semibold text-text">{entero(total)}</span>{' '}
        {total === 1 ? 'abierta coincide' : 'abiertas coinciden'} con «{termino}».
      </p>
      <ul aria-label="Licitaciones abiertas que coinciden" className={`mt-3 ${LISTA}`}>
        {items.slice(0, LICITACIONES_EN_BUSCAR).map((t) => (
          <FilaLicitacion key={t.codigo_externo} licitacion={t} />
        ))}
      </ul>
      <VerTodos href={urlCatalogoAbiertas('licitaciones', terminos)}>
        {total === 1 ? 'Verla en el catálogo' : `Ver las ${entero(total)} en el catálogo`}
      </VerTodos>
    </>
  );
}

function ComprasAgiles({ termino, bloque }: { termino: string; bloque: Bloque<CompraAgilDestacadasResponse> }) {
  if (bloque.estado === 'fallo') return <AvisoDeFallo que="las Compras Ágiles abiertas" motivo={bloque.motivo} />;
  const datos = bloque.datos;
  if (datos.items.length === 0) {
    return (
      <p className="text-sm text-subtle">
        Ninguna Compra Ágil abierta que cierre en más de dos horas coincide con «{termino}».
      </p>
    );
  }
  const meses = mesesDeVentana(datos.ventana_desde, datos.ventana_hasta);
  return (
    <>
      {/* Sin puesto: en una lista filtrada, «1» se leería como un ranking del término. */}
      <ul aria-label="Compras Ágiles abiertas que coinciden" className="space-y-3">
        {datos.items.slice(0, COMPRAS_AGILES_EN_BUSCAR).map((item) => (
          <li key={item.codigo_externo}>
            <TarjetaDestacada
              item={item}
              mesesVentana={meses}
              actualizadoEn={datos.actualizado_en}
              historiaDisponible={datos.historia_disponible}
            />
          </li>
        ))}
      </ul>
      <VerTodos href={rutaCompraAgil(termino)}>Ver todas en «{TITULO_DESTACADAS}»</VerTodos>
    </>
  );
}

export function BloqueAbiertas({
  termino,
  terminos,
  licitaciones,
  comprasAgiles,
}: {
  termino: string;
  terminos: string[];
  licitaciones: Bloque<LicitacionesEncontradas>;
  comprasAgiles: Bloque<CompraAgilDestacadasResponse>;
}) {
  return (
    <Seccion id="abiertas" titulo="Qué está abierto ahora">
      <div className="space-y-8">
        <div>
          <Subtitulo>Licitaciones</Subtitulo>
          <div className="mt-2">
            <Licitaciones termino={termino} terminos={terminos} bloque={licitaciones} />
          </div>
        </div>
        <div>
          <Subtitulo>Compras Ágiles</Subtitulo>
          <div className="mt-2">
            <ComprasAgiles termino={termino} bloque={comprasAgiles} />
          </div>
        </div>
      </div>
    </Seccion>
  );
}

// ── 3. Quién lo compra ───────────────────────────────────────────────────────

function Compradores({ producto }: { producto: ProductoPublico }) {
  const compradores = compradoresDistintos(producto.compradores, COMPRADORES_EN_BUSCAR);
  if (compradores.length === 0) {
    return <p className="text-sm text-subtle">Todavía no hay compradores con datos de este producto.</p>;
  }
  return (
    <>
      <ul aria-label="Compradores de este producto" className={LISTA}>
        {compradores.map((c) => (
          <li key={c.codigo}>
            <Link
              href={rutaComprador(c.codigo)}
              className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-surface-elevated"
            >
              <span className="min-w-0 truncate font-medium text-primary">{c.nombre}</span>
              <span className="cifra shrink-0 text-xs text-muted">{entero(c.n)} compras</span>
            </Link>
          </li>
        ))}
      </ul>
      <VerTodos href={rutaProducto(producto.slug)}>Ver la ficha del producto</VerTodos>
    </>
  );
}

export function BloqueCompradores({ ficha }: { ficha: Bloque<ProductoPublico> }) {
  return (
    <Seccion
      id="compradores"
      titulo="Quién lo compra"
      descripcion={
        ficha.estado === 'ok' ? `Los compradores con más compras de «${nombreProducto(ficha.datos)}».` : undefined
      }
    >
      {ficha.estado === 'fallo' ? (
        <AvisoDeFallo que="quién compra este producto" motivo={ficha.motivo} />
      ) : (
        <Compradores producto={ficha.datos} />
      )}
    </Seccion>
  );
}
