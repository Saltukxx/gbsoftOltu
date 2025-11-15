/**
 * Street Priority Scheduling System
 * Dynamic scheduling based on cleanliness levels, traffic patterns, and operational constraints
 */

import type { Street, CleaningVehicle, CleaningPriority, CleanlinessLevel } from './streetCleaningOptimizer'

export interface SchedulingConstraint {
  type: 'time_window' | 'vehicle_availability' | 'weather' | 'traffic' | 'event' | 'maintenance'
  severity: 'blocking' | 'high_penalty' | 'medium_penalty' | 'low_penalty'
  startTime?: Date
  endTime?: Date
  affectedStreets?: string[]
  penaltyMultiplier?: number
  description: string
}

export interface PriorityScore {
  streetId: string
  totalScore: number
  cleanlinessScore: number
  urgencyScore: number
  trafficScore: number
  maintenanceScore: number
  constraintPenalty: number
  recommendedTime: Date
}

export interface ScheduledCleaningBlock {
  id: string
  startTime: Date
  endTime: Date
  streets: Street[]
  assignedVehicle?: CleaningVehicle
  priority: CleaningPriority
  estimatedFuelCost: number
  constraints: SchedulingConstraint[]
}

export interface DynamicSchedule {
  date: Date
  blocks: ScheduledCleaningBlock[]
  totalEstimatedTime: number
  totalFuelCost: number
  coverageEfficiency: number
  constraintViolations: ConstraintViolation[]
}

export interface ConstraintViolation {
  constraint: SchedulingConstraint
  severity: 'critical' | 'warning' | 'info'
  affectedBlocks: string[]
  suggestedAction: string
}

/**
 * Advanced Street Priority Scheduler
 */
export class StreetPriorityScheduler {
  private readonly CLEANLINESS_WEIGHTS = {
    very_dirty: 100,
    dirty: 75,
    moderate: 50,
    clean: 25,
    very_clean: 10
  }

  private readonly PRIORITY_WEIGHTS = {
    critical: 1000,
    high: 750,
    medium: 500,
    low: 250
  }

  private readonly TIME_DECAY_FACTOR = 0.1 // Points per day since last cleaning

  /**
   * Generate dynamic priority-based schedule
   */
  generateDynamicSchedule(
    streets: Street[],
    vehicles: CleaningVehicle[],
    constraints: SchedulingConstraint[],
    scheduleDate: Date,
    options: {
      workingHoursStart: number // Hour (0-23)
      workingHoursEnd: number
      maxBlockDuration: number // Minutes
      prioritizeUrgent: boolean
      allowOvertimeIfCritical: boolean
    }
  ): DynamicSchedule {
    // Calculate priority scores for all streets
    const priorityScores = this.calculatePriorityScores(
      streets,
      constraints,
      scheduleDate
    )

    // Sort by priority score (descending)
    priorityScores.sort((a, b) => b.totalScore - a.totalScore)

    // Generate time blocks within working hours
    const timeBlocks = this.generateTimeBlocks(
      scheduleDate,
      options.workingHoursStart,
      options.workingHoursEnd,
      options.maxBlockDuration
    )

    // Assign streets to blocks based on priority and constraints
    const scheduledBlocks = this.assignStreetsToBlocks(
      priorityScores,
      timeBlocks,
      vehicles,
      constraints,
      streets,
      options
    )

    // Calculate schedule metrics
    const metrics = this.calculateScheduleMetrics(scheduledBlocks)

    // Identify constraint violations
    const violations = this.identifyConstraintViolations(
      scheduledBlocks,
      constraints
    )

    return {
      date: scheduleDate,
      blocks: scheduledBlocks,
      totalEstimatedTime: metrics.totalTime,
      totalFuelCost: metrics.totalFuelCost,
      coverageEfficiency: metrics.coverageEfficiency,
      constraintViolations: violations
    }
  }

  /**
   * Calculate priority scores for all streets
   */
  private calculatePriorityScores(
    streets: Street[],
    constraints: SchedulingConstraint[],
    scheduleDate: Date
  ): PriorityScore[] {
    return streets.map(street => {
      const cleanlinessScore = this.calculateCleanlinessScore(street)
      const urgencyScore = this.calculateUrgencyScore(street, scheduleDate)
      const trafficScore = this.calculateTrafficScore(street)
      const maintenanceScore = this.calculateMaintenanceScore(street)
      const constraintPenalty = this.calculateConstraintPenalty(street, constraints)

      const totalScore = cleanlinessScore + urgencyScore + trafficScore + 
                        maintenanceScore - constraintPenalty

      const recommendedTime = this.calculateOptimalTime(street, scheduleDate)

      return {
        streetId: street.id,
        totalScore,
        cleanlinessScore,
        urgencyScore,
        trafficScore,
        maintenanceScore,
        constraintPenalty,
        recommendedTime
      }
    })
  }

