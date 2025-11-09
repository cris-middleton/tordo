# Quick Start Guide

## Prerequisites Check

Before starting, make sure you have Node.js installed:

```bash
node --version  # Should show v18 or higher
npm --version   # Should show version 9 or higher
```

If not installed:
- **macOS/Linux:** Use [nvm](https://github.com/nvm-sh/nvm) or download from [nodejs.org](https://nodejs.org/)
- **Windows:** Download installer from [nodejs.org](https://nodejs.org/)

## Setup (3 Steps)

### Step 1: Install Dependencies

```bash
cd frontend
npm install
```

This will install all required packages (Next.js, React, Tailwind, etc.)

### Step 2: Create Environment File

Create `.env.local` in the `frontend` directory:

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

Or manually create the file with:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Step 3: Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## First Login

1. Navigate to the login page
2. Use your backend credentials to log in
3. If you don't have an account, register via the backend API first:
   ```bash
   curl -X POST http://localhost:8000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","email":"test@example.com","password":"testpass123","full_name":"Test User"}'
   ```

## Using Docker Instead

If you prefer Docker:

```bash
cd infra
docker-compose up frontend
```

The frontend will be available at `http://localhost:3000`

## Troubleshooting

### "npm: command not found"
- Install Node.js from [nodejs.org](https://nodejs.org/)

### "Port 3000 already in use"
- Change port: `PORT=3001 npm run dev`
- Or stop the process using port 3000

### "Cannot connect to API"
- Make sure backend is running: `curl http://localhost:8000/health/`
- Check `.env.local` has correct API URL
- Verify CORS is enabled in backend

### Build Errors
```bash
rm -rf node_modules .next
npm install
npm run dev
```

## Next Steps

- Read [SETUP.md](./SETUP.md) for detailed instructions
- Check [README.md](./README.md) for project overview
- Explore the dashboard after logging in!

