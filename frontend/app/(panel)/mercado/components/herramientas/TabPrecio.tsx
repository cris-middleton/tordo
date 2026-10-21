'use client';

import { useEffect, useState } from 'react';
import { Info, Loader2, Search } from 'lucide-react';

import { apiClient } from '@/lib/api';
import { useBuscarProductos } from '@/lib/queries';
import type { OrganismoConNombre } from '../../types';
import BotonExportar from '@/components/BotonExportar';
import {
  extractErrorMessage,
  formatCLPShort,
  nivelLabel,
  predictibilidadInfo,
  type PrecioBanda,
  type PrecioResultado,
} from './comun';
import { motivoParaPersona } from '@/lib/motivos';
import { textoPeriodo } from '@/lib/periodo';
import { decimal } from '@/lib/formato';
import { type ConsultaPrecio, rutaExportarPrecio } from '@/lib/exportar';

interface ProductoOption {
  codigoProductoONU?: string;
  nombre?: string;
  n?: number;
}

export default function TabPrecio({ organismosConNombre }: { organismosConNombre?: OrganismoConNombre[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ProductoOption | null>(null);
  // El desplegable se abría solo al llegar resultados (con un `setShowDropdown`
  // dentro del fetch). Al mover la petición a la consulta eso se habría perdido,
  // así que ahora se DERIVA: hay resultados, el campo no está cerrado a mano y
  // el usuario no ha elegido todavía.
  const [cerradoAMano, setCerradoAMano] = useState(false);
  const [organismo, setOrganismo] = useState('');
  const [resultado, setResultado] = useState<PrecioResultado | null>(null);
  // Con qué se consultó: el título y la descarga salen de aquí, no de lo que el
  // formulario tenga escrito después (`lib/exportar.ts`).
  const [consultada, setConsultada] = useState<ConsultaPrecio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // El retardo se queda como efecto —un temporizador SÍ es un efecto— pero ya no
  // hace la petición: sólo publica el texto retardado, y la consulta reacciona a
  // él. Así desaparece la carrera que tenía el original, donde una respuesta
  // lenta podía pisar a una más reciente.
  const [textoRetardado, setTextoRetardado] = useState('');
  useEffect(() => {
    const buscable = !query || query.trim().length < 2 || selected?.nombre === query ? '' : query;
    const t = setTimeout(() => setTextoRetardado(buscable), 250);
    return () => clearTimeout(t);
  }, [query, selected]);

  const consultaProductos = useBuscarProductos(textoRetardado);
  const resProductos = consultaProductos.data as { disponible?: boolean; resultados?: ProductoOption[] } | undefined;
  const options: ProductoOption[] = resProductos?.disponible ? (resProductos.resultados ?? []) : [];
  const searching = textoRetardado.length >= 2 && consultaProductos.isFetching;

  const consultar = async () => {
    const codigo = selected?.codigoProductoONU?.trim();
    if (!codigo) {
      setError('Elige un producto de la lista.');
      return;
    }
    setLoading(true);
    setError('');
    const pedida: ConsultaPrecio = { codigo, nombre: selected?.nombre, organismo: organismo.trim() };
    try {
      const res: PrecioResultado = await apiClient.getBIPrecio(codigo, {
        organismo_id: pedida.organismo || undefined,
      });
      setResultado(res);
      setConsultada(pedida);
      if (!res.disponible) {
        setError(motivoParaPersona(res.motivo, 'Sin datos de compras de este producto.'));
      }
    } catch (err) {
      setError(extractErrorMessage(err));
      setResultado(null);
      setConsultada(null);
    } finally {
      setLoading(false);
    }
  };

  // Antes se tomaba sólo `resultado.resultado[0]` y se descartaba el resto:
  // cuando el backend separa una categoría en varios productos reales (L0),
  // la pantalla volvía a enseñar un solo número, como si no se hubiera
  // separado nada. Ahora se muestran todas las bandas que trajo el backend.
  const bandas = (resultado?.resultado ?? []).filter((b) => b.p50 != null);
  const primeraBanda = bandas[0];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Busca un producto. Si eliges un comprador, ves sólo lo que pagó él.
      </p>

      {/* Combobox producto */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); setCerradoAMano(false); }}
          onFocus={() => setCerradoAMano(false)}
          onBlur={() => { setTimeout(() => setCerradoAMano(true), 150); }}
          placeholder="Por ejemplo, uniformes, reactivos o papel"
          className="input-field pl-9 pr-9 w-full"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
        )}

        {/* Dropdown con resultados */}
        {!cerradoAMano && !selected && options.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-border bg-surface shadow-xl">
            {options.map((p) => (
              <button
                key={p.codigoProductoONU}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelected(p);
                  setQuery(p.nombre || '');
                  setCerradoAMano(true);
                }}
                className="w-full text-left px-3 py-2 hover:bg-primary/5 border-b border-border last:border-0"
              >
                <p className="text-sm text-text font-medium">{p.nombre}</p>
                <p className="text-xs text-muted">
                  Código ONU <span className="font-mono">{p.codigoProductoONU}</span>
                  {p.n != null && <>, {p.n.toLocaleString('es-CL')} compras</>}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Organismo + botón */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        {organismosConNombre && organismosConNombre.length > 0 ? (
          <select
            aria-label="Comprador"
            value={organismo}
            onChange={(e) => setOrganismo(e.target.value)}
            className="input-field"
          >
            <option value="">Todos los compradores</option>
            {organismosConNombre.map((o) => (
              <option key={o.codigo} value={o.codigo} title={o.nombre}>
                {o.nombre.length > 45 ? `${o.nombre.slice(0, 45)}…` : o.nombre}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={organismo}
            onChange={(e) => setOrganismo(e.target.value)}
            placeholder="Código del comprador (opcional)"
            className="input-field"
          />
        )}
        <button
          onClick={consultar}
          disabled={loading || !selected}
          className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ver precios'}
        </button>
      </div>

      {error && !primeraBanda && (() => {
        const isMissingParquet = error.toLowerCase().includes('parquet') || error.toLowerCase().includes('sin datos');
        return (
          <div className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
            isMissingParquet ? 'border-border bg-surface/60 text-muted' : 'border-danger/30 bg-danger/5 text-danger'
          }`}>
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        );
      })()}

      {bandas.length > 0 && (
        <div className="space-y-3">
          {consultada?.nombre && (
            <p className="font-semibold text-text">{consultada.nombre}</p>
          )}
          {resultado?.nivel_usado && (
            <p className="text-xs text-muted">
              Sale de {nivelLabel(resultado.nivel_usado)}
              {/* Sólo se anuncia la cuenta cuando hay más de una: es la
                  diferencia visible entre "un precio" y "esta categoría son
                  varios productos distintos" — el hallazgo que motivó L0. */}
              {bandas.length > 1 && <>. {bandas.length} productos distintos en esta categoría</>}
              {/* Sin esto la banda se lee como histórica, y son sólo los
                  últimos 12 meses de datos (36 en la referencia del organismo). */}
              {textoPeriodo(resultado.periodo) && <>. Compras de {textoPeriodo(resultado.periodo)}</>}
            </p>
          )}
          <div className="space-y-2">
            {bandas.map((b, i) => (
              <BandaPrecioCard key={b.firma_producto || b.codigoProductoONU || i} banda={b} />
            ))}
          </div>
          {consultada && (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {/* La descarga es lo que convierte esto en un entregable: se pega
                  en una propuesta interna o se manda al socio que decide. */}
              <BotonExportar ruta={rutaExportarPrecio(consultada)} etiqueta="Descargar en CSV" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Una banda de precio. Definido a nivel de módulo (no dentro del cuerpo de
 * `TabPrecio`) para no reconstruirse en cada render de la pantalla — el mismo
 * motivo por el que los ayudantes de estado y formato van fuera del
 * componente, aplicado aquí a un sub-componente en vez de a una función pura.
 *
 * `descripcion` sólo viene en L0/L0N: es lo que distingue una banda de otra
 * cuando la categoría se separó en varios productos reales. En L1-L4 no hay
 * `descripcion` porque hay una sola banda por categoría, y el título ya lo
 * puso `TabPrecio` (`selected.nombre`) una sola vez arriba.
 */
function BandaPrecioCard({ banda }: { banda: PrecioBanda }) {
  if (banda.p50 == null) return null;
  const info = predictibilidadInfo(banda.predictibilidad);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm space-y-2">
      {banda.descripcion && (
        <p className="font-medium text-text">{banda.descripcion}</p>
      )}
      <p className="text-text">
        {/* La mediana dicha en palabras (docs/VOZ.md, regla 3), sin la palabra. */}
        La mitad pagó menos de <b>{formatCLPShort(banda.p50)}</b>
        {/* Un precio es siempre precio POR ALGO: "$2.380" significa algo
            distinto por unidad que por caja de 100. Se pega a la cifra, no a
            un pie de página, para que nunca se lea el número sin su unidad. */}
        {banda.UnidadMedida && <> por {banda.UnidadMedida}</>}
        {' y la otra mitad, más.'}
        {banda.p10 != null && banda.p90 != null && (
          <> 8 de cada 10 compras, entre <b>{formatCLPShort(banda.p10)}</b> y <b>{formatCLPShort(banda.p90)}</b>.</>
        )}
      </p>
      {!banda.UnidadMedida && (
        <p className="text-xs text-warning">
          Este precio viene sin unidad de medida. Antes de cotizar, confirma si es por unidad, caja o kilo.
        </p>
      )}
      <p className="text-xs text-muted">
        {banda.n != null && <><b>{banda.n.toLocaleString('es-CL')}</b> compras</>}
        {/* `confianza` es un float 0-1 del backend, no el texto que declaraba
            el tipo antes — se muestra como porcentaje, que es lo que es. */}
        {banda.confianza != null && (
          <>. Confianza del cálculo: {Math.round(banda.confianza * 100)} % (sube con más compras y precios más parejos)</>
        )}
      </p>
      {info && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${info.clase}`}>
            {info.etiqueta}
          </span>
          {/* El adjetivo no reemplaza el número: se muestra el QCD crudo al
              lado, para quien quiera verificarlo en vez de confiar en la
              palabra. No se inventa un corte nuevo aquí — el corte ya lo
              hizo el backend al calcular `predictibilidad`. */}
          {banda.qcd != null && (
            <span className="text-xs text-subtle">dispersión {decimal(banda.qcd, 2)}, de 0 (precios parejos) a 1 (muy distintos)</span>
          )}
        </div>
      )}
      {banda.predictibilidad === 'baja' && (
        <p className="text-xs text-danger">
          Por este producto se pagaron precios muy distintos, y el dato no dice por qué. Lee bien
          las bases antes de fijar tu precio.
        </p>
      )}
    </div>
  );
}