  /**
   * Calculate cleanliness-based priority score
   */
  private calculateCleanlinessScore(street: Street): number {
    const baseScore = this.CLEANLINESS_WEIGHTS[street.cleanliness] || 50
    const priorityMultiplier = this.PRIORITY_WEIGHTS[street.priority] / 500 // Normalize to ~1
    
    return baseScore * priorityMultiplier
  }

  /**
   * Calculate urgency score based on time since last cleaning
   */
  private calculateUrgencyScore(street: Street, currentDate: Date): number {
    if (!street.lastCleaned) {
      return 100 // Never cleaned = high urgency
    }

    const daysSinceLastCleaning = 
      (currentDate.getTime() - street.lastCleaned.getTime()) / (1000 * 60 * 60 * 24)

    // Score increases with time
    return Math.min(daysSinceLastCleaning * this.TIME_DECAY_FACTOR, 100)
  }

  /**
   * Calculate traffic-based score (prefer low traffic times)
   */
  private calculateTrafficScore(street: Street): number {
    const trafficScores = {
      low: 30,    // Good time to clean
      medium: 10, // Acceptable
      high: -20   // Should avoid
    }

    return trafficScores[street.trafficLevel] || 0
  }

  /**
   * Calculate maintenance-related score
   */
  private calculateMaintenanceScore(street: Street): number {
    // Streets in poor condition may need special attention
    const surfaceScores = {
      asphalt: 0,
      concrete: 5,
      cobblestone: 15 // Requires more careful cleaning
    }

    return surfaceScores[street.surfaceType] || 0
  }

  /**
   * Calculate penalty from scheduling constraints
   */
  private calculateConstraintPenalty(
    street: Street,
    constraints: SchedulingConstraint[]
  ): number {
    let penalty = 0

    for (const constraint of constraints) {
      if (this.constraintAffectsStreet(constraint, street)) {
        const penaltyMultipliers = {
          blocking: 1000,      // Cannot clean
          high_penalty: 100,   // Heavy discouragement
          medium_penalty: 50,  // Moderate discouragement
          low_penalty: 20      // Light discouragement
        }

        penalty += penaltyMultipliers[constraint.severity] * 
                   (constraint.penaltyMultiplier || 1)
      }
    }

    return penalty
  }

  /**
   * Check if constraint affects a specific street
   */
  private constraintAffectsStreet(
    constraint: SchedulingConstraint,
    street: Street
  ): boolean {
    if (constraint.affectedStreets) {
      return constraint.affectedStreets.includes(street.id)
    }

    // Apply general constraints based on type
    switch (constraint.type) {
      case 'traffic':
        return street.trafficLevel === 'high'
      case 'weather':
        return true // Weather affects all streets
      default:
        return false
    }
  }

  /**
   * Calculate optimal cleaning time for a street
   */
  private calculateOptimalTime(street: Street, scheduleDate: Date): Date {
    const baseTime = new Date(scheduleDate)
    
    // Prefer early morning for high-traffic streets
    if (street.trafficLevel === 'high') {
      baseTime.setHours(6, 0, 0, 0)
    }
    // Normal hours for medium traffic
    else if (street.trafficLevel === 'medium') {
      baseTime.setHours(8, 0, 0, 0)
    }
    // Flexible timing for low traffic
    else {
      baseTime.setHours(10, 0, 0, 0)
    }

    return baseTime
  }

  /**
   * Generate time blocks for scheduling
   */
  private generateTimeBlocks(
    date: Date,
    startHour: number,
    endHour: number,
    maxBlockDuration: number
  ): Date[][] {
    const blocks: Date[][] = []
    const startTime = new Date(date)
    startTime.setHours(startHour, 0, 0, 0)
    
    const endTime = new Date(date)
    endTime.setHours(endHour, 0, 0, 0)

    let currentTime = new Date(startTime)
    
    while (currentTime < endTime) {
      const blockStart = new Date(currentTime)
      const blockEnd = new Date(currentTime)
      blockEnd.setMinutes(blockEnd.getMinutes() + maxBlockDuration)
      
      if (blockEnd > endTime) {
        blockEnd.setTime(endTime.getTime())
      }

      blocks.push([blockStart, blockEnd])
      currentTime = new Date(blockEnd)
    }

    return blocks
  }

