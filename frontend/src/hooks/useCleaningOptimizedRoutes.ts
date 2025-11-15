/**
 * Enhanced route optimization hook specifically for street cleaning vehicles
 * Integrates new cleaning algorithms with existing route optimization system
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createCleaningRouteOptimizer } from '@/utils/cleaningRouteIntegrator'
import { optimizeRoutePath } from '@/utils/routeOptimization'
import type { VehicleRouteSegment } from '@/types/vehicles'
import type { 
  CleaningOptimizationOptions, 
  IntegratedCleaningOptimization,
  CleaningPerformanceMetrics 
} from '@/utils/cleaningRouteIntegrator'
import type { 
  CleaningVehicle, 
  CleaningArea, 
  Street 
} from '@/utils/streetCleaningOptimizer'
import type { SchedulingConstraint } from '@/utils/streetPriorityScheduler'

export interface UseCleaningOptimizedRoutesOptions {
  routeSegments: VehicleRouteSegment[]
  vehicles: CleaningVehicle[]
  cleaningArea?: CleaningArea
  enabled?: boolean
  optimizationLevel?: 'basic' | 'standard' | 'advanced' | 'maximum'
  cleaningMode?: boolean // Enable cleaning-specific optimizations
  scheduleDate?: Date
  constraints?: SchedulingConstraint[]
  cleaningOptions?: Partial<CleaningOptimizationOptions>
}

export interface CleaningOptimizedResult {
  optimizedRoutes: VehicleRouteSegment[]
  isOptimizing: boolean
  cleaningOptimization: IntegratedCleaningOptimization | null
  performanceMetrics: CleaningPerformanceMetrics | null
  recommendations: any[]
  error: string | null
}

/**
 * Advanced hook for cleaning vehicle route optimization
 * Combines traditional route optimization with specialized cleaning algorithms
 */
export function useCleaningOptimizedRoutes({
  routeSegments,
  vehicles,
  cleaningArea,
  enabled = true,
  optimizationLevel = 'standard',
  cleaningMode = false,
  scheduleDate = new Date(),
  constraints = [],
  cleaningOptions = {}
}: UseCleaningOptimizedRoutesOptions): CleaningOptimizedResult {
  const [optimizedRoutes, setOptimizedRoutes] = useState<VehicleRouteSegment[]>([])
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [cleaningOptimization, setCleaningOptimization] = useState<IntegratedCleaningOptimization | null>(null)
  const [performanceMetrics, setPerformanceMetrics] = useState<CleaningPerformanceMetrics | null>(null)
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  // Create cleaning route optimizer instance
  const cleaningOptimizer = useMemo(() => createCleaningRouteOptimizer(), [])

  // Convert route segments to cleaning area data
  const convertToCleaningData = useCallback((segments: VehicleRouteSegment[]): CleaningArea | null => {
    if (segments.length === 0) return null

    const streets: Street[] = segments.map((segment, index) => ({
      id: segment.vehicleId + '_' + index,
      name: `Route ${index + 1}`,
      path: segment.path,
      length: calculatePathLength(segment.path),
      priority: 'medium',
      cleanliness: 'moderate',
      width: 8,
      trafficLevel: 'medium',
      surfaceType: 'asphalt',
      slope: 0,
      lastCleaned: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) // Random within last week
    }))

    // Calculate bounds
    const allPoints = segments.flatMap(s => s.path)
    const lngs = allPoints.map(p => p[0])
    const lats = allPoints.map(p => p[1])
    
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)]
    ]

    return {
      id: 'auto_generated_area',
      name: 'Cleaning Area',
      bounds,
      streets,
      restrictions: []
    }
  }, [])

  // Main optimization effect
  useEffect(() => {
    if (!enabled || routeSegments.length === 0) {
      setOptimizedRoutes([])
      setCleaningOptimization(null)
      setPerformanceMetrics(null)
      setRecommendations([])
      setError(null)
      return
    }

    setIsOptimizing(true)
    setError(null)

    const optimizeRoutes = async () => {
      try {
        if (cleaningMode && vehicles.length > 0) {
          // Use cleaning algorithms
          await optimizeWithCleaningAlgorithms()
        } else {
          // Use traditional route optimization
          await optimizeWithTraditionalAlgorithms()
        }
      } catch (err) {
        console.error('Route optimization failed:', err)
        setError(err instanceof Error ? err.message : 'Optimization failed')
        // Fallback to original routes
        setOptimizedRoutes(routeSegments)
      } finally {
        setIsOptimizing(false)
      }
    }

    optimizeRoutes()
  }, [routeSegments, vehicles, cleaningMode, optimizationLevel, enabled, scheduleDate])

  // Cleaning algorithm optimization
  const optimizeWithCleaningAlgorithms = async () => {
    const area = cleaningArea || convertToCleaningData(routeSegments)
    if (!area) throw new Error('No cleaning area available')

    const options: CleaningOptimizationOptions = {
      optimizationLevel,
      prioritizeBy: 'fuel_efficiency',
      cleaningPattern: 'optimal',
      allowOvertimeIfCritical: false,
      workingHours: { start: 6, end: 18 },
      maxRouteTime: 480,
      fuelOptimization: {
        enabled: true,
        allowSpeedVariation: true,
        optimizeEquipmentSettings: true
      },
      constraints,
      ...cleaningOptions
    }

    const result = await cleaningOptimizer.optimizeCleaningOperations(
      area,
      vehicles,
      scheduleDate,
      options
    )

    // Convert cleaning routes back to VehicleRouteSegment format
    const integratedRoutes = await cleaningOptimizer.integrateWithExistingOptimization(
      result.vehicleRoutes
    )

    setCleaningOptimization(result)
    setPerformanceMetrics(result.performanceMetrics)
    setRecommendations(result.recommendations)
    setOptimizedRoutes(integratedRoutes)
  }

  // Traditional algorithm optimization (fallback)
  const optimizeWithTraditionalAlgorithms = async () => {
    const optimized: VehicleRouteSegment[] = []
    
    // Process routes in batches
    const batchSize = 3
    for (let i = 0; i < routeSegments.length; i += batchSize) {
      const batch = routeSegments.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (segment) => {
        try {
          const optimizedPath = await optimizeRoutePath(segment.path, {
            maxWaypoints: 25,
            minDistance: 100
          })

          return {
            ...segment,
            path: optimizedPath
          }
        } catch (error) {
          console.warn(`Failed to optimize route for ${segment.vehicleId}:`, error)
          return segment
        }
      })

      const batchResults = await Promise.all(batchPromises)
      optimized.push(...batchResults)
    }

    setOptimizedRoutes(optimized)
    setCleaningOptimization(null)
    setPerformanceMetrics(null)
    setRecommendations([])
  }

  // Calculate cleaning efficiency metrics
  const cleaningEfficiencyMetrics = useMemo(() => {
    if (!cleaningOptimization || !performanceMetrics) return null

    return {
      fuelSavings: performanceMetrics.fuelEfficiencyImprovement,
      timeSavings: performanceMetrics.timeEfficiencyImprovement,
      coverageEfficiency: performanceMetrics.coverageEfficiency,
      costSavings: performanceMetrics.costSavings,
      turnaroundReduction: performanceMetrics.turnaroundReduction,
      overlapReduction: performanceMetrics.overlapReduction
    }
  }, [cleaningOptimization, performanceMetrics])

  // Get cleaning status summary
  const getCleaningStatus = useCallback(() => {
    if (!cleaningMode) return 'Traditional optimization'
    if (isOptimizing) return 'Optimizing cleaning routes...'
    if (error) return `Error: ${error}`
    if (cleaningOptimization) return 'Cleaning optimization complete'
    return 'Ready for cleaning optimization'
  }, [cleaningMode, isOptimizing, error, cleaningOptimization])

  return {
    optimizedRoutes,
    isOptimizing,
    cleaningOptimization,
    performanceMetrics,
    recommendations,
    error
  }
}

