# Fase 4 — Dashboard de Compliance y Onboarding Guiado
**Complejidad**: 2 · **LLM recomendado**: Haiku 4.5 o similar  
**Semana**: 7 · **Duración estimada**: 5 días

---

## Contexto del Proyecto

**LicitaFácil** es un SaaS B2B para PYMES chilenas. Las Fases 1–3 implementaron el backend completo (empresa, estado hábil, documentos, checklist). Esta fase rediseña el frontend para que el **dashboard refleje la propuesta de valor** del producto.

Codebase en `saas_licitaciones/`. Ver `SPEC.md` para especificaciones completas.

**Estado al inicio de esta fase**:
- Todos los endpoints del backend funcionando
- `GET /api/empresas/me` retorna empresa con estado hábil
- `GET /api/postulaciones` retorna postulaciones con % completado
- `GET /api/documentos` retorna documentos con `esta_vigente`
- `GET /api/alerts` retorna alertas del usuario

---

## Objetivo de esta Fase

Rediseñar el dashboard y crear el flujo de onboarding para que:
1. El usuario vea su **estado hábil** como lo primero al entrar
2. El dashboard muestre compliance en lugar de analytics/BI
3. Un usuario nuevo complete el onboarding en **menos de 10 minutos**

---

## Tareas

### 4.1 — Rediseño de `/dashboard`

Reemplazar el contenido de `frontend/app/dashboard/page.tsx`. El nuevo layout debe tener **4 cards** en lugar del actual de stats/charts:

**Card 1 — Estado Hábil** (la más prominente, ocupa el ancho completo arriba):
```tsx
<EstadoHabilCard
  estado={empresa.estado_habil}
  updatedAt={empresa.estado_habil_updated_at}
  rutEmpresa={empresa.rut_empresa}
  onRefresh={() => refetch()}
/>
```
- Fondo verde si hábil, rojo si inhábil, amarillo si no_encontrado/desconocido
- Mostrar cuándo fue la última verificación
- Botón "Verificar ahora" que dispare una consulta manual (opcional en MVP)

**Card 2 — Próximos Plazos**:
```tsx
<ProximosPlazosCard postulaciones={postulaciones} />
```
- Lista de las postulaciones activas ordenadas por `fecha_cierre` ASC
- Para cada una: nombre de la licitación, días restantes, % del checklist
- Badge de urgencia: rojo si ≤ 2 días, amarillo si ≤ 7 días, verde si más
- Link directo a la postulación

**Card 3 — Documentos por Vencer**:
```tsx
<DocumentosAlertaCard documentos={documentosProximos} />
```
- Documentos con `fecha_vencimiento` en los próximos 30 días
- Ordenados por fecha de vencimiento ASC
- Badge de estado: "por vencer" o "vencido"
- Link directo a `/documentos`

**Card 4 — Alertas Recientes** (compacto):
```tsx
<AlertasRecentesCard alertas={alertasNoLeidas} />
```
- Máximo 5 alertas no leídas
- Con ícono por tipo de alerta
- Link a `/alertas` para ver todas

**Eliminar**: Todos los charts de Recharts de la página actual (barras de regiones, etc.)

### 4.2 — API calls del dashboard

El dashboard debe hacer estas 4 llamadas en paralelo (usar `@tanstack/react-query`):

```tsx
// frontend/hooks/useDashboardData.ts
import { useQuery } from '@tanstack/react-query'

export function useDashboardData() {
  const empresa = useQuery({
    queryKey: ['empresa'],
    queryFn: () => api.get('/empresas/me'),
  })
  const postulaciones = useQuery({
    queryKey: ['postulaciones', 'activas'],
    queryFn: () => api.get('/postulaciones?activas=true'),
  })
  const documentosProximos = useQuery({
    queryKey: ['documentos', 'proximos'],
    queryFn: () => api.get('/documentos?vigentes_only=true&por_vencer=true'),
  })
  const alertas = useQuery({
    queryKey: ['alertas', 'no-leidas'],
    queryFn: () => api.get('/alerts?status=unread&limit=5'),
  })
  return { empresa, postulaciones, documentosProximos, alertas }
}
```

### 4.3 — Configurar @tanstack/react-query

Envolver la aplicación en el `QueryClientProvider` en `frontend/app/layout.tsx`:

```tsx
// frontend/app/layout.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,  // 1 minuto
      retry: 1,
    },
  },
})

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  )
}
```

