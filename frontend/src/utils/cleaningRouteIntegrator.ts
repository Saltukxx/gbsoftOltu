/**
 * Street Cleaning Route Integrator
 * Integration layer connecting specialized cleaning algorithms with existing route optimization
 */

import { optimizeRoutePath } from './routeOptimization'
import { StreetCleaningOptimizer } from './streetCleaningOptimizer'
import { CleaningTSPSolver } from './tspSolver'
import { CleaningPatternGenerator } from './cleaningPatterns'
import { TurnaroundOptimizer } from './turnaroundOptimizer'
import { StreetPriorityScheduler } from './streetPriorityScheduler'
import { CleaningFuelOptimizer } from './cleaningFuelOptimizer'

import type { 
  Street, 
  CleaningVehicle, 
  OptimizedCleaningRoute,
  CleaningArea,
  CleaningPattern 
} from './streetCleaningOptimizer'
import type { DynamicSchedule, SchedulingConstraint } from './streetPriorityScheduler'
import type { VehicleRouteSegment } from '@/types/vehicles'

export interface IntegratedCleaningOptimization {
  vehicleRoutes: OptimizedCleaningRoute[]
  schedule: DynamicSchedule
  fuelOptimization: any
  performanceMetrics: CleaningPerformanceMetrics
  recommendations: OptimizationRecommendation[]
}

export interface CleaningPerformanceMetrics {
  totalFuelSavings: number // liters
  totalTimeSavings: number // minutes
  fuelEfficiencyImprovement: number // percentage
  timeEfficiencyImprovement: number // percentage
  coverageEfficiency: number // percentage
  turnaroundReduction: number // percentage
  overlapReduction: number // meters
  costSavings: number // currency units
}

export interface OptimizationRecommendation {
  type: 'fuel' | 'time' | 'coverage' | 'scheduling' | 'equipment'
  priority: 'high' | 'medium' | 'low'
  description: string
  estimatedImpact: number
  implementationCost: 'low' | 'medium' | 'high'
  timeToImplement: string
}

export interface CleaningOptimizationOptions {
  optimizationLevel: 'basic' | 'standard' | 'advanced' | 'maximum'
  prioritizeBy: 'fuel_efficiency' | 'time_efficiency' | 'cost_optimization' | 'coverage_quality'
  cleaningPattern: CleaningPattern
  allowOvertimeIfCritical: boolean
  workingHours: { start: number; end: number }
  maxRouteTime: number // minutes
  fuelOptimization: {
    enabled: boolean
    allowSpeedVariation: boolean
    optimizeEquipmentSettings: boolean
  }
  constraints: SchedulingConstraint[]
}

/**
 * Integrated Street Cleaning Route Optimizer
 * Combines all cleaning optimization algorithms for maximum efficiency
 */
export class CleaningRouteIntegrator {
  private cleaningOptimizer: StreetCleaningOptimizer
  private tspSolver: CleaningTSPSolver
  private patternGenerator: CleaningPatternGenerator
  private turnaroundOptimizer: TurnaroundOptimizer
  private priorityScheduler: StreetPriorityScheduler
  private fuelOptimizer: CleaningFuelOptimizer

  constructor() {
    this.cleaningOptimizer = new StreetCleaningOptimizer()
    this.tspSolver = new CleaningTSPSolver()
    this.patternGenerator = new CleaningPatternGenerator()
    this.turnaroundOptimizer = new TurnaroundOptimizer()
    this.priorityScheduler = new StreetPriorityScheduler()
    this.fuelOptimizer = new CleaningFuelOptimizer()
  }

