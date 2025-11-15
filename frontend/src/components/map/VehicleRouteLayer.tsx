import { memo } from 'react'
import type { VehicleRouteSegment } from '@/types/vehicles'

export interface VehicleRouteLayerProps {
  routes: VehicleRouteSegment[]
  selectedVehicleId?: string | null
  showRoutes?: boolean
}

/**
 * VehicleRouteLayer - Represents vehicle routes on the map
 * This is a conceptual component - actual rendering is handled by Deck.gl PathLayer
 * This component is used for type safety and documentation
 */
export const VehicleRouteLayer = memo(function VehicleRouteLayer({
  routes,
  selectedVehicleId,
  showRoutes = true
}: VehicleRouteLayerProps) {
  // This component is primarily for type safety
  // Actual rendering happens in useVehicleDeckLayers via PathLayer
  return null
})

/**
 * Validate and filter route points
 */
export function validateRoutePoints(
  path: [number, number][]
): [number, number][] {
  return path.filter(([lng, lat]) => {
    return (
      typeof lng === 'number' &&
      typeof lat === 'number' &&
      !Number.isNaN(lng) &&
      !Number.isNaN(lat) &&
      lng >= -180 &&
      lng <= 180 &&
      lat >= -90 &&
      lat <= 90
    )
  })
}

/**
 * Limit route points to prevent performance issues
 */
export function limitRoutePoints(
  path: [number, number][],
  maxPoints: number = 200
): [number, number][] {
  if (path.length <= maxPoints) return path

  // Keep first and last points, then sample evenly
  const step = Math.floor(path.length / maxPoints)
  const limited: [number, number][] = [path[0]]

  for (let i = step; i < path.length - step; i += step) {
    limited.push(path[i])
  }

  limited.push(path[path.length - 1])
  return limited
}

