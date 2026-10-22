'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { nombreCorto, type GraficoRed, type NodoRed } from '@/lib/redPortada';

import { Globo } from './Globo';
import { teclasDeRecorrido } from './teclado';

/** Cuántas partículas viajan a la vez por la red. */
const PARTICULAS = 32;
/** Cada cuánto se repinta la deriva, en ms: a 30 cuadros basta, y la red tiene 550 líneas. */
const CUADRO_MS = 33;

/** Un generador con semilla: la deriva y las partículas no dependen de `Math.random`. */
function azar(semilla: number) {
  let t = semilla >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Una coordenada del `viewBox` con un decimal (sin `toFixed`, que el test de cifras prohíbe). */
const u = (v: number) => String(Math.round(v * 10) / 10);

/** Cuánto se curva cada línea hacia el centro: la red se lee como un tejido y no como una malla. */
const CURVA = 0.3;

type Punto = { x: number; y: number };

/** El punto de control de la curva de un enlace: su punto medio, tirado hacia el centro del lienzo. */
const control = (a: Punto, b: Punto, centro: Punto) => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return { x: mx + (centro.x - mx) * CURVA, y: my + (centro.y - my) * CURVA };
};

const trazo = (nodos: Punto[], enlaces: { a: number; b: number }[], centro: Punto) =>
  enlaces
    .map((e) => {
      const a = nodos[e.a];
      const b = nodos[e.b];
      const c = control(a, b, centro);
      return `M${u(a.x)} ${u(a.y)}Q${u(c.x)} ${u(c.y)} ${u(b.x)} ${u(b.y)}`;
    })
    .join('');

/**
 * Cómo se pinta cada nodo: el organismo con el color de su sector; el proveedor que
 * nombra la conclusión, en tinta; el resto de los proveedores, hueco (un aro gris):
 * relleno de gris se confundía con el sector «Otros», que también es gris.
 */
const pintura = (d: NodoRed) =>
  d.sector
    ? `${d.sector.relleno} stroke-surface`
    : d.amplio
      ? 'fill-text stroke-surface'
      : 'fill-surface stroke-subtle';

/** Cuántos organismos se rotulan con su nombre en el dibujo: los de más monto. */
const ROTULADOS = 3;

/**
 * Quién le compra a quién entre los que más compran: los organismos (con el color
 * de su sector, `lib/sectores.ts`) y sus proveedores (en tinta los que le venden a
 * la mitad de ellos o más, que es lo que nombra la conclusión; en gris el resto),
 * unidos por una línea por cada par que se compró algo. El tamaño es el monto.
 *
 * La disposición llega calculada del servidor (`lib/redPortada.ts`), así que la
 * red se ve entera sin JavaScript. En el navegador, **un solo momento de
 * movimiento**: los nodos respiran apenas alrededor de su lugar y unas partículas
 * viajan del comprador al proveedor —la plata que va de uno al otro—. Se detiene
 * fuera de la pantalla, con la pestaña oculta y del todo con
 * `prefers-reduced-motion`. Se pinta con `requestAnimationFrame` sobre los
 * atributos, sin estado de React por cuadro.
 *
 * Pasar el mouse (o tocar) un nodo lo aísla con sus vecinos y abre su globo. Lo
 * que el globo dice está también en texto: la conclusión, la leyenda y la tabla
 * `sr-only` de los proveedores que le venden a más compradores. El dibujo es
 * `aria-hidden`.
 */