  /**
   * Main optimization function integrating all algorithms
   */
  async optimizeCleaningOperations(
    area: CleaningArea,
    vehicles: CleaningVehicle[],
    scheduleDate: Date,
    options: CleaningOptimizationOptions
  ): Promise<IntegratedCleaningOptimization> {
    console.log(`Starting integrated cleaning optimization with ${options.optimizationLevel} level`)

    // Step 1: Generate priority-based schedule
    const schedule = this.priorityScheduler.generateDynamicSchedule(
      area.streets,
      vehicles,
      options.constraints,
      scheduleDate,
      {
        workingHoursStart: options.workingHours.start,
        workingHoursEnd: options.workingHours.end,
        maxBlockDuration: options.maxRouteTime,
        prioritizeUrgent: true,
        allowOvertimeIfCritical: options.allowOvertimeIfCritical
      }
    )

    // Step 2: Generate optimized routes for each vehicle
    const vehicleRoutes: OptimizedCleaningRoute[] = []
    
    for (const vehicle of vehicles) {
      const vehicleStreets = this.getStreetsForVehicle(schedule, vehicle)
      
      if (vehicleStreets.length === 0) continue

      const optimizedRoute = await this.optimizeVehicleRoute(
        vehicle,
        vehicleStreets,
        options
      )

      if (optimizedRoute) {
        vehicleRoutes.push(optimizedRoute)
      }
    }

    // Step 3: Apply fuel optimization if enabled
    let fuelOptimization: any = null
    if (options.fuelOptimization.enabled) {
      const allSegments = vehicleRoutes.flatMap(route => route.streets)
      fuelOptimization = this.fuelOptimizer.optimizeFuelConsumption(
        allSegments,
        vehicles,
        {
          prioritizeEfficiency: options.prioritizeBy === 'fuel_efficiency',
          allowSpeedVariation: options.fuelOptimization.allowSpeedVariation,
          optimizeEquipmentSettings: options.fuelOptimization.optimizeEquipmentSettings,
          considerTrafficPatterns: true
        }
      )
    }

    // Step 4: Calculate performance metrics
    const performanceMetrics = this.calculatePerformanceMetrics(
      vehicleRoutes,
      area.streets,
      vehicles
    )

    // Step 5: Generate recommendations
    const recommendations = this.generateOptimizationRecommendations(
      vehicleRoutes,
      schedule,
      performanceMetrics,
      options
    )

    return {
      vehicleRoutes,
      schedule,
      fuelOptimization,
      performanceMetrics,
      recommendations
    }
  }

  /**
   * Optimize route for a single vehicle
   */
  private async optimizeVehicleRoute(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: CleaningOptimizationOptions
  ): Promise<OptimizedCleaningRoute | null> {
    if (streets.length === 0) return null

    // Apply optimization based on level
    switch (options.optimizationLevel) {
      case 'basic':
        return this.basicOptimization(vehicle, streets, options)
      
      case 'standard':
        return this.standardOptimization(vehicle, streets, options)
      
      case 'advanced':
        return this.advancedOptimization(vehicle, streets, options)
      
      case 'maximum':
        return this.maximumOptimization(vehicle, streets, options)
      
      default:
        return this.standardOptimization(vehicle, streets, options)
    }
  }

  /**
   * Basic optimization - simple pattern-based approach
   */
  private async basicOptimization(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: CleaningOptimizationOptions
  ): Promise<OptimizedCleaningRoute> {
    return this.cleaningOptimizer.optimizeCleaningRoutes(
      { id: 'area', name: 'Basic Area', bounds: [[0, 0], [1, 1]], streets, restrictions: [] },
      [vehicle],
      {
        pattern: options.cleaningPattern,
        prioritizeByDirtiness: true,
        minimizeTurnarounds: false,
        maxRouteTime: options.maxRouteTime,
        avoidTrafficHours: false
      }
    ).then(routes => routes[0])
  }

