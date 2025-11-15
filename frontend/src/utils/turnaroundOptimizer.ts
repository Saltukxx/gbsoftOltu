/**
 * Turnaround Cost Minimization and Coverage Overlap Prevention
 * Specialized algorithms to reduce fuel waste from unnecessary turns and redundant cleaning
 */

import { calculateDistance, calculateBearing } from './routeOptimization'
import type { OptimizedStreetSegment, CleaningVehicle, Street } from './streetCleaningOptimizer'

export interface TurnCostAnalysis {
  totalTurns: number
  uTurns: number
  sharpTurns: number
  estimatedExtraFuelCost: number
  turnaroundPenalty: number
}

export interface CoverageAnalysis {
  totalCoverage: number // meters
  overlappingCoverage: number // meters
  coverageEfficiency: number // percentage
  redundantSegments: OverlapSegment[]
}

export interface OverlapSegment {
  segmentId1: string
  segmentId2: string
  overlapDistance: number
  overlapPath: [number, number][]
  costImpact: number
}

export interface OptimizationResult {
  optimizedSegments: OptimizedStreetSegment[]
  turnCostReduction: number
  overlapReduction: number
  fuelSavings: number
  timeSavings: number
}

/**
 * Advanced Turnaround and Overlap Optimizer
 */
export class TurnaroundOptimizer {
  private readonly SHARP_TURN_THRESHOLD = 90 // degrees
  private readonly U_TURN_THRESHOLD = 150 // degrees
  private readonly TURN_FUEL_PENALTY = 0.05 // liters per turn
  private readonly U_TURN_FUEL_PENALTY = 0.15 // liters per U-turn
  private readonly OVERLAP_TOLERANCE = 10 // meters

  /**
   * Optimize route to minimize turnarounds and overlaps
   */
  optimizeRoute(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    options: {
      minimizeTurnarounds: boolean
      preventOverlaps: boolean
      allowReverseCleaning: boolean
      maxDetourDistance: number
    }
  ): OptimizationResult {
    let optimizedSegments = [...segments]
    let totalFuelSavings = 0
    let totalTimeSavings = 0

    // Step 1: Analyze current route issues
    const initialTurnCost = this.analyzeTurnCosts(optimizedSegments, vehicle)
    const initialCoverage = this.analyzeCoverage(optimizedSegments)

    // Step 2: Minimize turnarounds
    if (options.minimizeTurnarounds) {
      const turnaroundResult = this.minimizeTurnarounds(
        optimizedSegments,
        vehicle,
        options
      )
      optimizedSegments = turnaroundResult.segments
      totalFuelSavings += turnaroundResult.fuelSavings
      totalTimeSavings += turnaroundResult.timeSavings
    }

    // Step 3: Prevent coverage overlaps
    if (options.preventOverlaps) {
      const overlapResult = this.preventCoverageOverlaps(
        optimizedSegments,
        vehicle,
        options
      )
      optimizedSegments = overlapResult.segments
      totalFuelSavings += overlapResult.fuelSavings
      totalTimeSavings += overlapResult.timeSavings
    }

    // Calculate final improvements
    const finalTurnCost = this.analyzeTurnCosts(optimizedSegments, vehicle)
    const finalCoverage = this.analyzeCoverage(optimizedSegments)

    return {
      optimizedSegments,
      turnCostReduction: initialTurnCost.estimatedExtraFuelCost - finalTurnCost.estimatedExtraFuelCost,
      overlapReduction: initialCoverage.overlappingCoverage - finalCoverage.overlappingCoverage,
      fuelSavings: totalFuelSavings,
      timeSavings: totalTimeSavings
    }
  }

  /**
   * Analyze turn costs in current route
   */
  analyzeTurnCosts(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle
  ): TurnCostAnalysis {
    let totalTurns = 0
    let uTurns = 0
    let sharpTurns = 0
    let extraFuelCost = 0

    for (let i = 1; i < segments.length; i++) {
      const prevSegment = segments[i - 1]
      const currSegment = segments[i]

      const turnAnalysis = this.analyzeTurn(prevSegment, currSegment, vehicle)
      
      if (turnAnalysis.isUTurn) {
        uTurns++
        extraFuelCost += this.U_TURN_FUEL_PENALTY
      } else if (turnAnalysis.isSharpTurn) {
        sharpTurns++
        extraFuelCost += this.TURN_FUEL_PENALTY
      }

      if (turnAnalysis.angle > 45) {
        totalTurns++
      }
    }

    return {
      totalTurns,
      uTurns,
      sharpTurns,
      estimatedExtraFuelCost: extraFuelCost,
      turnaroundPenalty: (uTurns * 2 + sharpTurns * 1) / segments.length
    }
  }

