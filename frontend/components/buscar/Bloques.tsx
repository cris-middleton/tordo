import Link from 'next/link';

import { FilaCompraAgil } from '@/components/compraAgil/FilaCompraAgil';
import { PieDeMetodo } from '@/components/metodo/PieDeMetodo';
import { GraficoPrecio } from '@/components/precio/GraficoPrecio';
import { CifrasBanda } from '@/components/publico/CifrasBanda';
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
import { mesesDeVentana, rutaCompraAgil } from '@/lib/compraAgil';
import { urlCatalogoAbiertas } from '@/lib/filtrosCatalogo';
import { cierreFijo } from '@/lib/horaChile';
import { normalizeText, shortRegion } from '@/lib/licitacionEstado';
import { precioDeBanda } from '@/lib/lecturasPortada';
import { urlRepositorio } from '@/lib/repositorio';
import {
  entero,
  frasePrecio,
  listaDeL0,
  MINIMO_COMPRAS_L0,
  nombreProducto,
  plata,
  precioDeLaBanda,
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

const LISTA = 'divide-y divide-border border-y border-border';

function AvisoDeFallo({ que, motivo }: { que: string; motivo: MotivoFallo }) {
  return <p className="text-sm text-subtle">{textoDeFallo(que, motivo)}</p>;
}

function VerTodos({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="mt-3 text-sm">
      <Link href={href} className="enlace">
        {children}
      </Link>
    </p>
  );
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-text">{children}</h3>;
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

/**
 * Nada encontró nada. Con `sugerencia` (`GET /publico/sugerencia`, la búsqueda con
 * sus palabras mal escritas corregidas) la propone primero, enlazada.
 */
export function SinResultados({ termino, sugerencia = null }: { termino: string; sugerencia?: string | null }) {
  return (
    <div className="mt-8 border-y border-border py-6">
      {sugerencia && (
        <p className="mb-2 text-base text-text">
          ¿Quisiste decir{' '}
          <Link href={rutaBuscar(sugerencia)} className="enlace font-medium">
            «{sugerencia}»
          </Link>
          ?
        </p>
      )}
      <p className="text-sm text-text">
        No encontramos «{termino}» en los precios pagados ni en lo que está abierto hoy.
      </p>
      <p className="mt-1 text-sm text-muted">
        Las palabras de menos de tres letras y los números no cuentan en la búsqueda de precios.
      </p>
      <EjemplosBusqueda />
    </div>
  );
}

// ── 1. A qué precio lo compró el Estado ────────────────────────────────────────

function ProductoEnLista({ producto }: { producto: ProductoEncontrado }) {
  return (
    <Link
      href={rutaProducto(producto.slug)}
      className="flex items-baseline justify-between gap-3 py-2.5 hover:text-accent"
    >
      <span className="min-w-0 truncate font-medium text-primary">{nombreProducto(producto)}</span>
      <span className="cifra shrink-0 text-xs text-muted">
        {entero(producto.n)} compras{producto.indexable ? '' : ', precio orientativo'}
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
  // La misma lectura que la ficha del producto y la portada: conclusión, gráfico,
  // cifras y método. Antes aquí iba una tarjeta de P10…P90 propia de esta página.
  const precio =
    ficha?.estado === 'ok' && banda
      ? precioDeBanda({ producto: ficha.datos, banda, nombre: precioDeLaBanda(banda.unidad), repositorio: urlRepositorio() })
      : null;

  return (
    <div className="space-y-4">
      <div>
        <Link href={rutaProducto(primero.slug)} className="text-base font-semibold text-primary hover:underline">
          {nombreProducto(primero)}
        </Link>
        <p className="cifra text-xs text-muted">
          {entero(primero.n)} compras
          {/* El total suma todas las unidades de medida; la banda de abajo es sólo la más comprada. */}
          {banda && banda.n < primero.n ? ', en todas sus presentaciones' : ''}
          {primero.indexable ? '' : ', precio orientativo'}
        </p>
      </div>

      {ficha?.estado === 'fallo' ? (
        <AvisoDeFallo que="el precio de este producto" motivo={ficha.motivo} />
      ) : banda ? (
        <div className="max-w-3xl">
          {precio ? (
            <>
              <p className="font-semibold text-text">{precio.conclusion}</p>
              <div className="mt-4">
                <GraficoPrecio datos={precio.grafico} />
                <ul className="sr-only">
                  {precio.accesible.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="font-semibold text-text">{frasePrecio(banda)}</p>
          )}
          <CifrasBanda banda={banda} />
          {precio && <PieDeMetodo texto={precio.pie} enlaces={precio.enlaces} />}
        </div>
      ) : (
        <p className="text-sm text-subtle">Todavía hay muy pocas compras para darte un precio.</p>
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

      <VerTodos href={rutaBusquedaProductos(termino)}>Ver todos los productos con «{termino}»</VerTodos>
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
      titulo="A qué precio lo compró el Estado"
      descripcion="Precio por unidad, sacado de las órdenes de compra."
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

// ── 2. Dónde postular hoy ────────────────────────────────────────────────────

/**
 * Una licitación abierta, con la misma forma que la fila del catálogo
 * (`components/licitacion/FilaLicitacion.tsx`): nombre, comprador y región, el
 * cierre y el código, y el monto a la derecha. Sin «guardar»: eso vive en el
 * catálogo y en la ficha. El cierre con su fecha (`cierreFijo`), como lo demás que
 * se pinta en el servidor.
 */
function FilaLicitacion({ licitacion: t }: { licitacion: Tender }) {
  const monto = montoNumerico(t.monto_estimado);
  const cierre = cierreFijo(t.fecha_cierre);
  const lugar = [t.nombre_organismo && normalizeText(t.nombre_organismo), t.region && shortRegion(t.region)]
    .filter(Boolean)
    .join(', ');
  return (
    <li className="flex gap-3 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={rutaLicitacion(t.codigo_externo)}
          className="line-clamp-2 break-words text-sm font-semibold leading-snug text-text hover:text-primary"
        >
          {normalizeText(t.nombre)}
        </Link>
        {lugar && <p className="mt-0.5 break-words text-xs text-muted">{lugar}</p>}
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted">
          {cierre && <span>{cierre}</span>}
          <span className="font-mono text-subtle">{t.codigo_externo}</span>
        </p>
      </div>
      <p className="cifra shrink-0 text-sm font-semibold text-text">
        {monto !== null ? plata(monto) : <span className="font-normal text-subtle">Sin monto</span>}
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
    return <p className="text-sm text-subtle">No hay licitaciones abiertas que mencionen «{termino}».</p>;
  }
  return (
    <>
      <p className="text-sm text-muted">
        Hay <span className="cifra font-semibold text-text">{entero(total)}</span>{' '}
        {total === 1 ? 'licitación abierta que menciona' : 'licitaciones abiertas que mencionan'} «{termino}».
      </p>
      <ul aria-label="Licitaciones abiertas que coinciden" className={`mt-3 ${LISTA}`}>
        {items.slice(0, LICITACIONES_EN_BUSCAR).map((t) => (
          <FilaLicitacion key={t.codigo_externo} licitacion={t} />
        ))}
      </ul>
      <VerTodos href={urlCatalogoAbiertas('licitaciones', terminos)}>
        {total === 1 ? 'Ver esta licitación en el catálogo' : `Ver las ${entero(total)} licitaciones en el catálogo`}
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
        No hay Compras Ágiles abiertas que mencionen «{termino}» y cierren en más de dos horas.
      </p>
    );
  }
  const meses = mesesDeVentana(datos.ventana_desde, datos.ventana_hasta);
  return (
    <>
      {/* Sin puesto: en una lista filtrada, «1» se leería como un ranking del término. */}
      <ul aria-label="Compras Ágiles abiertas que coinciden" className="divide-y divide-border border-y border-border">
        {datos.items.slice(0, COMPRAS_AGILES_EN_BUSCAR).map((item) => (
          <li key={item.codigo_externo}>
            <FilaCompraAgil
              item={item}
              actualizadoEn={datos.actualizado_en}
              historia={{ meses, disponible: datos.historia_disponible }}
            />
          </li>
        ))}
      </ul>
      <VerTodos href={rutaCompraAgil(termino)}>Ver todas las Compras Ágiles con «{termino}»</VerTodos>
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
    <Seccion id="abiertas" titulo="Dónde postular hoy">
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
              className="flex items-baseline justify-between gap-3 py-2.5"
            >
              <span className="min-w-0 truncate font-medium text-primary hover:text-accent">{normalizeText(c.nombre)}</span>
              <span className="cifra shrink-0 text-xs text-muted">{entero(c.n)} compras</span>
            </Link>
          </li>
        ))}
      </ul>
      <VerTodos href={rutaProducto(producto.slug)}>Ver qué pagó cada comprador</VerTodos>
    </>
  );
}

export function BloqueCompradores({ ficha }: { ficha: Bloque<ProductoPublico> }) {
  return (
    <Seccion
      id="compradores"
      titulo="Quién lo compra"
      descripcion={
        ficha.estado === 'ok'
          ? listaDeL0(ficha.datos)
            ? `Los que compraron «${nombreProducto(ficha.datos)}» ${MINIMO_COMPRAS_L0} veces o más.`
            : `Los que más veces compraron «${nombreProducto(ficha.datos)}».`
          : undefined
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
