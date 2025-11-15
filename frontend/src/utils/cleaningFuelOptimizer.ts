/**
 * Specialized Fuel Optimization for Street Cleaning Vehicles
 * Advanced fuel consumption models and optimization strategies for cleaning operations
 */

import type { Street, CleaningVehicle, OptimizedStreetSegment } from './streetCleaningOptimizer'

export interface CleaningFuelModel {
  vehicleId: string
  baseConsumption: number // L/km without cleaning equipment
  cleaningEquipmentOverhead: number // Additional L/km when cleaning
  surfaceFactors: Record<string, number>
  cleanlinessFactors: Record<string, number>
  speedEfficiencyCurve: SpeedEfficiencyPoint[]
  turnPenalty: number // Extra fuel per turn
  idlingRate: number // L/hour when idling
  predictedAccuracy: number // Model accuracy percentage
}

export interface SpeedEfficiencyPoint {
  speed: number // km/h
  efficiency: number // km/L
}

export interface FuelOptimizationStrategy {
  name: string
  description: string
  estimatedSavings: number // Percentage
  implementation: 'speed_control' | 'route_modification' | 'equipment_adjustment' | 'timing_optimization'
  applicableVehicleTypes: string[]
}

export interface OptimizedFuelRoute {
  segments: OptimizedStreetSegment[]
  totalFuelCost: number
  fuelSavings: number
  strategies: FuelOptimizationStrategy[]
  speedRecommendations: SpeedRecommendation[]
  equipmentSettings: EquipmentSetting[]
}

export interface SpeedRecommendation {
  segmentId: string
  recommendedSpeed: number
  reasonCode: 'fuel_efficiency' | 'cleaning_effectiveness' | 'traffic_conditions'
  estimatedSavings: number
}

export interface EquipmentSetting {
  vehicleId: string
  setting: 'vacuum_power' | 'brush_speed' | 'water_pressure'
  value: number
  streetConditions: string[]
}

/**
 * Advanced Fuel Optimizer for Cleaning Operations
 */
export class CleaningFuelOptimizer {
  private fuelModels: Map<string, CleaningFuelModel> = new Map()
  private readonly EQUIPMENT_OVERHEAD = {
    sweeper: 0.8,  // Additional L/km for sweeping
    washer: 1.2,   // Additional L/km for washing
    combo: 1.5     // Additional L/km for combined operations
  }

  private readonly OPTIMAL_CLEANING_SPEEDS = {
    very_dirty: { min: 3, max: 8, optimal: 5 },
    dirty: { min: 5, max: 12, optimal: 8 },
    moderate: { min: 8, max: 15, optimal: 12 },
    clean: { min: 10, max: 18, optimal: 15 },
    very_clean: { min: 12, max: 20, optimal: 18 }
  }

  constructor() {
    this.initializeDefaultModels()
  }

  /**
   * Optimize fuel consumption for cleaning route
   */
  optimizeFuelConsumption(
    segments: OptimizedStreetSegment[],
    vehicles: CleaningVehicle[],
    options: {
      prioritizeEfficiency: boolean
      allowSpeedVariation: boolean
      optimizeEquipmentSettings: boolean
      considerTrafficPatterns: boolean
    }
  ): OptimizedFuelRoute[] {
    const optimizedRoutes: OptimizedFuelRoute[] = []

    for (const vehicle of vehicles) {
      const vehicleSegments = segments.filter(s => 
        this.isVehicleSuitableForSegments([s], vehicle)
      )

      if (vehicleSegments.length === 0) continue

      const fuelModel = this.getFuelModel(vehicle)
      const optimizedRoute = this.optimizeVehicleRoute(
        vehicleSegments,
        vehicle,
        fuelModel,
        options
      )

      optimizedRoutes.push(optimizedRoute)
    }

    return optimizedRoutes
  }

