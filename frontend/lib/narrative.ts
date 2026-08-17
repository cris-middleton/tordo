import type { DashboardHomeResponse } from '@/types/dashboardHome';

/* Todo lo de aquí se pinta dentro de la plantilla `${saludo}, ${nombre}.`, y
   ESO es lo que hay que probar antes de meter una frase en la lista. Los pools
   anteriores no lo pasaban:

   - «Buen día por la tarde» y «Espero buena tarde» no son español que hable
     nadie.
   - «Resumen de cierre», «Última pasada del día», «Arrancando el día» y
     «Listo para hoy» no son saludos: salían como «Resumen de cierre, Ana.».
   - «Cómo va el día» y «Cómo vas» son preguntas y la plantilla les pega un
     punto: «Cómo vas, Ana.» — sin signos, mal puntuado.
   - «Bienvenido de vuelta» está en masculino, y aquí el nombre viene de una
     persona real que puede no serlo.

   Se quedan sólo saludos, sin género y sin interrogación. Son menos, y la
   variedad importa bastante menos que no sonar a máquina mal traducida. */
const GREETINGS_MORNING = ['Buenos días', 'Buen día', 'Hola', 'Buenas'];
const GREETINGS_AFTERNOON = ['Buenas tardes', 'Hola', 'Buenas'];
const GREETINGS_EVENING = ['Buenas noches', 'Hola', 'Buenas'];

// «matches» estaba en tres de las ocho frases. Es la palabra que usamos entre
// nosotros; el usuario lee «calza» en el correo, en la landing y en la tarjeta
// de licitación, y aquí se le cambiaba el idioma sin motivo.
const MATCHES_PHRASES = [
  (n: number) => `Esta semana aparecieron ${n} licitaciones que te calzan`,
  (n: number) => `Hay ${n} licitaciones nuevas que calzan con lo que vendes`,
  (n: number) => `Encontramos ${n} oportunidades para ti esta semana`,
  (n: number) => `${n} licitaciones nuevas pasaron tu filtro`,
  (n: number) => `Se publicaron ${n} licitaciones que encajan con lo que haces`,
  (n: number) => `Tienes ${n} licitaciones nuevas por revisar`,
  (n: number) => `Aparecieron ${n} licitaciones nuevas en lo tuyo`,
];

const URGENCY_SUFFIXES = [
  (m: number) => ` — ${m} cierran en menos de 72 horas`,
  (m: number) => ` — a ${m} se les acaba el plazo pronto`,
  (m: number) => ` — ${m} van contra reloj`,
  (m: number) => ` — ${m} hay que responderlas esta semana`,
  (m: number) => ` — ojo, ${m} cierran en menos de 72 horas`,
  (m: number) => ` — ${m} no pueden esperar`,
];

const POSTULACIONES_PHRASES = [
  (n: number) => `Tienes ${n} postulaciones en curso`,
  (n: number) => `${n} postulaciones activas en tu tablero`,
  (n: number) => `Hay ${n} en preparación o en espera`,
  (n: number) => `Estás trabajando en ${n} postulaciones`,
  (n: number) => `${n} licitaciones en tu mesa`,
];

const DOCS_PHRASES = [
  (n: number) => `${n} ${n === 1 ? 'documento' : 'documentos'} ${n === 1 ? 'vence' : 'vencen'} este mes`,
  (n: number) => `${n} ${n === 1 ? 'documento' : 'documentos'} por renovar pronto`,
  (n: number) => `Atención: ${n} ${n === 1 ? 'doc caduca' : 'docs caducan'} en los próximos 30 días`,
  (n: number) => `${n} ${n === 1 ? 'documento requiere' : 'documentos requieren'} renovación`,
];

// «revisa documentos en Tesorería» nombraba UNA causa de varias, y nosotros no
// sabemos cuál es: el CSV de ChileCompra trae el RUT y el estado, sin motivo.
// La causa sólo la ve el proveedor, en la sección «Habilidad» de su ficha.
// Mandarlo a Tesorería cuando el problema era la tarifa del registro quema el
// aviso: va, no encuentra nada, y la próxima vez no lo lee.
const INHABIL_PHRASES = [
  'Importante: tu empresa figura inhábil, así no puedes ofertar',
  'Atención: estás inhábil en Mercado Público — el motivo sale en tu ficha',
  'Ojo: hoy apareces inhábil, y eso bloquea cualquier oferta',
  'Estado inhábil — mira la sección «Habilidad» de tu ficha',
];