  /**
   * Standard optimization - adds TSP and basic turnaround optimization
   */
  private async standardOptimization(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: CleaningOptimizationOptions
  ): Promise<OptimizedCleaningRoute> {
    // Get base route
    const baseRoute = await this.basicOptimization(vehicle, streets, options)

    // Apply TSP optimization for better sequencing
    const tspSolution = await this.tspSolver.solveTSP(
      streets,
      vehicle,
      vehicle.currentLocation,
      {
        algorithm: 'genetic',
        maxIterations: 200,
        populationSize: 20,
        timeLimitMs: 5000,
        priorityWeight: 0.2,
        fuelOptimization: true
      }
    )

    const optimizedSegments = this.tspSolver.convertToOptimizedSegments(tspSolution)

    return {
      ...baseRoute,
      streets: optimizedSegments,
      totalDistance: tspSolution.totalDistance,
      estimatedTime: tspSolution.totalTime,
      estimatedFuelConsumption: tspSolution.fuelCost,
      efficiency: {
        fuelSavings: Math.max(0, (baseRoute.estimatedFuelConsumption - tspSolution.fuelCost) / baseRoute.estimatedFuelConsumption * 100),
        timeSavings: Math.max(0, (baseRoute.estimatedTime - tspSolution.totalTime) / baseRoute.estimatedTime * 100),
        coverageEfficiency: tspSolution.efficiency
      }
    }
  }

  /**
   * Advanced optimization - adds turnaround and overlap optimization
   */
  private async advancedOptimization(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: CleaningOptimizationOptions
  ): Promise<OptimizedCleaningRoute> {
    // Get standard optimized route
    const standardRoute = await this.standardOptimization(vehicle, streets, options)

    // Apply turnaround and overlap optimization
    const turnaroundResult = this.turnaroundOptimizer.optimizeRoute(
      standardRoute.streets,
      vehicle,
      {
        minimizeTurnarounds: true,
        preventOverlaps: true,
        allowReverseCleaning: true,
        maxDetourDistance: 500 // 500m max detour
      }
    )

    return {
      ...standardRoute,
      streets: turnaroundResult.optimizedSegments,
      estimatedFuelConsumption: standardRoute.estimatedFuelConsumption - turnaroundResult.fuelSavings,
      estimatedTime: standardRoute.estimatedTime - turnaroundResult.timeSavings,
      turnarounds: standardRoute.turnarounds - Math.floor(turnaroundResult.turnCostReduction * 0.1),
      overlappingCoverage: standardRoute.overlappingCoverage - turnaroundResult.overlapReduction,
      efficiency: {
        fuelSavings: standardRoute.efficiency.fuelSavings + (turnaroundResult.fuelSavings / standardRoute.estimatedFuelConsumption * 100),
        timeSavings: standardRoute.efficiency.timeSavings + (turnaroundResult.timeSavings / standardRoute.estimatedTime * 100),
        coverageEfficiency: standardRoute.efficiency.coverageEfficiency + (turnaroundResult.overlapReduction / standardRoute.totalDistance * 100)
      }
    }
  }

  /**
   * Maximum optimization - uses all available algorithms
   */
  private async maximumOptimization(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: CleaningOptimizationOptions
  ): Promise<OptimizedCleaningRoute> {
    // Get advanced optimized route
    const advancedRoute = await this.advancedOptimization(vehicle, streets, options)

    // Apply specialized cleaning pattern optimization
    let patternOptimizedSegments = advancedRoute.streets

    switch (options.cleaningPattern) {
      case 'spiral':
        patternOptimizedSegments = this.patternGenerator.generateOptimizedSpiralPattern(
          vehicle,
          streets,
          {
            minimizeTurnarounds: true,
            maxRouteTime: options.maxRouteTime,
            vehicleWidth: vehicle.cleaningWidth,
            overlapTolerance: 10,
            spiralDirection: 'clockwise',
            gridOrientation: 'optimal'
          }
        )
        break
      
      case 'grid':
        patternOptimizedSegments = this.patternGenerator.generateSystematicGridPattern(
          vehicle,
          streets,
          {
            minimizeTurnarounds: true,
            maxRouteTime: options.maxRouteTime,
            vehicleWidth: vehicle.cleaningWidth,
            overlapTolerance: 10,
            spiralDirection: 'clockwise',
            gridOrientation: 'optimal'
          }
        )
        break
      
      case 'back_forth':
        patternOptimizedSegments = this.patternGenerator.generateOptimizedBackForthPattern(
          vehicle,
          streets,
          {
            minimizeTurnarounds: true,
            maxRouteTime: options.maxRouteTime,
            vehicleWidth: vehicle.cleaningWidth,
            overlapTolerance: 10,
            spiralDirection: 'clockwise',
            gridOrientation: 'optimal'
          }
        )
        break
    }

    // Calculate final metrics
    const finalMetrics = this.calculateRouteMetrics(patternOptimizedSegments, vehicle)

    return {
      ...advancedRoute,
      streets: patternOptimizedSegments,
      totalDistance: finalMetrics.totalDistance,
      estimatedTime: finalMetrics.estimatedTime,
      estimatedFuelConsumption: finalMetrics.fuelConsumption,
      turnarounds: finalMetrics.turnarounds,
      overlappingCoverage: finalMetrics.overlappingCoverage,
      efficiency: {
        fuelSavings: Math.max(0, (advancedRoute.estimatedFuelConsumption - finalMetrics.fuelConsumption) / advancedRoute.estimatedFuelConsumption * 100),
        timeSavings: Math.max(0, (advancedRoute.estimatedTime - finalMetrics.estimatedTime) / advancedRoute.estimatedTime * 100),
        coverageEfficiency: finalMetrics.coverageEfficiency
      }
    }
  }

