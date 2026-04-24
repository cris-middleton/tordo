'use client';

import { createContext, useContext, useRef, ReactNode } from 'react';
import { apiClient } from '@/lib/api';
import { CompradorResult } from '../types';

type CompradorCache = {
  get: (organismoId: string) => Promise<CompradorResult>;
};

const CompradorCacheContext = createContext<CompradorCache | null>(null);

export function CompradorCacheProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, Promise<CompradorResult>>>(new Map());

  const get = (organismoId: string) => {
    const cached = cacheRef.current.get(organismoId);
    if (cached) return cached;
    const promise = apiClient.getBIComprador(organismoId) as Promise<CompradorResult>;
    cacheRef.current.set(organismoId, promise);
    return promise;
  };

  return (
    <CompradorCacheContext.Provider value={{ get }}>
      {children}
    </CompradorCacheContext.Provider>
  );
}

export function useCompradorCache(): CompradorCache {
  const ctx = useContext(CompradorCacheContext);
  if (!ctx) throw new Error('useCompradorCache must be used inside CompradorCacheProvider');
  return ctx;
}
