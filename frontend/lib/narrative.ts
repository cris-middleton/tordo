import type { DashboardHomeResponse } from '@/types/dashboardHome';

const GREETINGS_MORNING = [
  'Buenos días', 'Buen día', 'Hola', 'Arrancando el día',
  'Empezamos', 'Cómo va el día', 'Bienvenido de vuelta', 'Listo para hoy',
];
const GREETINGS_AFTERNOON = [
  'Buenas tardes', 'Hola', 'Cómo vas', 'Buen día por la tarde',
  'Espero buena tarde', 'En la mitad del día', 'De vuelta',
];
const GREETINGS_EVENING = [
  'Buenas noches', 'Cerrando el día', 'Última pasada del día', 'Hola', 'Resumen de cierre',
];

const MATCHES_PHRASES = [
  (n: number) => `Esta semana aparecieron ${n} matches nuevos`,
  (n: number) => `Hay ${n} licitaciones nuevas que calzan con tu perfil`,
  (n: number) => `Encontramos ${n} oportunidades para ti esta semana`,
  (n: number) => `${n} licitaciones cruzaron tu radar`,
  (n: number) => `Se publicaron ${n} licitaciones que encajan con lo que haces`,
  (n: number) => `Tienes ${n} matches frescos para revisar`,
  (n: number) => `${n} oportunidades nuevas te apuntan`,
  (n: number) => `Aparecieron ${n} licitaciones nuevas en tus rubros`,
];

const URGENCY_SUFFIXES = [
  (m: number) => ` — ${m} cierran en menos de 72h`,
  (m: number) => ` — ${m} vencen pronto`,
  (m: number) => ` — ${m} están en cuenta regresiva`,
  (m: number) => ` — ${m} necesitan respuesta esta semana`,
  (m: number) => ` — ojo, ${m} cierran en <72h`,
  (m: number) => ` — ${m} requieren atención inmediata`,
];

const POSTULACIONES_PHRASES = [
  (n: number) => `Tienes ${n} postulaciones en curso`,
  (n: number) => `${n} postulaciones activas en tu pipeline`,
  (n: number) => `Hay ${n} en preparación o seguimiento`,
  (n: number) => `Estás trabajando en ${n} postulaciones`,
  (n: number) => `${n} licitaciones en tu mesa`,
];

const DOCS_PHRASES = [
  (n: number) => `${n} ${n === 1 ? 'documento' : 'documentos'} ${n === 1 ? 'vence' : 'vencen'} este mes`,
  (n: number) => `${n} ${n === 1 ? 'documento' : 'documentos'} por renovar pronto`,
  (n: number) => `Atención: ${n} ${n === 1 ? 'doc caduca' : 'docs caducan'} en los próximos 30 días`,
  (n: number) => `${n} ${n === 1 ? 'documento requiere' : 'documentos requieren'} renovación`,
];

const INHABIL_PHRASES = [
  'Importante: tu empresa figura inhábil',
  'Atención: estás inhábil en Mercado Público',
  'Ojo: tu estado actual es inhábil',
  'Estado inhábil — revisa documentos en Tesorería',
];

const ADJUDICACIONES_PHRASES = [
  (n: number) => `Ya van ${n} adjudicaciones este mes`,
  (n: number) => `Has ganado ${n} licitaciones este mes`,
  (n: number) => `${n} adjudicaciones a tu favor este mes`,
  (n: number) => `Buen mes: ${n} adjudicada${n === 1 ? '' : 's'}`,
];

const EMPTY_PHRASES = [
  'No hay nada urgente por ahora. Buen momento para revisar tu perfil de rubros.',
  'Todo despejado por ahora. Aprovecha para configurar alertas.',
  'Sin novedades urgentes. Es buena hora para mirar tu pipeline con calma.',
  'Día tranquilo. Revisa tus alertas o explora /bi para encontrar nuevos compradores.',
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
  const greeting = `${pick(greetings, seed, 0)}, ${firstName || 'hola'}.`;

  const out: string[] = [greeting];
  const r = data.resumen;
  const inhabil = data.empresa && data.empresa.estado_habil !== 'habil';

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
