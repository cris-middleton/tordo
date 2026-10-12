/**
 * Respuestas de `/publico/*` según el contrato del paso 10 (backend
 * `api/publico.py`). Escritas a mano: el backend se construye en paralelo, y si
 * su forma cambia, `types/publico.ts` es lo primero que hay que tocar.
 */
import type {
  CompradorPublico,
  ProductoPublico,
  RubroPublico,
  SitemapPublico,
} from '@/types/publico';

export const SITEMAP: SitemapPublico = {
  actualizado: '2026-10-04',
  compradores: ['7297'],
  rubros: ['equipos-medicos'],
  productos: ['guante-latex-nitrilo'],
};

export const COMPRADOR: CompradorPublico = {
  codigo: '7297',
  nombre: 'Hospital de Prueba',
  indexable: true,
  periodo: { ventana_desde: '2024-10-01', ventana_hasta: '2026-10-04' },
  perfil: {
    disponible: true,
    organismo_id: '7297',
    nombre: 'Hospital de Prueba',
    buyer_score: 7.4,
    clasificacion: 'bueno',
    tramitacion: { tasa_adjudicacion: 0.8 },
    risk_flags: {
      n_flags: 1,
      aceptacion_lenta: false,
      aceptacion_impredecible: false,
      cancelaciones: true,
      licitaciones_fallidas: false,
      baja_calificacion: false,
      compras_irregulares: false,
    },
    volumen: { n_oc_total: 1234, n_meses_activo: 24, prom_calificacion: 4.5, prom_oferentes: 3.2 },
    transparencia: { clasificacion: 'transparente', pct_trato_directo: 0.1, n_lic_total: 210 },
  },
  compra_agil: {
    ordenes: 321,
    publicadas: 400,
    proveedores_distintos: 87,
    cuota_lider_pct: 12.5,
    monto_p25: 150000,
    monto_mediana: 480000,
    monto_p75: 1200000,
  },
  rubros: [{ nombre: 'Equipos médicos', slug: 'equipos-medicos', monto: 5e9, ordenes: 300 }],
};

export const RUBRO: RubroPublico = {
  slug: 'equipos-medicos',
  nombre: 'Equipos médicos',
  indexable: true,
  panorama: {
    disponible: true,
    rubro: 'Equipos médicos',
    mercado: { disponible: true, anio: 2025, monto_clp: 3.2e11, n_oc: 9000, ticket_promedio_clp: 3.5e7 },
    competencia: {
      disponible: true,
      n_proveedores: 812,
      n_compradores: 140,
      hhi: 600,
      tipo_mercado: 'fragmentado',
      share_top5_pct: 22,
      lideres: [{ nombre: 'Proveedor Uno SpA', share_pct: 8.1, share_oc_pct: 5.2 }],
    },
    estacionalidad: null,
    vigilar: null,
  },
  compradores: [{ codigo: '7297', nombre: 'Hospital de Prueba', monto: 5e9, ordenes: 300 }],
};

export const PRODUCTO: ProductoPublico = {
  slug: 'guante-latex-nitrilo',
  firma: 'guante latex nitrilo',
  nombre_generico: 'guante de nitrilo',
  codigo_onu: '42132203',
  descripcion: null,
  indexable: true,
  unidades: [
    { unidad: 'Caja', n: 120, p10: 3000, p25: 4000, p50: 5000, p75: 6000, p90: 8000, predictibilidad: 'alta', confianza: 'alta' },
    { unidad: 'Unidad', n: 30, p10: 30, p25: 40, p50: 50, p75: 70, p90: 90, predictibilidad: 'media', confianza: 'media' },
  ],
  compradores: [{ codigo: '7297', nombre: 'Hospital de Prueba', unidad: 'Caja', n: 40, p50: 4800 }],
};
