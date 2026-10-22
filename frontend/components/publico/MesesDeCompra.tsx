import { Columnas } from '@/components/graficos/Columnas';
import { Seccion } from '@/components/publico/Piezas';
import { decimal } from '@/lib/formato';
import { conclusionDeMeses, MESES_CORTOS, mesesNombrados } from '@/lib/mesesDeCompra';
import { MESES_ANALISIS } from '@/lib/periodo';
import type { MesDeCompra } from '@/types/publico';

/**
 * «En qué meses compra»: la parte de sus órdenes que cae en cada mes del año,
 * sumando todos sus rubros (`meses_de_compra` de `GET /publico/compradores/{codigo}`).
 * Responde cuándo conviene tener lista una oferta. La frase es la de `/mercado`
 * (`conclusionDeMeses`) y en `dato` van sólo los meses que nombra. Sin el dato
 * —una API que todavía no lo trae, o un comprador sin órdenes—, no se pinta.
 */
export function MesesDeCompra({ meses }: { meses: MesDeCompra[] | null | undefined }) {
  const total = (meses ?? []).reduce((a, m) => a + m.compras, 0);
  if (!meses || meses.length !== 12 || !(total > 0)) return null;
  const probs = meses.map((m) => ({ mes: m.mes, prob: m.compras / total }));
  const nombrados = new Set(mesesNombrados(probs));
  return (
    <Seccion
      titulo="En qué meses compra"
      descripcion={`Qué parte de sus órdenes de los últimos ${MESES_ANALISIS} meses cae en cada mes del año, en todos sus rubros.`}
    >
      <div className="max-w-3xl">
        <p className="font-semibold text-text">{conclusionDeMeses(probs, [])}</p>
        <div className="mt-4">
          <Columnas
            etiqueta="Parte de sus órdenes en cada mes"
            columnas={probs.map((m) => ({
              clave: String(m.mes),
              etiqueta: MESES_CORTOS[m.mes - 1],
              valor: m.prob,
              texto: `${decimal(m.prob * 100, 0)}\u00a0%`,
              destacada: nombrados.has(m.mes),
            }))}
          />
        </div>
      </div>
    </Seccion>
  );
}
