/**
 * Plan de la empresa y claves de API.
 *
 * Los límites llegan del backend a propósito: viven en `PLAN_QUOTAS`
 * (`core/plan_limits.py`) y copiarlos aquí los desincroniza en cuanto cambian
 * los precios, sin que nada falle — el cliente ve un límite que no es el suyo.
 */

/** `null` es ILIMITADO, no cero. Un 0 se leería como "no cabe ninguno". */
export interface LimitesPlan {
  max_usuarios: number | null;
  max_docs: number | null;
  max_docs_mb: number | null;
  bi_queries_per_day: number | null;
  max_active_alerts: number | null;
}

export interface UsoPlan {
  usuarios: number;
  consultas_bi_hoy: number;
}

export interface PlanResumen {
  /** Tier EFECTIVO: en trial es `pro` aunque se pague otro. */
  tier: string;
  etiqueta: string;
  en_trial: boolean;
  tier_contratado: string;
  siguiente_tier: string | null;
  limites: LimitesPlan;
  uso: UsoPlan;
}

export interface ApiKeyResumen {
  id: string;
  nombre: string;
  /** La parte en claro de la clave. Sirve para reconocerla en un log. */
  prefijo: string;
  creada_por: number | null;
  ultimo_uso_en: string | null;
  expira_en: string | null;
  revocada_en: string | null;
  created_at: string;
}

/** La respuesta de creación, y la única que trae el secreto. */
export interface ApiKeyCreada extends ApiKeyResumen {
  clave: string;
}