  /**
   * Extract streets assigned to a specific vehicle from schedule
   */
  private getStreetsForVehicle(schedule: DynamicSchedule, vehicle: CleaningVehicle): Street[] {
    const vehicleStreets: Street[] = []

    for (const block of schedule.blocks) {
      if (block.assignedVehicle?.id === vehicle.id) {
        vehicleStreets.push(...block.streets)
      }
    }

    return vehicleStreets
  }

  /**
   * Calculate route metrics for segments
   */
  private calculateRouteMetrics(
    segments: any[],
    vehicle: CleaningVehicle
  ): {
    totalDistance: number
    estimatedTime: number
    fuelConsumption: number
    turnarounds: number
    overlappingCoverage: number
    coverageEfficiency: number
  } {
    let totalDistance = 0
    let estimatedTime = 0
    let fuelConsumption = 0
    let turnarounds = 0

    // Calculate totals
    for (const segment of segments) {
      totalDistance += this.calculateSegmentDistance(segment.path)
      estimatedTime += segment.estimatedTime || 30 // Default 30 minutes
      fuelConsumption += segment.fuelCost || 2 // Default 2L
    }

    // Count turnarounds (simplified)
    turnarounds = Math.max(0, segments.length - 1) * 0.7 // Estimate

    // Calculate coverage efficiency
    const coverageEfficiency = Math.max(80, 100 - (turnarounds / segments.length * 20))

    return {
      totalDistance,
      estimatedTime,
      fuelConsumption,
      turnarounds,
      overlappingCoverage: 0, // Simplified
      coverageEfficiency
    }
  }

  /**
   * Calculate distance for a segment path
   */
  private calculateSegmentDistance(path: [number, number][]): number {
    let distance = 0
    for (let i = 1; i < path.length; i++) {
      distance += this.calculateDistance(path[i - 1], path[i])
    }
    return distance
  }

