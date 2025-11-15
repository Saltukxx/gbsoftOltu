/**
 * Advanced Cleaning Pattern Algorithms
 * Specialized algorithms for different street cleaning patterns to maximize efficiency
 */

import { calculateDistance, calculateBearing } from './routeOptimization'
import type { Street, CleaningVehicle, OptimizedStreetSegment } from './streetCleaningOptimizer'

export interface CleaningGrid {
  cells: GridCell[][]
  bounds: [[number, number], [number, number]]
  cellSize: number // in meters
}

export interface GridCell {
  id: string
  bounds: [[number, number], [number, number]]
  streets: Street[]
  priority: number
  cleaned: boolean
  estimatedTime: number
}

export interface PatternOptions {
  minimizeTurnarounds: boolean
  maxRouteTime: number
  vehicleWidth: number
  overlapTolerance: number // meters
  spiralDirection: 'clockwise' | 'counterclockwise'
  gridOrientation: 'north_south' | 'east_west' | 'optimal'
}

/**
 * Advanced Cleaning Pattern Generator
 */
export class CleaningPatternGenerator {
  private readonly TURN_COST_MULTIPLIER = 1.5 // Extra fuel cost for turns
  private readonly U_TURN_COST_MULTIPLIER = 2.5 // Extra fuel cost for U-turns

  /**
   * Generate advanced spiral cleaning pattern with optimization
   */
  generateOptimizedSpiralPattern(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: PatternOptions
  ): OptimizedStreetSegment[] {
    // Create grid-based representation for systematic spiral generation
    const grid = this.createCleaningGrid(streets, 200) // 200m cells
    const spiralSequence = this.generateSpiralSequence(grid, options.spiralDirection)
    
    return this.convertGridSequenceToSegments(spiralSequence, vehicle, options)
  }

  /**
   * Generate systematic grid cleaning pattern
   */
  generateSystematicGridPattern(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: PatternOptions
  ): OptimizedStreetSegment[] {
    const grid = this.createCleaningGrid(streets, 150) // 150m cells for finer control
    
    let gridSequence: GridCell[]
    
    switch (options.gridOrientation) {
      case 'north_south':
        gridSequence = this.generateNorthSouthGrid(grid)
        break
      case 'east_west':
        gridSequence = this.generateEastWestGrid(grid)
        break
      case 'optimal':
      default:
        gridSequence = this.generateOptimalGridOrientation(grid, vehicle)
        break
    }

    return this.convertGridSequenceToSegments(gridSequence, vehicle, options)
  }

  /**
   * Generate advanced back-and-forth pattern with minimal turnarounds
   */
  generateOptimizedBackForthPattern(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: PatternOptions
  ): OptimizedStreetSegment[] {
    // Group streets by parallel alignment
    const parallelGroups = this.findParallelStreetGroups(streets)
    const optimizedSegments: OptimizedStreetSegment[] = []
    
    for (const group of parallelGroups) {
      // Sort streets within group for optimal back-and-forth
      const sortedStreets = this.sortStreetsForBackForth(group, vehicle)
      
      // Generate back-and-forth sequence with direction optimization
      const groupSegments = this.generateBackForthSequence(
        sortedStreets,
        vehicle,
        options
      )
      
      optimizedSegments.push(...groupSegments)
    }

    return this.optimizeSegmentConnections(optimizedSegments, vehicle, options)
  }

  /**
   * Generate perimeter-first pattern with inner area optimization
   */
  generatePerimeterFirstPattern(
    vehicle: CleaningVehicle,
    streets: Street[],
    options: PatternOptions
  ): OptimizedStreetSegment[] {
    const { perimeterStreets, innerStreets } = this.identifyPerimeterAndInnerStreets(streets)
    
    // Optimize perimeter cleaning sequence
    const perimeterSegments = this.optimizePerimeterSequence(
      perimeterStreets,
      vehicle,
      options
    )
    
    // Generate efficient pattern for inner areas
    const innerSegments = this.generateOptimizedSpiralPattern(
      vehicle,
      innerStreets,
      { ...options, spiralDirection: 'counterclockwise' }
    )
    
    return [...perimeterSegments, ...innerSegments]
  }