/**
 * Helper function to calculate path length
 */
function calculatePathLength(path: [number, number][]): number {
  let length = 0
  for (let i = 1; i < path.length; i++) {
    length += calculateDistance(path[i - 1], path[i])
  }
  return length
}

/**
 * Calculate distance between two points (Haversine formula)
 */
function calculateDistance(point1: [number, number], point2: [number, number]): number {
  const R = 6371000 // Earth radius in meters
  const lat1 = (point1[1] * Math.PI) / 180
  const lat2 = (point2[1] * Math.PI) / 180
  const deltaLat = ((point2[1] - point1[1]) * Math.PI) / 180
  const deltaLon = ((point2[0] - point1[0]) * Math.PI) / 180

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

/**
 * Hook for cleaning vehicle data conversion
 */
export function useCleaningVehicleData(vehicles: any[]): CleaningVehicle[] {
  return useMemo(() => {
    return vehicles.map(vehicle => ({
      id: vehicle.id,
      type: vehicle.vehicleType?.toLowerCase().includes('clean') ? 'combo' : 
            vehicle.vehicleType?.toLowerCase().includes('sweep') ? 'sweeper' : 'combo',
      cleaningWidth: vehicle.specs?.cleaningWidth || 2.5,
      fuelEfficiency: vehicle.specs?.fuelEfficiency || 12,
      turnRadius: vehicle.specs?.turnRadius || 8,
      maxSpeed: vehicle.specs?.maxSpeed || 25,
      capacity: vehicle.specs?.capacity || 5000,
      currentLocation: vehicle.lastLocation ? 
        [vehicle.lastLocation.longitude, vehicle.lastLocation.latitude] as [number, number] :
        [41.987, 40.540] as [number, number]
    }))
  }, [vehicles])
}

/**
 * Hook for creating cleaning constraints from schedule data
 */
export function useCleaningConstraints(
  trafficHours?: { start: number; end: number }[],
  maintenanceWindows?: { start: Date; end: Date }[]
): SchedulingConstraint[] {
  return useMemo(() => {
    const constraints: SchedulingConstraint[] = []

    // Add traffic constraints
    if (trafficHours) {
      trafficHours.forEach((hours, index) => {
        constraints.push({
          type: 'traffic',
          severity: 'medium_penalty',
          startTime: new Date(new Date().setHours(hours.start, 0, 0, 0)),
          endTime: new Date(new Date().setHours(hours.end, 0, 0, 0)),
          description: `Traffic peak hours ${hours.start}:00-${hours.end}:00`,
          penaltyMultiplier: 1.5
        })
      })
    }

    // Add maintenance constraints
    if (maintenanceWindows) {
      maintenanceWindows.forEach((window, index) => {
        constraints.push({
          type: 'maintenance',
          severity: 'blocking',
          startTime: window.start,
          endTime: window.end,
          description: `Maintenance window ${index + 1}`,
          penaltyMultiplier: 1.0
        })
      })
    }

    // Add default morning traffic constraint
    constraints.push({
      type: 'traffic',
      severity: 'high_penalty',
      startTime: new Date(new Date().setHours(7, 0, 0, 0)),
      endTime: new Date(new Date().setHours(9, 0, 0, 0)),
      description: 'Morning rush hour',
      penaltyMultiplier: 2.0
    })

    return constraints
  }, [trafficHours, maintenanceWindows])
}