  /**
   * Analyze individual turn between segments
   */
  private analyzeTurn(
    segment1: OptimizedStreetSegment,
    segment2: OptimizedStreetSegment,
    vehicle: CleaningVehicle
  ): {
    angle: number
    distance: number
    isSharpTurn: boolean
    isUTurn: boolean
    isFeasible: boolean
  } {
    const end1 = segment1.path[segment1.path.length - 1]
    const start2 = segment2.path[0]
    const distance = calculateDistance(end1, start2)

    let angle = 0
    if (segment1.path.length >= 2 && segment2.path.length >= 2) {
      const beforeEnd1 = segment1.path[segment1.path.length - 2]
      const afterStart2 = segment2.path[1]

      const bearing1 = calculateBearing(beforeEnd1, end1)
      const bearing2 = calculateBearing(start2, afterStart2)
      
      angle = Math.abs(bearing1 - bearing2)
      angle = angle > 180 ? 360 - angle : angle
    }

    return {
      angle,
      distance,
      isSharpTurn: angle >= this.SHARP_TURN_THRESHOLD && angle < this.U_TURN_THRESHOLD,
      isUTurn: angle >= this.U_TURN_THRESHOLD,
      isFeasible: distance >= vehicle.turnRadius
    }
  }

  /**
   * Minimize turnarounds through reordering and direction optimization
   */
  private minimizeTurnarounds(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    options: {
      allowReverseCleaning: boolean
      maxDetourDistance: number
    }
  ): {
    segments: OptimizedStreetSegment[]
    fuelSavings: number
    timeSavings: number
  } {
    let optimizedSegments = [...segments]
    let fuelSavings = 0
    let timeSavings = 0

    // Strategy 1: Reorder segments to minimize direction changes
    const reorderedResult = this.reorderSegmentsForMinimalTurns(
      optimizedSegments,
      vehicle,
      options.maxDetourDistance
    )
    optimizedSegments = reorderedResult.segments
    fuelSavings += reorderedResult.fuelSavings

    // Strategy 2: Optimize cleaning directions
    if (options.allowReverseCleaning) {
      const directionResult = this.optimizeCleaningDirections(
        optimizedSegments,
        vehicle
      )
      optimizedSegments = directionResult.segments
      fuelSavings += directionResult.fuelSavings
      timeSavings += directionResult.timeSavings
    }

    // Strategy 3: Insert connecting segments to smooth transitions
    const connectionResult = this.insertSmoothConnections(
      optimizedSegments,
      vehicle,
      options.maxDetourDistance
    )
    optimizedSegments = connectionResult.segments
    fuelSavings += connectionResult.fuelSavings

    return {
      segments: optimizedSegments,
      fuelSavings,
      timeSavings
    }
  }

  /**
   * Reorder segments to minimize turns using advanced algorithms
   */
  private reorderSegmentsForMinimalTurns(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    maxDetourDistance: number
  ): {
    segments: OptimizedStreetSegment[]
    fuelSavings: number
  } {
    if (segments.length <= 2) {
      return { segments, fuelSavings: 0 }
    }

    // Use local search optimization to find better ordering
    let currentOrder = [...segments]
    let bestOrder = [...segments]
    let bestScore = this.calculateRouteScore(currentOrder, vehicle)
    let fuelSavings = 0

    // Apply 2-opt optimization
    for (let i = 0; i < segments.length - 2; i++) {
      for (let j = i + 2; j < segments.length; j++) {
        const newOrder = this.apply2OptSwap(currentOrder, i, j)
        const newScore = this.calculateRouteScore(newOrder, vehicle)
        
        if (newScore < bestScore) {
          bestOrder = newOrder
          bestScore = newScore
          fuelSavings += (bestScore - newScore) * 0.1 // Approximate fuel savings
        }
      }
    }

    return {
      segments: bestOrder.map((segment, index) => ({
        ...segment,
        sequence: index + 1
      })),
      fuelSavings
    }
  }

  /**
   * Apply 2-opt swap to improve route ordering
   */
  private apply2OptSwap(
    segments: OptimizedStreetSegment[],
    i: number,
    j: number
  ): OptimizedStreetSegment[] {
    const newOrder = [...segments]
    
    // Reverse the order of segments between i and j
    const toReverse = newOrder.slice(i + 1, j + 1).reverse()
    newOrder.splice(i + 1, j - i, ...toReverse)
    
    return newOrder
  }