  /**
   * Create grid representation of cleaning area
   */
  private createCleaningGrid(streets: Street[], cellSize: number): CleaningGrid {
    // Calculate area bounds
    let minLng = Infinity, maxLng = -Infinity
    let minLat = Infinity, maxLat = -Infinity
    
    streets.forEach(street => {
      street.path.forEach(point => {
        minLng = Math.min(minLng, point[0])
        maxLng = Math.max(maxLng, point[0])
        minLat = Math.min(minLat, point[1])
        maxLat = Math.max(maxLat, point[1])
      })
    })
    
    const bounds: [[number, number], [number, number]] = [[minLng, minLat], [maxLng, maxLat]]
    
    // Create grid cells
    const cellsLng = Math.ceil((maxLng - minLng) * 111320 / cellSize) // Approximate meters per degree
    const cellsLat = Math.ceil((maxLat - minLat) * 111320 / cellSize)
    
    const cells: GridCell[][] = []
    
    for (let row = 0; row < cellsLat; row++) {
      const cellRow: GridCell[] = []
      
      for (let col = 0; col < cellsLng; col++) {
        const cellMinLng = minLng + (col * (maxLng - minLng)) / cellsLng
        const cellMaxLng = minLng + ((col + 1) * (maxLng - minLng)) / cellsLng
        const cellMinLat = minLat + (row * (maxLat - minLat)) / cellsLat
        const cellMaxLat = minLat + ((row + 1) * (maxLat - minLat)) / cellsLat
        
        const cellBounds: [[number, number], [number, number]] = [
          [cellMinLng, cellMinLat],
          [cellMaxLng, cellMaxLat]
        ]
        
        const cellStreets = this.findStreetsInCell(streets, cellBounds)
        
        const cell: GridCell = {
          id: `cell_${row}_${col}`,
          bounds: cellBounds,
          streets: cellStreets,
          priority: this.calculateCellPriority(cellStreets),
          cleaned: false,
          estimatedTime: this.calculateCellCleaningTime(cellStreets)
        }
        
        cellRow.push(cell)
      }
      
      cells.push(cellRow)
    }
    
    return {
      cells,
      bounds,
      cellSize
    }
  }

  /**
   * Find streets that intersect with a grid cell
   */
  private findStreetsInCell(
    streets: Street[],
    cellBounds: [[number, number], [number, number]]
  ): Street[] {
    const [[minLng, minLat], [maxLng, maxLat]] = cellBounds
    
    return streets.filter(street => {
      return street.path.some(point => {
        const [lng, lat] = point
        return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
      })
    })
  }

  /**
   * Calculate priority score for a grid cell
   */
  private calculateCellPriority(streets: Street[]): number {
    if (streets.length === 0) return 0
    
    const priorityValues = { critical: 100, high: 75, medium: 50, low: 25 }
    const totalPriority = streets.reduce((sum, street) => 
      sum + (priorityValues[street.priority] || 25), 0
    )
    
    return totalPriority / streets.length
  }

  /**
   * Calculate estimated cleaning time for a cell
   */
  private calculateCellCleaningTime(streets: Street[]): number {
    return streets.reduce((sum, street) => {
      const streetLength = street.length / 1000 // km
      const cleaningSpeed = this.getCleaningSpeedForStreet(street)
      return sum + (streetLength / cleaningSpeed) * 60 // minutes
    }, 0)
  }

  /**
   * Get cleaning speed based on street characteristics
   */
  private getCleaningSpeedForStreet(street: Street): number {
    let speed = 12 // Base speed in km/h
    
    // Surface type factor
    const surfaceFactors = {
      asphalt: 1.0,
      concrete: 0.85,
      cobblestone: 0.65
    }
    speed *= surfaceFactors[street.surfaceType] || 1.0
    
    // Cleanliness factor
    const cleanlinessFactors = {
      very_dirty: 0.5,
      dirty: 0.65,
      moderate: 0.8,
      clean: 0.9,
      very_clean: 1.0
    }
    speed *= cleanlinessFactors[street.cleanliness]
    
    return Math.max(speed, 3) // Minimum 3 km/h
  }

