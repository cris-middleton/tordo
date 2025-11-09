'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '@/lib/api';

interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      if (token) {
        const userData = await apiClient.getCurrentUser();
        setUser(userData);
      }
    } catch (error) {
      apiClient.clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      // Step 1: Login and get token
      const loginResponse = await apiClient.login(username, password);
      
      // Step 2: Small delay to ensure token is set in localStorage and axios interceptor picks it up
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Step 3: Get user data with the token
      const userData = await apiClient.getCurrentUser();
      setUser(userData);
    } catch (error: any) {
      // Clear token if login fails
      apiClient.clearToken();
      setUser(null);
      
      // Provide better error message
      if (error.response?.status === 401) {
        if (error.response?.data?.detail?.includes('validate credentials')) {
          // This means getCurrentUser failed, but login might have succeeded
          // Try to get user again or show a different error
          throw new Error('Sesión iniciada pero no se pudo obtener información del usuario. Por favor intenta nuevamente.');
        }
      }
      
      throw error; // Re-throw to let the component handle it
    }
  };

  const logout = () => {
    apiClient.clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
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

