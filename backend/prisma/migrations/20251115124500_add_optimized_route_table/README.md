# Migration: Add Optimized Route Table

**Created:** 2025-11-15
**Status:** Ready to apply (pending database connection)

## Overview

This migration adds the `OptimizedRoute` model to store route optimization results, including algorithm metadata, performance metrics, and savings calculations.

## Changes

### New Enums
- `OptimizationAlgorithm`: NEAREST_NEIGHBOR, GENETIC_ALGORITHM, ANT_COLONY_OPTIMIZATION, HYBRID
- `OptimizationPattern`: NONE, SPIRAL, GRID, BACK_AND_FORTH, PERIMETER_FIRST, TSP_OPTIMAL

### New Table: `optimized_routes`

Stores optimization results with:
- **Algorithm metadata**: Which algorithm/pattern was used, parameters
- **Original metrics**: Distance, time, fuel cost before optimization
- **Optimized metrics**: Distance, time, fuel cost after optimization
- **Savings**: Absolute and percentage savings for distance, time, and fuel
- **Route data**: Optimized path (JSON array of GPS coordinates), waypoints
- **Performance**: Optimization time in milliseconds, number of stops
- **Status**: Whether the optimization has been applied to actual routes
- **Relations**: Links to VehicleRoute (optional) and Vehicle (required)

### Indexes Created
- `vehicleId, createdAt` - Fast lookup of optimizations by vehicle over time
- `vehicleRouteId` - Quick access to optimizations for specific routes
- `algorithm` - Filter by optimization algorithm
- `isApplied` - Find applied/unapplied optimizations

## How to Apply

When database connection is available:

```bash
cd backend
npx prisma migrate deploy
```

Or for development:

```bash
cd backend
npx prisma migrate dev
```

## Verification

After applying, verify the tables were created:

```sql
-- Check enums
SELECT typname FROM pg_type WHERE typname IN ('OptimizationAlgorithm', 'OptimizationPattern');

-- Check table
SELECT table_name FROM information_schema.tables WHERE table_name = 'optimized_routes';

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'optimized_routes';
```

## Next Steps

After migration:
1. Implement backend API endpoint: `POST /api/routes/optimize`
2. Implement backend API endpoint: `POST /api/routes/:id/save-optimization`
3. Implement backend API endpoint: `GET /api/routes/:id/optimizations`
4. Update frontend to use new API endpoints instead of client-side optimization
