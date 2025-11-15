# Complete Setup Guide: Database + Backend

## Option 1: Using Docker Desktop (Recommended - Easiest)

### Step 1: Install Docker Desktop

1. **Download Docker Desktop:**
   - Go to: https://www.docker.com/products/docker-desktop/
   - Click "Download for Windows"
   - Run the installer and follow the setup wizard
   - **Important:** Restart your computer when prompted

2. **Start Docker Desktop:**
   - After restart, open Docker Desktop from Start Menu
   - Wait for it to fully start (you'll see a whale icon in system tray)
   - Make sure it says "Docker Desktop is running"

### Step 2: Start Database Services

Open PowerShell in the project directory and run:

```powershell
docker-compose -f infra/docker-compose.dev.yml up -d postgres redis
```

This will:
- Download PostgreSQL and Redis images (first time only, ~500MB)
- Start PostgreSQL on port 5432
- Start Redis on port 6379

**Wait 10-15 seconds** for containers to fully start, then verify:

```powershell
docker ps
```

You should see `oltu-postgres` and `oltu-redis` containers running.

### Step 3: Set Up Database Schema

**Option A: Direct Connection (if networking works)**

```powershell
cd backend
pnpm db:migrate
```

This creates all the database tables.

**Option B: Docker Container (if Windows/Docker networking issues)**

If you're having connection issues from Windows to the Docker container, run Prisma commands from inside a Docker container:

```powershell
# Run from project root
docker run --rm -v "${PWD}/backend:/app" -w /app --network infra_oltu-network -e DATABASE_URL=postgresql://postgres:postgres@oltu-postgres:5432/oltu_platform node:18 sh -c "npm install -g pnpm && pnpm install && pnpm db:push && pnpm db:seed"
```

**Note:** Use `node:18` (not `node:18-alpine`) as Alpine Linux has OpenSSL compatibility issues with Prisma.

This will:
- Create all database tables (`db:push`)
- Seed the database with users (`db:seed`)
- Work because it connects from inside the Docker network

### Step 4: Seed Database (Create Users)

**If you used Option A above:**

```powershell
pnpm db:seed
```

**If you used Option B above, seeding is already done!**

This creates:
- 5 default users (admin, supervisor, operators, messenger)
- 3 employees
- 3 vehicles
- Sample shifts and data

You should see: `✅ Database seeding completed successfully!`

### Step 5: Start Backend

```powershell
pnpm dev
```

Backend will start on **http://localhost:3001**

You should see output like:
```
Server running on port 3001
Database connected successfully
```

---

## Option 2: Local PostgreSQL Installation (Alternative)

If you prefer not to use Docker:

### Step 1: Install PostgreSQL

1. **Download PostgreSQL:**
   - Go to: https://www.postgresql.org/download/windows/
   - Download the installer
   - During installation:
     - Remember the password you set for `postgres` user
     - Port: 5432 (default)
     - Install pgAdmin (optional but helpful)

2. **Create Database:**
   - Open pgAdmin or use command line:
   ```powershell
   psql -U postgres
   ```
   - Then run:
   ```sql
   CREATE DATABASE gbsoft_oltu;
   \q
   ```

3. **Update .env file:**
   Edit `backend/.env`:
   ```
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/gbsoft_oltu
   ```
   Replace `YOUR_PASSWORD` with the password you set during installation.

### Step 2: Install Redis (Optional but Recommended)

Redis is used for caching and sessions. You can:

**Option A:** Install Redis for Windows
- Download from: https://github.com/microsoftarchive/redis/releases
- Or use WSL (Windows Subsystem for Linux)

**Option B:** Skip Redis for now (backend will work but with limited caching)

Update `backend/.env`:
```
REDIS_URL=redis://localhost:6379
```

### Step 3-5: Same as Docker Option

Follow Steps 3-5 from the Docker option above.

---

## Troubleshooting

### Docker Issues

**"docker-compose command not found":**
- Use: `docker compose` (without hyphen) instead of `docker-compose`
- Or install Docker Compose separately

**"Port already in use":**
- Check if PostgreSQL is already running: `netstat -ano | findstr :5432`
- Stop existing PostgreSQL service or change port in docker-compose.yml

**"Cannot connect to database":**
- Wait longer for containers to start (30 seconds)
- Check logs: `docker logs oltu-postgres`
- Verify DATABASE_URL in `backend/.env`
- **Windows/Docker networking issue:** Use the Docker container method (Option B in Step 3) to run Prisma commands from inside the Docker network

### Database Migration Issues

**"Migration failed":**
- Make sure PostgreSQL is running
- Check DATABASE_URL is correct
- Try: `pnpm db:push` instead of `pnpm db:migrate`

**"Prisma Client not generated":**
- Run: `pnpm db:generate` first
- Then run migrations

### Backend Won't Start

**"Cannot find module":**
- Run: `pnpm install` in backend directory
- Check Node.js version: `node --version` (should be 18+)

**"Port 3001 already in use":**
- Change PORT in `backend/.env` to another port (e.g., 3002)
- Update `frontend/.env` VITE_API_URL accordingly

**"Database connection error":**
- Verify PostgreSQL is running
- Check DATABASE_URL format
- Test connection: `psql -U postgres -d gbsoft_oltu`

---

## Quick Verification

After setup, verify everything works:

1. **Backend Health Check:**
   Open browser: http://localhost:3001/health
   Should return: `{"status":"OK","service":"backend"}`

2. **Database Connection:**
   Backend logs should show: `Database connected successfully`

3. **Login Test:**
   - Frontend: http://localhost:3000
   - Try logging in with: `admin@oltubelediyesi.gov.tr` / `admin123`

---

## Next Steps

Once backend is running:
1. ✅ Frontend should be able to connect (already running on port 3000)
2. ✅ You can login with the credentials from `LOGIN_CREDENTIALS.md`
3. ✅ All features should work (shifts, vehicles, messages)

## Need Help?

If you encounter issues:
1. Check the error message carefully
2. Verify all services are running (`docker ps` or check Windows Services)
3. Check logs: `docker logs oltu-postgres` or backend console output
4. Make sure all environment variables are set correctly

