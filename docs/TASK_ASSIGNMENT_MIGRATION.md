# Task Assignment Feature Migration Guide

This guide explains how to apply the database migration for the Task Assignment feature.

## Prerequisites

- PostgreSQL database running
- Backend dependencies installed (`pnpm install` in `backend/` directory)
- Database connection configured in `.env` file

## Migration Steps

### 1. Generate Prisma Migration

Navigate to the backend directory and generate the migration:

```bash
cd backend
pnpm prisma migrate dev --name add_task_assignment_feature
```

This will:
- Create a new migration file in `backend/prisma/migrations/`
- Apply the migration to your database
- Regenerate the Prisma client

### 2. Verify Migration

After the migration completes, verify that:
- The `tasks` table exists
- The `TaskStatus` and `TaskPriority` enums are created
- The `PRESIDENT` role is added to `UserRole` enum

You can verify by running:

```bash
pnpm prisma studio
```

Or by checking the database directly:

```sql
-- Check if tasks table exists
SELECT * FROM tasks LIMIT 1;

-- Check UserRole enum
SELECT enum_range(NULL::"UserRole");

-- Check TaskStatus enum
SELECT enum_range(NULL::"TaskStatus");

-- Check TaskPriority enum
SELECT enum_range(NULL::"TaskPriority");
```

### 3. Regenerate Prisma Client

If the migration didn't automatically regenerate the client, run:

```bash
pnpm prisma generate
```

### 4. Restart Backend Server

Restart your backend server to pick up the new Prisma client:

```bash
pnpm dev
```

## Rollback (if needed)

If you need to rollback the migration:

```bash
pnpm prisma migrate reset
```

**Warning**: This will delete all data in your database. Use with caution in production.

For a safer rollback in production, manually create a rollback migration:

```bash
pnpm prisma migrate dev --create-only --name rollback_task_assignment
```

Then edit the generated migration file to reverse the changes.

## Post-Migration Tasks

1. **Create a President User** (if needed):
   - You can create a user with PRESIDENT role through your admin interface or directly in the database
   - Example SQL:
     ```sql
     UPDATE users SET role = 'PRESIDENT' WHERE email = 'president@example.com';
     ```

2. **Test the Feature**:
   - Log in as a SUPERVISOR, ADMIN, or PRESIDENT
   - Navigate to the Tasks page
   - Create a task and assign it to a lower-ranked user
   - Test status updates and completion notes

3. **Verify WebSocket Events**:
   - Open browser console
   - Create/update a task
   - Verify that WebSocket events are being received

## Troubleshooting

### Migration Fails with "enum already exists"

If you get an error about enums already existing, you may need to manually add the PRESIDENT role:

```sql
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PRESIDENT';
```

### Prisma Client Not Updated

If TypeScript errors appear after migration, ensure Prisma client is regenerated:

```bash
cd backend
pnpm prisma generate
```

### Foreign Key Constraints

If you encounter foreign key constraint errors, ensure all users referenced in tasks exist and are active.

## Production Deployment

For production deployment:

1. **Backup Database**: Always backup your database before running migrations
2. **Test Migration**: Test the migration on a staging environment first
3. **Run Migration**: Use `prisma migrate deploy` in production:
   ```bash
   pnpm prisma migrate deploy
   ```
4. **Verify**: Check logs and verify the feature works correctly
5. **Monitor**: Monitor for any errors or issues

## Support

If you encounter issues during migration, check:
- Prisma migration logs
- Database connection settings
- User permissions in the database
- Backend server logs

