/**
 * Street Cleaning Route Optimization System
 * Specialized algorithms for minimizing fuel consumption and time waste in street cleaning operations
 */

import { calculateDistance, calculateBearing } from './routeOptimization'

// Types for street cleaning optimization
export interface Street {
  id: string
  name: string
  path: [number, number][] // GPS coordinates defining the street
  length: number // in meters
  priority: CleaningPriority
  lastCleaned?: Date
  cleanliness: CleanlinessLevel
  width: number // street width in meters
  trafficLevel: 'low' | 'medium' | 'high'
  surfaceType: 'asphalt' | 'concrete' | 'cobblestone'
  slope: number // slope percentage
}

export interface CleaningVehicle {
  id: string
  type: 'sweeper' | 'washer' | 'combo'
  cleaningWidth: number // cleaning width in meters
  fuelEfficiency: number // km per liter
  turnRadius: number // minimum turn radius in meters
  maxSpeed: number // max cleaning speed in km/h
  capacity: number // waste/water capacity
  currentLocation: [number, number]
}

export interface CleaningArea {
  id: string
  name: string
  bounds: [[number, number], [number, number]] // [southwest, northeast]
  streets: Street[]
  restrictions: CleaningRestriction[]
}

export type CleaningPriority = 'critical' | 'high' | 'medium' | 'low'
export type CleanlinessLevel = 'very_dirty' | 'dirty' | 'moderate' | 'clean' | 'very_clean'
export type CleaningPattern = 'spiral' | 'grid' | 'back_forth' | 'perimeter_first' | 'optimal'

export interface CleaningRestriction {
  type: 'time_window' | 'no_parking' | 'traffic_peak' | 'event'
  timeStart?: string // HH:MM format
  timeEnd?: string
  daysOfWeek?: number[] // 0=Sunday, 1=Monday, etc.
  severity: 'blocking' | 'penalty' | 'preference'
}

export interface OptimizedCleaningRoute {
  vehicleId: string
  streets: OptimizedStreetSegment[]
  totalDistance: number
  estimatedTime: number // in minutes
  estimatedFuelConsumption: number // in liters
  cleaningPattern: CleaningPattern
  efficiency: {
    fuelSavings: number // percentage
    timeSavings: number // percentage
    coverageEfficiency: number // percentage
  }
  turnarounds: number
  overlappingCoverage: number // in meters
}

export interface OptimizedStreetSegment {
  streetId: string
  sequence: number
  path: [number, number][]
  cleaningDirection: 'forward' | 'reverse' | 'both'
  estimatedTime: number // minutes
  fuelCost: number // liters
  priority: CleaningPriority
}

/**
 * Street Cleaning Route Optimizer
 * Main class for optimizing cleaning routes with fuel and time efficiency
 */
export class StreetCleaningOptimizer {
  private fuelCostMatrix: Map<string, number> = new Map()
  private coverageTracker: Set<string> = new Set()
  
  constructor() {
    this.initializeOptimizer()
  }

  private initializeOptimizer(): void {
    // Initialize fuel cost calculations and coverage tracking
    this.fuelCostMatrix.clear()
    this.coverageTracker.clear()
  }

  /**
   * Main optimization function - generates optimal cleaning routes
   */
  async optimizeCleaningRoutes(
    area: CleaningArea,
    vehicles: CleaningVehicle[],
    options: {
      pattern?: CleaningPattern
      prioritizeByDirtiness?: boolean
      minimizeTurnarounds?: boolean
      maxRouteTime?: number // in minutes
      avoidTrafficHours?: boolean
    } = {}
  ): Promise<OptimizedCleaningRoute[]> {
    const {
      pattern = 'optimal',
      prioritizeByDirtiness = true,
      minimizeTurnarounds = true,
      maxRouteTime = 480, // 8 hours
      avoidTrafficHours = true
    } = options

    // Step 1: Preprocess streets and calculate priorities
    const processedStreets = this.preprocessStreets(area.streets, {
      prioritizeByDirtiness,
      avoidTrafficHours
    })

    // Step 2: Generate optimal routes for each vehicle
    const optimizedRoutes: OptimizedCleaningRoute[] = []

    for (const vehicle of vehicles) {
      // Filter streets suitable for this vehicle
      const suitableStreets = this.filterStreetsForVehicle(processedStreets, vehicle)
      
      if (suitableStreets.length === 0) continue

      // Generate route based on selected pattern
      const route = await this.generateOptimalRoute(
        vehicle,
        suitableStreets,
        pattern,
        { minimizeTurnarounds, maxRouteTime }
      )

      if (route) {
        optimizedRoutes.push(route)
      }
    }

    return optimizedRoutes
  }

