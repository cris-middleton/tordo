'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';

import { debeReintentar } from '@/lib/reintentos';

/**
 * El cliente se crea DENTRO del componente, no como constante de módulo.
 *
 * Un `new QueryClient()` a nivel de módulo se comparte entre peticiones en el
 * servidor: lo que pidió un visitante acabaría en la caché del siguiente.
 *
 * `useState` con inicializador perezoso lo crea una vez por montaje del árbol,
 * que es lo que hace falta.
 */
function crearCliente() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Los datos de licitaciones vienen de un ETL horario: pedirlos otra vez
        // a los 30 segundos no devuelve nada nuevo. Un minuto de frescura evita
        // el refetch en cada navegación sin mostrar nada rancio.
        staleTime: 60_000,
        // Un solo reintento, sólo para lo pasajero, nunca tras un timeout: ver
        // `lib/reintentos.ts` (el spinner de /mercado pasaba de 30 s).
        retry: debeReintentar,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(crearCliente);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        themes={['dark', 'light', 'system']}
        enableSystem
        disableTransitionOnChange={false}
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
