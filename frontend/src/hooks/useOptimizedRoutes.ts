import { useState, useEffect, useMemo } from 'react'
import { optimizeRoutePath, simplifyPath } from '@/utils/routeOptimization'
import type { VehicleRouteSegment } from '@/types/vehicles'

interface UseOptimizedRoutesOptions {
  routeSegments: VehicleRouteSegment[]
  enabled?: boolean
  optimizationLevel?: 'none' | 'simplify' | 'full' // Optimization level
}

interface OptimizedRouteSegment extends VehicleRouteSegment {
  optimizedPath: [number, number][]
  isOptimizing: boolean
}

/**
 * Hook to optimize vehicle routes for road-following display
 * Handles async route optimization with loading states
 */
export function useOptimizedRoutes({
  routeSegments,
  enabled = true,
  optimizationLevel = 'full'
}: UseOptimizedRoutesOptions) {
  const [optimizedRoutes, setOptimizedRoutes] = useState<Map<string, OptimizedRouteSegment>>(new Map())
  const [isOptimizing, setIsOptimizing] = useState(false)

  // Optimize routes when segments change
  useEffect(() => {
    if (!enabled || routeSegments.length === 0) {
      setOptimizedRoutes(new Map())
      return
    }

    setIsOptimizing(true)

    const optimizeRoutes = async () => {
      const optimized = new Map<string, OptimizedRouteSegment>()

      // Process routes in parallel (but limit concurrency)
      const batchSize = 3
      for (let i = 0; i < routeSegments.length; i += batchSize) {
        const batch = routeSegments.slice(i, i + batchSize)
        
        const batchPromises = batch.map(async (segment) => {
          try {
            let optimizedPath: [number, number][]

            if (optimizationLevel === 'none') {
              optimizedPath = segment.path
            } else if (optimizationLevel === 'simplify') {
              // Just simplify, don't use routing API
              optimizedPath = simplifyPath(segment.path, 0.0001)
            } else {
              // Full optimization: use Mapbox Directions API
              optimizedPath = await optimizeRoutePath(segment.path, {
                maxWaypoints: 25,
                minDistance: 100 // 100 meters minimum between waypoints
              })
            }

            return {
              ...segment,
              optimizedPath,
              isOptimizing: false
            } as OptimizedRouteSegment
          } catch (error) {
            console.warn(`Failed to optimize route for ${segment.vehicleId}:`, error)
            // Fallback to original path
            return {
              ...segment,
              optimizedPath: segment.path,
              isOptimizing: false
            } as OptimizedRouteSegment
          }
        })

        const batchResults = await Promise.all(batchPromises)
        batchResults.forEach((result) => {
          optimized.set(result.vehicleId, result)
        })

        // Update state incrementally for better UX
        setOptimizedRoutes(new Map(optimized))
      }

      setIsOptimizing(false)
    }

    optimizeRoutes()
  }, [routeSegments, enabled, optimizationLevel])

  // Return optimized route segments with original path as fallback
  const finalRoutes = useMemo(() => {
    return routeSegments.map((segment) => {
      const optimized = optimizedRoutes.get(segment.vehicleId)
      if (optimized && optimized.optimizedPath.length > 0) {
        return {
          ...segment,
          path: optimized.optimizedPath
        }
      }
      return segment
    })
  }, [routeSegments, optimizedRoutes])

  return {
    optimizedRoutes: finalRoutes,
    isOptimizing,
    hasOptimizedRoutes: optimizedRoutes.size > 0
  }
}

