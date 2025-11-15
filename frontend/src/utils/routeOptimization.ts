/**
 * Route optimization utilities
 * Converts straight-line GPS paths to road-following routes using Mapbox Directions API
 */

interface MapboxDirectionsResponse {
  routes: Array<{
    geometry: {
      coordinates: [number, number][]
    }
    distance: number
    duration: number
  }>
}

interface RouteCacheEntry {
  path: [number, number][]
  timestamp: number
}

// Cache for optimized routes to avoid excessive API calls
const routeCache = new Map<string, RouteCacheEntry>()
const CACHE_TTL = 1000 * 60 * 60 // 1 hour cache

/**
 * Generate cache key from start and end coordinates
 */
function getCacheKey(start: [number, number], end: [number, number]): string {
  return `${start[0].toFixed(4)},${start[1].toFixed(4)}-${end[0].toFixed(4)},${end[1].toFixed(4)}`
}

/**
 * Get optimized route between two points using Mapbox Directions API
 */
async function getOptimizedRouteSegment(
  start: [number, number],
  end: [number, number]
): Promise<[number, number][]> {
  const cacheKey = getCacheKey(start, end)
  const cached = routeCache.get(cacheKey)
  
  // Check cache
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.path
  }

  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
  if (!mapboxToken) {
    // Fallback to straight line if no token
    return [start, end]
  }

  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&access_token=${mapboxToken}`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`)
    }

    const data: MapboxDirectionsResponse = await response.json()
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0].geometry.coordinates
      // Cache the result
      routeCache.set(cacheKey, {
        path: route,
        timestamp: Date.now()
      })
      return route
    }
    
    // Fallback to straight line
    return [start, end]
  } catch (error) {
    console.warn('Failed to get optimized route, using straight line:', error)
    return [start, end]
  }
}

/**
 * Optimize a path by getting road-following routes between waypoints
 * Uses intelligent waypoint selection to balance accuracy and API calls
 */
export async function optimizeRoutePath(
  path: [number, number][],
  options: {
    maxWaypoints?: number // Maximum waypoints to use for routing (default: 25)
    minDistance?: number // Minimum distance (meters) between waypoints (default: 100)
  } = {}
): Promise<[number, number][]> {
  if (path.length < 2) return path

  const { maxWaypoints = 25, minDistance = 100 } = options

  // If path is short, optimize all segments
  if (path.length <= maxWaypoints) {
    return await optimizePathSegments(path)
  }

  // For long paths, select key waypoints
  const waypoints = selectKeyWaypoints(path, maxWaypoints, minDistance)
  
  // Optimize route between waypoints
  return await optimizePathSegments(waypoints)
}

/**
 * Select key waypoints from a path
 * Prioritizes points with significant direction changes or distance
 */
function selectKeyWaypoints(
  path: [number, number][],
  maxPoints: number,
  minDistance: number
): [number, number][] {
  if (path.length <= maxPoints) return path

  const selected: [number, number][] = [path[0]] // Always include start
  
  // Calculate distances and angles between consecutive points
  const segments: Array<{
    index: number
    distance: number
    angleChange: number
    score: number
  }> = []

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1]
    const curr = path[i]
    const next = path[i + 1]

    // Calculate distance
    const dist = calculateDistance(prev, curr)
    
    // Calculate angle change
    const angle1 = calculateBearing(prev, curr)
    const angle2 = calculateBearing(curr, next)
    const angleChange = Math.abs(angle2 - angle1)
    const normalizedAngleChange = angleChange > 180 ? 360 - angleChange : angleChange

    // Score: prioritize points with significant distance and direction changes
    const score = dist * 0.7 + normalizedAngleChange * 0.3

    segments.push({ index: i, distance: dist, angleChange: normalizedAngleChange, score })
  }

  // Sort by score and select top points
  segments.sort((a, b) => b.score - a.score)
  
  const selectedIndices = new Set<number>([0, path.length - 1]) // Always include start and end
  
  for (const segment of segments) {
    if (selectedIndices.size >= maxPoints) break
    
    // Check minimum distance from already selected points
    let tooClose = false
    for (const selectedIdx of selectedIndices) {
      const dist = calculateDistance(path[selectedIdx], path[segment.index])
      if (dist < minDistance) {
        tooClose = true
        break
      }
    }
    
    if (!tooClose && segment.distance >= minDistance) {
      selectedIndices.add(segment.index)
    }
  }

  // Sort selected indices and build waypoint array
  const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b)
  return sortedIndices.map(idx => path[idx])
}