  /**
   * Preprocess streets - calculate priorities and filter based on constraints
   */
  private preprocessStreets(
    streets: Street[],
    options: { prioritizeByDirtiness: boolean; avoidTrafficHours: boolean }
  ): Street[] {
    return streets
      .map(street => ({
        ...street,
        priority: this.calculateDynamicPriority(street, options.prioritizeByDirtiness)
      }))
      .filter(street => this.isStreetAccessible(street, options.avoidTrafficHours))
      .sort((a, b) => this.comparePriorities(a.priority, b.priority))
  }

  /**
   * Calculate dynamic priority based on multiple factors
   */
  private calculateDynamicPriority(street: Street, prioritizeByDirtiness: boolean): CleaningPriority {
    let score = 0

    // Cleanliness factor (higher priority for dirtier streets)
    const cleanlinessScores = {
      'very_dirty': 100,
      'dirty': 80,
      'moderate': 60,
      'clean': 40,
      'very_clean': 20
    }
    score += cleanlinessScores[street.cleanliness] * (prioritizeByDirtiness ? 2 : 1)

    // Time since last cleaning
    if (street.lastCleaned) {
      const daysSinceLastCleaning = (Date.now() - street.lastCleaned.getTime()) / (1000 * 60 * 60 * 24)
      score += Math.min(daysSinceLastCleaning * 5, 50)
    } else {
      score += 50 // Never cleaned
    }

    // Traffic level (higher priority for low traffic for efficiency)
    const trafficScores = { 'low': 20, 'medium': 10, 'high': 0 }
    score += trafficScores[street.trafficLevel]

    // Convert score to priority
    if (score >= 150) return 'critical'
    if (score >= 120) return 'high'
    if (score >= 80) return 'medium'
    return 'low'
  }

  /**
   * Check if street is accessible considering time and traffic restrictions
   */
  private isStreetAccessible(street: Street, avoidTrafficHours: boolean): boolean {
    const currentHour = new Date().getHours()
    
    // Avoid cleaning during traffic peak hours (7-9 AM, 5-7 PM)
    if (avoidTrafficHours && street.trafficLevel === 'high') {
      const isTrafficPeak = (currentHour >= 7 && currentHour <= 9) || 
                           (currentHour >= 17 && currentHour <= 19)
      if (isTrafficPeak) return false
    }

    return true
  }

  /**
   * Filter streets that are suitable for a specific vehicle
   */
  private filterStreetsForVehicle(streets: Street[], vehicle: CleaningVehicle): Street[] {
    return streets.filter(street => {
      // Check if vehicle can physically access the street
      const canAccess = street.width >= vehicle.cleaningWidth + 1 // 1m clearance
      
      // Check if vehicle type is suitable for street condition
      const isSuitableForSurface = this.isVehicleSuitableForSurface(vehicle, street.surfaceType)
      
      return canAccess && isSuitableForSurface
    })
  }

  private isVehicleSuitableForSurface(vehicle: CleaningVehicle, surfaceType: string): boolean {
    // Sweepers work best on smooth surfaces, washers on all surfaces
    if (vehicle.type === 'sweeper' && surfaceType === 'cobblestone') return false
    return true
  }