  /**
   * Calculate route quality score (lower is better)
   */
  private calculateRouteScore(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle
  ): number {
    let score = 0

    for (let i = 1; i < segments.length; i++) {
      const turnAnalysis = this.analyzeTurn(segments[i - 1], segments[i], vehicle)
      
      // Penalize turns based on severity
      score += turnAnalysis.distance * 0.001 // Distance penalty
      score += turnAnalysis.angle * 0.01 // Angle penalty
      
      if (turnAnalysis.isUTurn) {
        score += 10 // Heavy U-turn penalty
      } else if (turnAnalysis.isSharpTurn) {
        score += 3 // Sharp turn penalty
      }

      if (!turnAnalysis.isFeasible) {
        score += 20 // Infeasible turn penalty
      }
    }

    return score
  }

  /**
   * Optimize cleaning directions to minimize turns
   */
  private optimizeCleaningDirections(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle
  ): {
    segments: OptimizedStreetSegment[]
    fuelSavings: number
    timeSavings: number
  } {
    const optimizedSegments = [...segments]
    let fuelSavings = 0
    let timeSavings = 0

    for (let i = 1; i < optimizedSegments.length; i++) {
      const prevSegment = optimizedSegments[i - 1]
      const currSegment = optimizedSegments[i]

      // Try both forward and reverse directions for current segment
      const forwardScore = this.calculateConnectionScore(
        prevSegment,
        currSegment,
        vehicle
      )

      const reversedSegment = {
        ...currSegment,
        path: [...currSegment.path].reverse(),
        cleaningDirection: currSegment.cleaningDirection === 'forward' ? 'reverse' : 'forward'
      } as OptimizedStreetSegment

      const reverseScore = this.calculateConnectionScore(
        prevSegment,
        reversedSegment,
        vehicle
      )

      // Use reverse direction if it's significantly better
      if (reverseScore > forwardScore * 1.2) {
        optimizedSegments[i] = reversedSegment
        fuelSavings += 0.05 // Estimated fuel savings per optimized direction
        timeSavings += 1 // Estimated time savings in minutes
      }
    }

    return {
      segments: optimizedSegments,
      fuelSavings,
      timeSavings
    }
  }

  /**
   * Calculate connection score between segments
   */
  private calculateConnectionScore(
    segment1: OptimizedStreetSegment,
    segment2: OptimizedStreetSegment,
    vehicle: CleaningVehicle
  ): number {
    const end1 = segment1.path[segment1.path.length - 1]
    const start2 = segment2.path[0]
    const distance = calculateDistance(end1, start2)

    // Distance factor (closer is better)
    const distanceScore = 1000 / (distance + 1)

    // Turn angle factor
    const turnAnalysis = this.analyzeTurn(segment1, segment2, vehicle)
    const angleScore = 180 - turnAnalysis.angle

    // Feasibility factor
    const feasibilityScore = turnAnalysis.isFeasible ? 100 : 0

    return distanceScore * 0.4 + angleScore * 0.4 + feasibilityScore * 0.2
  }

  /**
   * Insert smooth connecting segments where beneficial
   */
  private insertSmoothConnections(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    maxDetourDistance: number
  ): {
    segments: OptimizedStreetSegment[]
    fuelSavings: number
  } {
    // For now, return original segments
    // This could be extended to insert intermediate waypoints
    // to create smoother transitions between segments
    return {
      segments,
      fuelSavings: 0
    }
  }