### 4.4 — Flujo de Onboarding en 5 pasos

Crear `frontend/app/onboarding/page.tsx` con un stepper de 5 pasos:

**Paso 1 — RUT y Estado Hábil**:
- Input de RUT con formato chileno (auto-formatear mientras escribe: `12.345.678-9`)
- Al hacer submit: `POST /api/empresas` con el RUT
- Mostrar resultado: badge de estado hábil con animación de carga
- Si es "hábil": animación de confetti/celebración
- Si es "inhábil": mensaje explicativo de cómo regularizarse

**Paso 2 — Datos de la empresa**:
- Confirmar nombre empresa y razón social (pre-rellenar si la API retornó el nombre)
- Email de contacto y teléfono (opcionales)

**Paso 3 — Rubros y región**:
- Multi-select de rubros (categorías UNSPSC/CPV)
- Multi-select de regiones de Chile
- Mostrar "Últimas 5 licitaciones relevantes" basadas en la selección
- Llamar a `PUT /api/empresas/me` con rubros y regiones

**Paso 4 — Activar alertas**:
- Toggle para alertas por email (activado por defecto)
- Input de número de teléfono para WhatsApp (si WABA ya está activo)
- Llamar a `PUT /api/users/me/notifications` con las preferencias

**Paso 5 — Tour del dashboard**:
- Preview del dashboard con tooltips explicando cada card
- Botón "Empezar a usar LicitaFácil"
- Llamar a `PUT /api/users/me` con `onboarding_completed: true`
- Redirigir a `/dashboard`

**Endpoint requerido en backend** (agregar si no existe):
```python
# backend/app/api/users.py
@router.put("/me")
async def update_current_user(body: UserUpdate, ...):
    """Actualiza perfil del usuario actual, incluyendo onboarding_completed."""
    ...
```

### 4.5 — Redirect automático al onboarding

En `frontend/app/dashboard/layout.tsx`, verificar si el usuario completó el onboarding:

```tsx
export default async function DashboardLayout({ children }) {
  // Si el usuario no completó el onboarding, redirigir
  // Esto debe ejecutarse después de que AuthContext esté listo
  return (
    <DashboardLayoutClient>
      {children}
    </DashboardLayoutClient>
  )
}

// frontend/components/DashboardLayoutClient.tsx (client component)
'use client'
export function DashboardLayoutClient({ children }) {
  const { user } = useAuth()
  const router = useRouter()
  
  useEffect(() => {
    if (user && !user.onboarding_completed) {
      router.push('/onboarding')
    }
  }, [user])
  
  return <Layout>{children}</Layout>
}
```

### 4.6 — Actualizar sidebar de navegación

En `frontend/components/Layout.tsx`, actualizar el menú de navegación:

```
Antes:           Después:
- Dashboard      - Dashboard
- Licitaciones   - Licitaciones
- Órdenes        - Mis Postulaciones   ← nuevo
- Analytics      ← ELIMINAR
- Alertas        - Documentos         ← mover
                 - Alertas
                 - Configuración
```

---

## Criterios de Aceptación

- [ ] El dashboard muestra las 4 cards en lugar de las gráficas de analytics
- [ ] El estado hábil es lo primero que ve el usuario (arriba, prominente)
- [ ] Las 4 queries del dashboard se ejecutan en paralelo (verificar en DevTools Network)
- [ ] Un usuario nuevo es redirigido a `/onboarding` al primer login
- [ ] Al completar el onboarding, `onboarding_completed` se guarda en la DB como `true`
- [ ] La ruta `/dashboard/analytics` no aparece en el sidebar
- [ ] El flujo de onboarding completo se puede hacer en < 5 minutos

---

## Patrones a seguir

1. **@tanstack/react-query para todas las llamadas a la API**: Reemplazar los `useEffect + fetch` existentes por `useQuery`. Los `useDashboardCollections` de localStorage deben eliminarse.
2. **react-hot-toast para feedback**: Usar `toast.success()` / `toast.error()` en lugar de alerts de browser.
3. **Skeleton loaders**: Mientras cargan los datos, mostrar skeletons en lugar de spinners.

---

## NO implementes en esta fase

- Billing/Stripe (Fase 5a)
- Google OAuth (Fase 6)
- WhatsApp (Fase 6)
- El dashboard final con analytics completos (está descartado por diseño)