export function RedProveedores({ datos, accesible }: { datos: GraficoRed; accesible: { nombre: string; vecinos: number; texto: string }[] }) {
  const { nodos, enlaces, ancho, alto } = datos;
  const centro = useMemo(() => ({ x: ancho / 2, y: alto / 2 }), [ancho, alto]);
  const quieto = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [activo, setActivo] = useState<number | null>(null);
  const activoRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lineasRef = useRef<SVGPathElement>(null);
  const resaltadasRef = useRef<SVGPathElement>(null);
  const circulosRef = useRef<(SVGCircleElement | null)[]>([]);
  const particulasRef = useRef<(SVGCircleElement | null)[]>([]);
  // Dónde está cada nodo ahora: la base más la deriva. La lee el puntero.
  const posRef = useRef(nodos.map((d) => ({ x: d.x, y: d.y })));

  const vecinos = useMemo(() => {
    const v = nodos.map(() => new Set<number>());
    for (const e of enlaces) {
      v[e.a].add(e.b);
      v[e.b].add(e.a);
    }
    return v;
  }, [nodos, enlaces]);
  const base = useMemo(() => trazo(nodos, enlaces, centro), [nodos, enlaces, centro]);
  const delActivo = (i: number | null) => (i == null ? [] : enlaces.filter((e) => e.a === i || e.b === i));

  useEffect(() => {
    activoRef.current = activo;
  }, [activo]);

  useEffect(() => {
    if (quieto) return;
    const r = azar(nodos.length * 7919 + enlaces.length);
    const deriva = nodos.map(() => ({
      ax: 1 + r() * 2.2,
      ay: 1 + r() * 2.2,
      w: (0.12 + r() * 0.22) * 2 * Math.PI,
      fx: r() * 2 * Math.PI,
      fy: r() * 2 * Math.PI,
    }));
    // Las partículas eligen enlace por monto (la raíz, para que los chicos también se vean).
    const pesos = enlaces.map((e) => Math.sqrt(e.monto));
    const total = pesos.reduce((a, b) => a + b, 0);
    const elegir = () => {
      let x = r() * total;
      for (let i = 0; i < pesos.length; i++) if ((x -= pesos[i]) <= 0) return i;
      return pesos.length - 1;
    };
    const particulas = Array.from({ length: PARTICULAS }, () => ({ e: elegir(), p: r(), v: 1 / (2600 + r() * 2400) }));
    for (const [k, q] of particulas.entries()) {
      const c = particulasRef.current[k];
      const comprador = nodos[enlaces[q.e].a];
      if (c && comprador.sector) c.setAttribute('class', comprador.sector.relleno);
    }

    let visible = true;
    const observador = new IntersectionObserver(([entrada]) => {
      visible = entrada.isIntersecting;
    });
    if (svgRef.current) observador.observe(svgRef.current);

    let cuadro = 0;
    let ultimo = 0;
    let antes = performance.now();
    const pintar = (ahora: number) => {
      cuadro = requestAnimationFrame(pintar);
      const dt = ahora - antes;
      if (!visible || document.hidden || ahora - ultimo < CUADRO_MS) {
        if (dt > 200) antes = ahora;
        return;
      }
      ultimo = ahora;
      antes = ahora;
      const t = ahora / 1000;
      const pos = posRef.current;
      for (let i = 0; i < nodos.length; i++) {
        const d = deriva[i];
        pos[i].x = nodos[i].x + d.ax * Math.sin(d.w * t + d.fx);
        pos[i].y = nodos[i].y + d.ay * Math.cos(d.w * t + d.fy);
        const c = circulosRef.current[i];
        if (c) {
          c.setAttribute('cx', u(pos[i].x));
          c.setAttribute('cy', u(pos[i].y));
        }
      }
      lineasRef.current?.setAttribute('d', trazo(pos, enlaces, centro));
      const elegido = activoRef.current;
      if (resaltadasRef.current) {
        resaltadasRef.current.setAttribute(
          'd',
          elegido == null ? '' : trazo(pos, enlaces.filter((e) => e.a === elegido || e.b === elegido), centro),
        );
      }
      for (let k = 0; k < particulas.length; k++) {
        const q = particulas[k];
        q.p += q.v * dt;
        const c = particulasRef.current[k];
        if (q.p >= 1) {
          q.p = 0;
          q.e = elegir();
          const comprador = nodos[enlaces[q.e].a];
          if (c && comprador.sector) c.setAttribute('class', comprador.sector.relleno);
        }
        if (!c) continue;
        const { a, b } = enlaces[q.e];
        const s = q.p * q.p * (3 - 2 * q.p);
        const ctl = control(pos[a], pos[b], centro);
        // Sobre la misma curva que la línea: la cuadrática de Bézier en s.
        const r1 = 1 - s;
        c.setAttribute('cx', u(r1 * r1 * pos[a].x + 2 * r1 * s * ctl.x + s * s * pos[b].x));
        c.setAttribute('cy', u(r1 * r1 * pos[a].y + 2 * r1 * s * ctl.y + s * s * pos[b].y));
        const enLaRed = elegido == null || enlaces[q.e].a === elegido || enlaces[q.e].b === elegido;
        c.setAttribute('opacity', enLaRed ? String(Math.round(Math.sin(Math.PI * q.p) * 90) / 100) : '0');
      }
    };
    cuadro = requestAnimationFrame(pintar);
    return () => {
      cancelAnimationFrame(cuadro);
      observador.disconnect();
    };
  }, [quieto, nodos, enlaces, centro]);

  /** El nodo bajo el puntero, con 8 unidades de holgura: los proveedores chicos miden 3. */
  const buscar = (cliente: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const matriz = svg?.getScreenCTM();
    if (!svg || !matriz) return null;
    const punto = new DOMPoint(cliente.clientX, cliente.clientY).matrixTransform(matriz.inverse());
    let mejor: number | null = null;
    let distancia = Infinity;
    posRef.current.forEach((p, i) => {
      const d = Math.hypot(p.x - punto.x, p.y - punto.y) - nodos[i].r;
      if (d < 8 && d < distancia) {
        distancia = d;
        mejor = i;
      }
    });
    return mejor;
  };

  const rotulos = useMemo(
    () =>
      nodos
        .filter((d) => d.tipo === 'comprador')
        .sort((a, b) => b.monto - a.monto)
        .slice(0, ROTULADOS)
        .map((d) => {
          // Del lado de adentro: a la izquierda del nodo si está a la derecha del centro, y al revés.
          const derecha = d.x > ancho / 2;
          return {
            id: d.id,
            texto: nombreCorto(d.nombre),
            x: ((derecha ? d.x - d.r - 3 : d.x + d.r + 3) / ancho) * 100,
            y: (d.y / alto) * 100,
            clase: `${derecha ? '-translate-x-full' : ''} -translate-y-1/2`,
          };
        }),
    [nodos, ancho, alto],
  );
  const centro_ = useMemo(() => {
    const amplios = nodos.filter((d) => d.amplio);
    if (amplios.length < 3) return null;
    const x = amplios.reduce((a, d) => a + d.x, 0) / amplios.length;
    const abajo = Math.max(...amplios.map((d) => d.y + d.r));
    return { x: (x / ancho) * 100, y: ((abajo + 6) / alto) * 100, texto: `Le venden a ${datos.mitad} o más` };
  }, [nodos, ancho, alto, datos.mitad]);
  const nodo = activo != null ? nodos[activo] : null;
  const cerca = activo != null ? vecinos[activo] : null;
  const resaltadasIniciales = useMemo(() => trazo(nodos, delActivo(activo), centro), [activo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <figure className="min-w-0">
      <p aria-live="polite" className="sr-only">
        {nodo ? `${nodo.nombre}: ${nodo.tipo === 'comprador' ? `compró ${nodo.texto}` : `les vendió ${nodo.texto} a ${nodo.vecinos} organismos`}` : ''}
      </p>
      <div
        className="relative rounded-sm"
        tabIndex={0}
        role="group"
        aria-label="La red: recorre los organismos y proveedores con las flechas"
        onKeyDown={teclasDeRecorrido(nodos.length, activo, setActivo)}
        onBlur={() => setActivo(null)}
      >
        <svg
          ref={svgRef}
          aria-hidden="true"
          viewBox={`0 0 ${ancho} ${alto}`}
          className="block h-auto w-full touch-pan-y"
          onPointerMove={(e) => {
            const i = buscar(e);
            if (i !== activo) setActivo(i);
          }}
          onPointerDown={(e) => setActivo(buscar(e))}
          onPointerLeave={() => setActivo(null)}
        >
          <path
            ref={lineasRef}
            d={base}
            className={`fill-none stroke-subtle ${activo != null ? 'opacity-10' : 'opacity-25'}`}
            strokeWidth={0.6}
          />
          <path ref={resaltadasRef} d={resaltadasIniciales} className="fill-none stroke-text" strokeWidth={1.1} />
          <g>
            {Array.from({ length: PARTICULAS }, (_, k) => (
              <circle
                key={k}
                ref={(c) => {
                  particulasRef.current[k] = c;
                }}
                r={2}
                cx={-10}
                cy={-10}
                opacity={0}
                className="fill-serie-otros"
              />
            ))}
          </g>
          <g>
            {nodos.map((d, i) => (
              <circle
                key={d.id}
                ref={(c) => {
                  circulosRef.current[i] = c;
                }}
                data-nodo={d.tipo}
                cx={d.x}
                cy={d.y}
                r={d.r}
                strokeWidth={d.tipo === 'comprador' ? 1.5 : d.amplio ? 1 : 1.2}
                className={`${pintura(d)} ${activo != null && activo !== i && !cerca?.has(i) ? 'opacity-15' : ''}`}
              />
            ))}
          </g>
        </svg>
        {/* Rótulos directos: los organismos más grandes, por su nombre corto, del lado de
            adentro del anillo; y el grupo del centro, que es lo que dice la conclusión. */}
        <div aria-hidden="true" className={`pointer-events-none ${activo != null ? 'opacity-0' : ''}`}>
          {rotulos.map((r) => (
            <span
              key={r.id}
              className={`absolute whitespace-nowrap rounded-sm bg-surface px-1 text-[12px] font-medium leading-tight text-text ${r.clase}`}
              style={{ left: `${r.x}%`, top: `${r.y}%` }}
            >
              {r.texto}
            </span>
          ))}
          {centro_ && (
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap rounded-sm bg-surface px-1 text-[12px] leading-tight text-text"
              style={{ left: `${centro_.x}%`, top: `${centro_.y}%` }}
            >
              {centro_.texto}
            </span>
          )}
        </div>
        {nodo && activo != null && (
          <Globo x={(nodo.x / ancho) * 100} medio={(nodo.r / ancho) * 100}>
            <p className="font-semibold leading-snug">{nodo.nombre}</p>
            {nodo.tipo === 'comprador' ? (
              <>
                <p className="text-muted">{nodo.sector?.nombre}</p>
                <p className="mt-1">
                  Compró <span className="cifra font-semibold">{nodo.texto}</span>
                </p>
                <p className="text-muted">
                  Le compra a {nodo.vecinos} {nodo.vecinos === 1 ? 'proveedor' : 'proveedores'} de la red
                </p>
              </>
            ) : (
              <>
                <p className="mt-1">
                  Les vendió <span className="cifra font-semibold">{nodo.texto}</span>
                </p>
                <p className="text-muted">
                  A {nodo.vecinos} de los {datos.compradores} organismos
                </p>
              </>
            )}
          </Globo>
        )}
      </div>

      {/* La leyenda en dos grupos, uno por cada cosa que se dibuja: los organismos por su
          color de sector y los proveedores por su forma. */}
      <div className="mt-3 space-y-1.5 text-sm text-muted">
        <ul aria-label="Organismos, por sector" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <li className="font-medium text-text">Organismos:</li>
          {datos.sectores.map((s) => (
            <li key={s.clave} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-3 w-3 rounded-full ${s.fondo}`} />
              {s.nombre}
            </li>
          ))}
        </ul>
        <ul aria-label="Proveedores" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <li className="font-medium text-text">Proveedores:</li>
          {nodos.some((d) => d.amplio) && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-text" />
              le venden a {datos.mitad} organismos o más
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-subtle bg-surface" />
            el resto
          </li>
        </ul>
      </div>

      {/* Una tabla no respeta el ancho de 1 px de `sr-only`: va dentro de un div. */}
      <div className="sr-only">
        <table>
          <caption>Los proveedores que le venden a más de estos organismos</caption>
          <tbody>
            {accesible.map((p) => (
              <tr key={p.nombre}>
                <th scope="row">{p.nombre}</th>
                <td>
                  A {p.vecinos} organismos, {p.texto}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