  /**
   * Assign streets to time blocks with optimization
   */
  private assignStreetsToBlocks(
    priorityScores: PriorityScore[],
    timeBlocks: Date[][],
    vehicles: CleaningVehicle[],
    constraints: SchedulingConstraint[],
    streets: Street[],
    options: {
      maxBlockDuration: number
      prioritizeUrgent: boolean
      allowOvertimeIfCritical: boolean
    }
  ): ScheduledCleaningBlock[] {
    const scheduledBlocks: ScheduledCleaningBlock[] = []
    const assignedStreets = new Set<string>()
    
    // Sort vehicles by suitability for different tasks
    const sortedVehicles = this.sortVehiclesByEfficiency(vehicles)

    for (let blockIndex = 0; blockIndex < timeBlocks.length; blockIndex++) {
      const [blockStart, blockEnd] = timeBlocks[blockIndex]
      const blockDuration = blockEnd.getTime() - blockStart.getTime()

      // Find best vehicle for this time slot
      const availableVehicle = sortedVehicles.find(vehicle => 
        this.isVehicleAvailable(vehicle, blockStart, blockEnd, scheduledBlocks)
      )

      if (!availableVehicle) continue

      // Select streets for this block
      const blockStreets: Street[] = []
      let remainingTime = blockDuration / (1000 * 60) // Convert to minutes

      for (const priorityScore of priorityScores) {
        if (assignedStreets.has(priorityScore.streetId)) continue
        
        const street = streets.find(s => s.id === priorityScore.streetId)
        if (!street) continue

        // Check if street can be cleaned in this time slot
        const estimatedTime = this.estimateCleaningTime(street, availableVehicle)
        
        if (estimatedTime <= remainingTime) {
          // Check constraints for this time slot
          if (this.canCleanStreetAtTime(street, blockStart, blockEnd, constraints)) {
            blockStreets.push(street)
            assignedStreets.add(street.id)
            remainingTime -= estimatedTime
          }
        }

        // Stop if block is full
        if (remainingTime < 10) break // Need at least 10 minutes remaining
      }

      // Create scheduled block if we have streets
      if (blockStreets.length > 0) {
        const block = this.createScheduledBlock(
          blockStreets,
          blockStart,
          blockEnd,
          availableVehicle,
          constraints
        )
        scheduledBlocks.push(block)
      }
    }

    // Handle critical streets that couldn't be scheduled
    if (options.allowOvertimeIfCritical) {
      const unscheduledCritical = priorityScores.filter(score =>
        !assignedStreets.has(score.streetId) &&
        score.totalScore > 500 // High priority threshold
      )

      if (unscheduledCritical.length > 0) {
        const overtimeBlocks = this.scheduleOvertimeBlocks(
          unscheduledCritical,
          streets,
          vehicles,
          timeBlocks[timeBlocks.length - 1][1], // Start after normal hours
          constraints
        )
        scheduledBlocks.push(...overtimeBlocks)
      }
    }

    return scheduledBlocks
  }

  /**
   * Sort vehicles by cleaning efficiency
   */
  private sortVehiclesByEfficiency(vehicles: CleaningVehicle[]): CleaningVehicle[] {
    return vehicles.sort((a, b) => {
      // Prefer combo vehicles, then efficiency factors
      const aScore = this.calculateVehicleEfficiencyScore(a)
      const bScore = this.calculateVehicleEfficiencyScore(b)
      return bScore - aScore
    })
  }

  /**
   * Calculate vehicle efficiency score
   */
  private calculateVehicleEfficiencyScore(vehicle: CleaningVehicle): number {
    let score = 0

    // Type preference
    const typeScores = {
      combo: 100,   // Most versatile
      sweeper: 70,  // Good for most tasks
      washer: 60    // Specialized
    }
    score += typeScores[vehicle.type] || 50

    // Efficiency factors
    score += vehicle.fuelEfficiency * 2
    score += vehicle.cleaningWidth * 5
    score += vehicle.maxSpeed

    return score
  }

