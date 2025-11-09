# Frontend Setup Instructions

## Prerequisites

Make sure you have Node.js 18+ and npm installed. You can check with:

```bash
node --version
npm --version
```

If not installed, download from [nodejs.org](https://nodejs.org/) or use a version manager like `nvm`.

## Setup Steps

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Create Environment File

Create a `.env.local` file in the `frontend` directory with:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Note:** For Docker development, the API URL should point to where your browser can access the backend. If running locally, use `http://localhost:8000`. If using Docker, you may need to adjust based on your setup.

### 3. Run Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

### 4. Build for Production

```bash
npm run build
npm start
```

## Docker Setup

Alternatively, you can use Docker Compose from the `infra` directory:

```bash
cd infra
docker-compose up frontend
```

This will:
- Build the frontend Docker image
- Run the development server
- Mount volumes for hot reloading
- Connect to the backend service

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, you can change it:

```bash
PORT=3001 npm run dev
```

### API Connection Issues

- Make sure the backend is running on port 8000
- Check that CORS is properly configured in the backend
- Verify the `NEXT_PUBLIC_API_URL` in `.env.local` matches your backend URL

### Build Errors

If you encounter build errors:
1. Delete `node_modules` and `.next` directories
2. Run `npm install` again
3. Try `npm run build` again

## Development Tips

- The app uses hot reloading, so changes will appear automatically
- Check the browser console for any API errors
- Use the Network tab in DevTools to debug API calls
- The authentication token is stored in localStorage

