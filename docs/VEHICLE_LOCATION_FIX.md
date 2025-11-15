# Vehicle Location Fix - Oltu Coordinates

## Problem
Vehicles were being seeded with incorrect coordinates, placing them randomly instead of within Oltu, Erzurum boundaries.

## Solution
Updated the seed file (`backend/src/database/seed.ts`) to use correct Oltu coordinates and create realistic cleaning vehicle locations.

## Changes Made

### 1. Updated Coordinates
- **Old coordinates**: `{ lat: 40.3456, lng: 42.1234 }` (incorrect)
- **New coordinates**: `{ lat: 40.540, lng: 41.987 }` (Oltu center)

### 2. Realistic Vehicle Locations
Created three base locations within Oltu:
- **Vehicle 1** (25 OLT 001): Oltu Merkez (City Center) - Main cleaning route
- **Vehicle 2** (25 OLT 002): Yeni Mahalle (New Neighborhood) - Residential area
- **Vehicle 3** (25 OLT 003): Eski Mahalle (Old Neighborhood) - Historical area

### 3. Realistic Movement Patterns
- Vehicles move within ~500m radius of their assigned area
- Realistic speeds: 5-25 km/h (typical for street cleaning vehicles)
- Gradual heading changes (not completely random)
- Historical locations for past 10 hours
- Current location for each vehicle

## How to Apply Changes

### Option 1: Reseed Database (Recommended)
This will recreate all vehicle locations with correct coordinates:

```powershell
cd backend
pnpm db:seed
```

**Note**: This will recreate all seed data. If you have custom data, you may want to backup first.

### Option 2: Update Existing Locations Only
If you want to keep other data and only update vehicle locations:

1. Delete existing vehicle locations:
```sql
DELETE FROM vehicle_locations;
```

2. Then run seed again:
```powershell
cd backend
pnpm db:seed
```

## Verification

After reseeding, verify vehicles are in Oltu:

1. Open the Vehicles page in the frontend
2. Check the map - all vehicles should be visible within Oltu boundaries
3. Vehicles should be clustered around:
   - City center (40.540, 41.987)
   - New Neighborhood (40.545, 41.992)
   - Old Neighborhood (40.535, 41.982)

## Route Optimization

Route optimization functionality exists in the AI service (`ai-service/routers/fuel.py`), but it's primarily for fuel optimization. For cleaning route optimization, you may want to:

1. Create a dedicated route optimization endpoint
2. Use Mapbox Directions API to calculate optimal routes
3. Consider factors like:
   - Street cleaning schedules
   - Traffic patterns
   - Distance optimization
   - Time windows

## Future Improvements

1. **Boundary Validation**: Add validation to ensure all vehicle locations stay within Oltu boundaries
2. **Route Optimization**: Implement dedicated cleaning route optimization
3. **Real-time Updates**: Ensure MQTT updates also validate coordinates are within Oltu
4. **Geofencing**: Add geofencing alerts if vehicles leave Oltu boundaries

## Coordinates Reference

- **Oltu Center**: `[41.987, 40.540]` (longitude, latitude)
- **Oltu Boundaries**: Approximately:
  - North: 40.550
  - South: 40.530
  - East: 41.995
  - West: 41.980

