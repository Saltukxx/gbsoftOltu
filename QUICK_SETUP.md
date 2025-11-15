# 🚀 Quick Setup Guide - Database & Backend

## What You Need

You need **Docker Desktop** to run PostgreSQL and Redis easily. Here's how to set everything up:

---

## Step 1: Install Docker Desktop ⏱️ (5-10 minutes)

1. **Download Docker Desktop:**
   - Visit: https://www.docker.com/products/docker-desktop/
   - Click "Download for Windows"
   - The file is ~500MB, so it may take a few minutes

2. **Install Docker Desktop:**
   - Run the installer (`Docker Desktop Installer.exe`)
   - Follow the installation wizard
   - **Important:** When it asks to restart, click "Restart now"
   - After restart, Docker Desktop will start automatically

3. **Verify Docker is Running:**
   - Look for the Docker whale icon in your system tray (bottom right)
   - If you see it, Docker is running ✅
   - If not, open Docker Desktop from Start Menu

---

## Step 2: Start Database Services ⏱️ (2 minutes)

Open PowerShell in this project folder and run:

```powershell
docker-compose -f infra/docker-compose.dev.yml up -d postgres redis
```

**What this does:**
- Downloads PostgreSQL and Redis (first time only, ~200MB)
- Starts them in the background
- PostgreSQL will be on port 5432
- Redis will be on port 6379

**Wait 15-20 seconds** for them to fully start, then verify:

```powershell
docker ps
```

You should see two containers: `oltu-postgres` and `oltu-redis`

---

## Step 3: Create Database Tables ⏱️ (30 seconds)

```powershell
cd backend
pnpm db:migrate
```

This creates all the database tables (users, shifts, vehicles, messages, etc.)

---

## Step 4: Seed Database (Create Users) ⏱️ (30 seconds)

```powershell
pnpm db:seed
```

This creates:
- ✅ 5 default users (admin, supervisor, 2 operators, messenger)
- ✅ 3 employees
- ✅ 3 vehicles  
- ✅ Sample shifts and data

You should see: `✅ Database seeding completed successfully!`

**Login credentials will be displayed** - save them!

---

## Step 5: Start Backend ⏱️ (starts immediately)

```powershell
pnpm dev
```

The backend will start on **http://localhost:3001**

You should see:
```
Server running on port 3001
Database connected successfully
```

**Keep this terminal open** - the backend needs to keep running!

---

## Step 6: Test Login 🎉

1. Open your browser: **http://localhost:3000**
2. Try logging in with:
   - **Email:** `admin@oltubelediyesi.gov.tr`
   - **Password:** `admin123`

---

## ✅ All Done!

You now have:
- ✅ PostgreSQL database running
- ✅ Redis cache running  
- ✅ Database tables created
- ✅ Default users created
- ✅ Backend API running on port 3001
- ✅ Frontend running on port 3000

---

## 🆘 Troubleshooting

### "docker-compose command not found"
Try: `docker compose` (without hyphen) - newer Docker versions use this

### "Port 5432 already in use"
Something else is using PostgreSQL. Either:
- Stop other PostgreSQL services
- Or change the port in `infra/docker-compose.dev.yml`

### "Cannot connect to database"
- Wait longer (30 seconds) for containers to start
- Check: `docker ps` - containers should be running
- Check logs: `docker logs oltu-postgres`

### "Migration failed"
- Make sure containers are running: `docker ps`
- Check DATABASE_URL in `backend/.env` matches docker-compose settings
- Try: `pnpm db:push` instead

### Backend won't start
- Make sure you're in the `backend` folder
- Run `pnpm install` if you see module errors
- Check Node.js version: `node --version` (should be 18+)

---

## 📝 Quick Reference Commands

**Start database:**
```powershell
docker-compose -f infra/docker-compose.dev.yml up -d postgres redis
```

**Stop database:**
```powershell
docker-compose -f infra/docker-compose.dev.yml down
```

**View database logs:**
```powershell
docker logs oltu-postgres
```

**Reset database (WARNING: deletes all data):**
```powershell
docker-compose -f infra/docker-compose.dev.yml down -v
docker-compose -f infra/docker-compose.dev.yml up -d postgres redis
cd backend
pnpm db:migrate
pnpm db:seed
```

---

## 🎯 Next Steps

Once everything is running:
1. ✅ You can login and use the app
2. ✅ Try creating shifts, viewing vehicles, sending messages
3. ✅ Check the dashboard for statistics

For more details, see `SETUP_DATABASE_AND_BACKEND.md`

