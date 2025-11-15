# Quick Start Guide

## ✅ What's Been Done

1. **Dependencies Installed**
   - ✅ Installed pnpm globally
   - ✅ Installed all project dependencies (backend, frontend, root)
   - ✅ Generated Prisma client

2. **Environment Configuration**
   - ✅ Updated `backend/.env` with secure JWT secrets
   - ✅ Updated `frontend/.env` with API URLs
   - ⚠️ Mapbox token is a placeholder (you need a real one)

3. **Frontend Started**
   - ✅ Frontend dev server is starting (check http://localhost:3000)

## 🚀 Next Steps to Run the Full Application

### Step 1: Install Docker Desktop (Recommended)

1. Download from: https://www.docker.com/products/docker-desktop/
2. Install and start Docker Desktop
3. Wait for it to fully start (whale icon in system tray)

### Step 2: Start Infrastructure Services

Open a new terminal and run:

```powershell
docker-compose -f infra/docker-compose.dev.yml up -d postgres redis
```

This will start:
- PostgreSQL database on port 5432
- Redis cache on port 6379

### Step 3: Set Up Database

```powershell
cd backend
pnpm db:migrate
pnpm db:seed
```

This will:
- Create all database tables
- Seed with initial data (users, employees, vehicles, etc.)

### Step 4: Start Backend

In a new terminal:

```powershell
cd backend
pnpm dev
```

Backend will run on http://localhost:3001

### Step 5: Get Mapbox Token (Optional but Recommended)

1. Go to https://account.mapbox.com/access-tokens/
2. Sign up/login
3. Copy your public token
4. Update `frontend/.env`:
   ```
   VITE_MAPBOX_ACCESS_TOKEN=your_real_token_here
   ```
5. Update `backend/.env`:
   ```
   MAPBOX_ACCESS_TOKEN=your_real_token_here
   ```

### Step 6: Start AI Service (Optional)

In another terminal:

```powershell
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## 🧪 Testing the Application

1. **Frontend**: Open http://localhost:3000
2. **Backend API**: Test http://localhost:3001/health
3. **Login**: Use seeded user credentials (check seed.ts for default users)

## 📝 Default Login Credentials

Check `backend/src/database/seed.ts` for default users. Typically:
- Admin: admin@oltu.bel.tr / password
- Supervisor: supervisor@oltu.bel.tr / password

## 🔧 Troubleshooting

### Database Connection Error
- Make sure Docker containers are running: `docker ps`
- Check DATABASE_URL in `backend/.env`
- Try: `docker-compose -f infra/docker-compose.dev.yml logs postgres`

### Port Already in Use
- Backend: Change PORT in `backend/.env`
- Frontend: Change port in `frontend/vite.config.ts`

### Frontend Can't Connect to Backend
- Make sure backend is running on port 3001
- Check `VITE_API_URL` in `frontend/.env`
- Check CORS settings in backend

## 📚 More Information

See `SETUP_INSTRUCTIONS.md` for detailed setup guide.

