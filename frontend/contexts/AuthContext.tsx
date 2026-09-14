'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';

interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_verified: boolean;
  notification_email?: boolean;
  notification_in_app?: boolean;
  notification_webhook?: boolean;
  recibe_informe_semanal?: boolean;
  plan_tier?: string;
  subscription_status?: string;
  trial_ends_at?: string | null;
  onboarding_completed?: boolean;
  onboarding_step?: number;
  webhook_url?: string;
  has_google?: boolean;
  created_at?: string;
  last_login?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // `checkAuth` se declara ANTES del efecto que la usa. Estaba después, y una
  // `const` no se iza: sólo funcionaba porque el efecto corre tras el render.
  // Lo marcó `react-hooks/immutability` al subir a Next 16.
  const checkAuth = async () => {
    // Ya no se mira si hay token: el cliente no lo puede ver. Se pregunta al
    // servidor, que sabe leer la cookie — y si el acceso caducó, el proxy lo
    // renueva por el camino sin que aquí se note.
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const userData = await apiClient.getCurrentUser(controller.signal);
        setUser(userData);
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // 401 sin sesión es lo normal en la landing: no es un error que reportar.
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // Comprueba la sesión al montar. Sigue siendo un efecto a propósito: es un
  // arranque de sesión, no una consulta de datos — TanStack Query no aporta aquí
  // caché ni invalidación, y meterlo obligaría a que el proveedor de consultas
  // envolviera al de autenticación.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      // El handler de sesión ya devuelve el usuario: se ahorra la segunda
      // llamada que hacía antes, y con ella la ventana en la que había sesión
      // pero no usuario.
      const { usuario } = await apiClient.login(username, password);
      setUser(usuario ?? (await apiClient.getCurrentUser()));
    } catch (error: any) {
      setUser(null);

      // Provide better error message
      if (error.response?.status === 401) {
        // Por `mensajeDeError` y no leyendo `detail` a mano: ahí no siempre hay
        // una cadena, y `.includes` sobre la lista de un 422 devuelve `false`
        // en silencio — la rama no se cumpliría nunca y nadie se enteraría.
        if (mensajeDeError(error, '').includes('validate credentials')) {
          // This means getCurrentUser failed, but login might have succeeded
          // Try to get user again or show a different error
          throw new Error('Sesión iniciada pero no se pudo obtener información del usuario. Por favor intenta nuevamente.');
        }
      }

      throw error; // Re-throw to let the component handle it
    }
  };

  const logout = async () => {
    // Revoca el refresco en el backend antes de borrar la cookie: si sólo se
    // borrara, el token seguiría valiendo para quien lo hubiera copiado.
    await apiClient.logout().catch(() => {});
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const userData = await apiClient.getCurrentUser();
      setUser(userData);
    } catch (error: any) {
      // El interceptor ya no redirige por un 401 de `/auth/me` —en la landing
      // ése es el caso normal—, así que quien tiene que reaccionar a la sesión
      // caída es esto: al dejar el usuario en null, la guarda de
      // `app/dashboard/layout.tsx` manda a /login. Sólo con 401: un fallo de
      // red no es motivo para echar a nadie.
      if (error?.response?.status === 401) setUser(null);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
