import axios, { AxiosInstance } from 'axios';

import { API } from '@/lib/versionApi';
import type { ApiKeyCreada, ApiKeyResumen, PlanResumen, PrecioVigilado } from '@/types/cuenta';

/**
 * Cliente HTTP del navegador.
 *
 * **Ya no maneja tokens.** Habla con `/api/proxy` en el mismo origen, y es el
 * servidor de Next quien lee la cookie `httpOnly` y pone la cabecera
 * `Authorization`. El navegador no puede leer la sesión ni aunque quiera — que
 * es justo lo que hace que un XSS deje de ser una toma de cuenta.
 *
 * Antes el JWT vivía en `localStorage`, legible por cualquier script de la
 * página, y por eso el token de refresco no podía guardarse en el cliente: la
 * sesión moría a los 30 minutos. Ahora vive en cookie y la renovación la hace el
 * proxy sin que nadie se entere.
 */
class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      // Mismo origen. `NEXT_PUBLIC_API_URL` ya no lo usa el navegador: la URL
      // del backend es ahora una variable de SERVIDOR (`API_URL`), y eso también
      // significa que deja de estar en el bundle.
      baseURL: '/api/proxy',
      headers: { 'Content-Type': 'application/json' },
      // Para que las cookies viajen en cada petición.
      withCredentials: true,
    });

    // Al 401, al login. Ya no hay token que borrar aquí: de eso se encarga el
    // proxy, que limpia las cookies cuando el refresco deja de valer.
    //
    // El 402 se traduce al evento que escucha `PlanUpgradeBanner`. Va aquí y no
    // en cada pantalla porque el backend devuelve 402 desde cuatro sitios
    // —asientos, cuota de BI, documentos y alertas— y son 22 endpoints de BI
    // sólo en uno de ellos. El banner llevaba escuchando ese evento sin que
    // nadie lo emitiera: cada tope de plan se topaba en silencio.
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error.response?.status;
        if (status === 401 && typeof window !== 'undefined') {
          const path = window.location.pathname;
          if (!path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/auth')) {
            window.location.href = '/login';
          }
        }
        if (status === 402 && typeof window !== 'undefined') {
          const detalle = error.response?.data?.detail;
          if (detalle?.bloqueada_por_plan) {
            window.dispatchEvent(new CustomEvent('plan-upgrade-needed', { detail: detalle }));
          }
        }
        return Promise.reject(error);
      },
    );
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  async login(username: string, password: string) {
    // NO pasa por el proxy: va al handler que guarda las cookies. Es el único
    // sitio donde los tokens existen, y existen en el servidor.
    const res = await axios.post(
      '/api/sesion/entrar',
      { username, password },
      { withCredentials: true },
    );
    return res.data;
  }

  async logout() {
    // Revoca el refresco en el backend y borra las cookies.
    await axios.post('/api/sesion/salir', {}, { withCredentials: true });
  }

  async register(data: { username: string; email: string; password: string; full_name?: string }) {
    const res = await this.client.post(`${API}/auth/register`, data);
    return res.data;
  }

  async getCurrentUser(signal?: AbortSignal) {
    const res = await this.client.get(`${API}/auth/me`, { signal });
    return res.data;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const res = await this.client.post(`${API}/auth/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return res.data;
  }

  getGoogleAuthUrl(): string {
    // Ruta propia: la URL del backend ya no viaja en el bundle.
    return '/api/sesion/google';
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async updateUser(userId: number, data: Record<string, unknown>) {
    const res = await this.client.put(`${API}/users/${userId}`, data);
    return res.data;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const res = await this.client.get(`${API}/dashboard/stats`);
    return res.data;
  }

  async getDashboardHome(empresaId?: string) {
    const params = empresaId ? { empresa_id: empresaId } : {};
    const res = await this.client.get(`${API}/dashboard/home`, { params });
    return res.data as import('@/types/dashboardHome').DashboardHomeResponse;
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

  // ── Orders (via data-inspection) ───────────────────────────────────────────

  async getOrders(params: Record<string, unknown> = {}) {
    const res = await this.client.get(`${API}/data/ordenes_compra`, { params });
    return res.data;
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────

  async getAlerts(params: Record<string, unknown> = {}) {
    const res = await this.client.get(`${API}/alerts/`, { params });
    return res.data;
  }

  async markAlertAsRead(alertId: number) {
    const res = await this.client.post(`${API}/alerts/${alertId}/read`);
    return res.data;
  }

  async deleteAlert(alertId: number) {
    await this.client.delete(`${API}/alerts/${alertId}`);
  }

  async getAlertPreferences(activeOnly: boolean = true) {
    const res = await this.client.get(`${API}/alerts/preferences`, {
      params: { active_only: activeOnly },
    });
    return res.data;
  }

  async createAlertPreference(data: Record<string, unknown>) {
    const res = await this.client.post(`${API}/alerts/preferences`, data);
    return res.data;
  }

  async updateAlertPreference(prefId: number, data: Record<string, unknown>) {
    const res = await this.client.put(`${API}/alerts/preferences/${prefId}`, data);
    return res.data;
  }

  async deleteAlertPreference(prefId: number) {
    await this.client.delete(`${API}/alerts/preferences/${prefId}`);
  }

  async sendTestAlert() {
    const res = await this.client.post(`${API}/alerts/test`);
    return res.data;
  }

  // ── Empresas ───────────────────────────────────────────────────────────────

  async getEmpresas() {
    const res = await this.client.get(`${API}/empresas/`);
    return res.data;
  }

  async createEmpresa(data: { rut_empresa: string; nombre_empresa: string }) {
    const res = await this.client.post(`${API}/empresas/`, data);
    return res.data;
  }

  async updateEmpresa(empresaId: string, data: Record<string, unknown>) {
    const res = await this.client.put(`${API}/empresas/${empresaId}`, data);
    return res.data;
  }

  async getEstadoHabil(empresaId: string) {
    const res = await this.client.get(`${API}/empresas/${empresaId}/estado-habil`);
    return res.data;
  }

  async checkEstadoHabilNow(empresaId: string) {
    const res = await this.client.post(`${API}/empresas/${empresaId}/check-estado-habil-now`);
    return res.data;
  }

  async getPlanEmpresa(empresaId: string): Promise<PlanResumen> {
    const res = await this.client.get(`${API}/empresas/${empresaId}/plan`)
    return res.data
  }

  async getEmpresaMembers(empresaId: string) {
    const res = await this.client.get(`${API}/empresas/${empresaId}/members`)
    return res.data
  }

  async addEmpresaMember(empresaId: string, email: string, rol: 'admin' | 'viewer') {
    const res = await this.client.post(`${API}/empresas/${empresaId}/members`, { email, rol })
    return res.data
  }

  async removeEmpresaMember(empresaId: string, userId: number) {
    const res = await this.client.delete(`${API}/empresas/${empresaId}/members/${userId}`)
    return res.data
  }

  // ── Claves de API ──────────────────────────────────────────────────────────

  async getApiKeys(empresaId: string): Promise<ApiKeyResumen[]> {
    const res = await this.client.get(`${API}/empresas/${empresaId}/api-keys`)
    return res.data
  }

  /** El `clave` de la respuesta es la ÚNICA vez que el secreto viaja. */
  async crearApiKey(empresaId: string, nombre: string): Promise<ApiKeyCreada> {
    const res = await this.client.post(`${API}/empresas/${empresaId}/api-keys`, { nombre })
    return res.data
  }

  async revocarApiKey(empresaId: string, claveId: string) {
    const res = await this.client.delete(`${API}/empresas/${empresaId}/api-keys/${claveId}`)
    return res.data
  }

  // ── Vigilancia de precios ──────────────────────────────────────────────────

  async getPreciosVigilados(empresaId: string): Promise<PrecioVigilado[]> {
    const res = await this.client.get(`${API}/empresas/${empresaId}/precios-vigilados`)
    return res.data
  }

  /**
   * La unidad se omite a propósito: la resuelve el servidor por la unidad en la
   * que más se compra el producto. Mandarla vacía crearía una vigilancia que no
   * puede coincidir con los datos y no avisaría nunca.
   */
  async vigilarPrecio(
    empresaId: string,
    datos: { codigo_producto: string; nombre_producto?: string; umbral_pct?: number },
  ): Promise<PrecioVigilado> {
    const res = await this.client.post(`${API}/empresas/${empresaId}/precios-vigilados`, datos)
    return res.data
  }

  async dejarDeVigilarPrecio(empresaId: string, suscripcionId: number) {
    const res = await this.client.delete(
      `${API}/empresas/${empresaId}/precios-vigilados/${suscripcionId}`,
    )
    return res.data
  }

  // ── Documentos ─────────────────────────────────────────────────────────────

  async getDocumentos(empresaId: string) {
    const res = await this.client.get(`${API}/empresas/${empresaId}/documentos`);
    return res.data;
  }

  async uploadDocumento(empresaId: string, formData: FormData) {
    const res = await this.client.post(`${API}/empresas/${empresaId}/documentos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  async deleteDocumento(empresaId: string, docId: string) {
    await this.client.delete(`${API}/empresas/${empresaId}/documentos/${docId}`);
  }

  async getDocumentoDownloadUrl(empresaId: string, docId: string) {
    const res = await this.client.get(`${API}/empresas/${empresaId}/documentos/${docId}/download`);
    return res.data;
  }

  // ── Postulaciones ──────────────────────────────────────────────────────────

  async getPostulaciones(empresaId: string, params: Record<string, unknown> = {}) {
    const res = await this.client.get(`${API}/empresas/${empresaId}/postulaciones`, { params });
    return res.data;
  }

  async toggleChecklistItem(postulacionId: string, itemId: string, completed: boolean, documentoId?: string) {
    const res = await this.client.put(
      `${API}/postulaciones/${postulacionId}/checklist/${itemId}`,
      { completado: completed, ...(documentoId !== undefined ? { documento_id: documentoId } : {}) },
    );
    return res.data;
  }

  async createPostulacion(data: { empresa_id: string; licitacion_id: number | string; notas?: string }) {
    const res = await this.client.post(`${API}/postulaciones`, data);
    return res.data;
  }

  // ── Billing ────────────────────────────────────────────────────────────────

  async getBillingPlans() {
    const res = await this.client.get(`${API}/billing/plans`);
    return res.data;
  }

  async getBillingStatus() {
    const res = await this.client.get(`${API}/billing/status`);
    return res.data;
  }

  async createCheckoutSession(data: {
    plan_tier: string;
    billing_period?: 'monthly' | 'annual';
    success_url: string;
    cancel_url: string;
  }) {
    const res = await this.client.post(`${API}/billing/checkout`, data);
    return res.data;
  }

  async createBillingPortal() {
    const res = await this.client.post(`${API}/billing/portal`);
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

  async getBIResumen(rubro: string) {
    const res = await this.client.get(`${API}/bi/resumen`, { params: { rubro } });
    return res.data;
  }

  async getBIMiPosicion(params: { empresa_id: string; rubro: string }) {
    const res = await this.client.get(`${API}/bi/mi_posicion`, { params });
    return res.data;
  }

  async getBIClusters(topN: number = 80) {
    const res = await this.client.get(`${API}/bi/clusters`, { params: { top_n: topN } });
    return res.data;
  }

  async getTFIDFPerfil(empresaId: string) {
    const res = await this.client.get(`${API}/bi/perfil/${empresaId}`);
    return res.data;
  }

  async updateTFIDFPerfil(empresaId: string, data: Record<string, unknown>) {
    const res = await this.client.put(`${API}/bi/perfil/${empresaId}`, data);
    return res.data;
  }

  async getBIPanel(codigoExterno: string, empresaId?: string) {
    const res = await this.client.get(`${API}/bi/licitacion/${encodeURIComponent(codigoExterno)}/panel`, {
      params: empresaId ? { empresa_id: empresaId } : undefined,
    })
    return res.data
  }

  async getBILicitacionMatch(codigoExterno: string, params: { empresa_id: string; texto: string }) {
    const res = await this.client.get(`${API}/bi/licitacion/${encodeURIComponent(codigoExterno)}/match`, { params })
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

  async getDataSummary() {
    const res = await this.client.get(`${API}/data/summary`)
    return res.data
  }

  async getBIForecastCompetidores(params: { organismo_id?: string; rubro?: string; tipo?: string } = {}) {
    const res = await this.client.get(`${API}/bi/forecast_competidores`, { params });
    return res.data;
  }

  async getBIRadarSemanal(empresaId: string) {
    const res = await this.client.get(`${API}/bi/radar_semanal`, { params: { empresa_id: empresaId } });
    return res.data as import('@/types/dashboardHome').RadarResponse;
  }

  // ── WhatsApp test ──────────────────────────────────────────────────────────

  async sendTestWhatsApp() {
    const res = await this.client.post(`${API}/alerts/test-whatsapp`);
    return res.data;
  }

}

export const apiClient = new ApiClient();