  /**
   * Analyze coverage overlaps between segments
   */
  analyzeCoverage(segments: OptimizedStreetSegment[]): CoverageAnalysis {
    let totalCoverage = 0
    let overlappingCoverage = 0
    const redundantSegments: OverlapSegment[] = []

    // Calculate total coverage
    for (const segment of segments) {
      totalCoverage += this.calculateSegmentCoverage(segment)
    }

    // Find overlapping segments
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const overlap = this.calculateSegmentOverlap(segments[i], segments[j])
        
        if (overlap.overlapDistance > this.OVERLAP_TOLERANCE) {
          overlappingCoverage += overlap.overlapDistance
          redundantSegments.push({
            segmentId1: segments[i].streetId,
            segmentId2: segments[j].streetId,
            overlapDistance: overlap.overlapDistance,
            overlapPath: overlap.overlapPath,
            costImpact: overlap.overlapDistance * 0.002 // Estimated cost per meter
          })
        }
      }
    }

    const coverageEfficiency = totalCoverage > 0 ? 
      ((totalCoverage - overlappingCoverage) / totalCoverage) * 100 : 100

    return {
      totalCoverage,
      overlappingCoverage,
      coverageEfficiency,
      redundantSegments
    }
  }

  /**
   * Calculate coverage area for a segment
   */
  private calculateSegmentCoverage(segment: OptimizedStreetSegment): number {
    // Simplified calculation: path length
    let coverage = 0
    
    for (let i = 1; i < segment.path.length; i++) {
      coverage += calculateDistance(segment.path[i - 1], segment.path[i])
    }
    
    return coverage
  }

  /**
   * Calculate overlap between two segments
   */
  private calculateSegmentOverlap(
    segment1: OptimizedStreetSegment,
    segment2: OptimizedStreetSegment
  ): {
    overlapDistance: number
    overlapPath: [number, number][]
  } {
    const overlapPath: [number, number][] = []
    let overlapDistance = 0

    // Simplified overlap detection - check for nearby points
    for (const point1 of segment1.path) {
      for (const point2 of segment2.path) {
        const distance = calculateDistance(point1, point2)
        
        if (distance < this.OVERLAP_TOLERANCE) {
          overlapPath.push(point1)
          overlapDistance += this.OVERLAP_TOLERANCE
          break // Avoid double counting
        }
      }
    }

    return {
      overlapDistance,
      overlapPath
    }
  }

  /**
   * Prevent coverage overlaps through route modification
   */
  private preventCoverageOverlaps(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    options: {
      maxDetourDistance: number
    }
  ): {
    segments: OptimizedStreetSegment[]
    fuelSavings: number
    timeSavings: number
  } {
    let optimizedSegments = [...segments]
    let fuelSavings = 0
    let timeSavings = 0

    const coverageAnalysis = this.analyzeCoverage(optimizedSegments)
    
    // Remove or modify segments with significant overlaps
    for (const overlap of coverageAnalysis.redundantSegments) {
      if (overlap.overlapDistance > 50) { // 50m threshold
        const modificationResult = this.reduceSegmentOverlap(
          optimizedSegments,
          overlap,
          vehicle,
          options.maxDetourDistance
        )
        
        optimizedSegments = modificationResult.segments
        fuelSavings += modificationResult.fuelSavings
        timeSavings += modificationResult.timeSavings
      }
    }

    return {
      segments: optimizedSegments,
      fuelSavings,
      timeSavings
    }
  }

  /**
   * Reduce overlap between specific segments
   */
  private reduceSegmentOverlap(
    segments: OptimizedStreetSegment[],
    overlap: OverlapSegment,
    vehicle: CleaningVehicle,
    maxDetourDistance: number
  ): {
    segments: OptimizedStreetSegment[]
    fuelSavings: number
    timeSavings: number
  } {
    // Find segments with overlap
    const segment1Index = segments.findIndex(s => s.streetId === overlap.segmentId1)
    const segment2Index = segments.findIndex(s => s.streetId === overlap.segmentId2)
    
    if (segment1Index === -1 || segment2Index === -1) {
      return { segments, fuelSavings: 0, timeSavings: 0 }
    }

    // Strategy: Modify path to avoid overlap
    const modifiedSegments = [...segments]
    
    // For simplicity, remove the overlapping portions from the later segment
    if (segment2Index > segment1Index) {
      const segment2 = modifiedSegments[segment2Index]
      const cleanedPath = this.removeOverlappingPoints(
        segment2.path,
        overlap.overlapPath
      )
      
      if (cleanedPath.length >= 2) {
        modifiedSegments[segment2Index] = {
          ...segment2,
          path: cleanedPath
        }
        
        return {
          segments: modifiedSegments,
          fuelSavings: overlap.costImpact,
          timeSavings: overlap.overlapDistance / 1000 / 15 * 60 // Assume 15 km/h cleaning speed
        }
      }
    }

    return { segments, fuelSavings: 0, timeSavings: 0 }
  }

  /**
   * Remove overlapping points from a path
   */
  private removeOverlappingPoints(
    path: [number, number][],
    overlapPoints: [number, number][]
  ): [number, number][] {
    return path.filter(point => {
      return !overlapPoints.some(overlapPoint => 
        calculateDistance(point, overlapPoint) < this.OVERLAP_TOLERANCE
      )
    })
  }
}