  /**
   * Generate spiral sequence from grid
   */
  private generateSpiralSequence(
    grid: CleaningGrid,
    direction: 'clockwise' | 'counterclockwise'
  ): GridCell[] {
    const cells = grid.cells
    const rows = cells.length
    const cols = cells[0]?.length || 0
    
    if (rows === 0 || cols === 0) return []
    
    const sequence: GridCell[] = []
    const visited = Array(rows).fill(null).map(() => Array(cols).fill(false))
    
    let top = 0, bottom = rows - 1, left = 0, right = cols - 1
    
    while (top <= bottom && left <= right) {
      if (direction === 'clockwise') {
        // Move right along top row
        for (let col = left; col <= right; col++) {
          if (cells[top][col].streets.length > 0) {
            sequence.push(cells[top][col])
          }
          visited[top][col] = true
        }
        top++
        
        // Move down along right column
        for (let row = top; row <= bottom; row++) {
          if (cells[row][right].streets.length > 0) {
            sequence.push(cells[row][right])
          }
          visited[row][right] = true
        }
        right--
        
        // Move left along bottom row
        if (top <= bottom) {
          for (let col = right; col >= left; col--) {
            if (cells[bottom][col].streets.length > 0) {
              sequence.push(cells[bottom][col])
            }
            visited[bottom][col] = true
          }
          bottom--
        }
        
        // Move up along left column
        if (left <= right) {
          for (let row = bottom; row >= top; row--) {
            if (cells[row][left].streets.length > 0) {
              sequence.push(cells[row][left])
            }
            visited[row][left] = true
          }
          left++
        }
      } else {
        // Counterclockwise spiral
        // Move down along left column
        for (let row = top; row <= bottom; row++) {
          if (cells[row][left].streets.length > 0) {
            sequence.push(cells[row][left])
          }
          visited[row][left] = true
        }
        left++
        
        // Move right along bottom row
        if (top <= bottom) {
          for (let col = left; col <= right; col++) {
            if (cells[bottom][col].streets.length > 0) {
              sequence.push(cells[bottom][col])
            }
            visited[bottom][col] = true
          }
          bottom--
        }
        
        // Move up along right column
        if (left <= right) {
          for (let row = bottom; row >= top; row--) {
            if (cells[row][right].streets.length > 0) {
              sequence.push(cells[row][right])
            }
            visited[row][right] = true
          }
          right--
        }
        
        // Move left along top row
        if (top <= bottom) {
          for (let col = right; col >= left; col--) {
            if (cells[top][col].streets.length > 0) {
              sequence.push(cells[top][col])
            }
            visited[top][col] = true
          }
          top++
        }
      }
    }
    
    return sequence
  }

  /**
   * Generate north-south oriented grid cleaning sequence
   */
  private generateNorthSouthGrid(grid: CleaningGrid): GridCell[] {
    const sequence: GridCell[] = []
    const cells = grid.cells
    
    for (let col = 0; col < cells[0]?.length || 0; col++) {
      const columnCells: GridCell[] = []
      
      for (let row = 0; row < cells.length; row++) {
        if (cells[row][col].streets.length > 0) {
          columnCells.push(cells[row][col])
        }
      }
      
      // Alternate direction for back-and-forth pattern
      if (col % 2 === 1) {
        columnCells.reverse()
      }
      
      sequence.push(...columnCells)
    }
    
    return sequence
  }

  /**
   * Generate east-west oriented grid cleaning sequence
   */
  private generateEastWestGrid(grid: CleaningGrid): GridCell[] {
    const sequence: GridCell[] = []
    const cells = grid.cells
    
    for (let row = 0; row < cells.length; row++) {
      const rowCells: GridCell[] = []
      
      for (let col = 0; col < cells[row].length; col++) {
        if (cells[row][col].streets.length > 0) {
          rowCells.push(cells[row][col])
        }
      }
      
      // Alternate direction for back-and-forth pattern
      if (row % 2 === 1) {
        rowCells.reverse()
      }
      
      sequence.push(...rowCells)
    }
    
    return sequence
  }