  /**
   * Check if vehicle is available during time slot
   */
  private isVehicleAvailable(
    vehicle: CleaningVehicle,
    startTime: Date,
    endTime: Date,
    existingBlocks: ScheduledCleaningBlock[]
  ): boolean {
    return !existingBlocks.some(block =>
      block.assignedVehicle?.id === vehicle.id &&
      this.timePeriodsOverlap(
        [block.startTime, block.endTime],
        [startTime, endTime]
      )
    )
  }

  /**
   * Check if two time periods overlap
   */
  private timePeriodsOverlap(
    period1: [Date, Date],
    period2: [Date, Date]
  ): boolean {
    return period1[0] < period2[1] && period2[0] < period1[1]
  }

  /**
   * Estimate cleaning time for a street
   */
  private estimateCleaningTime(street: Street, vehicle: CleaningVehicle): number {
    const streetLength = street.length / 1000 // Convert to km
    
    // Base cleaning speed
    let cleaningSpeed = Math.min(vehicle.maxSpeed, 15) // Max 15 km/h for cleaning
    
    // Adjust for street conditions
    const surfaceFactors = {
      asphalt: 1.0,
      concrete: 0.9,
      cobblestone: 0.7
    }
    cleaningSpeed *= surfaceFactors[street.surfaceType] || 1.0

    const cleanlinessFactors = {
      very_dirty: 0.6,
      dirty: 0.75,
      moderate: 0.9,
      clean: 1.0,
      very_clean: 1.1
    }
    cleaningSpeed *= cleanlinessFactors[street.cleanliness]

    const timeHours = streetLength / cleaningSpeed
    return Math.ceil(timeHours * 60) // Return minutes, rounded up
  }

  /**
   * Check if street can be cleaned at specific time
   */
  private canCleanStreetAtTime(
    street: Street,
    startTime: Date,
    endTime: Date,
    constraints: SchedulingConstraint[]
  ): boolean {
    for (const constraint of constraints) {
      if (constraint.severity === 'blocking' && 
          this.constraintAffectsStreet(constraint, street)) {
        
        // Check time window conflicts
        if (constraint.startTime && constraint.endTime) {
          if (this.timePeriodsOverlap(
            [constraint.startTime, constraint.endTime],
            [startTime, endTime]
          )) {
            return false
          }
        }
      }
    }

    return true
  }

  /**
   * Create a scheduled cleaning block
   */
  private createScheduledBlock(
    streets: Street[],
    startTime: Date,
    endTime: Date,
    vehicle: CleaningVehicle,
    constraints: SchedulingConstraint[]
  ): ScheduledCleaningBlock {
    // Calculate block priority based on highest street priority
    const priorities: CleaningPriority[] = ['low', 'medium', 'high', 'critical']
    const blockPriority = streets.reduce((highest, street) => {
      return priorities.indexOf(street.priority) > priorities.indexOf(highest) 
        ? street.priority : highest
    }, 'low' as CleaningPriority)

    // Calculate estimated fuel cost
    const estimatedFuelCost = streets.reduce((total, street) => {
      const distance = street.length / 1000 // km
      const baseFuel = distance / vehicle.fuelEfficiency
      
      // Apply street-specific factors
      let multiplier = 1.3 // Cleaning equipment overhead
      
      const surfaceFactors = {
        asphalt: 1.0,
        concrete: 1.1,
        cobblestone: 1.3
      }
      multiplier *= surfaceFactors[street.surfaceType] || 1.0

      return total + (baseFuel * multiplier)
    }, 0)

    // Find applicable constraints
    const applicableConstraints = constraints.filter(constraint =>
      streets.some(street => this.constraintAffectsStreet(constraint, street))
    )

    return {
      id: `block_${startTime.getTime()}_${vehicle.id}`,
      startTime,
      endTime,
      streets,
      assignedVehicle: vehicle,
      priority: blockPriority,
      estimatedFuelCost,
      constraints: applicableConstraints
    }
  }

