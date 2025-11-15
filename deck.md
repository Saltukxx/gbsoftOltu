# Deck.gl Integration Plan

## ARCHITECTURE SUMMARY
- **Monorepo Layout**: Root `pnpm` workspace with `frontend` (React 18 + Vite), `backend` (Express + Prisma + Socket.IO), and `ai-service` (FastAPI). Shared tooling (`infra`, `docker`) supports local orchestration.
- **Frontend Build**: Vite configuration with React plugin, path alias `@`, Tailwind, Vitest, and axios-based `apiClient`. Auth handled via Zustand store persisted in `sessionStorage`; data fetching via React Query; real-time via `websocketService`.
- **App Hierarchy**: `src/main.tsx` boots QueryClient/Router > `App` attaches WebSocket lifecycle on auth > `DashboardLayout` renders routed pages with role gating. Map UI lives exclusively in `pages/VehiclesPage.tsx`.
- **Map Initialization**: Direct Mapbox GL JS instance wrapped manually, then augmented with Deck.gl `MapboxOverlay`.

```218:248:frontend/src/pages/VehiclesPage.tsx
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [41.987, 40.540],
      zoom: 13,
      accessToken: token
    })
    ...
    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({ layers: [] })
      map.current.addControl(overlayRef.current)
    }
```

- **Vehicle Data Flow**: Vehicles list (`/api/vehicles`) polled every 30 s; location history (`/api/vehicles/locations`) polled every 5 s; Socket.IO subscription streams `vehicle:location` and `vehicle:telemetry` for live updates, normalized before entering local state.
- **Route Rendering**: Recent locations grouped per vehicle -> `PathLayer` polyline + `IconLayer` markers built from memoized Deck.gl layers.

```552:613:frontend/src/pages/VehiclesPage.tsx
  if (showRouteLayer && routeSegments.length > 0) {
    layers.push(
      new PathLayer<VehicleRouteSegment>({
        id: 'vehicle-routes',
        data: routeSegments,
        ...
      })
    )
  }
  if (showVehicleLayer && iconAtlas && vehiclePoints.length > 0) {
    layers.push(
      new IconLayer<VehicleDeckPoint>({
        id: 'vehicle-icons',
        data: vehiclePoints,
        getAngle: (d) => (360 - (d.heading ?? 0)) % 360,
        ...
      })
    )
  }
```

## ISSUES / CONFLICTS
- **Duplicate Component Implementation**: `VehiclesPage.tsx` contains a second legacy Mapbox marker-based version appended after the Deck.gl version, reusing the same component names and default export. This introduces redeclaration risk and diverging logic paths when TypeScript recompiles.

```993:1659:frontend/src/pages/VehiclesPage.tsx
import React, { useState, useEffect, useRef } from 'react'
...
function VehiclesPageContent() {
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleWithLocation | null>(null)
  ...
}
```

- **Temporal Dead Zone Bug**: `useEffect(() => overlayRef.current?.setProps({ layers: deckLayers }))` is declared before `const deckLayers = useMemo(...)`, causing a runtime ReferenceError during render.
- **Layer Lifecycle Coupling**: Deck layer construction, icon atlas generation, selection logic, and UI toggles all live in the page component, leading to large renders and making future GPU layer additions harder.
- **Update Volume**: Live WebSocket updates push directly into React state, triggering full layer reconstruction without throttling or diffing; risk of dropped frames once vehicle count grows.
- **Trips/Animated Routes Missing**: Current `PathLayer` shows static breadcrumbs; no temporal interpolation or playback for operators wanting trip replays.
- **Style Conflicts**: Mapbox overlay uses the default base map while legacy markers inject DOM nodes; mixing DOM markers and Deck layers would double-manage the WebGL context if both implementations persist.

## INTEGRATION PLAN
1. **Clean Slate Vehicles Page**
   - Remove the legacy marker-based block and keep the Deck-enabled version.
   - Reorder hooks so `deckLayers` (and other derived data) are declared before dependent effects to eliminate TDZ risk.
   - Extract map setup (Mapbox + Overlay creation) into a dedicated `useMapboxWithDeck` hook to encapsulate cleanup and keep component lean.