  /**
   * Determine optimal grid orientation based on street layout
   */
  private generateOptimalGridOrientation(
    grid: CleaningGrid,
    vehicle: CleaningVehicle
  ): GridCell[] {
    // Test both orientations and choose the one with fewer turns
    const nsSequence = this.generateNorthSouthGrid(grid)
    const ewSequence = this.generateEastWestGrid(grid)
    
    const nsTurns = this.calculateSequenceTurns(nsSequence)
    const ewTurns = this.calculateSequenceTurns(ewSequence)
    
    return nsTurns <= ewTurns ? nsSequence : ewSequence
  }

  /**
   * Calculate number of turns in a sequence
   */
  private calculateSequenceTurns(sequence: GridCell[]): number {
    let turns = 0
    
    for (let i = 2; i < sequence.length; i++) {
      const prev = this.getCellCenter(sequence[i - 2])
      const curr = this.getCellCenter(sequence[i - 1])
      const next = this.getCellCenter(sequence[i])
      
      const bearing1 = calculateBearing(prev, curr)
      const bearing2 = calculateBearing(curr, next)
      const bearingChange = Math.abs(bearing2 - bearing1)
      
      if (bearingChange > 45 && bearingChange < 315) {
        turns++
      }
    }
    
    return turns
  }

  /**
   * Get center point of a grid cell
   */
  private getCellCenter(cell: GridCell): [number, number] {
    const [[minLng, minLat], [maxLng, maxLat]] = cell.bounds
    return [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
  }

  /**
   * Convert grid sequence to optimized segments
   */
  private convertGridSequenceToSegments(
    gridSequence: GridCell[],
    vehicle: CleaningVehicle,
    options: PatternOptions
  ): OptimizedStreetSegment[] {
    const segments: OptimizedStreetSegment[] = []
    let sequenceNumber = 1
    
    for (const cell of gridSequence) {
      for (const street of cell.streets) {
        const segment: OptimizedStreetSegment = {
          streetId: street.id,
          sequence: sequenceNumber++,
          path: street.path,
          cleaningDirection: 'forward',
          estimatedTime: this.calculateSegmentTime(street, vehicle),
          fuelCost: this.calculateSegmentFuelCost(street, vehicle),
          priority: street.priority
        }
        
        segments.push(segment)
      }
    }
    
    return options.minimizeTurnarounds ? 
      this.minimizeTurnarounds(segments, vehicle) : segments
  }

  /**
   * Find parallel street groups
   */
  private findParallelStreetGroups(streets: Street[]): Street[][] {
    const groups: Street[][] = []
    const processed = new Set<string>()
    
    for (const street of streets) {
      if (processed.has(street.id)) continue
      
      const group = [street]
      processed.add(street.id)
      
      const streetBearing = this.calculateStreetBearing(street)
      
      for (const otherStreet of streets) {
        if (processed.has(otherStreet.id)) continue
        
        const otherBearing = this.calculateStreetBearing(otherStreet)
        const bearingDiff = Math.abs(streetBearing - otherBearing)
        
        // Consider streets parallel if bearing difference is < 20 degrees
        if (bearingDiff < 20 || bearingDiff > 340) {
          group.push(otherStreet)
          processed.add(otherStreet.id)
        }
      }
      
      groups.push(group)
    }
    
    return groups
  }

  /**
   * Calculate average bearing of a street
   */
  private calculateStreetBearing(street: Street): number {
    if (street.path.length < 2) return 0
    
    const bearings: number[] = []
    for (let i = 0; i < street.path.length - 1; i++) {
      bearings.push(calculateBearing(street.path[i], street.path[i + 1]))
    }
    
    return bearings.reduce((sum, bearing) => sum + bearing, 0) / bearings.length
  }

  /**
   * Sort streets within parallel group for optimal back-and-forth
   */
  private sortStreetsForBackForth(streets: Street[], vehicle: CleaningVehicle): Street[] {
    if (streets.length === 0) return []
    
    // Sort by perpendicular distance from first street
    const reference = streets[0]
    const refCenter = this.getStreetCenter(reference)
    
    return streets.sort((a, b) => {
      const aCenter = this.getStreetCenter(a)
      const bCenter = this.getStreetCenter(b)
      
      const aDist = calculateDistance(refCenter, aCenter)
      const bDist = calculateDistance(refCenter, bCenter)
      
      return aDist - bDist
    })
  }

  /**
   * Get center point of a street
   */
  private getStreetCenter(street: Street): [number, number] {
    const centerIndex = Math.floor(street.path.length / 2)
    return street.path[centerIndex]
  }

  /**
   * Generate back-and-forth cleaning sequence
   */
  private generateBackForthSequence(
    streets: Street[],
    vehicle: CleaningVehicle,
    options: PatternOptions
  ): OptimizedStreetSegment[] {
    const segments: OptimizedStreetSegment[] = []
    
    streets.forEach((street, index) => {
      // Alternate direction for adjacent streets
      const cleaningDirection = index % 2 === 0 ? 'forward' : 'reverse'
      const path = cleaningDirection === 'reverse' ? [...street.path].reverse() : street.path
      
      const segment: OptimizedStreetSegment = {
        streetId: street.id,
        sequence: index + 1,
        path: path,
        cleaningDirection: cleaningDirection,
        estimatedTime: this.calculateSegmentTime(street, vehicle),
        fuelCost: this.calculateSegmentFuelCost(street, vehicle),
        priority: street.priority
      }
      
      segments.push(segment)
    })
    
    return segments
  }

  /**
   * Identify perimeter and inner streets
   */
  private identifyPerimeterAndInnerStreets(
    streets: Street[]
  ): { perimeterStreets: Street[]; innerStreets: Street[] } {
    if (streets.length === 0) {
      return { perimeterStreets: [], innerStreets: [] }
    }
    
    // Calculate area center and bounds
    const center = this.calculateStreetsCenter(streets)
    const maxDistance = Math.max(...streets.map(street => 
      Math.max(...street.path.map(point => calculateDistance(center, point)))
    ))
    
    const perimeterThreshold = maxDistance * 0.75 // 75% of max distance
    
    const perimeterStreets: Street[] = []
    const innerStreets: Street[] = []
    
    for (const street of streets) {
      const streetCenter = this.getStreetCenter(street)
      const distanceFromCenter = calculateDistance(center, streetCenter)
      
      if (distanceFromCenter >= perimeterThreshold) {
        perimeterStreets.push(street)
      } else {
        innerStreets.push(street)
      }
    }
    
    return { perimeterStreets, innerStreets }
  }

  /**
   * Calculate center point of all streets
   */
  private calculateStreetsCenter(streets: Street[]): [number, number] {
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
   * Optimize perimeter cleaning sequence
   */
  private optimizePerimeterSequence(
    perimeterStreets: Street[],
    vehicle: CleaningVehicle,
    options: PatternOptions
  ): OptimizedStreetSegment[] {
    // Sort perimeter streets in circular order
    if (perimeterStreets.length === 0) return []
    
    const center = this.calculateStreetsCenter(perimeterStreets)
    
    const streetAngles = perimeterStreets.map(street => {
      const streetCenter = this.getStreetCenter(street)
      const angle = Math.atan2(
        streetCenter[1] - center[1],
        streetCenter[0] - center[0]
      ) * 180 / Math.PI
      
      return { street, angle: angle < 0 ? angle + 360 : angle }
    })
    
    // Sort by angle for circular traversal
    streetAngles.sort((a, b) => a.angle - b.angle)
    
    return streetAngles.map((item, index) => ({
      streetId: item.street.id,
      sequence: index + 1,
      path: item.street.path,
      cleaningDirection: 'forward',
      estimatedTime: this.calculateSegmentTime(item.street, vehicle),
      fuelCost: this.calculateSegmentFuelCost(item.street, vehicle),
      priority: item.street.priority
    }))
  }

  /**
   * Optimize connections between segments
   */
  private optimizeSegmentConnections(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle,
    options: PatternOptions
  ): OptimizedStreetSegment[] {
    if (!options.minimizeTurnarounds || segments.length < 2) return segments
    
    return this.minimizeTurnarounds(segments, vehicle)
  }

  /**
   * Minimize turnarounds using nearest neighbor optimization
   */
  private minimizeTurnarounds(
    segments: OptimizedStreetSegment[],
    vehicle: CleaningVehicle
  ): OptimizedStreetSegment[] {
    if (segments.length < 2) return segments
    
    const optimized = [segments[0]]
    const remaining = segments.slice(1)
    
    while (remaining.length > 0) {
      const lastSegment = optimized[optimized.length - 1]
      let bestIndex = 0
      let bestScore = this.calculateConnectionScore(lastSegment, remaining[0], vehicle)
      
      for (let i = 1; i < remaining.length; i++) {
        const score = this.calculateConnectionScore(lastSegment, remaining[i], vehicle)
        if (score > bestScore) {
          bestScore = score
          bestIndex = i
        }
      }
      
      optimized.push(remaining[bestIndex])
      remaining.splice(bestIndex, 1)
    }
    
    // Update sequence numbers
    return optimized.map((segment, index) => ({
      ...segment,
      sequence: index + 1
    }))
  }

  /**
   * Calculate connection score between two segments
   */
  private calculateConnectionScore(
    seg1: OptimizedStreetSegment,
    seg2: OptimizedStreetSegment,
    vehicle: CleaningVehicle
  ): number {
    const end1 = seg1.path[seg1.path.length - 1]
    const start2 = seg2.path[0]
    
    // Distance factor (closer is better)
    const distance = calculateDistance(end1, start2)
    const distanceScore = 1000 / (distance + 1)
    
    // Turn angle factor (straighter is better)
    let angleScore = 180 // Default score
    
    if (seg1.path.length >= 2 && seg2.path.length >= 2) {
      const beforeEnd = seg1.path[seg1.path.length - 2]
      const afterStart = seg2.path[1]
      
      const bearing1 = calculateBearing(beforeEnd, end1)
      const bearing2 = calculateBearing(start2, afterStart)
      const angleDiff = Math.abs(bearing1 - bearing2)
      const normalizedAngle = angleDiff > 180 ? 360 - angleDiff : angleDiff
      
      angleScore = 180 - normalizedAngle
    }
    
    // Vehicle capability factor
    const canMakeTurn = distance >= vehicle.turnRadius ? 1.0 : 0.5
    
    return (distanceScore * 0.5 + angleScore * 0.3) * canMakeTurn
  }

  /**
   * Calculate estimated time for cleaning a street segment
   */
  private calculateSegmentTime(street: Street, vehicle: CleaningVehicle): number {
    const streetLength = street.length / 1000 // Convert to km
    const cleaningSpeed = Math.min(
      vehicle.maxSpeed,
      this.getCleaningSpeedForStreet(street)
    )
    
    return (streetLength / cleaningSpeed) * 60 // Return minutes
  }

  /**
   * Calculate fuel cost for cleaning a street segment
   */
  private calculateSegmentFuelCost(street: Street, vehicle: CleaningVehicle): number {
    const streetLength = street.length / 1000 // Convert to km
    const baseFuel = streetLength / vehicle.fuelEfficiency
    
    // Apply cleaning-specific multipliers
    let multiplier = 1.3 // Base cleaning equipment overhead
    
    // Surface type multiplier
    const surfaceMultipliers = {
      asphalt: 1.0,
      concrete: 1.1,
      cobblestone: 1.25
    }
    multiplier *= surfaceMultipliers[street.surfaceType] || 1.0
    
    // Cleanliness multiplier
    const cleanlinessMultipliers = {
      very_dirty: 1.4,
      dirty: 1.2,
      moderate: 1.0,
      clean: 0.9,
      very_clean: 0.8
    }
    multiplier *= cleanlinessMultipliers[street.cleanliness]
    
    return baseFuel * multiplier
  }
}