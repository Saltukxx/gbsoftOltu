# Supabase Connection Troubleshooting

## Common Issues and Solutions

### 1. Database Paused (Most Common)
Supabase free tier databases pause after 1 week of inactivity. 

**Solution:**
- Go to your Supabase dashboard: https://app.supabase.com
- Navigate to your project
- Click "Restore" or "Resume" if the database is paused
- Wait a few minutes for it to come back online

### 2. Connection String Format

Supabase provides two types of connection strings:

**Pooler Connection (Recommended for Prisma):**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Direct Connection (For migrations):**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

### 3. Environment Variables Setup

Make sure your `.env` file has:

```env
# For Prisma migrations and direct connections
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# For connection pooling (optional but recommended)
DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# Shadow database (can be same as DATABASE_URL for Supabase)
SHADOW_DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
```

### 4. How to Get Your Connection String

1. Go to Supabase Dashboard → Your Project
2. Go to Settings → Database
3. Under "Connection string" → Select "URI"
4. Copy the connection string
5. Replace `[YOUR-PASSWORD]` with your actual database password

### 5. Test Connection

You can test the connection with:

```powershell
# Test if you can reach the database
psql "your_connection_string_here"
```

Or use Prisma Studio to test:
```powershell
npx prisma studio
```

### 6. Alternative: Use Prisma Migrate with Skip Seed

If shadow database is causing issues:

```powershell
npx prisma migrate dev --name add_warehouse_management --skip-seed --skip-generate
npx prisma generate
npm run db:seed
```

### 7. Network/Firewall Issues

If you're behind a corporate firewall:
- Check if port 5432 or 6543 is blocked
- Try using the pooler port (6543) instead of direct port (5432)
- Contact your network administrator

### 8. Verify Database Status

Check your Supabase dashboard:
- Project Settings → Database
- Look for "Database Status" - should be "Active"
- If paused, click "Restore"

