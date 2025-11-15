/**
 * Hook for route optimization using backend TSP algorithms
 * Integrates with backend route optimization API
 */

import { useState, useCallback } from 'react'
import { apiClient } from '@/services/api'

export interface RouteNode {
  id: string
  position: [number, number] // [lng, lat]
  priority?: number // 1-100, higher = more important
  metadata?: Record<string, any>
}

export interface VehicleProfile {
  id?: string
  fuelType?: 'gasoline' | 'diesel' | 'electric' | 'hybrid'
  fuelCapacity?: number // liters
  averageSpeed?: number // km/h
  fuelConsumptionRate?: number // liters per 100km
}

export interface OptimizationOptions {
  algorithm?: 'nearest_neighbor' | 'genetic' | 'ant_colony' | 'hybrid'
  maxIterations?: number
  populationSize?: number
  mutationRate?: number
  timeLimitMs?: number
  priorityWeight?: number // 0-1, how much to weight priority vs distance
  fuelOptimization?: boolean
}

export interface OptimizedRoute {
  optimizationId?: string
  sequence: RouteNode[]
  totalDistance: number // meters
  totalTime: number // minutes
  fuelCost: number // liters
  efficiency: number // percentage
  algorithm: string
  pattern: string
  optimizationTimeMs: number
  savings: {
    distance: {
      original?: number
      optimized: number
      saved?: number
      savedPercent?: number
    }
    time: {
      original?: number
      optimized: number
      saved?: number
      savedPercent?: number
    }
    fuel: {
      original?: number
      optimized: number
      saved?: number
      savedPercent?: number
    }
  }
}

export interface UseRouteOptimizationOptions {
  vehicleId: string
  vehicleProfile?: VehicleProfile
  vehicleRouteId?: string
  saveToDatabase?: boolean
}

export function useRouteOptimization({
  vehicleId,
  vehicleProfile,
  vehicleRouteId,
  saveToDatabase = true
}: UseRouteOptimizationOptions) {
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Optimize a route given nodes and start position
   */
  const optimizeRoute = useCallback(async (
    nodes: RouteNode[],
    startPosition: [number, number],
    options?: OptimizationOptions
  ): Promise<OptimizedRoute | null> => {
    if (nodes.length === 0) {
      setError('No nodes provided for optimization')
      return null
    }

    setIsOptimizing(true)
    setError(null)

    try {
      const response = await apiClient.optimizeRoute({
        vehicleId,
        vehicleRouteId,
        nodes,
        startPosition,
        vehicle: vehicleProfile,
        options: {
          algorithm: options?.algorithm || 'hybrid',
          maxIterations: options?.maxIterations || 1000,
          populationSize: options?.populationSize || 50,
          mutationRate: options?.mutationRate || 0.1,
          timeLimitMs: options?.timeLimitMs || 15000,
          priorityWeight: options?.priorityWeight ?? 0.3,
          fuelOptimization: options?.fuelOptimization ?? true,
        },
        saveToDatabase,
      })

      if (response.success && response.data) {
        const result: OptimizedRoute = {
          optimizationId: response.data.optimizationId,
          sequence: response.data.best.sequence,
          totalDistance: response.data.best.totalDistance,
          totalTime: response.data.best.totalTime,
          fuelCost: response.data.best.fuelCost,
          efficiency: response.data.best.efficiency,
          algorithm: response.data.metadata.algorithm,
          pattern: response.data.metadata.pattern,
          optimizationTimeMs: response.data.metadata.optimizationTimeMs,
          savings: response.data.metadata.savings,
        }

        setOptimizedRoute(result)
        return result
      }

      return null
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to optimize route'
      setError(errorMessage)
      console.error('Route optimization error:', err)
      return null
    } finally {
      setIsOptimizing(false)
    }
  }, [vehicleId, vehicleRouteId, vehicleProfile, saveToDatabase])

  /**
   * Clear the current optimization
   */
  const clearOptimization = useCallback(() => {
    setOptimizedRoute(null)
    setError(null)
  }, [])

  /**
   * Get optimization history for the vehicle
   */
  const getHistory = useCallback(async (limit: number = 10) => {
    try {
      const response = await apiClient.getOptimizationHistory(vehicleId, limit)
      return response.data
    } catch (err: any) {
      console.error('Failed to fetch optimization history:', err)
      return []
    }
  }, [vehicleId])

  /**
   * Mark an optimization as applied
   */
  const markAsApplied = useCallback(async (optimizationId: string) => {
    try {
      await apiClient.markOptimizationAsApplied(optimizationId)
      return true
    } catch (err: any) {
      console.error('Failed to mark optimization as applied:', err)
      return false
    }
  }, [])

  /**
   * Get optimization statistics
   */
  const getStats = useCallback(async () => {
    try {
      const response = await apiClient.getOptimizationStats(vehicleId)
      return response.data
    } catch (err: any) {
      console.error('Failed to fetch optimization stats:', err)
      return null
    }
  }, [vehicleId])

  return {
    optimizedRoute,
    isOptimizing,
    error,
    optimizeRoute,
    clearOptimization,
    getHistory,
    markAsApplied,
    getStats,
  }
}

/**
 * Hook to fetch available algorithms
 */
export function useOptimizationAlgorithms() {
  const [algorithms, setAlgorithms] = useState<Array<{
    id: string
    name: string
    description: string
    complexity: string
    recommended: string
    speed: string
  }>>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchAlgorithms = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await apiClient.getAvailableAlgorithms()
      if (response.success && response.data) {
        setAlgorithms(response.data.algorithms)
      }
    } catch (err) {
      console.error('Failed to fetch algorithms:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    algorithms,
    isLoading,
    fetchAlgorithms,
  }
}
