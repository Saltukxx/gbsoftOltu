import type { VehicleDeckPoint } from '@/types/vehicles'

/**
 * Calculate bounding box from vehicle points
 */
export function calculateBounds(points: VehicleDeckPoint[]): mapboxgl.LngLatBounds | null {
  if (points.length === 0) return null

  const bounds = new mapboxgl.LngLatBounds()

  points.forEach((point) => {
    bounds.extend(point.position)
  })

  return bounds
}

/**
 * Calculate bounds with padding
 */
export function fitBoundsToVehicles(
  map: mapboxgl.Map,
  points: VehicleDeckPoint[],
  padding: { top: number; bottom: number; left: number; right: number } = {
    top: 50,
    bottom: 50,
    left: 50,
    right: 50
  }
): void {
  const bounds = calculateBounds(points)
  if (!bounds) return

  try {
    map.fitBounds(bounds, {
      padding,
      duration: 1000,
      maxZoom: 15 // Don't zoom in too much
    })
  } catch (error) {
    console.error('Failed to fit bounds:', error)
  }
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