/**
 * Optimize path by getting routes between consecutive waypoints
 */
async function optimizePathSegments(
  waypoints: [number, number][]
): Promise<[number, number][]> {
  if (waypoints.length < 2) return waypoints

  const optimizedPath: [number, number][] = [waypoints[0]]

  // Process segments sequentially to maintain order
  for (let i = 0; i < waypoints.length - 1; i++) {
    const segment = await getOptimizedRouteSegment(waypoints[i], waypoints[i + 1])
    // Skip first point to avoid duplicates (it's already in optimizedPath)
    optimizedPath.push(...segment.slice(1))
    
    // Add small delay to avoid rate limiting (50ms between requests)
    if (i < waypoints.length - 2) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  return optimizedPath
}

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 */
export function calculateDistance(
  point1: [number, number],
  point2: [number, number]
): number {
  const R = 6371000 // Earth radius in meters
  const lat1 = (point1[1] * Math.PI) / 180
  const lat2 = (point2[1] * Math.PI) / 180
  const deltaLat = ((point2[1] - point1[1]) * Math.PI) / 180
  const deltaLon = ((point2[0] - point1[0]) * Math.PI) / 180

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

/**
 * Calculate bearing (direction) between two points in degrees
 */
export function calculateBearing(
  point1: [number, number],
  point2: [number, number]
): number {
  const lat1 = (point1[1] * Math.PI) / 180
  const lat2 = (point2[1] * Math.PI) / 180
  const deltaLon = ((point2[0] - point1[0]) * Math.PI) / 180

  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)

  const bearing = (Math.atan2(y, x) * 180) / Math.PI
  return (bearing + 360) % 360
}

/**
 * Simplify path using Douglas-Peucker algorithm
 * Reduces number of points while maintaining shape
 */
export function simplifyPath(
  path: [number, number][],
  tolerance: number = 0.0001
): [number, number][] {
  if (path.length <= 2) return path

  const simplified: [number, number][] = [path[0]]
  
  function douglasPeucker(
    points: [number, number][],
    start: number,
    end: number,
    tolerance: number
  ): void {
    if (end - start <= 1) return

    let maxDistance = 0
    let maxIndex = start

    const startPoint = points[start]
    const endPoint = points[end]

    for (let i = start + 1; i < end; i++) {
      const distance = perpendicularDistance(points[i], startPoint, endPoint)
      if (distance > maxDistance) {
        maxDistance = distance
        maxIndex = i
      }
    }

    if (maxDistance > tolerance) {
      douglasPeucker(points, start, maxIndex, tolerance)
      simplified.push(points[maxIndex])
      douglasPeucker(points, maxIndex, end, tolerance)
    }
  }

  douglasPeucker(path, 0, path.length - 1, tolerance)
  simplified.push(path[path.length - 1])

  return simplified
}

/**
 * Calculate perpendicular distance from point to line segment
 */
function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const dx = lineEnd[0] - lineStart[0]
  const dy = lineEnd[1] - lineStart[1]
  const mag = Math.sqrt(dx * dx + dy * dy)
  
  if (mag < 0.00000001) {
    return calculateDistance(point, lineStart)
  }

  const u = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (mag * mag)
  
  if (u < 0) {
    return calculateDistance(point, lineStart)
  } else if (u > 1) {
    return calculateDistance(point, lineEnd)
  }

  const intersection: [number, number] = [
    lineStart[0] + u * dx,
    lineStart[1] + u * dy
  ]
  
  return calculateDistance(point, intersection)
}

/**
 * Clear route cache (useful for testing or when routes need to be refreshed)
 */
export function clearRouteCache(): void {
  routeCache.clear()
}