const ADJUDICACIONES_PHRASES = [
  (n: number) => `Ya van ${n} adjudicaciones este mes`,
  (n: number) => `Has ganado ${n} licitaciones este mes`,
  (n: number) => `${n} adjudicaciones a tu favor este mes`,
  (n: number) => `Buen mes: ${n} adjudicada${n === 1 ? '' : 's'}`,
];

// La cuarta frase mandaba al usuario a «explora /bi»: una ruta interna, cruda,
// en pantalla. Nadie escribe una URL a mano desde un panel — y aunque lo
// hiciera, «/bi» no es el nombre de nada que se vea en el menú.
const EMPTY_PHRASES = [
  'No hay nada urgente. Buen momento para revisar en qué rubros te estamos buscando.',
  'Todo despejado. Aprovecha de afinar tus alertas.',
  'Sin novedades urgentes. Buena hora para mirar tus postulaciones con calma.',
  'Día tranquilo. Pásate por Inteligencia de mercado y mira qué compradores mueven tu rubro.',
];

function pickGreeting(hour: number): string[] {
  if (hour >= 6 && hour < 12) return GREETINGS_MORNING;
  if (hour >= 12 && hour < 19) return GREETINGS_AFTERNOON;
  if (hour >= 19) return GREETINGS_EVENING;
  return GREETINGS_MORNING;
}

function dateSeed(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function pick<T>(pool: T[], seed: number, slot: number): T {
  return pool[(seed + slot * 7919) % pool.length];
}

interface BuildArgs {
  data: DashboardHomeResponse;
  firstName: string;
  now: Date;
}

export function buildNarrative({ data, firstName, now }: BuildArgs): string[] {
  const seed = dateSeed(now);
  const hour = now.getHours();
  const greetings = pickGreeting(hour);
  // Sin nombre, el saludo va solo. El respaldo era la cadena 'hola', así que
  // una cuenta sin `full_name` ni `username` saludaba con «Buenos días, hola.».
  const nombre = firstName.trim();
  const greeting = nombre ? `${pick(greetings, seed, 0)}, ${nombre}.` : `${pick(greetings, seed, 0)}.`;

  const out: string[] = [greeting];
  const r = data.resumen;
  // `estado_habil` empieza en 'desconocido' y se queda ahí mientras no haya
  // fuente configurada (ver backend/app/services/estado_habil_service.py) —
  // no es lo mismo que 'inhabil'. Comparar contra 'inhabil' explícito, en vez
  // de "!== 'habil'", evita que cada empresa sin dato reciba la frase de
  // alarma en cada carga del dashboard.
  const inhabil = data.empresa?.estado_habil === 'inhabil';

  if (r.matches_semana > 0) {
    let p = pick(MATCHES_PHRASES, seed, 1)(r.matches_semana);
    const urgentCount = r.matches_72h > 0 ? r.matches_72h : r.postulaciones_cierran_72h;
    if (urgentCount > 0) {
      p += pick(URGENCY_SUFFIXES, seed, 2)(urgentCount);
    }
    out.push(p + '.');
  }

  const secondaryParts: string[] = [];
  if (inhabil) {
    secondaryParts.push(pick(INHABIL_PHRASES, seed, 3));
  } else if (r.docs_por_vencer_30d > 0) {
    secondaryParts.push(pick(DOCS_PHRASES, seed, 3)(r.docs_por_vencer_30d));
  } else if (r.postulaciones_activas > 0) {
    secondaryParts.push(pick(POSTULACIONES_PHRASES, seed, 3)(r.postulaciones_activas));
  } else if (r.adjudicaciones_mes > 0) {
    secondaryParts.push(pick(ADJUDICACIONES_PHRASES, seed, 3)(r.adjudicaciones_mes));
  }
  if (secondaryParts.length > 0) out.push(secondaryParts.join('. ') + '.');

  if (out.length >= 2 && r.adjudicaciones_mes > 0 && !inhabil) {
    out.push(pick(ADJUDICACIONES_PHRASES, seed, 4)(r.adjudicaciones_mes) + '.');
  }

  if (out.length === 1) {
    out.push(pick(EMPTY_PHRASES, seed, 5));
  }

  return out.slice(0, 3);
}
