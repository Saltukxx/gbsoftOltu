# Database Connection Workaround

## The Problem
Prisma can't authenticate to PostgreSQL from Windows host, even though:
- Password is correct (`postgres`)
- Port is accessible (5432)
- Container is running

## Solution: Run Prisma Commands Inside Docker

Since the database works fine from inside the container, we can run Prisma commands there:

### Option 1: Use Docker Exec (Recommended)

```powershell
# Run migrations inside the container
docker exec -w /workspace oltu-postgres sh -c "cd /workspace && npx prisma migrate dev"

# Or use a temporary container with Node.js
docker run --rm -v ${PWD}/backend:/app -w /app --network infra_oltu-network -e DATABASE_URL=postgresql://postgres:postgres@oltu-postgres:5432/oltu_platform node:18-alpine sh -c "npm install -g pnpm && pnpm install && pnpm db:push"
```

### Option 2: Use Docker Compose Service

Add a temporary service to docker-compose.dev.yml that runs Prisma commands.

### Option 3: Manual SQL Execution

Since we can connect from inside the container, we can manually create tables or use Prisma's SQL output.

## Quick Manual Setup

Run these SQL commands directly:

```powershell
# Get the Prisma migration SQL
cd backend
npx prisma migrate dev --create-only --name init

# Then execute the SQL inside the container
docker exec -i oltu-postgres psql -U postgres -d oltu_platform < prisma/migrations/.../migration.sql
```

## Alternative: Use Different PostgreSQL Image

Try using `postgres/postgres` image or a different version that might work better with Windows Docker Desktop.

