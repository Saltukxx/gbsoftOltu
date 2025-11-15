import { useMemo } from 'react'
import { IconLayer, PathLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'
import type { VehicleLocation, Vehicle } from '@/types'
import type { VehicleDeckPoint, VehicleRouteSegment } from '@/types/vehicles'
import { ROUTE_COLORS, ICON_MAPPING } from '@/types/vehicles'

interface VehicleWithLocation extends Vehicle {
  lastLocation?: VehicleLocation
  lastTelemetry?: any
}

interface UseVehicleDeckLayersOptions {
  vehiclePoints: VehicleDeckPoint[]
  routeSegments: VehicleRouteSegment[]
  iconAtlas: HTMLCanvasElement | null
  mapLoaded: boolean
  showVehicleLayer: boolean
  showRouteLayer: boolean
  showTripsLayer?: boolean
  selectedVehicleId: string | null
  onVehicleClick?: (point: VehicleDeckPoint) => void
  onVehicleHover?: (point: VehicleDeckPoint | null, event: any) => void
}

// Helper functions exported for use in other hooks if needed
// These are kept here for potential reuse but not used in this hook

/**
 * Hook to compose Deck.gl layers for vehicle visualization
 * Returns IconLayer for vehicles, PathLayer for routes, and optional TripsLayer for animation
 */
export function useVehicleDeckLayers({
  vehiclePoints,
  routeSegments,
  iconAtlas,
  mapLoaded,
  showVehicleLayer,
  showRouteLayer,
  showTripsLayer = false,
  selectedVehicleId,
  onVehicleClick,
  onVehicleHover
}: UseVehicleDeckLayersOptions): Layer[] {
  return useMemo(() => {
    if (!mapLoaded) return []

    const layers: Layer[] = []

    // PathLayer for static route visualization
    if (showRouteLayer && routeSegments.length > 0 && !showTripsLayer) {
      layers.push(
        new PathLayer<VehicleRouteSegment>({
          id: 'vehicle-routes',
          data: routeSegments,
          pickable: false,
          getPath: (d) => d.path,
          widthMinPixels: 2,
          widthMaxPixels: 8,
          getWidth: (d) => (selectedVehicleId === d.vehicleId ? 6 : 3),
          getColor: (d) => {
            const base = ROUTE_COLORS[d.colorIndex % ROUTE_COLORS.length]
            if (selectedVehicleId === d.vehicleId) {
              return [base[0], base[1], base[2], 230]
            }
            return [base[0], base[1], base[2], 150]
          },
          capRounded: true,
          jointRounded: true,
          parameters: { depthTest: false },
          updateTriggers: {
            getWidth: selectedVehicleId,
            getColor: selectedVehicleId
          }
        })
      )
    }

    // TripsLayer for animated route playback (optional)
    // NOTE: Full TripsLayer implementation requires timestamp data in route segments
    // For now, this is disabled as it requires additional data structure changes
    // To enable: add timestamps to VehicleRouteSegment and use TripsLayer from @deck.gl/geo-layers
    if (showTripsLayer && routeSegments.length > 0) {
      // Using PathLayer with enhanced styling for "trips" mode
      layers.push(
        new PathLayer<VehicleRouteSegment>({
          id: 'vehicle-trips',
          data: routeSegments,
          pickable: false,
          getPath: (d) => d.path,
          widthMinPixels: 3,
          widthMaxPixels: 10,
          getWidth: (d) => (selectedVehicleId === d.vehicleId ? 8 : 4),
          getColor: (d) => {
            const base = ROUTE_COLORS[d.colorIndex % ROUTE_COLORS.length]
            return [base[0], base[1], base[2], 200]
          },
          capRounded: true,
          jointRounded: true,
          parameters: { depthTest: false },
          updateTriggers: {
            getWidth: selectedVehicleId,
            getColor: selectedVehicleId
          }
        })
      )
    }

    // IconLayer for vehicle markers
    // Note: For clustering with many vehicles (50+), consider implementing
    // ScatterplotLayer with clustering or custom clustering algorithm
    if (showVehicleLayer && iconAtlas && vehiclePoints.length > 0) {
      layers.push(
        new IconLayer<VehicleDeckPoint>({
          id: 'vehicle-icons',
          data: vehiclePoints,
          pickable: true,
          iconAtlas,
          iconMapping: ICON_MAPPING,
          getIcon: (d) => {
            // Select icon based on vehicle status and selection state
            const isSelected = selectedVehicleId === d.vehicleId
            const status = d.status || 'ONLINE'
            
            if (status === 'OFFLINE') {
              return 'vehicleOffline'
            }
            if (isSelected) {
              return 'vehicleSelected'
            }
            return 'vehicle'
          },
          sizeScale: 1,
          sizeUnits: 'pixels',
          sizeMinPixels: 24,
          sizeMaxPixels: 64,
          getSize: (d) => {
            // Larger size for selected vehicles
            return selectedVehicleId === d.vehicleId ? 56 : 40
          },
          getPosition: (d) => d.position,
          getColor: (d) => {
            // Use white color (255, 255, 255) to show pre-colored icons as-is
            // The icons are already colored in the atlas, so white preserves the original colors
            // For better visibility, we can use a slight tint based on vehicle status
            const status = d.status || 'ONLINE'
            
            if (status === 'OFFLINE') {
              // Keep gray icon as-is
              return [255, 255, 255, 255]
            }
            
            // Use white to preserve icon colors, but we can add a subtle tint
            // Since icons are pre-colored, white preserves them best
            return [255, 255, 255, 255]
          },
          getAngle: (d) => {
            // Rotate icon based on heading (0-360 degrees)
            // Convert heading to icon rotation (deck.gl uses counter-clockwise)
            const heading = d.heading ?? 0
            return (360 - heading) % 360
          },
          billboard: false, // Set to false so icons rotate with map
          parameters: { 
            depthTest: false,
            blend: true,
            blendFunc: [770, 771, 1, 771] // Standard alpha blending
          },
          // Note: IconLayer doesn't support built-in clustering
          // For clustering with many vehicles, consider using ScatterplotLayer
          // or implementing custom clustering logic
          updateTriggers: {
            getIcon: [selectedVehicleId, vehiclePoints.map(v => v.status).join(',')],
            getSize: selectedVehicleId,
            getColor: [selectedVehicleId, vehiclePoints.map(v => `${v.vehicleId}-${v.status}`).join(',')],
            // Position updates are handled automatically by deck.gl when data changes
          },
          onClick: (info) => {
            const point = info?.object as VehicleDeckPoint | undefined
            if (point && onVehicleClick) {
              onVehicleClick(point)
            }
          },
          onHover: (info) => {
            if (onVehicleHover) {
              const point = info?.object as VehicleDeckPoint | undefined
              onVehicleHover(point || null, info)
            }
          }
        })
      )
    }

    return layers
  }, [
    mapLoaded,
    showRouteLayer,
    showTripsLayer,
    showVehicleLayer,
    routeSegments,
    vehiclePoints,
    iconAtlas,
    selectedVehicleId,
    onVehicleClick,
    onVehicleHover
  ])
}