  /**
   * Compare cleaning priorities for sorting
   */
  private comparePriorities(a: CleaningPriority, b: CleaningPriority): number {
    const priorities = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 }
    return priorities[b] - priorities[a] // Higher priority first
  }

  /**
   * Generate optimal route for a vehicle using specified pattern
   */
  private async generateOptimalRoute(
    vehicle: CleaningVehicle,
    streets: Street[],
    pattern: CleaningPattern,
    options: { minimizeTurnarounds: boolean; maxRouteTime: number }
  ): Promise<OptimizedCleaningRoute | null> {
    let optimizedSegments: OptimizedStreetSegment[]

    switch (pattern) {
      case 'spiral':
        optimizedSegments = this.generateSpiralPattern(vehicle, streets, options)
        break
      case 'grid':
        optimizedSegments = this.generateGridPattern(vehicle, streets, options)
        break
      case 'back_forth':
        optimizedSegments = this.generateBackForthPattern(vehicle, streets, options)
        break
      case 'perimeter_first':
        optimizedSegments = this.generatePerimeterFirstPattern(vehicle, streets, options)
        break
      case 'optimal':
      default:
        optimizedSegments = await this.generateOptimalPatternTSP(vehicle, streets, options)
        break
    }

    if (optimizedSegments.length === 0) return null

    // Calculate route metrics
    const metrics = this.calculateRouteMetrics(optimizedSegments, vehicle)

    return {
      vehicleId: vehicle.id,
      streets: optimizedSegments,
      totalDistance: metrics.totalDistance,
      estimatedTime: metrics.estimatedTime,
      estimatedFuelConsumption: metrics.fuelConsumption,
      cleaningPattern: pattern,
      efficiency: metrics.efficiency,
      turnarounds: metrics.turnarounds,
      overlappingCoverage: metrics.overlappingCoverage
    }
  }

  /**
   * Generate spiral cleaning pattern - starts from outside and spirals inward
   */
  private generateSpiralPattern(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: { minimizeTurnarounds: boolean; maxRouteTime: number }
  ): OptimizedStreetSegment[] {
    // Sort streets by distance from area center to create spiral effect
    const center = this.calculateAreaCenter(streets)
    const sortedStreets = streets.sort((a, b) => {
      const distA = calculateDistance(center, a.path[0])
      const distB = calculateDistance(center, b.path[0])
      return distB - distA // Start from outside
    })

    return this.buildOptimizedSegments(vehicle, sortedStreets, options)
  }

  /**
   * Generate grid cleaning pattern - systematic grid-based coverage
   */
  private generateGridPattern(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: { minimizeTurnarounds: boolean; maxRouteTime: number }
  ): OptimizedStreetSegment[] {
    // Sort streets by coordinates to create grid pattern
    const gridStreets = streets.sort((a, b) => {
      const aLat = a.path[0][1]
      const bLat = b.path[0][1]
      if (Math.abs(aLat - bLat) < 0.0001) {
        // Same latitude, sort by longitude
        return a.path[0][0] - b.path[0][0]
      }
      return bLat - aLat // North to south
    })

    return this.buildOptimizedSegments(vehicle, gridStreets, options)
  }

  /**
   * Generate back-and-forth cleaning pattern
   */
  private generateBackForthPattern(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: { minimizeTurnarounds: boolean; maxRouteTime: number }
  ): OptimizedStreetSegment[] {
    // Group parallel streets and alternate directions
    const parallelGroups = this.groupParallelStreets(streets)
    const optimizedStreets: Street[] = []

    for (const group of parallelGroups) {
      group.forEach((street, index) => {
        // Alternate direction for back-and-forth pattern
        if (index % 2 === 1) {
          street.path = [...street.path].reverse()
        }
        optimizedStreets.push(street)
      })
    }

    return this.buildOptimizedSegments(vehicle, optimizedStreets, options)
  }

  /**
   * Generate perimeter-first cleaning pattern
   */
  private generatePerimeterFirstPattern(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: { minimizeTurnarounds: boolean; maxRouteTime: number }
  ): OptimizedStreetSegment[] {
    // Identify perimeter streets and clean them first
    const perimeterStreets = this.identifyPerimeterStreets(streets)
    const interiorStreets = streets.filter(s => !perimeterStreets.includes(s))
    
    const orderedStreets = [...perimeterStreets, ...interiorStreets]
    return this.buildOptimizedSegments(vehicle, orderedStreets, options)
  }

  /**
   * Calculate the center point of a cleaning area
   */
  private calculateAreaCenter(streets: Street[]): [number, number] {
    let totalLng = 0
    let totalLat = 0
    let pointCount = 0

    streets.forEach(street => {
      street.path.forEach(point => {
        totalLng += point[0]
        totalLat += point[1]
        pointCount++
      })
    })

    return [totalLng / pointCount, totalLat / pointCount]
  }

  /**
   * Build optimized segments with fuel and time calculations
   */
  private buildOptimizedSegments(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: { minimizeTurnarounds: boolean; maxRouteTime: number }
  ): OptimizedStreetSegment[] {
    const segments: OptimizedStreetSegment[] = []
    let currentTime = 0

    for (let i = 0; i < streets.length; i++) {
      const street = streets[i]
      const segmentTime = this.calculateSegmentTime(vehicle, street)
      
      // Check if adding this segment exceeds time limit
      if (currentTime + segmentTime > options.maxRouteTime) break

      const segment: OptimizedStreetSegment = {
        streetId: street.id,
        sequence: i + 1,
        path: street.path,
        cleaningDirection: 'forward',
        estimatedTime: segmentTime,
        fuelCost: this.calculateSegmentFuelCost(vehicle, street),
        priority: street.priority
      }

      segments.push(segment)
      currentTime += segmentTime
    }

    // Optimize turn sequence if requested
    if (options.minimizeTurnarounds) {
      return this.minimizeTurnarounds(segments, vehicle)
    }

    return segments
  }

  /**
   * Calculate cleaning time for a street segment
   */
  private calculateSegmentTime(vehicle: CleaningVehicle, street: Street): number {
    const cleaningSpeed = Math.min(vehicle.maxSpeed, this.getOptimalCleaningSpeed(street))
    const timeHours = street.length / 1000 / cleaningSpeed // Convert to hours
    return timeHours * 60 // Convert to minutes
  }

  /**
   * Get optimal cleaning speed based on street characteristics
   */
  private getOptimalCleaningSpeed(street: Street): number {
    let baseSpeed = 15 // km/h base cleaning speed

    // Adjust for surface type
    const surfaceFactors = {
      'asphalt': 1.0,
      'concrete': 0.9,
      'cobblestone': 0.7
    }
    baseSpeed *= surfaceFactors[street.surfaceType] || 1.0

    // Adjust for cleanliness level (dirtier = slower)
    const cleanlinessFactors = {
      'very_dirty': 0.6,
      'dirty': 0.7,
      'moderate': 0.8,
      'clean': 0.9,
      'very_clean': 1.0
    }
    baseSpeed *= cleanlinessFactors[street.cleanliness]

    // Adjust for traffic level
    const trafficFactors = {
      'low': 1.0,
      'medium': 0.8,
      'high': 0.6
    }
    baseSpeed *= trafficFactors[street.trafficLevel]

    return baseSpeed
  }

  /**
   * Calculate fuel cost for cleaning a street segment
   */
  private calculateSegmentFuelCost(vehicle: CleaningVehicle, street: Street): number {
    const distance = street.length / 1000 // Convert to km
    const baseFuelConsumption = distance / vehicle.fuelEfficiency

    // Apply cleaning-specific factors
    let fuelMultiplier = 1.0

    // Cleaning operation increases fuel consumption
    fuelMultiplier += 0.3 // 30% increase for cleaning equipment operation

    // Surface type affects fuel consumption
    const surfaceFactors = {
      'asphalt': 1.0,
      'concrete': 1.1,
      'cobblestone': 1.3
    }
    fuelMultiplier *= surfaceFactors[street.surfaceType] || 1.0

    // Slope affects fuel consumption
    fuelMultiplier += Math.abs(street.slope) * 0.02 // 2% per 1% slope

    // Dirtiness level affects equipment load
    const cleanlinessFactors = {
      'very_dirty': 1.4,
      'dirty': 1.2,
      'moderate': 1.1,
      'clean': 1.0,
      'very_clean': 0.9
    }
    fuelMultiplier *= cleanlinessFactors[street.cleanliness]

    return baseFuelConsumption * fuelMultiplier
  }

  /**
   * Group parallel streets for back-and-forth patterns
   */
  private groupParallelStreets(streets: Street[]): Street[][] {
    const groups: Street[][] = []
    const processed = new Set<string>()

    for (const street of streets) {
      if (processed.has(street.id)) continue

      const group = [street]
      processed.add(street.id)

      // Find parallel streets
      for (const otherStreet of streets) {
        if (processed.has(otherStreet.id)) continue

        if (this.areStreetsParallel(street, otherStreet)) {
          group.push(otherStreet)
          processed.add(otherStreet.id)
        }
      }

      groups.push(group)
    }

    return groups
  }

  /**
   * Check if two streets are parallel
   */
  private areStreetsParallel(street1: Street, street2: Street): boolean {
    if (street1.path.length < 2 || street2.path.length < 2) return false

    const bearing1 = calculateBearing(street1.path[0], street1.path[street1.path.length - 1])
    const bearing2 = calculateBearing(street2.path[0], street2.path[street2.path.length - 1])

    const bearingDiff = Math.abs(bearing1 - bearing2)
    const parallelThreshold = 15 // degrees

    return bearingDiff < parallelThreshold || bearingDiff > (180 - parallelThreshold)
  }

  /**
   * Identify perimeter streets of an area
   */
  private identifyPerimeterStreets(streets: Street[]): Street[] {
    // Simple implementation: streets that have endpoints near area boundaries
    const center = this.calculateAreaCenter(streets)
    const maxDistance = Math.max(...streets.map(s => 
      Math.max(...s.path.map(p => calculateDistance(center, p)))
    ))

    return streets.filter(street => {
      const distanceFromCenter = calculateDistance(center, street.path[0])
      return distanceFromCenter > maxDistance * 0.8 // 80% of max distance
    })
  }

  /**
   * Calculate comprehensive route metrics
   */
  private calculateRouteMetrics(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle
  ): {
    totalDistance: number
    estimatedTime: number
    fuelConsumption: number
    turnarounds: number
    overlappingCoverage: number
    efficiency: {
      fuelSavings: number
      timeSavings: number
      coverageEfficiency: number
    }
  } {
    const totalDistance = segments.reduce((sum, seg) => {
      const pathDistance = seg.path.reduce((d, point, i) => {
        if (i === 0) return 0
        return d + calculateDistance(seg.path[i - 1], point)
      }, 0)
      return sum + pathDistance
    }, 0)

    const estimatedTime = segments.reduce((sum, seg) => sum + seg.estimatedTime, 0)
    const fuelConsumption = segments.reduce((sum, seg) => sum + seg.fuelCost, 0)
    const turnarounds = this.calculateTurnarounds(segments)
    const overlappingCoverage = this.calculateOverlappingCoverage(segments)

    // Calculate efficiency improvements over naive approach
    const naiveMetrics = this.calculateNaiveMetrics(segments, vehicle)
    const efficiency = {
      fuelSavings: Math.max(0, (naiveMetrics.fuel - fuelConsumption) / naiveMetrics.fuel * 100),
      timeSavings: Math.max(0, (naiveMetrics.time - estimatedTime) / naiveMetrics.time * 100),
      coverageEfficiency: Math.max(0, 100 - (overlappingCoverage / totalDistance * 100))
    }

    return {
      totalDistance,
      estimatedTime,
      fuelConsumption,
      turnarounds,
      overlappingCoverage,
      efficiency
    }
  }

  /**
   * Calculate number of turnarounds in the route
   */
  private calculateTurnarounds(segments: OptimizedStreetSegment[]): number {
    let turnarounds = 0

    for (let i = 1; i < segments.length; i++) {
      const prevSegment = segments[i - 1]
      const currSegment = segments[i]

      // Calculate bearing change between segments
      const prevEnd = prevSegment.path[prevSegment.path.length - 1]
      const currStart = currSegment.path[0]
      const currSecond = currSegment.path[1]

      if (currSecond) {
        const bearingChange = Math.abs(
          calculateBearing(prevEnd, currStart) - calculateBearing(currStart, currSecond)
        )
        
        // Count significant direction changes as turnarounds
        if (bearingChange > 90) {
          turnarounds++
        }
      }
    }

    return turnarounds
  }

  /**
   * Calculate overlapping coverage between segments
   */
  private calculateOverlappingCoverage(segments: OptimizedStreetSegment[]): number {
    // Simplified calculation - in practice would use spatial analysis
    let overlap = 0
    const cleanedPaths: [number, number][][] = []

    for (const segment of segments) {
      for (const existingPath of cleanedPaths) {
        overlap += this.calculatePathOverlap(segment.path, existingPath)
      }
      cleanedPaths.push(segment.path)
    }

    return overlap
  }

  /**
   * Calculate overlap between two paths
   */
  private calculatePathOverlap(path1: [number, number][], path2: [number, number][]): number {
    // Simplified overlap calculation
    let overlap = 0
    const threshold = 20 // meters

    for (const point1 of path1) {
      for (const point2 of path2) {
        if (calculateDistance(point1, point2) < threshold) {
          overlap += threshold
          break
        }
      }
    }

    return overlap
  }

  /**
   * Calculate metrics for naive (unoptimized) route
   */
  private calculateNaiveMetrics(segments: OptimizedStreetSegment[], vehicle: CleaningVehicle) {
    // Naive approach: clean streets in original order without optimization
    const naiveFuel = segments.length * 5 // Assume 5L per street segment
    const naiveTime = segments.length * 30 // Assume 30 minutes per segment
    
    return { fuel: naiveFuel, time: naiveTime }
  }

  /**
   * Generate optimal pattern using TSP solver
   */
  private async generateOptimalPatternTSP(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: { minimizeTurnarounds: boolean; maxRouteTime: number }
  ): Promise<OptimizedStreetSegment[]> {
    try {
      const { CleaningTSPSolver } = await import('./tspSolver')
      const tspSolver = new CleaningTSPSolver()

      const tspSolution = await tspSolver.solveTSP(
        streets,
        vehicle,
        vehicle.currentLocation,
        {
          algorithm: 'hybrid',
          maxIterations: 500,
          populationSize: 30,
          mutationRate: 0.15,
          timeLimitMs: 15000, // 15 seconds
          priorityWeight: 0.3,
          fuelOptimization: true
        }
      )

      return tspSolver.convertToOptimizedSegments(tspSolution)
    } catch (error) {
      console.warn('TSP solver failed, falling back to spiral pattern:', error)
      return this.generateSpiralPattern(vehicle, streets, options)
    }
  }

  /**
   * Minimize turnarounds in route segments
   */
  private minimizeTurnarounds(segments: OptimizedStreetSegment[], vehicle: CleaningVehicle): OptimizedStreetSegment[] {
    // Simple turnaround minimization - reorder segments to reduce direction changes
    if (segments.length < 2) return segments

    const optimized = [segments[0]]
    const remaining = segments.slice(1)

    while (remaining.length > 0) {
      const lastSegment = optimized[optimized.length - 1]
      let bestNext = remaining[0]
      let bestIndex = 0
      let bestScore = this.calculateConnectionScore(lastSegment, bestNext, vehicle)

      // Find segment with best connection score
      for (let i = 1; i < remaining.length; i++) {
        const score = this.calculateConnectionScore(lastSegment, remaining[i], vehicle)
        if (score > bestScore) {
          bestNext = remaining[i]
          bestIndex = i
          bestScore = score
        }
      }

      optimized.push(bestNext)
      remaining.splice(bestIndex, 1)
    }

    return optimized
  }

  /**
   * Calculate connection score between two segments
   */
  private calculateConnectionScore(seg1: OptimizedStreetSegment, seg2: OptimizedStreetSegment, vehicle: CleaningVehicle): number {
    const end1 = seg1.path[seg1.path.length - 1]
    const start2 = seg2.path[0]
    
    // Distance factor (closer is better)
    const distance = calculateDistance(end1, start2)
    const distanceScore = 1000 / (distance + 1) // Avoid division by zero

    // Bearing continuity factor (similar direction is better)
    const bearing1 = calculateBearing(seg1.path[0], end1)
    const bearing2 = calculateBearing(start2, seg2.path[seg2.path.length - 1])
    const bearingDiff = Math.abs(bearing1 - bearing2)
    const bearingScore = 180 - Math.min(bearingDiff, 360 - bearingDiff)

    // Turn radius factor (avoid tight turns)
    const turnFeasible = distance >= vehicle.turnRadius ? 1 : 0.5

    return distanceScore * 0.4 + bearingScore * 0.4 + turnFeasible * 0.2
  }
}