  /**
   * Initialize default fuel models for different vehicle types
   */
  private initializeDefaultModels(): void {
    // Sweeper model
    this.fuelModels.set('sweeper', {
      vehicleId: 'default_sweeper',
      baseConsumption: 0.15, // L/km
      cleaningEquipmentOverhead: this.EQUIPMENT_OVERHEAD.sweeper,
      surfaceFactors: {
        asphalt: 1.0,
        concrete: 1.1,
        cobblestone: 1.3
      },
      cleanlinessFactors: {
        very_dirty: 1.5,
        dirty: 1.3,
        moderate: 1.1,
        clean: 1.0,
        very_clean: 0.9
      },
      speedEfficiencyCurve: [
        { speed: 5, efficiency: 8 },
        { speed: 10, efficiency: 12 },
        { speed: 15, efficiency: 15 },
        { speed: 20, efficiency: 13 },
        { speed: 25, efficiency: 10 }
      ],
      turnPenalty: 0.02,
      idlingRate: 1.5,
      predictedAccuracy: 0.88
    })

    // Washer model
    this.fuelModels.set('washer', {
      vehicleId: 'default_washer',
      baseConsumption: 0.18,
      cleaningEquipmentOverhead: this.EQUIPMENT_OVERHEAD.washer,
      surfaceFactors: {
        asphalt: 1.0,
        concrete: 1.05,
        cobblestone: 1.2
      },
      cleanlinessFactors: {
        very_dirty: 1.6,
        dirty: 1.4,
        moderate: 1.2,
        clean: 1.0,
        very_clean: 0.95
      },
      speedEfficiencyCurve: [
        { speed: 3, efficiency: 6 },
        { speed: 8, efficiency: 10 },
        { speed: 12, efficiency: 13 },
        { speed: 18, efficiency: 11 },
        { speed: 22, efficiency: 8 }
      ],
      turnPenalty: 0.03,
      idlingRate: 2.0,
      predictedAccuracy: 0.85
    })

    // Combo model
    this.fuelModels.set('combo', {
      vehicleId: 'default_combo',
      baseConsumption: 0.22,
      cleaningEquipmentOverhead: this.EQUIPMENT_OVERHEAD.combo,
      surfaceFactors: {
        asphalt: 1.0,
        concrete: 1.08,
        cobblestone: 1.25
      },
      cleanlinessFactors: {
        very_dirty: 1.7,
        dirty: 1.45,
        moderate: 1.15,
        clean: 1.0,
        very_clean: 0.92
      },
      speedEfficiencyCurve: [
        { speed: 4, efficiency: 7 },
        { speed: 9, efficiency: 11 },
        { speed: 14, efficiency: 14 },
        { speed: 19, efficiency: 12 },
        { speed: 24, efficiency: 9 }
      ],
      turnPenalty: 0.04,
      idlingRate: 2.5,
      predictedAccuracy: 0.90
    })
  }

  /**
   * Get fuel model for a specific vehicle
   */
  private getFuelModel(vehicle: CleaningVehicle): CleaningFuelModel {
    // Try to get specific model for this vehicle
    let model = this.fuelModels.get(vehicle.id)
    
    if (!model) {
      // Fall back to default model for vehicle type
      model = this.fuelModels.get(vehicle.type)
    }

    if (!model) {
      // Fall back to combo model as default
      model = this.fuelModels.get('combo')!
    }

    return model
  }

  /**
   * Optimize fuel consumption for a single vehicle route
   */
  private optimizeVehicleRoute(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    fuelModel: CleaningFuelModel,
    options: {
      prioritizeEfficiency: boolean
      allowSpeedVariation: boolean
      optimizeEquipmentSettings: boolean
      considerTrafficPatterns: boolean
    }
  ): OptimizedFuelRoute {
    let optimizedSegments = [...segments]
    const strategies: FuelOptimizationStrategy[] = []
    const speedRecommendations: SpeedRecommendation[] = []
    const equipmentSettings: EquipmentSetting[] = []

    // Calculate baseline fuel consumption
    const baselineFuel = this.calculateTotalFuelCost(segments, vehicle, fuelModel)

    // Strategy 1: Speed optimization
    if (options.allowSpeedVariation) {
      const speedResult = this.optimizeCleaningSpeeds(
        optimizedSegments,
        vehicle,
        fuelModel,
        options.considerTrafficPatterns
      )
      optimizedSegments = speedResult.segments
      speedRecommendations.push(...speedResult.recommendations)
      strategies.push({
        name: 'Speed Optimization',
        description: 'Adjust cleaning speeds for optimal fuel efficiency',
        estimatedSavings: speedResult.savings,
        implementation: 'speed_control',
        applicableVehicleTypes: [vehicle.type]
      })
    }

    // Strategy 2: Equipment optimization
    if (options.optimizeEquipmentSettings) {
      const equipmentResult = this.optimizeEquipmentSettings(
        optimizedSegments,
        vehicle,
        fuelModel
      )
      equipmentSettings.push(...equipmentResult.settings)
      strategies.push({
        name: 'Equipment Optimization',
        description: 'Adjust cleaning equipment for street conditions',
        estimatedSavings: equipmentResult.savings,
        implementation: 'equipment_adjustment',
        applicableVehicleTypes: [vehicle.type]
      })
    }

    // Strategy 3: Route micro-optimizations
    if (options.prioritizeEfficiency) {
      const routeResult = this.optimizeRouteForFuelEfficiency(
        optimizedSegments,
        vehicle,
        fuelModel
      )
      optimizedSegments = routeResult.segments
      strategies.push({
        name: 'Route Fuel Optimization',
        description: 'Minor route adjustments for better fuel efficiency',
        estimatedSavings: routeResult.savings,
        implementation: 'route_modification',
        applicableVehicleTypes: [vehicle.type]
      })
    }

    // Calculate optimized fuel consumption
    const optimizedFuel = this.calculateTotalFuelCost(optimizedSegments, vehicle, fuelModel)
    const fuelSavings = ((baselineFuel - optimizedFuel) / baselineFuel) * 100

    return {
      segments: optimizedSegments,
      totalFuelCost: optimizedFuel,
      fuelSavings,
      strategies,
      speedRecommendations,
      equipmentSettings
    }
  }