  /**
   * Schedule overtime blocks for critical streets
   */
  private scheduleOvertimeBlocks(
    criticalScores: PriorityScore[],
    streets: Street[],
    vehicles: CleaningVehicle[],
    overtimeStart: Date,
    constraints: SchedulingConstraint[]
  ): ScheduledCleaningBlock[] {
    const overtimeBlocks: ScheduledCleaningBlock[] = []
    let currentTime = new Date(overtimeStart)

    for (const score of criticalScores) {
      const street = streets.find(s => s.id === score.streetId)
      if (!street) continue

      const availableVehicle = vehicles[0] // Use first available vehicle
      const estimatedTime = this.estimateCleaningTime(street, availableVehicle)
      
      const blockStart = new Date(currentTime)
      const blockEnd = new Date(currentTime)
      blockEnd.setMinutes(blockEnd.getMinutes() + estimatedTime + 10) // 10min buffer

      const block = this.createScheduledBlock(
        [street],
        blockStart,
        blockEnd,
        availableVehicle,
        constraints
      )

      overtimeBlocks.push(block)
      currentTime = new Date(blockEnd)
    }

    return overtimeBlocks
  }

  /**
   * Calculate schedule metrics
   */
  private calculateScheduleMetrics(blocks: ScheduledCleaningBlock[]): {
    totalTime: number
    totalFuelCost: number
    coverageEfficiency: number
  } {
    const totalTime = blocks.reduce((sum, block) => {
      return sum + (block.endTime.getTime() - block.startTime.getTime()) / (1000 * 60)
    }, 0)

    const totalFuelCost = blocks.reduce((sum, block) => 
      sum + block.estimatedFuelCost, 0)

    // Calculate coverage efficiency
    const totalStreets = blocks.reduce((sum, block) => sum + block.streets.length, 0)
    const uniqueStreets = new Set(
      blocks.flatMap(block => block.streets.map(s => s.id))
    ).size

    const coverageEfficiency = totalStreets > 0 ? (uniqueStreets / totalStreets) * 100 : 100

    return {
      totalTime,
      totalFuelCost,
      coverageEfficiency
    }
  }

  /**
   * Identify constraint violations
   */
  private identifyConstraintViolations(
    blocks: ScheduledCleaningBlock[],
    constraints: SchedulingConstraint[]
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = []

    for (const constraint of constraints) {
      const affectedBlocks = blocks.filter(block =>
        block.constraints.includes(constraint)
      )

      if (affectedBlocks.length > 0 && constraint.severity === 'blocking') {
        violations.push({
          constraint,
          severity: 'critical',
          affectedBlocks: affectedBlocks.map(b => b.id),
          suggestedAction: 'Reschedule affected blocks to avoid constraint conflict'
        })
      } else if (affectedBlocks.length > 0 && constraint.severity === 'high_penalty') {
        violations.push({
          constraint,
          severity: 'warning',
          affectedBlocks: affectedBlocks.map(b => b.id),
          suggestedAction: 'Consider rescheduling to reduce efficiency penalty'
        })
      }
    }

    return violations
  }

  /**
   * Optimize schedule by resolving conflicts
   */
  optimizeSchedule(
    schedule: DynamicSchedule,
    constraints: SchedulingConstraint[]
  ): DynamicSchedule {
    let optimizedBlocks = [...schedule.blocks]

    // Resolve critical violations first
    const criticalViolations = schedule.constraintViolations.filter(
      v => v.severity === 'critical'
    )

    for (const violation of criticalViolations) {
      optimizedBlocks = this.resolveConstraintViolation(
        optimizedBlocks,
        violation,
        constraints
      )
    }

    // Recalculate metrics
    const metrics = this.calculateScheduleMetrics(optimizedBlocks)
    const newViolations = this.identifyConstraintViolations(optimizedBlocks, constraints)

    return {
      ...schedule,
      blocks: optimizedBlocks,
      totalEstimatedTime: metrics.totalTime,
      totalFuelCost: metrics.totalFuelCost,
      coverageEfficiency: metrics.coverageEfficiency,
      constraintViolations: newViolations
    }
  }

  /**
   * Resolve a specific constraint violation
   */
  private resolveConstraintViolation(
    blocks: ScheduledCleaningBlock[],
    violation: ConstraintViolation,
    constraints: SchedulingConstraint[]
  ): ScheduledCleaningBlock[] {
    // Simple resolution: delay affected blocks
    return blocks.map(block => {
      if (violation.affectedBlocks.includes(block.id)) {
        const newStartTime = new Date(block.startTime)
        newStartTime.setHours(newStartTime.getHours() + 1) // Delay by 1 hour
        
        const newEndTime = new Date(block.endTime)
        newEndTime.setHours(newEndTime.getHours() + 1)

        return {
          ...block,
          startTime: newStartTime,
          endTime: newEndTime
        }
      }
      return block
    })
  }
}