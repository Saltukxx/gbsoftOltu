# Database Schema Migration Guide

This document outlines the high and medium priority improvements made to the database schema.

## Changes Summary

### ✅ High Priority Changes

1. **New Enums Added**
   - `MessagePriority`: LOW, NORMAL, HIGH, URGENT
   - `TelemetrySeverity`: LOW, MEDIUM, HIGH, CRITICAL

2. **Cascade Delete Behaviors**
   - All relations now have explicit `onDelete` behaviors:
     - `Cascade`: Child records are deleted when parent is deleted
     - `SetNull`: Foreign keys are set to NULL when parent is deleted (for audit trails)

3. **Missing Indexes Added**
   - Foreign key indexes for better join performance
   - Composite indexes for common query patterns
   - Indexes on `deletedAt` for soft delete queries

4. **Message-AudioAsset Relation**
   - Added `audioAssetId` field to `Message` model
   - Created relation between `Message` and `AudioAsset`
   - `audioPath` field marked as deprecated (kept for backward compatibility)

### ✅ Medium Priority Changes

5. **Soft Delete Support**
   - Added `deletedAt` field to: `Employee`, `Shift`, `Vehicle`, `Message`, `AudioAsset`
   - Added indexes on `deletedAt` for efficient filtering

6. **Missing Timestamps**
   - Added `createdAt` and `updatedAt` to: `ShiftConstraint`, `VehicleRoute`, `FuelReport`, `SystemConfig`, `AudioAsset`

7. **Check Constraints Migration**
   - Created SQL migration file for data validation constraints
   - Validates GPS coordinates, fuel consumption, efficiency scores, etc.

## Migration Steps

### Step 1: Generate Prisma Client

```bash
cd backend
npm run db:generate
```

### Step 2: Create and Apply Migration

```bash
# Create a new migration
npm run db:migrate

# Or use db:push for development (non-production)
npm run db:push
```

**Note**: Prisma will detect all schema changes and create a migration automatically.

### Step 3: Apply Check Constraints (Optional but Recommended)

After applying the Prisma migration, run the SQL file to add check constraints:

```bash
# Using psql
psql $DATABASE_URL -f prisma/migrations/add_check_constraints.sql

# Or using Docker
docker exec -i <postgres-container> psql -U <user> -d <database> < prisma/migrations/add_check_constraints.sql
```

### Step 4: Update Application Code

#### Update Message Priority Usage

**Before:**
```typescript
priority: "NORMAL" // string
```

**After:**
```typescript
import { MessagePriority } from '@prisma/client';

priority: MessagePriority.NORMAL // enum
```

#### Update Telemetry Severity Usage

**Before:**
```typescript
severity: "HIGH" // string
```

**After:**
```typescript
import { TelemetrySeverity } from '@prisma/client';

severity: TelemetrySeverity.HIGH // enum
```

#### Update Message-AudioAsset Relation

**Before:**
```typescript
// Using audioPath string
const message = await prisma.message.create({
  data: {
    audioPath: '/path/to/audio.mp3',
    // ...
  }
});
```

**After:**
```typescript
// Using audioAsset relation
const message = await prisma.message.create({
  data: {
    audioAsset: {
      connect: { id: audioAssetId }
    },
    // or
    audioAssetId: audioAssetId,
    // ...
  }
});
```

#### Implement Soft Delete Queries

**Before:**
```typescript
// Hard delete
await prisma.vehicle.delete({ where: { id } });
```

**After:**
```typescript
// Soft delete
await prisma.vehicle.update({
  where: { id },
  data: { deletedAt: new Date() }
});

// Query non-deleted records
const vehicles = await prisma.vehicle.findMany({
  where: { deletedAt: null }
});
```

## Breaking Changes

### Enum Type Changes

1. **Message.priority**: Changed from `String` to `MessagePriority` enum
   - **Action Required**: Update all code that sets/reads `priority` field
   - **Migration**: Existing string values will need to be migrated to enum values

2. **TelemetryEvent.severity**: Changed from `String?` to `TelemetrySeverity?` enum
   - **Action Required**: Update all code that sets/reads `severity` field
   - **Migration**: Existing string values will need to be migrated to enum values

### New Required Fields

1. **ShiftConstraint**: Now has `createdAt` and `updatedAt` (auto-populated)
2. **VehicleRoute**: Now has `createdAt` and `updatedAt` (auto-populated)
3. **FuelReport**: Now has `updatedAt` (auto-populated)
4. **SystemConfig**: Now has `createdAt` and `updatedAt` (auto-populated)
5. **AudioAsset**: Now has `updatedAt` (auto-populated)

These are auto-populated, so no manual migration needed.

## Data Migration Script

If you have existing data with string values for `priority` or `severity`, you'll need to migrate them:

```sql
-- Migrate Message priority strings to enum
UPDATE messages 
SET priority = 'NORMAL' 
WHERE priority NOT IN ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- Migrate TelemetryEvent severity strings to enum
UPDATE telemetry_events 
SET severity = NULL 
WHERE severity NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
```

## Rollback

If you need to rollback:

1. Revert the Prisma schema changes
2. Run `npm run db:migrate` to create a rollback migration
3. Remove check constraints manually if applied:
   ```sql
   ALTER TABLE fuel_reports DROP CONSTRAINT IF EXISTS fuel_reports_consumption_liters_check;
   -- ... (repeat for all constraints)
   ```

## Verification

After migration, verify:

1. ✅ Prisma client regenerated successfully
2. ✅ All migrations applied without errors
3. ✅ Check constraints applied (if SQL migration was run)
4. ✅ Application code updated to use new enums
5. ✅ Soft delete queries working correctly
6. ✅ Relations between Message and AudioAsset working

## Questions?

If you encounter any issues during migration, check:
- Prisma migration logs
- Database connection settings
- Existing data compatibility with new constraints

