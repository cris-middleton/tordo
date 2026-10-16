import { OJO_PAJARO, TRAZOS_PAJARO, VIEWBOX_PAJARO, type ParteDelPajaro } from '@/lib/pajaroImagen';

/**
 * El pájaro del logo junto a la marca (docs/IDENTIDAD_Y_PORTADA_2026-10.md D2).
 *
 * **Componente de servidor y sin JavaScript**: el que había, `TordoLogo`, era un
 * componente cliente con un aleteo por `setInterval` y siete colores escritos a mano,
 * y viajaba en todas las páginas como una quinta isla que nadie contaba.
 *
 * Los trazos son los de la tarjeta de vista previa (`lib/pajaroImagen.ts`), que
 * `pajaro-imagen.test.ts` compara con el SVG del logo: una sola copia. Dos tonos, como
 * la tarjeta: el cuerpo en el azul del logo y el ala y el pico en su turquesa, los dos
 * invariantes de tema. El ojo es un hueco al fondo de la cabecera (`surface`), como en
 * la tarjeta es un hueco al panel. Decorativo: el nombre lo da el enlace de la marca.
 */
const RELLENO: Record<ParteDelPajaro, string> = {
  cuerpo: 'fill-brand-blue',
  ala: 'fill-brand-teal',
};

export function PajaroMarca() {
  return (
    <svg
      viewBox={VIEWBOX_PAJARO}
      width={30}
      height={26}
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {TRAZOS_PAJARO.map((t, i) => (
        <path key={i} d={t.d} className={RELLENO[t.parte]} />
      ))}
      <ellipse {...OJO_PAJARO} className="fill-surface" />
    </svg>
  );
}
