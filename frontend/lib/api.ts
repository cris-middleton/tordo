import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: { 'Content-Type': 'application/json' },
    });

    // Attach token to every request
    this.client.interceptors.request.use((config) => {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    });

    // On 401, clear token
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && typeof window !== 'undefined') {
          const path = window.location.pathname;
          // Don't redirect if already on login/register pages
          if (!path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/auth')) {
            localStorage.removeItem('access_token');
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      },
    );
  }

  // ── Token management ──────────────────────────────────────────────────────

  setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', token);
    }
  }

  clearToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
    }
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  async login(username: string, password: string) {
    const res = await this.client.post('/api/auth/login', { username, password });
    const { access_token } = res.data;
    this.setToken(access_token);
    return res.data;
  }

  async register(data: { username: string; email: string; password: string; full_name?: string }) {
    const res = await this.client.post('/api/auth/register', data);
    return res.data;
  }

  async getCurrentUser() {
    const res = await this.client.get('/api/auth/me');
    return res.data;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const res = await this.client.post('/api/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return res.data;
  }

  getGoogleAuthUrl(): string {
    return `${API_URL}/api/auth/google`;
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async updateUser(userId: number, data: Record<string, unknown>) {
    const res = await this.client.put(`/api/users/${userId}`, data);
    return res.data;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const res = await this.client.get('/api/dashboard/stats');
    return res.data;
  }

  // ── Tenders ────────────────────────────────────────────────────────────────

  async getTenders(params: Record<string, unknown> = {}) {
    const res = await this.client.get('/api/tenders/', { params });
    return res.data;
  }

  async getTenderByCode(codigo: string) {
    const res = await this.client.get(`/api/tenders/codigo/${encodeURIComponent(codigo)}`);
    return res.data;
  }

  // ── Orders (via data-inspection) ───────────────────────────────────────────

  async getOrders(params: Record<string, unknown> = {}) {
    const res = await this.client.get('/api/data/ordenes_compra', { params });
    return res.data;
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────

  async getAlerts(params: Record<string, unknown> = {}) {
    const res = await this.client.get('/api/alerts/', { params });
    return res.data;
  }

  async markAlertAsRead(alertId: number) {
    const res = await this.client.post(`/api/alerts/${alertId}/read`);
    return res.data;
  }

  async deleteAlert(alertId: number) {
    await this.client.delete(`/api/alerts/${alertId}`);
  }

  async getAlertPreferences(activeOnly: boolean = true) {
    const res = await this.client.get('/api/alerts/preferences', {
      params: { active_only: activeOnly },
    });
    return res.data;
  }

  async createAlertPreference(data: Record<string, unknown>) {
    const res = await this.client.post('/api/alerts/preferences', data);
    return res.data;
  }

  async sendTestAlert() {
    const res = await this.client.post('/api/alerts/test');
    return res.data;
  }

  // ── Empresas ───────────────────────────────────────────────────────────────

  async getEmpresas() {
    const res = await this.client.get('/api/empresas/');
    return res.data;
  }

  async createEmpresa(data: { rut_empresa: string; nombre_empresa: string }) {
    const res = await this.client.post('/api/empresas/', data);
    return res.data;
  }

  async updateEmpresa(empresaId: string, data: Record<string, unknown>) {
    const res = await this.client.put(`/api/empresas/${empresaId}`, data);
    return res.data;
  }

  async checkEstadoHabilNow(empresaId: string) {
    const res = await this.client.post(`/api/empresas/${empresaId}/check-estado-habil-now`);
    return res.data;
  }

  async getEmpresaMembers(empresaId: string) {
    const res = await this.client.get(`/api/empresas/${empresaId}/members`)
    return res.data
  }

  async addEmpresaMember(empresaId: string, email: string, rol: 'admin' | 'viewer') {
    const res = await this.client.post(`/api/empresas/${empresaId}/members`, { email, rol })
    return res.data
  }

  async removeEmpresaMember(empresaId: string, userId: number) {
    const res = await this.client.delete(`/api/empresas/${empresaId}/members/${userId}`)
    return res.data
  }

  // ── Documentos ─────────────────────────────────────────────────────────────

  async getDocumentos(empresaId: string) {
    const res = await this.client.get(`/api/empresas/${empresaId}/documentos`);
    return res.data;
  }

  async uploadDocumento(empresaId: string, formData: FormData) {
    const res = await this.client.post(`/api/empresas/${empresaId}/documentos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  async deleteDocumento(empresaId: string, docId: string) {
    await this.client.delete(`/api/empresas/${empresaId}/documentos/${docId}`);
  }

  async getDocumentoDownloadUrl(empresaId: string, docId: string) {
    const res = await this.client.get(`/api/empresas/${empresaId}/documentos/${docId}/download`);
    return res.data;
  }

  // ── Postulaciones ──────────────────────────────────────────────────────────

  async getPostulaciones(empresaId: string, params: Record<string, unknown> = {}) {
    const res = await this.client.get(`/api/empresas/${empresaId}/postulaciones`, { params });
    return res.data;
  }

  async toggleChecklistItem(postulacionId: string, itemId: string, completed: boolean) {
    const res = await this.client.put(
      `/api/postulaciones/${postulacionId}/checklist/${itemId}`,
      { completado: completed },
    );
    return res.data;
  }

  // ── Billing ────────────────────────────────────────────────────────────────

  async getBillingPlans() {
    const res = await this.client.get('/api/billing/plans');
    return res.data;
  }

  async getBillingStatus() {
    const res = await this.client.get('/api/billing/status');
    return res.data;
  }

  async createCheckoutSession(data: {
    plan_tier: string;
    success_url: string;
    cancel_url: string;
  }) {
    const res = await this.client.post('/api/billing/checkout', data);
    return res.data;
  }

  async createBillingPortal() {
    const res = await this.client.post('/api/billing/portal');
    return res.data;
  }

  // ── BI / Analytics ─────────────────────────────────────────────────────────

  async getBIOportunidades(params: Record<string, unknown> = {}) {
    const res = await this.client.get('/api/bi/oportunidades', { params });
    return res.data;
  }

  async getBIMatching(params: { texto: string; top_n?: number }) {
    const res = await this.client.get('/api/bi/matching', { params });
    return res.data;
  }

  async getBICompetidores(organismoId: string, params: Record<string, unknown> = {}) {
    const res = await this.client.get(`/api/bi/competidores/${encodeURIComponent(organismoId)}`, {
      params,
    });
    return res.data;
  }

  async getBIComprador(organismoId: string) {
    const res = await this.client.get(`/api/bi/comprador/${encodeURIComponent(organismoId)}`);
    return res.data;
  }

  async getBIVentana(codigoExterno: string) {
    const res = await this.client.get(`/api/bi/ventana/${encodeURIComponent(codigoExterno)}`);
    return res.data;
  }

  async getBIEstacionalidad(organismoId: string, params: Record<string, unknown> = {}) {
    const res = await this.client.get(
      `/api/bi/estacionalidad/${encodeURIComponent(organismoId)}`,
      { params },
    );
    return res.data;
  }

  async getBITendencia(params: Record<string, unknown> = {}) {
    const res = await this.client.get('/api/bi/tendencia', { params });
    return res.data;
  }

  async getBIDescuento(params: Record<string, unknown> = {}) {
    const res = await this.client.get('/api/bi/descuento', { params });
    return res.data;
  }

  async getBIClusters(topN: number = 80) {
    const res = await this.client.get('/api/bi/clusters', { params: { top_n: topN } });
    return res.data;
  }

  async getTFIDFPerfil(empresaId: string) {
    const res = await this.client.get(`/api/bi/perfil/${empresaId}`);
    return res.data;
  }

  async updateTFIDFPerfil(empresaId: string, data: Record<string, unknown>) {
    const res = await this.client.put(`/api/bi/perfil/${empresaId}`, data);
    return res.data;
  }

  async getBIPanel(codigoExterno: string, empresaId?: string) {
    const res = await this.client.get(`/api/bi/licitacion/${encodeURIComponent(codigoExterno)}/panel`, {
      params: empresaId ? { empresa_id: empresaId } : undefined,
    })
    return res.data
  }

  async getBILicitacionMatch(codigoExterno: string, params: { empresa_id: string; texto: string }) {
    const res = await this.client.get(`/api/bi/licitacion/${encodeURIComponent(codigoExterno)}/match`, { params })
    return res.data
  }

  async getBISector(params?: { sector?: string; limit?: number }) {
    const res = await this.client.get('/api/bi/sector', { params })
    return res.data
  }

  async getDataSummary() {
    const res = await this.client.get('/api/data/summary')
    return res.data
  }

  // ── WhatsApp test ──────────────────────────────────────────────────────────

  async sendTestWhatsApp() {
    const res = await this.client.post('/api/alerts/test-whatsapp');
    return res.data;
  }

}

export const apiClient = new ApiClient();
