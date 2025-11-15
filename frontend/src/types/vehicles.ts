// Enhanced vehicle tracking types with clean data contracts

/**
 * Normalized vehicle position data for map rendering
 */
export interface VehiclePosition {
  vehicleId: string
  plateNumber: string
  latitude: number
  longitude: number
  heading: number
  speed: number
  recordedAt: string
  status: 'ONLINE' | 'IDLE' | 'OFFLINE'
  fuelLevel?: number
}

/**
 * Normalized route segment for a vehicle
 */
export interface VehicleRouteSegment {
  vehicleId: string
  plateNumber: string
  path: [number, number][] // Array of [longitude, latitude] pairs
  timestamps: string[] // Corresponding timestamps for each point
  colorIndex: number
  startTime: string
  endTime: string
}

/**
 * Vehicle status information
 */
export interface VehicleStatus {
  status: 'ONLINE' | 'IDLE' | 'OFFLINE'
  color: string
  bg: string
  lastUpdate: Date
  minutesSinceUpdate: number
}

/**
 * Time window options for route history
 */
export type RouteTimeWindow = '30min' | '1h' | '2h' | '6h' | '24h' | 'all'

/**
 * Map viewport state
 */
export interface MapViewport {
  center: [number, number]
  zoom: number
  bearing?: number
  pitch?: number
}

// Deck.gl specific types (for backward compatibility and internal use)
export interface VehicleDeckPoint {
  vehicleId: string
  plateNumber: string
  position: [number, number] // [longitude, latitude]
  heading: number
  speed: number
  recordedAt: string
  colorIndex: number
  status?: 'ONLINE' | 'IDLE' | 'OFFLINE'
}

// Constants
export const MAX_ROUTE_POINTS = 100 // Increased for better route visualization
export const MAX_ROUTE_POINTS_PER_VEHICLE = 200 // Per vehicle limit

export const ROUTE_COLORS: [number, number, number][] = [
  [37, 99, 235],   // Blue
  [16, 185, 129],  // Green
  [249, 115, 22],  // Orange
  [236, 72, 153],  // Pink
  [139, 92, 246],  // Purple
  [34, 197, 94],   // Emerald
  [234, 179, 8],   // Yellow
  [239, 68, 68],   // Red
  [59, 130, 246],  // Sky Blue
  [168, 85, 247]   // Violet
]

export const ICON_MAPPING = {
  vehicle: { x: 0, y: 0, width: 64, height: 64, mask: false },
  vehicleSelected: { x: 64, y: 0, width: 64, height: 64, mask: false },
  vehicleOffline: { x: 128, y: 0, width: 64, height: 64, mask: false }
} as const

/**
 * Route time window configuration
 */
export const ROUTE_TIME_WINDOWS: Record<RouteTimeWindow, { hours: number; label: string }> = {
  '30min': { hours: 0.5, label: 'Son 30 Dakika' },
  '1h': { hours: 1, label: 'Son 1 Saat' },
  '2h': { hours: 2, label: 'Son 2 Saat' },
  '6h': { hours: 6, label: 'Son 6 Saat' },
  '24h': { hours: 24, label: 'Son 24 Saat' },
  'all': { hours: Infinity, label: 'Tümü' }
}

/**
 * Utility function to convert API location to normalized position
 */
export function normalizeVehiclePosition(
  location: any,
  vehicle: { id: string; plateNumber: string }
): VehiclePosition | null {
  if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    return null
  }

  // Validate coordinates
  if (
    Number.isNaN(location.latitude) ||
    Number.isNaN(location.longitude) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    return null
  }

  return {
    vehicleId: vehicle.id,
    plateNumber: vehicle.plateNumber,
    latitude: location.latitude,
    longitude: location.longitude,
    heading: typeof location.heading === 'number' ? location.heading : 0,
    speed: typeof location.speed === 'number' ? location.speed : 0,
    recordedAt: location.recordedAt || new Date().toISOString(),
    status: 'ONLINE', // Will be calculated based on timestamp
    fuelLevel: location.fuelLevel
  }
}

/**
 * Utility function to calculate vehicle status from last update time
 */
export function calculateVehicleStatus(lastUpdate: string): VehicleStatus {
  const now = new Date()
  const updateTime = new Date(lastUpdate)
  const minutesSinceUpdate = (now.getTime() - updateTime.getTime()) / (1000 * 60)

  if (minutesSinceUpdate < 5) {
    return {
      status: 'ONLINE',
      color: 'text-green-700',
      bg: 'bg-green-100',
      lastUpdate: updateTime,
      minutesSinceUpdate
    }
  } else if (minutesSinceUpdate < 30) {
    return {
      status: 'IDLE',
      color: 'text-yellow-700',
      bg: 'bg-yellow-100',
      lastUpdate: updateTime,
      minutesSinceUpdate
    }
  } else {
    return {
      status: 'OFFLINE',
      color: 'text-gray-500',
      bg: 'bg-gray-100',
      lastUpdate: updateTime,
      minutesSinceUpdate
    }
  }
}