  /**
   * Calculate distance between two points
   */
  private calculateDistance(point1: [number, number], point2: [number, number]): number {
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
   * Calculate comprehensive performance metrics
   */
  private calculatePerformanceMetrics(
    optimizedRoutes: OptimizedCleaningRoute[],
    originalStreets: Street[],
    vehicles: CleaningVehicle[]
  ): CleaningPerformanceMetrics {
    // Calculate baseline metrics (naive approach)
    const baselineMetrics = this.calculateBaselineMetrics(originalStreets, vehicles)
    
    // Calculate optimized metrics
    const optimizedMetrics = {
      totalFuel: optimizedRoutes.reduce((sum, route) => sum + route.estimatedFuelConsumption, 0),
      totalTime: optimizedRoutes.reduce((sum, route) => sum + route.estimatedTime, 0),
      totalDistance: optimizedRoutes.reduce((sum, route) => sum + route.totalDistance, 0),
      turnarounds: optimizedRoutes.reduce((sum, route) => sum + route.turnarounds, 0),
      overlap: optimizedRoutes.reduce((sum, route) => sum + route.overlappingCoverage, 0)
    }

    // Calculate improvements
    const fuelSavings = Math.max(0, baselineMetrics.totalFuel - optimizedMetrics.totalFuel)
    const timeSavings = Math.max(0, baselineMetrics.totalTime - optimizedMetrics.totalTime)
    
    const fuelEfficiencyImprovement = baselineMetrics.totalFuel > 0 ? 
      (fuelSavings / baselineMetrics.totalFuel) * 100 : 0
    
    const timeEfficiencyImprovement = baselineMetrics.totalTime > 0 ? 
      (timeSavings / baselineMetrics.totalTime) * 100 : 0

    const coverageEfficiency = optimizedRoutes.length > 0 ?
      optimizedRoutes.reduce((sum, route) => sum + route.efficiency.coverageEfficiency, 0) / optimizedRoutes.length : 0

    const turnaroundReduction = baselineMetrics.turnarounds > 0 ?
      Math.max(0, (baselineMetrics.turnarounds - optimizedMetrics.turnarounds) / baselineMetrics.turnarounds) * 100 : 0

    // Estimate cost savings (assuming 1.5€ per liter of fuel)
    const costSavings = fuelSavings * 1.5

    return {
      totalFuelSavings: fuelSavings,
      totalTimeSavings: timeSavings,
      fuelEfficiencyImprovement,
      timeEfficiencyImprovement,
      coverageEfficiency,
      turnaroundReduction,
      overlapReduction: Math.max(0, baselineMetrics.overlap - optimizedMetrics.overlap),
      costSavings
    }
  }

  /**
   * Calculate baseline metrics for comparison
   */
  private calculateBaselineMetrics(streets: Street[], vehicles: CleaningVehicle[]) {
    // Naive approach: each vehicle cleans streets sequentially without optimization
    const avgVehicleFuelEfficiency = vehicles.reduce((sum, v) => sum + v.fuelEfficiency, 0) / vehicles.length || 10
    
    const totalDistance = streets.reduce((sum, street) => sum + street.length, 0)
    const totalFuel = (totalDistance / 1000) / avgVehicleFuelEfficiency * 1.5 // 1.5x for cleaning equipment
    const totalTime = streets.length * 45 // 45 minutes per street
    const turnarounds = Math.max(0, streets.length - 1) // One turn between each street
    const overlap = totalDistance * 0.15 // Assume 15% overlap in naive approach

    return {
      totalFuel,
      totalTime,
      totalDistance,
      turnarounds,
      overlap
    }
  }

  /**
   * Generate optimization recommendations
   */
  private generateOptimizationRecommendations(
    routes: OptimizedCleaningRoute[],
    schedule: DynamicSchedule,
    metrics: CleaningPerformanceMetrics,
    options: CleaningOptimizationOptions
  ): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = []

    // Fuel efficiency recommendations
    if (metrics.fuelEfficiencyImprovement < 15) {
      recommendations.push({
        type: 'fuel',
        priority: 'high',
        description: 'Enable advanced fuel optimization settings and speed variation control',
        estimatedImpact: 12,
        implementationCost: 'low',
        timeToImplement: '1 day'
      })
    }

    // Time efficiency recommendations
    if (metrics.timeEfficiencyImprovement < 10) {
      recommendations.push({
        type: 'time',
        priority: 'medium',
        description: 'Consider using maximum optimization level with TSP solver',
        estimatedImpact: 15,
        implementationCost: 'medium',
        timeToImplement: '1 week'
      })
    }

    // Coverage efficiency recommendations
    if (metrics.coverageEfficiency < 85) {
      recommendations.push({
        type: 'coverage',
        priority: 'high',
        description: 'Implement overlap prevention and systematic cleaning patterns',
        estimatedImpact: 20,
        implementationCost: 'medium',
        timeToImplement: '3 days'
      })
    }

    // Scheduling recommendations
    if (schedule.constraintViolations.length > 0) {
      recommendations.push({
        type: 'scheduling',
        priority: 'high',
        description: 'Resolve scheduling constraint violations and optimize time windows',
        estimatedImpact: 10,
        implementationCost: 'low',
        timeToImplement: '1 day'
      })
    }

    // Equipment recommendations
    if (!options.fuelOptimization.optimizeEquipmentSettings) {
      recommendations.push({
        type: 'equipment',
        priority: 'medium',
        description: 'Enable equipment setting optimization for different street conditions',
        estimatedImpact: 8,
        implementationCost: 'low',
        timeToImplement: '2 days'
      })
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
  }

  /**
   * Convert cleaning routes to existing VehicleRouteSegment format
   */
  convertToVehicleRouteSegments(routes: OptimizedCleaningRoute[]): VehicleRouteSegment[] {
    const segments: VehicleRouteSegment[] = []

    for (const route of routes) {
      for (const street of route.streets) {
        segments.push({
          vehicleId: route.vehicleId,
          path: street.path,
          timestamp: new Date(),
          // Add other required fields as needed
        })
      }
    }

    return segments
  }

  /**
   * Integration with existing route optimization
   */
  async integrateWithExistingOptimization(
    cleaningRoutes: OptimizedCleaningRoute[],
    options: { maxWaypoints?: number; minDistance?: number } = {}
  ): Promise<VehicleRouteSegment[]> {
    const vehicleSegments = this.convertToVehicleRouteSegments(cleaningRoutes)
    
    // Apply existing route optimization for road-following
    const optimizedSegments: VehicleRouteSegment[] = []
    
    for (const segment of vehicleSegments) {
      try {
        const optimizedPath = await optimizeRoutePath(segment.path, {
          maxWaypoints: options.maxWaypoints || 25,
          minDistance: options.minDistance || 100
        })

        optimizedSegments.push({
          ...segment,
          path: optimizedPath
        })
      } catch (error) {
        console.warn('Failed to optimize segment path, using original:', error)
        optimizedSegments.push(segment)
      }
    }

    return optimizedSegments
  }
}

/**
 * Factory function for easy integration
 */
export function createCleaningRouteOptimizer(): CleaningRouteIntegrator {
  return new CleaningRouteIntegrator()
}

/**
 * Utility function to create sample cleaning data for testing
 */
export function createSampleCleaningData(): {
  area: CleaningArea
  vehicles: CleaningVehicle[]
  constraints: SchedulingConstraint[]
} {
  const sampleStreets: Street[] = [
    {
      id: 'street_1',
      name: 'Main Street',
      path: [[28.97, 41.01], [28.98, 41.01], [28.99, 41.01]],
      length: 1000,
      priority: 'high',
      cleanliness: 'dirty',
      width: 12,
      trafficLevel: 'high',
      surfaceType: 'asphalt',
      slope: 2
    },
    {
      id: 'street_2',
      name: 'Side Street',
      path: [[28.97, 41.005], [28.98, 41.005], [28.99, 41.005]],
      length: 500,
      priority: 'medium',
      cleanliness: 'moderate',
      width: 8,
      trafficLevel: 'medium',
      surfaceType: 'concrete',
      slope: 0
    }
  ]

  const sampleVehicles: CleaningVehicle[] = [
    {
      id: 'vehicle_1',
      type: 'combo',
      cleaningWidth: 2.5,
      fuelEfficiency: 12,
      turnRadius: 8,
      maxSpeed: 25,
      capacity: 5000,
      currentLocation: [28.975, 41.008]
    }
  ]

  const sampleConstraints: SchedulingConstraint[] = [
    {
      type: 'time_window',
      severity: 'high_penalty',
      startTime: new Date('2024-01-01T07:00:00'),
      endTime: new Date('2024-01-01T09:00:00'),
      description: 'Morning traffic hours',
      penaltyMultiplier: 1.5
    }
  ]

  return {
    area: {
      id: 'area_1',
      name: 'Downtown Area',
      bounds: [[28.96, 41.0], [29.0, 41.02]],
      streets: sampleStreets,
      restrictions: []
    },
    vehicles: sampleVehicles,
    constraints: sampleConstraints
  }
}