  /**
   * Calculate total fuel cost for segments
   */
  private calculateTotalFuelCost(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    fuelModel: CleaningFuelModel
  ): number {
    let totalFuel = 0

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      const street = this.getStreetFromSegment(segment)
      
      // Cleaning fuel cost
      const cleaningFuel = this.calculateSegmentFuelCost(street, vehicle, fuelModel)
      totalFuel += cleaningFuel

      // Travel fuel cost to next segment
      if (i < segments.length - 1) {
        const travelFuel = this.calculateTravelFuelCost(
          segment,
          segments[i + 1],
          vehicle,
          fuelModel
        )
        totalFuel += travelFuel
      }
    }

    return totalFuel
  }

  /**
   * Get street object from segment (simplified)
   */
  private getStreetFromSegment(segment: OptimizedStreetSegment): Street {
    // In a real implementation, this would fetch from a data store
    return {
      id: segment.streetId,
      name: `Street ${segment.streetId}`,
      path: segment.path,
      length: this.calculatePathLength(segment.path),
      priority: segment.priority,
      cleanliness: 'moderate', // Default value
      width: 8,
      trafficLevel: 'medium',
      surfaceType: 'asphalt',
      slope: 0
    }
  }

  /**
   * Calculate path length from coordinates
   */
  private calculatePathLength(path: [number, number][]): number {
    let length = 0
    for (let i = 1; i < path.length; i++) {
      length += this.calculateDistance(path[i - 1], path[i])
    }
    return length
  }

  /**
   * Calculate distance between two points (Haversine formula)
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
   * Calculate fuel cost for cleaning a street segment
   */
  private calculateSegmentFuelCost(
    street: Street,
    vehicle: CleaningVehicle,
    model: CleaningFuelModel
  ): number {
    const distance = street.length / 1000 // Convert to km

    // Base consumption including equipment overhead
    const baseRate = model.baseConsumption + model.cleaningEquipmentOverhead

    // Apply surface factor
    const surfaceFactor = model.surfaceFactors[street.surfaceType] || 1.0

    // Apply cleanliness factor
    const cleanlinessFactor = model.cleanlinessFactors[street.cleanliness] || 1.0

    // Apply speed efficiency
    const optimalSpeed = this.getOptimalSpeedForStreet(street)
    const speedEfficiency = this.getSpeedEfficiency(optimalSpeed, model.speedEfficiencyCurve)

    const fuelCost = distance * (baseRate / speedEfficiency) * surfaceFactor * cleanlinessFactor

    return Math.max(fuelCost, 0.01) // Minimum fuel cost
  }

  /**
   * Calculate travel fuel cost between segments
   */
  private calculateTravelFuelCost(
    fromSegment: OptimizedStreetSegment,
    toSegment: OptimizedStreetSegment,
    vehicle: CleaningVehicle,
    model: CleaningFuelModel
  ): number {
    const fromEnd = fromSegment.path[fromSegment.path.length - 1]
    const toStart = toSegment.path[0]
    const distance = this.calculateDistance(fromEnd, toStart) / 1000 // Convert to km

    // Travel at higher speed without cleaning equipment
    const travelFuel = distance * model.baseConsumption

    // Add turn penalty if significant direction change
    const turnAngle = this.calculateTurnAngle(fromSegment, toSegment)
    const turnPenalty = turnAngle > 45 ? model.turnPenalty : 0

    return travelFuel + turnPenalty
  }

  /**
   * Calculate turn angle between segments
   */
  private calculateTurnAngle(
    segment1: OptimizedStreetSegment,
    segment2: OptimizedStreetSegment
  ): number {
    if (segment1.path.length < 2 || segment2.path.length < 2) return 0

    const end1 = segment1.path[segment1.path.length - 1]
    const beforeEnd1 = segment1.path[segment1.path.length - 2]
    const start2 = segment2.path[0]
    const afterStart2 = segment2.path[1]

    const bearing1 = this.calculateBearing(beforeEnd1, end1)
    const bearing2 = this.calculateBearing(start2, afterStart2)

    const angle = Math.abs(bearing1 - bearing2)
    return angle > 180 ? 360 - angle : angle
  }

  /**
   * Calculate bearing between two points
   */
  private calculateBearing(point1: [number, number], point2: [number, number]): number {
    const lat1 = (point1[1] * Math.PI) / 180
    const lat2 = (point2[1] * Math.PI) / 180
    const deltaLon = ((point2[0] - point1[0]) * Math.PI) / 180

    const y = Math.sin(deltaLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)

    const bearing = (Math.atan2(y, x) * 180) / Math.PI
    return (bearing + 360) % 360
  }

  /**
   * Get optimal cleaning speed for a street
   */
  private getOptimalSpeedForStreet(street: Street): number {
    const speedRange = this.OPTIMAL_CLEANING_SPEEDS[street.cleanliness] || 
                       this.OPTIMAL_CLEANING_SPEEDS.moderate

    let optimalSpeed = speedRange.optimal

    // Adjust for traffic conditions
    if (street.trafficLevel === 'high') {
      optimalSpeed = Math.min(optimalSpeed, speedRange.min + 2)
    } else if (street.trafficLevel === 'low') {
      optimalSpeed = Math.min(optimalSpeed + 3, speedRange.max)
    }

    // Adjust for surface type
    if (street.surfaceType === 'cobblestone') {
      optimalSpeed = Math.min(optimalSpeed, speedRange.min + 1)
    }

    return optimalSpeed
  }

  /**
   * Get speed efficiency from curve
   */
  private getSpeedEfficiency(speed: number, curve: SpeedEfficiencyPoint[]): number {
    if (curve.length === 0) return 10 // Default efficiency

    // Find closest points on curve
    if (speed <= curve[0].speed) return curve[0].efficiency
    if (speed >= curve[curve.length - 1].speed) return curve[curve.length - 1].efficiency

    // Linear interpolation between points
    for (let i = 0; i < curve.length - 1; i++) {
      if (speed >= curve[i].speed && speed <= curve[i + 1].speed) {
        const ratio = (speed - curve[i].speed) / (curve[i + 1].speed - curve[i].speed)
        return curve[i].efficiency + ratio * (curve[i + 1].efficiency - curve[i].efficiency)
      }
    }

    return curve[Math.floor(curve.length / 2)].efficiency // Fallback to middle value
  }

  /**
   * Optimize cleaning speeds for segments
   */
  private optimizeCleaningSpeeds(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    model: CleaningFuelModel,
    considerTraffic: boolean
  ): {
    segments: OptimizedStreetSegment[]
    recommendations: SpeedRecommendation[]
    savings: number
  } {
    const recommendations: SpeedRecommendation[] = []
    let totalSavings = 0

    for (const segment of segments) {
      const street = this.getStreetFromSegment(segment)
      const currentSpeed = this.getOptimalSpeedForStreet(street)
      
      // Find the most fuel-efficient speed for this segment
      const optimalSpeed = this.findOptimalSpeedForFuelEfficiency(
        street,
        vehicle,
        model,
        considerTraffic
      )

      if (Math.abs(optimalSpeed - currentSpeed) > 2) { // Significant difference
        recommendations.push({
          segmentId: segment.streetId,
          recommendedSpeed: optimalSpeed,
          reasonCode: 'fuel_efficiency',
          estimatedSavings: this.calculateSpeedSavings(currentSpeed, optimalSpeed, model)
        })

        totalSavings += this.calculateSpeedSavings(currentSpeed, optimalSpeed, model)
      }
    }

    return {
      segments,
      recommendations,
      savings: totalSavings / segments.length // Average savings per segment
    }
  }

  /**
   * Find optimal speed for fuel efficiency
   */
  private findOptimalSpeedForFuelEfficiency(
    street: Street,
    vehicle: CleaningVehicle,
    model: CleaningFuelModel,
    considerTraffic: boolean
  ): number {
    const speedRange = this.OPTIMAL_CLEANING_SPEEDS[street.cleanliness]
    let bestSpeed = speedRange.optimal
    let bestEfficiency = this.getSpeedEfficiency(bestSpeed, model.speedEfficiencyCurve)

    // Test speeds in the valid range
    for (let speed = speedRange.min; speed <= speedRange.max; speed += 1) {
      const efficiency = this.getSpeedEfficiency(speed, model.speedEfficiencyCurve)
      
      // Adjust for cleaning effectiveness (slower speeds clean better)
      const cleaningFactor = this.getCleaningEffectiveness(speed, street.cleanliness)
      const adjustedEfficiency = efficiency * cleaningFactor

      if (adjustedEfficiency > bestEfficiency) {
        bestSpeed = speed
        bestEfficiency = adjustedEfficiency
      }
    }

    // Apply traffic constraints
    if (considerTraffic && street.trafficLevel === 'high') {
      bestSpeed = Math.min(bestSpeed, speedRange.min + 3)
    }

    return bestSpeed
  }

  /**
   * Get cleaning effectiveness for a given speed
   */
  private getCleaningEffectiveness(speed: number, cleanliness: string): number {
    // Slower speeds are more effective for cleaning
    const baseEffectiveness = Math.max(0.5, (25 - speed) / 25)
    
    // Dirtier streets need slower speeds for effective cleaning
    const cleanlinessFactors = {
      very_dirty: 0.7,  // Needs slow speeds
      dirty: 0.8,
      moderate: 0.9,
      clean: 1.0,
      very_clean: 1.1   // Can clean faster
    }

    return baseEffectiveness * (cleanlinessFactors[cleanliness as keyof typeof cleanlinessFactors] || 1.0)
  }

  /**
   * Calculate fuel savings from speed optimization
   */
  private calculateSpeedSavings(
    currentSpeed: number,
    optimalSpeed: number,
    model: CleaningFuelModel
  ): number {
    const currentEfficiency = this.getSpeedEfficiency(currentSpeed, model.speedEfficiencyCurve)
    const optimalEfficiency = this.getSpeedEfficiency(optimalSpeed, model.speedEfficiencyCurve)
    
    return ((optimalEfficiency - currentEfficiency) / currentEfficiency) * 100
  }

  /**
   * Optimize equipment settings for different street conditions
   */
  private optimizeEquipmentSettings(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    model: CleaningFuelModel
  ): {
    settings: EquipmentSetting[]
    savings: number
  } {
    const settings: EquipmentSetting[] = []
    let totalSavings = 0

    // Group segments by similar street conditions
    const conditionGroups = this.groupSegmentsByConditions(segments)

    for (const [conditions, groupSegments] of conditionGroups) {
      const optimizedSettings = this.getOptimalEquipmentSettings(
        conditions,
        vehicle,
        model
      )

      settings.push(...optimizedSettings)
      totalSavings += this.calculateEquipmentSavings(optimizedSettings)
    }

    return {
      settings,
      savings: totalSavings / conditionGroups.size
    }
  }

  /**
   * Group segments by similar street conditions
   */
  private groupSegmentsByConditions(
    segments: OptimizedStreetSegment[]
  ): Map<string, OptimizedStreetSegment[]> {
    const groups = new Map<string, OptimizedStreetSegment[]>()

    for (const segment of segments) {
      const street = this.getStreetFromSegment(segment)
      const conditionKey = `${street.surfaceType}_${street.cleanliness}_${street.trafficLevel}`
      
      if (!groups.has(conditionKey)) {
        groups.set(conditionKey, [])
      }
      groups.get(conditionKey)!.push(segment)
    }

    return groups
  }

  /**
   * Get optimal equipment settings for street conditions
   */
  private getOptimalEquipmentSettings(
    conditions: string,
    vehicle: CleaningVehicle,
    model: CleaningFuelModel
  ): EquipmentSetting[] {
    const [surfaceType, cleanliness, trafficLevel] = conditions.split('_')
    const settings: EquipmentSetting[] = []

    // Vacuum power settings (for sweepers and combo vehicles)
    if (vehicle.type === 'sweeper' || vehicle.type === 'combo') {
      let vacuumPower = 50 // Default 50%

      if (cleanliness === 'very_dirty') vacuumPower = 85
      else if (cleanliness === 'dirty') vacuumPower = 70
      else if (cleanliness === 'clean' || cleanliness === 'very_clean') vacuumPower = 35

      settings.push({
        vehicleId: vehicle.id,
        setting: 'vacuum_power',
        value: vacuumPower,
        streetConditions: [conditions]
      })
    }

    // Water pressure settings (for washers and combo vehicles)
    if (vehicle.type === 'washer' || vehicle.type === 'combo') {
      let waterPressure = 60 // Default 60%

      if (surfaceType === 'cobblestone') waterPressure = 45
      else if (cleanliness === 'very_dirty') waterPressure = 80
      else if (cleanliness === 'clean' || cleanliness === 'very_clean') waterPressure = 40

      settings.push({
        vehicleId: vehicle.id,
        setting: 'water_pressure',
        value: waterPressure,
        streetConditions: [conditions]
      })
    }

    // Brush speed settings (for all vehicle types)
    let brushSpeed = 100 // Default 100%

    if (surfaceType === 'cobblestone') brushSpeed = 80
    else if (trafficLevel === 'high') brushSpeed = 120 // Faster cleaning

    settings.push({
      vehicleId: vehicle.id,
      setting: 'brush_speed',
      value: brushSpeed,
      streetConditions: [conditions]
    })

    return settings
  }

  /**
   * Calculate equipment optimization savings
   */
  private calculateEquipmentSavings(settings: EquipmentSetting[]): number {
    // Simplified calculation - in reality would be based on empirical data
    let savings = 0

    for (const setting of settings) {
      if (setting.setting === 'vacuum_power' && setting.value < 50) {
        savings += 8 // 8% savings from reduced vacuum power
      } else if (setting.setting === 'water_pressure' && setting.value < 60) {
        savings += 12 // 12% savings from reduced water pressure
      } else if (setting.setting === 'brush_speed' && setting.value < 100) {
        savings += 5 // 5% savings from reduced brush speed
      }
    }

    return Math.min(savings, 25) // Cap at 25% savings
  }

  /**
   * Optimize route for fuel efficiency
   */
  private optimizeRouteForFuelEfficiency(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    model: CleaningFuelModel
  ): {
    segments: OptimizedStreetSegment[]
    savings: number
  } {
    // Micro-optimizations: prefer downhill segments, minimize sharp turns
    let optimizedSegments = [...segments]
    let savings = 0

    // Sort segments to minimize fuel-consuming maneuvers
    optimizedSegments = this.reorderForFuelEfficiency(optimizedSegments, vehicle, model)
    savings += 3 // Estimated 3% savings from reordering

    return {
      segments: optimizedSegments,
      savings
    }
  }

  /**
   * Reorder segments for better fuel efficiency
   */
  private reorderForFuelEfficiency(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    model: CleaningFuelModel
  ): OptimizedStreetSegment[] {
    // Simple greedy approach: minimize travel distances between segments
    if (segments.length <= 2) return segments

    const optimized = [segments[0]]
    const remaining = segments.slice(1)

    while (remaining.length > 0) {
      const lastSegment = optimized[optimized.length - 1]
      let bestIndex = 0
      let bestScore = this.calculateConnectionScore(lastSegment, remaining[0], model)

      for (let i = 1; i < remaining.length; i++) {
        const score = this.calculateConnectionScore(lastSegment, remaining[i], model)
        if (score < bestScore) {
          bestScore = score
          bestIndex = i
        }
      }

      optimized.push(remaining[bestIndex])
      remaining.splice(bestIndex, 1)
    }

    return optimized.map((segment, index) => ({
      ...segment,
      sequence: index + 1
    }))
  }

  /**
   * Calculate fuel efficiency score for connecting two segments
   */
  private calculateConnectionScore(
    segment1: OptimizedStreetSegment,
    segment2: OptimizedStreetSegment,
    model: CleaningFuelModel
  ): number {
    const end1 = segment1.path[segment1.path.length - 1]
    const start2 = segment2.path[0]
    
    // Distance component (shorter is better)
    const distance = this.calculateDistance(end1, start2)
    
    // Turn penalty component
    const turnAngle = this.calculateTurnAngle(segment1, segment2)
    const turnPenalty = turnAngle > 90 ? model.turnPenalty * 10 : 0
    
    return distance / 1000 + turnPenalty // Combine distance and turn penalty
  }

  /**
   * Check if vehicle is suitable for segments
   */
  private isVehicleSuitableForSegments(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle
  ): boolean {
    // Basic suitability check
    return segments.length > 0 && vehicle.cleaningWidth > 0
  }
}