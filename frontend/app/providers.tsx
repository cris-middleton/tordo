'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';

/**
 * El cliente se crea DENTRO del componente, no como constante de módulo.
 *
 * Un `new QueryClient()` a nivel de módulo se comparte entre peticiones en el
 * servidor: los datos de una empresa acabarían en la caché que ve otra. En un
 * producto multi-inquilino eso no es un detalle de rendimiento.
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
        // Reintentar un 401 o un 403 no arregla nada y multiplica el ruido en
        // los logs. Sólo se reintenta lo que puede ser un fallo transitorio.
        retry: (fallos, error: unknown) => {
          const status = (error as { response?: { status?: number } })?.response?.status;
          if (status && status >= 400 && status < 500) return false;
          return fallos < 2;
        },
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
