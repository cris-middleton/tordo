# Frontend - Tordo

Frontend moderno construido con Next.js, React y Tailwind CSS para la plataforma de gestión de licitaciones públicas.

## Características

- 🎨 **Diseño moderno y minimalista** - Interfaz oscura y limpia
- 📱 **Mobile-first** - Diseño responsive optimizado para móviles
- 🔐 **Autenticación** - Sistema de login seguro con JWT
- 📊 **Dashboard** - Vista general con estadísticas
- 🔍 **Búsqueda avanzada** - Filtros para licitaciones y órdenes de compra
- 🔔 **Sistema de alertas** - Gestión de notificaciones y preferencias
- ⚙️ **Configuración** - Panel de ajustes de usuario

## Tecnologías

- **Next.js 14** - Framework React con App Router
- **React 18** - Biblioteca UI
- **TypeScript** - Tipado estático
- **Tailwind CSS** - Estilos utility-first
- **Axios** - Cliente HTTP
- **React Hook Form** - Manejo de formularios
- **Lucide React** - Iconos
- **date-fns** - Manejo de fechas

## Instalación Rápida

Ver [SETUP.md](./SETUP.md) para instrucciones detalladas.

### Pasos Básicos

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Crear archivo de entorno:**
   Crea `.env.local` en el directorio `frontend/`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

3. **Ejecutar en desarrollo:**
   ```bash
   npm run dev
   ```

4. **Construir para producción:**
   ```bash
   npm run build
   npm start
   ```

## Variables de Entorno

Crea un archivo `.env.local` en el directorio `frontend/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Nota:** Este archivo está en `.gitignore` y no se subirá al repositorio.

## Estructura del Proyecto

```
frontend/
├── app/                    # App Router de Next.js
│   ├── dashboard/         # Páginas del panel de control
│   ├── login/             # Página de login
│   ├── layout.tsx         # Layout principal
│   └── page.tsx           # Página inicial
├── components/            # Componentes reutilizables
│   └── Layout.tsx         # Layout del dashboard
├── contexts/              # Contextos de React
│   └── AuthContext.tsx     # Contexto de autenticación
├── lib/                   # Utilidades
│   └── api.ts            # Cliente API
└── public/               # Archivos estáticos
```

## Páginas

- `/login` - Pantalla de inicio de sesión
- `/dashboard` - Vista general con estadísticas
- `/dashboard/tenders` - Búsqueda y visualización de licitaciones
- `/dashboard/orders` - Búsqueda y visualización de órdenes de compra
- `/dashboard/alerts` - Gestión de alertas y preferencias
- `/dashboard/settings` - Configuración de usuario

## Desarrollo

El frontend se conecta al backend a través de la API REST. Asegúrate de que el backend esté corriendo en el puerto configurado (por defecto 8000).

## Docker

Para construir y ejecutar con Docker:

```bash
docker build -t licitaciones-frontend .
docker run -p 3000:3000 licitaciones-frontend
```

O usa docker-compose desde el directorio `infra/`:

```bash
cd infra
docker-compose up frontend
```
