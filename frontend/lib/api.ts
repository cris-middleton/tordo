import axios, { AxiosInstance } from 'axios';

import { API } from '@/lib/versionApi';

/**
 * Cliente HTTP del navegador.
 *
 * Habla con `/api/proxy` en el mismo origen; es el servidor de Next quien sabe
 * dónde vive el backend (`API_URL`). Desde el pivote a sitio público no hay
 * cuentas: ni tokens, ni cookies de sesión, ni redirección a un login al
 * recibir un 401. Un error de la API llega a la pantalla tal cual y lo traduce
 * `lib/errores.ts`.
 */
class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/proxy',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Tenders ────────────────────────────────────────────────────────────────

  async getTenders(params: Record<string, unknown> = {}) {
    const res = await this.client.get(`${API}/tenders/`, { params });
    return res.data;
  }

  async getTenderByCode(codigo: string) {
    const res = await this.client.get(`${API}/tenders/codigo/${encodeURIComponent(codigo)}`);
    return res.data;
  }

  // ── BI / Analytics ─────────────────────────────────────────────────────────

  async getBIOportunidades(params: Record<string, unknown> = {}) {
    const res = await this.client.get(`${API}/bi/oportunidades`, { params });
    return res.data;
  }

  async getBIMatching(params: { texto: string; top_n?: number }) {
    const res = await this.client.get(`${API}/bi/matching`, { params });
    return res.data;
  }

  async getBICompetidores(organismoId: string, params: Record<string, unknown> = {}) {
    const res = await this.client.get(`${API}/bi/competidores/${encodeURIComponent(organismoId)}`, {
      params,
    });
    return res.data;
  }

  async getBIComprador(organismoId: string) {
    const res = await this.client.get(`${API}/bi/comprador/${encodeURIComponent(organismoId)}`);
    return res.data;
  }

  async getBIVentana(codigoExterno: string) {
    const res = await this.client.get(`${API}/bi/ventana/${encodeURIComponent(codigoExterno)}`);
    return res.data;
  }

  async getBIEstacionalidad(organismoId: string, params: Record<string, unknown> = {}) {
    const res = await this.client.get(
      `${API}/bi/estacionalidad/${encodeURIComponent(organismoId)}`,
      { params },
    );
    return res.data;
  }

  async getBITendencia(params: Record<string, unknown> = {}) {
    const res = await this.client.get(`${API}/bi/tendencia`, { params });
    return res.data;
  }

  async getBIDescuento(params: Record<string, unknown> = {}) {
    const res = await this.client.get(`${API}/bi/descuento`, { params });
    return res.data;
  }

  async getBIRubros(limit: number = 354) {
    const res = await this.client.get(`${API}/bi/rubros`, { params: { limit } });
    return res.data;
  }

  async getBIPanorama(rubro: string) {
    const res = await this.client.get(`${API}/bi/panorama`, { params: { rubro } });
    return res.data;
  }

  async getBIResumen(rubro: string) {
    const res = await this.client.get(`${API}/bi/resumen`, { params: { rubro } });
    return res.data;
  }

  async getBIClusters(topN: number = 80) {
    const res = await this.client.get(`${API}/bi/clusters`, { params: { top_n: topN } });
    return res.data;
  }

  /**
   * Descarga un CSV a través del proxy.
   *
   * Se pide con el cliente y no con un `href` directo porque la URL del
   * backend es de servidor: el navegador sólo conoce `/api/proxy`. El nombre
   * del archivo sale de `Content-Disposition`, que el proxy reenvía.
   */
  async descargarCsv(ruta: string): Promise<{ blob: Blob; nombre: string }> {
    const res = await this.client.get(`${API}/${ruta}`, { responseType: 'blob' });
    const disposicion = String(res.headers['content-disposition'] ?? '');
    const encontrado = /filename="?([^"]+)"?/.exec(disposicion);
    return {
      blob: res.data as Blob,
      nombre: encontrado?.[1] ?? 'tordo.csv',
    };
  }

  async getBIPanel(codigoExterno: string) {
    const res = await this.client.get(`${API}/bi/licitacion/${encodeURIComponent(codigoExterno)}/panel`)
    return res.data
  }

  async getBISector(params?: { sector?: string; limit?: number }) {
    const res = await this.client.get(`${API}/bi/sector`, { params })
    return res.data
  }

  async getBIProductos(params: { q: string; limit?: number }) {
    const res = await this.client.get(`${API}/bi/productos`, { params });
    return res.data;
  }

  async getBIPrecio(codigoProducto: string, params: { organismo_id?: string; unidad_medida?: string } = {}) {
    const res = await this.client.get(`${API}/bi/precio/${encodeURIComponent(codigoProducto)}`, { params });
    return res.data;
  }

  async getBIForecastCompetidores(params: { organismo_id?: string; rubro?: string; tipo?: string } = {}) {
    const res = await this.client.get(`${API}/bi/forecast_competidores`, { params });
    return res.data;
  }
}

export const apiClient = new ApiClient();
