# Setup Instructions for Oltu Belediyesi Platform

## Prerequisites

You need to install one of the following options:

### Option 1: Docker Desktop (Recommended - Easiest)
1. Download and install Docker Desktop from: https://www.docker.com/products/docker-desktop/
2. Start Docker Desktop
3. Run: `docker-compose -f infra/docker-compose.dev.yml up -d`

### Option 2: Local PostgreSQL Installation
1. Install PostgreSQL from: https://www.postgresql.org/download/windows/
2. Install Redis from: https://redis.io/download (or use WSL)
3. Create database: `createdb gbsoft_oltu`
4. Update `backend/.env` DATABASE_URL accordingly

## Quick Start (with Docker)

1. **Start Infrastructure Services:**
   ```bash
   docker-compose -f infra/docker-compose.dev.yml up -d postgres redis
   ```

2. **Set up Database:**
   ```bash
   cd backend
   pnpm db:generate
   pnpm db:migrate
   pnpm db:seed
   ```

3. **Start Backend:**
   ```bash
   cd backend
   pnpm dev
   ```
   Backend will run on http://localhost:3001

4. **Start Frontend (in a new terminal):**
   ```bash
   cd frontend
   pnpm dev
   ```
   Frontend will run on http://localhost:3000

5. **Start AI Service (optional, in another terminal):**
   ```bash
   cd ai-service
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```

## Environment Variables

The `.env` files have been updated with:
- ✅ JWT secrets (generated)
- ✅ Session secret (generated)
- ✅ Database URL (configured for localhost)
- ⚠️ Mapbox token (placeholder - you need to get a real one from https://account.mapbox.com/access-tokens/)

## Troubleshooting

### Database Connection Issues
- Make sure PostgreSQL is running
- Check DATABASE_URL in `backend/.env`
- Try: `psql -U postgres -d gbsoft_oltu` to test connection

### Port Already in Use
- Backend uses port 3001
- Frontend uses port 3000
- Change ports in `.env` files if needed

### Missing Dependencies
- Run `pnpm install` in root directory
- Run `pnpm install` in backend and frontend directories if needed

## Next Steps

1. Get a Mapbox token from https://account.mapbox.com/access-tokens/
2. Update `VITE_MAPBOX_ACCESS_TOKEN` in `frontend/.env`
3. Update `MAPBOX_ACCESS_TOKEN` in `backend/.env`
4. Start all services and test the application

