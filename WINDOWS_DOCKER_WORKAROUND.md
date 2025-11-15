# Windows/Docker Networking Workaround

## Issue

When running PostgreSQL in Docker on Windows, there's a known authentication issue where connections from Windows host to the Docker container fail, even though the database works perfectly from inside Docker containers.

**Error:**
```
Authentication failed against database server at `localhost`
```

## Why This Happens

- PostgreSQL's `pg_hba.conf` authentication works differently for connections from Windows host vs. Docker network
- Windows localhost (127.0.0.1/localhost) connections are treated differently than Docker internal network connections
- This is a Windows/Docker Desktop networking quirk

## Verified Working Solutions

### Solution 1: Run Prisma Commands from Docker (Recommended)

Since the database works from inside Docker, run database setup commands from a Docker container:

```powershell
# From project root
docker run --rm -v "${PWD}/backend:/app" -w /app --network infra_oltu-network -e DATABASE_URL=postgresql://postgres:postgres@oltu-postgres:5432/oltu_platform node:18 sh -c "npm install -g pnpm && pnpm install && pnpm db:push && pnpm db:seed"
```

**This command:**
- ✅ Sets up database schema (`db:push`)
- ✅ Seeds the database with users (`db:seed`)
- ✅ Works because it connects from inside Docker network

### Solution 2: Start All Services in Docker

Start the entire stack in Docker (backend, frontend, database):

```powershell
docker-compose -f infra/docker-compose.dev.yml up -d
```

This avoids the Windows/Docker networking issue entirely.

### Solution 3: Use PostgreSQL Locally (Not in Docker)

Install PostgreSQL directly on Windows:
1. Download from https://www.postgresql.org/download/windows/
2. Install and set password
3. Update `backend/.env`:
   ```
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/gbsoft_oltu
   ```

## Current Status

✅ **Database:** Set up and seeded successfully
✅ **Data:** Users, employees, vehicles, shifts all created
❌ **Backend:** Cannot connect from Windows to Docker PostgreSQL

## Recommended Next Steps

**Option A: Run Backend in Docker**
```powershell
# Start all services including backend
docker-compose -f infra/docker-compose.dev.yml up -d
```
- Backend: http://localhost:3001
- Frontend: http://localhost:3000

**Option B: Use Local PostgreSQL**
- Install PostgreSQL on Windows
- Update DATABASE_URL in `backend/.env`
- Run `pnpm dev` from backend directory

## Login Credentials

After database is seeded:
- **Admin:** admin@oltubelediyesi.gov.tr / admin123
- **Supervisor:** supervisor@oltubelediyesi.gov.tr / supervisor123
- **Operator:** [name]@oltubelediyesi.gov.tr / operator123
- **Messenger:** messenger@oltubelediyesi.gov.tr / messenger123

## Alternative: Port Forwarding

If you need to run backend on Windows, you can try SSH port forwarding:

```powershell
# Forward PostgreSQL port through Docker
docker run --rm -p 5433:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp-connect:oltu-postgres:5432
```

Then update DATABASE_URL to use port 5433.

## Summary

The database works fine; it's just a Windows/Docker connection issue. Use Solution 1 (Docker commands) for database operations, or Solution 2 (full Docker stack) to run everything.