2. **Modularize Live Data Processing**
   - Create `useVehicleLiveData` hook to own polling + WebSocket subscriptions, returning memoized `vehicles`, `locationHistory`, and helper selectors. Introduce request cancellation when the page unmounts or user toggles offline.
   - Inside the hook, debounce WebSocket-driven history updates (e.g., `requestAnimationFrame` batching) to avoid rebuilding layers more than ~30 fps.

3. **Deck Layer Composition**
   - Introduce `useVehicleDeckLayers` helper that accepts `vehiclePoints`, `routeSegments`, current selection, toggles, and icon atlas; returns a stable layer array for `MapboxOverlay.setProps`.
   - Keep `IconLayer` for bearings; add `sizeMinPixels`, `sizeMaxPixels`, and `updateTriggers` so only affected points re-render.
   - Add a `PathLayer` upgrade to `TripsLayer` (with `trailLength`, `currentTime`) gated behind a toggle for animated playback using timestamps already stored in `locationHistory`.

4. **GPU Asset Management**
   - Move icon atlas creation to `useVehicleIconAtlas` that memoizes by color scheme and cleans up canvas references.
   - Precompute route colors and easing functions outside render to minimize allocations.

5. **Layer Toggles UI**
   - Extract the toggle buttons into `components/vehicles/LayerToggleGroup.tsx` with context-driven state to avoid re-rendering the map card.
   - Provide switches for: Vehicles (IconLayer), Trails (PathLayer), Trips animation (TripsLayer), Alerts (future Heatmap layer hook).

6. **Backend Alignment (Optional for Trip Data)**
   - Confirm `/api/vehicles/locations` retains ordering guarantees; if not, adjust sorting client-side.
   - If trip duration exceeds `MAX_ROUTE_POINTS`, consider backend endpoint (e.g., `/api/vehicles/:id/routes`) to fetch recent polylines, then feed Deck TripLayer for longer playback without over-fetching.

7. **Performance & Safety**
   - Apply shallow compare / `useMemo` to prevent layer rebuild when unchanged.
   - Guard overlay updates until both Mapbox `isStyleLoaded()` and Deck layers exist; ensure cleanup removes overlay before map removal to avoid memory leaks.
   - Add `console.warn` throttling or convert to `logger` utility to reduce noise in production.

8. **Testing & Verification**
   - Add Vitest coverage for new hooks (mocking WebSocket + React Query) to confirm history aggregation, throttle, and selection logic.
   - Provide Playwright/E2E scenario (optional) to assert layer toggles respond and map overlay loads.

## CODE PATCHES
- `frontend/src/pages/VehiclesPage.tsx`
  - Delete legacy marker implementation, reorganize hooks, and delegate to new helpers.
  - Wire `useMapboxWithDeck`, `useVehicleLiveData`, and `useVehicleDeckLayers`.
- `frontend/src/hooks/useMapboxWithDeck.ts`
  - New hook to initialize Mapbox map, attach `MapboxOverlay`, expose refs, and manage lifecycle.
- `frontend/src/hooks/useVehicleLiveData.ts`
  - Centralize polling + WebSocket handling, return aggregated history, selection setters, status helpers.
- `frontend/src/hooks/useVehicleDeckLayers.ts`
  - Build `IconLayer`, `PathLayer`, and optional `TripsLayer` with memoized update triggers and toggles.
- `frontend/src/components/vehicles/LayerToggleGroup.tsx`
  - Presentational control for layer visibility; consumes callbacks from page component.
- `frontend/src/types/vehicles.ts` (optional)
  - Extract Deck-specific interfaces (`VehicleDeckPoint`, `VehicleRouteSegment`) for reuse.
- `frontend/src/tests/vehicles/` (new)
  - Unit tests for hooks ensuring history grouping, throttle, and layer updates behave.

## FINAL RESULT
- Deck.gl layers render atop the existing Mapbox map with smooth GPU-accelerated vehicle icons rotated by bearing and highlight states.
- Operators can toggle vehicles, static routes, and animated trip playback without affecting other dashboard modules.
- Live updates remain responsive even under bursty telemetry, thanks to batched history updates and memoized layers.
- Codebase gains modular hooks and components, making future geospatial layers (heatmaps, clustering) easier to add without touching the core page.
- Cleanup eliminates legacy DOM marker code, preventing double-rendering paths and reducing maintenance overhead.

