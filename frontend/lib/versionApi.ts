/**
 * La versión de la API del backend, en un solo sitio.
 *
 * Espeja `backend/app/api/versionado.py`. Están duplicadas a propósito: el
 * frontend no importa nada de Python, y si se desincronizan todas las llamadas
 * fallan con 404 a la vez — un fallo ruidoso, no silencioso.
 *
 * **No confundir con las rutas propias de Next.** `/api/proxy` y `/api/sesion`
 * son del servidor de Next y no llevan versión: no son la API del producto.
 */
export const API = '/api/v1';
