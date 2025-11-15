/**
 * Route planning utilities
 * Provides functions to calculate optimal routes between two points using Mapbox Directions API
 */

export interface RoutePlan {
  geometry: {
    coordinates: [number, number][]
  }
  distance: number // meters
  duration: number // seconds
  steps: RouteStep[]
}

export interface RouteStep {
  distance: number
  duration: number
  instruction: string
  maneuver: {
    type: string
    modifier?: string
  }
  geometry: {
    coordinates: [number, number][]
  }
}

interface MapboxDirectionsResponse {
  routes: Array<{
    geometry: {
      coordinates: [number, number][]
    }
    distance: number
    duration: number
    legs: Array<{
      distance: number
      duration: number
      steps: Array<{
        distance: number
        duration: number
        instruction: string
        maneuver: {
          type: string
          modifier?: string
        }
        geometry: {
          coordinates: [number, number][]
        }
      }>
    }>
  }>
  waypoints: Array<{
    location: [number, number]
  }>
}

/**
 * Plan optimal route between two points
 */
export async function planRoute(
  start: [number, number],
  end: [number, number],
  options: {
    profile?: 'driving' | 'walking' | 'cycling' // Route profile
    alternatives?: boolean // Return alternative routes
    steps?: boolean // Include turn-by-turn directions
  } = {}
): Promise<RoutePlan | null> {
  const {
    profile = 'driving',
    alternatives = false,
    steps = true
  } = options

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  if (!mapboxToken) {
    throw new Error('Mapbox token is required for route planning')
  }

  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&steps=${steps}&alternatives=${alternatives}&access_token=${mapboxToken}`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`)
    }

    const data: MapboxDirectionsResponse = await response.json()
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0]
      const leg = route.legs[0] // Get first leg (for single waypoint routes)
      
      return {
        geometry: {
          coordinates: route.geometry.coordinates
        },
        distance: route.distance,
        duration: route.duration,
        steps: leg.steps.map(step => ({
          distance: step.distance,
          duration: step.duration,
          instruction: step.instruction,
          maneuver: {
            type: step.maneuver.type,
            modifier: step.maneuver.modifier
          },
          geometry: {
            coordinates: step.geometry.coordinates
          }
        }))
      }
    }
    
    return null
  } catch (error) {
    console.error('Failed to plan route:', error)
    throw error
  }
}

/**
 * Plan route with multiple waypoints
 */
export async function planRouteWithWaypoints(
  waypoints: [number, number][],
  options: {
    profile?: 'driving' | 'walking' | 'cycling'
    steps?: boolean
  } = {}
): Promise<RoutePlan | null> {
  if (waypoints.length < 2) {
    throw new Error('At least 2 waypoints required')
  }

  const {
    profile = 'driving',
    steps = true
  } = options

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  if (!mapboxToken) {
    throw new Error('Mapbox token is required for route planning')
  }

  try {
    // Format waypoints for API
    const coordinates = waypoints.map(wp => `${wp[0]},${wp[1]}`).join(';')
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&steps=${steps}&access_token=${mapboxToken}`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`)
    }

    const data: MapboxDirectionsResponse = await response.json()
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0]
      
      // Combine all legs
      const allSteps: RouteStep[] = []
      route.legs.forEach(leg => {
        allSteps.push(...leg.steps.map(step => ({
          distance: step.distance,
          duration: step.duration,
          instruction: step.instruction,
          maneuver: {
            type: step.maneuver.type,
            modifier: step.maneuver.modifier
          },
          geometry: {
            coordinates: step.geometry.coordinates
          }
        })))
      })
      
      return {
        geometry: {
          coordinates: route.geometry.coordinates
        },
        distance: route.distance,
        duration: route.duration,
        steps: allSteps
      }
    }
    
    return null
  } catch (error) {
    console.error('Failed to plan route with waypoints:', error)
    throw error
  }
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return `${hours} sa ${minutes} dk`
  }
  return `${minutes} dk`
}



