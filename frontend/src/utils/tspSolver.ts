/**
 * Traveling Salesman Problem (TSP) Solver for Street Cleaning Optimization
 * Optimizes the sequence of street cleaning to minimize fuel consumption and travel time
 */

import { calculateDistance } from './routeOptimization'
import type { Street, CleaningVehicle, OptimizedStreetSegment } from './streetCleaningOptimizer'

export interface TSPNode {
  id: string
  position: [number, number] // Representative position of the street
  street: Street
  priority: number // Higher values = higher priority
}

export interface TSPSolution {
  sequence: TSPNode[]
  totalDistance: number
  totalTime: number
  fuelCost: number
  efficiency: number // Efficiency score vs naive approach
}

export interface TSPOptions {
  algorithm: 'nearest_neighbor' | 'genetic' | 'ant_colony' | 'hybrid'
  maxIterations?: number
  populationSize?: number // For genetic algorithm
  mutationRate?: number // For genetic algorithm
  eliteRatio?: number // Percentage of best solutions to keep
  timeLimitMs?: number
  priorityWeight?: number // How much to weight cleaning priority vs distance
  fuelOptimization?: boolean
}

/**
 * TSP Solver specialized for street cleaning route optimization
 */
export class CleaningTSPSolver {
  private distanceMatrix: number[][] = []
  private fuelCostMatrix: number[][] = []
  private timeMatrix: number[][] = []
  private nodes: TSPNode[] = []
  private vehicle: CleaningVehicle | null = null

  constructor() {}

  /**
   * Solve TSP for optimal street cleaning sequence
   */
  async solveTSP(
    streets: Street[],
    vehicle: CleaningVehicle,
    startPosition: [number, number],
    options: TSPOptions = {}
  ): Promise<TSPSolution> {
    const {
      algorithm = 'hybrid',
      maxIterations = 1000,
      populationSize = 50,
      mutationRate = 0.1,
      eliteRatio = 0.2,
      timeLimitMs = 30000, // 30 seconds max
      priorityWeight = 0.3,
      fuelOptimization = true
    } = options

    this.vehicle = vehicle
    
    // Prepare nodes and matrices
    this.prepareNodes(streets, startPosition)
    this.buildDistanceMatrix()
    if (fuelOptimization) {
      this.buildFuelCostMatrix()
    }
    this.buildTimeMatrix()

    let solution: TSPSolution

    const startTime = Date.now()
    
    switch (algorithm) {
      case 'nearest_neighbor':
        solution = this.solveNearestNeighbor(priorityWeight)
        break
      case 'genetic':
        solution = await this.solveGenetic({
          populationSize,
          maxIterations,
          mutationRate,
          eliteRatio,
          timeLimitMs,
          priorityWeight,
          fuelOptimization
        })
        break
      case 'ant_colony':
        solution = await this.solveAntColony({
          maxIterations,
          timeLimitMs,
          priorityWeight,
          fuelOptimization
        })
        break
      case 'hybrid':
      default:
        solution = await this.solveHybrid({
          maxIterations,
          populationSize,
          mutationRate,
          timeLimitMs,
          priorityWeight,
          fuelOptimization
        })
        break
    }

    const solveTime = Date.now() - startTime
    console.log(`TSP solved in ${solveTime}ms using ${algorithm} algorithm`)

    return solution
  }

  /**
   * Prepare TSP nodes from streets
   */
  private prepareNodes(streets: Street[], startPosition: [number, number]): void {
    this.nodes = []
    
    // Add start position as first node
    this.nodes.push({
      id: 'start',
      position: startPosition,
      street: {
        id: 'start',
        name: 'Start Position',
        path: [startPosition],
        length: 0,
        priority: 'low',
        cleanliness: 'clean',
        width: 10,
        trafficLevel: 'low',
        surfaceType: 'asphalt',
        slope: 0
      },
      priority: 0
    })

    // Add street nodes
    streets.forEach((street, index) => {
      // Use street center as representative position
      const centerIndex = Math.floor(street.path.length / 2)
      const position = street.path[centerIndex]

      const priorityValues = { 'critical': 100, 'high': 75, 'medium': 50, 'low': 25 }
      const priority = priorityValues[street.priority] || 25

      this.nodes.push({
        id: street.id,
        position: position,
        street: street,
        priority: priority
      })
    })
  }

  /**
   * Build distance matrix between all nodes
   */
  private buildDistanceMatrix(): void {
    const n = this.nodes.length
    this.distanceMatrix = Array(n).fill(null).map(() => Array(n).fill(0))

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          this.distanceMatrix[i][j] = 0
        } else {
          this.distanceMatrix[i][j] = calculateDistance(
            this.nodes[i].position,
            this.nodes[j].position
          )
        }
      }
    }
  }

  /**
   * Build fuel cost matrix considering vehicle characteristics
   */
  private buildFuelCostMatrix(): void {
    const n = this.nodes.length
    this.fuelCostMatrix = Array(n).fill(null).map(() => Array(n).fill(0))

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || !this.vehicle) {
          this.fuelCostMatrix[i][j] = 0
        } else {
          this.fuelCostMatrix[i][j] = this.calculateFuelCost(i, j)
        }
      }
    }
  }

  /**
   * Calculate fuel cost between two nodes
   */
  private calculateFuelCost(fromIndex: number, toIndex: number): number {
    if (!this.vehicle) return 0

    const distance = this.distanceMatrix[fromIndex][toIndex] / 1000 // Convert to km
    const baseFuelCost = distance / this.vehicle.fuelEfficiency

    // Apply cleaning-specific factors
    const toStreet = this.nodes[toIndex].street
    let fuelMultiplier = 1.0

    // Fuel consumption varies by street surface and cleanliness
    const surfaceFactors = {
      'asphalt': 1.0,
      'concrete': 1.15,
      'cobblestone': 1.3
    }
    fuelMultiplier *= surfaceFactors[toStreet.surfaceType] || 1.0

    const cleanlinessFactors = {
      'very_dirty': 1.5,
      'dirty': 1.3,
      'moderate': 1.1,
      'clean': 1.0,
      'very_clean': 0.9
    }
    fuelMultiplier *= cleanlinessFactors[toStreet.cleanliness]

    // Traffic factor
    const trafficFactors = {
      'low': 1.0,
      'medium': 1.2,
      'high': 1.4
    }
    fuelMultiplier *= trafficFactors[toStreet.trafficLevel]

    return baseFuelCost * fuelMultiplier
  }

  /**
   * Build time matrix considering cleaning operations
   */
  private buildTimeMatrix(): void {
    const n = this.nodes.length
    this.timeMatrix = Array(n).fill(null).map(() => Array(n).fill(0))

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || !this.vehicle) {
          this.timeMatrix[i][j] = 0
        } else {
          this.timeMatrix[i][j] = this.calculateTravelAndCleaningTime(i, j)
        }
      }
    }
  }

  /**
   * Calculate travel time + cleaning time between nodes
   */
  private calculateTravelAndCleaningTime(fromIndex: number, toIndex: number): number {
    if (!this.vehicle) return 0

    const distance = this.distanceMatrix[fromIndex][toIndex] / 1000 // km
    const street = this.nodes[toIndex].street

    // Travel time
    const averageSpeed = 30 // km/h average speed between streets
    const travelTime = (distance / averageSpeed) * 60 // minutes

    // Cleaning time
    const cleaningSpeed = this.getCleaningSpeed(street)
    const cleaningTime = (street.length / 1000 / cleaningSpeed) * 60 // minutes

    return travelTime + cleaningTime
  }

  /**
   * Get optimal cleaning speed based on street conditions
   */
  private getCleaningSpeed(street: Street): number {
    let speed = this.vehicle?.maxSpeed || 15

    // Adjust for street conditions
    const surfaceFactors = {
      'asphalt': 1.0,
      'concrete': 0.9,
      'cobblestone': 0.7
    }
    speed *= surfaceFactors[street.surfaceType] || 1.0

    const cleanlinessFactors = {
      'very_dirty': 0.6,
      'dirty': 0.75,
      'moderate': 0.85,
      'clean': 0.95,
      'very_clean': 1.0
    }
    speed *= cleanlinessFactors[street.cleanliness]

    return Math.max(speed, 5) // Minimum 5 km/h
  }

  /**
   * Nearest Neighbor algorithm - fast but not optimal
   */
  private solveNearestNeighbor(priorityWeight: number): TSPSolution {
    const visited = new Set<number>()
    const sequence: TSPNode[] = []
    let current = 0 // Start from depot
    let totalDistance = 0
    let totalTime = 0
    let fuelCost = 0

    visited.add(current)
    sequence.push(this.nodes[current])

    while (visited.size < this.nodes.length) {
      let bestNext = -1
      let bestScore = -Infinity

      for (let i = 0; i < this.nodes.length; i++) {
        if (visited.has(i)) continue

        const distance = this.distanceMatrix[current][i]
        const priority = this.nodes[i].priority
        
        // Combined score: lower distance is better, higher priority is better
        const distanceScore = 1000000 / (distance + 1) // Inverse distance
        const priorityScore = priority * priorityWeight * 10000
        const score = distanceScore + priorityScore

        if (score > bestScore) {
          bestScore = score
          bestNext = i
        }
      }

      if (bestNext !== -1) {
        totalDistance += this.distanceMatrix[current][bestNext]
        totalTime += this.timeMatrix[current][bestNext]
        if (this.fuelCostMatrix.length > 0) {
          fuelCost += this.fuelCostMatrix[current][bestNext]
        }

        visited.add(bestNext)
        sequence.push(this.nodes[bestNext])
        current = bestNext
      }
    }

    // Return to start
    if (this.nodes.length > 1) {
      totalDistance += this.distanceMatrix[current][0]
      totalTime += this.timeMatrix[current][0]
      if (this.fuelCostMatrix.length > 0) {
        fuelCost += this.fuelCostMatrix[current][0]
      }
    }

    const efficiency = this.calculateEfficiency(totalDistance, totalTime, fuelCost)

    return {
      sequence,
      totalDistance,
      totalTime,
      fuelCost,
      efficiency
    }
  }

  /**
   * Genetic Algorithm for better optimization
   */
  private async solveGenetic(options: {
    populationSize: number
    maxIterations: number
    mutationRate: number
    eliteRatio: number
    timeLimitMs: number
    priorityWeight: number
    fuelOptimization: boolean
  }): Promise<TSPSolution> {
    const startTime = Date.now()
    
    // Initialize population
    let population = this.initializePopulation(options.populationSize)
    let bestSolution = this.evaluateChromosome(population[0], options.priorityWeight, options.fuelOptimization)

    for (let generation = 0; generation < options.maxIterations; generation++) {
      // Check time limit
      if (Date.now() - startTime > options.timeLimitMs) break

      // Evaluate fitness for all chromosomes
      const evaluatedPop = population.map(chromosome => 
        this.evaluateChromosome(chromosome, options.priorityWeight, options.fuelOptimization)
      )

      // Sort by fitness (lower total cost is better)
      evaluatedPop.sort((a, b) => a.fitness - b.fitness)

      // Update best solution
      if (evaluatedPop[0].fitness < bestSolution.fitness) {
        bestSolution = evaluatedPop[0]
      }

      // Selection and reproduction
      const eliteCount = Math.floor(options.populationSize * options.eliteRatio)
      const newPopulation: number[][] = []

      // Keep elite solutions
      for (let i = 0; i < eliteCount; i++) {
        newPopulation.push([...evaluatedPop[i].chromosome])
      }

      // Generate offspring
      while (newPopulation.length < options.populationSize) {
        const parent1 = this.tournamentSelection(evaluatedPop)
        const parent2 = this.tournamentSelection(evaluatedPop)
        const offspring = this.crossover(parent1, parent2)
        
        if (Math.random() < options.mutationRate) {
          this.mutate(offspring)
        }
        
        newPopulation.push(offspring)
      }

      population = newPopulation
    }

    return this.chromosomeToSolution(bestSolution.chromosome, options.priorityWeight, options.fuelOptimization)
  }

  /**
   * Initialize random population for genetic algorithm
   */
  private initializePopulation(size: number): number[][] {
    const population: number[][] = []
    
    for (let i = 0; i < size; i++) {
      const chromosome = Array.from({ length: this.nodes.length - 1 }, (_, j) => j + 1)
      
      // Shuffle chromosome (excluding start node 0)
      for (let j = chromosome.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1))
        ;[chromosome[j], chromosome[k]] = [chromosome[k], chromosome[j]]
      }
      
      population.push(chromosome)
    }
    
    return population
  }

  /**
   * Evaluate chromosome fitness
   */
  private evaluateChromosome(chromosome: number[], priorityWeight: number, fuelOptimization: boolean): {
    chromosome: number[]
    fitness: number
    distance: number
    time: number
    fuel: number
  } {
    let totalDistance = 0
    let totalTime = 0
    let totalFuel = 0
    let priorityBonus = 0

    // Calculate path cost starting from depot (0)
    let current = 0
    
    for (const next of chromosome) {
      totalDistance += this.distanceMatrix[current][next]
      totalTime += this.timeMatrix[current][next]
      if (fuelOptimization && this.fuelCostMatrix.length > 0) {
        totalFuel += this.fuelCostMatrix[current][next]
      }
      
      // Priority bonus for cleaning high-priority streets earlier
      const position = chromosome.indexOf(next) + 1
      const timePenalty = position / chromosome.length // Later = higher penalty
      priorityBonus += this.nodes[next].priority * (1 - timePenalty)
      
      current = next
    }

    // Return to depot
    totalDistance += this.distanceMatrix[current][0]
    totalTime += this.timeMatrix[current][0]
    if (fuelOptimization && this.fuelCostMatrix.length > 0) {
      totalFuel += this.fuelCostMatrix[current][0]
    }

    // Combined fitness score
    const costWeight = fuelOptimization ? 0.4 : 0.6
    const timeWeight = 0.4
    const distanceWeight = fuelOptimization ? 0.2 : 0.4

    const normalizedDistance = totalDistance / 10000 // Normalize to similar scale
    const normalizedTime = totalTime / 100
    const normalizedFuel = totalFuel * 1000 // Fuel is typically small numbers
    const normalizedPriority = priorityBonus / 100

    const fitness = (normalizedDistance * distanceWeight) + 
                   (normalizedTime * timeWeight) + 
                   (normalizedFuel * costWeight) - 
                   (normalizedPriority * priorityWeight)

    return {
      chromosome,
      fitness,
      distance: totalDistance,
      time: totalTime,
      fuel: totalFuel
    }
  }

  /**
   * Tournament selection for genetic algorithm
   */
  private tournamentSelection(population: any[], tournamentSize: number = 3): number[] {
    const tournament = []
    for (let i = 0; i < tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * population.length)
      tournament.push(population[randomIndex])
    }
    
    tournament.sort((a, b) => a.fitness - b.fitness)
    return tournament[0].chromosome
  }

  /**
   * Order crossover (OX) for TSP
   */
  private crossover(parent1: number[], parent2: number[]): number[] {
    const length = parent1.length
    const start = Math.floor(Math.random() * length)
    const end = Math.floor(Math.random() * (length - start)) + start

    const offspring = new Array(length).fill(-1)
    
    // Copy segment from parent1
    for (let i = start; i <= end; i++) {
      offspring[i] = parent1[i]
    }

    // Fill remaining positions with parent2 order
    const remaining = parent2.filter(gene => !offspring.includes(gene))
    let remainingIndex = 0

    for (let i = 0; i < length; i++) {
      if (offspring[i] === -1) {
        offspring[i] = remaining[remainingIndex++]
      }
    }

    return offspring
  }

  /**
   * Mutation by swapping two random genes
   */
  private mutate(chromosome: number[]): void {
    const i = Math.floor(Math.random() * chromosome.length)
    const j = Math.floor(Math.random() * chromosome.length)
    ;[chromosome[i], chromosome[j]] = [chromosome[j], chromosome[i]]
  }

  /**
   * Ant Colony Optimization algorithm
   */
  private async solveAntColony(options: {
    maxIterations: number
    timeLimitMs: number
    priorityWeight: number
    fuelOptimization: boolean
  }): Promise<TSPSolution> {
    // Simplified ACO implementation
    const startTime = Date.now()
    const numAnts = Math.min(20, this.nodes.length)
    const alpha = 1.0 // Pheromone importance
    const beta = 2.0 // Heuristic importance
    const evaporation = 0.5
    const pheromoneDeposit = 100.0

    // Initialize pheromone matrix
    const n = this.nodes.length
    const pheromones = Array(n).fill(null).map(() => Array(n).fill(1.0))
    
    let bestSolution = this.solveNearestNeighbor(options.priorityWeight)

    for (let iter = 0; iter < options.maxIterations; iter++) {
      if (Date.now() - startTime > options.timeLimitMs) break

      const antSolutions: TSPSolution[] = []

      // Each ant constructs a solution
      for (let ant = 0; ant < numAnts; ant++) {
        const solution = this.constructAntSolution(pheromones, alpha, beta, options.priorityWeight)
        antSolutions.push(solution)

        if (solution.totalDistance < bestSolution.totalDistance) {
          bestSolution = solution
        }
      }

      // Update pheromones
      this.updatePheromones(pheromones, antSolutions, evaporation, pheromoneDeposit)
    }

    return bestSolution
  }

  /**
   * Construct solution for one ant
   */
  private constructAntSolution(
    pheromones: number[][],
    alpha: number,
    beta: number,
    priorityWeight: number
  ): TSPSolution {
    const visited = new Set<number>([0]) // Start at depot
    const sequence = [this.nodes[0]]
    let current = 0
    let totalDistance = 0
    let totalTime = 0
    let fuelCost = 0

    while (visited.size < this.nodes.length) {
      const next = this.selectNextAntNode(current, visited, pheromones, alpha, beta)
      
      if (next !== -1) {
        totalDistance += this.distanceMatrix[current][next]
        totalTime += this.timeMatrix[current][next]
        if (this.fuelCostMatrix.length > 0) {
          fuelCost += this.fuelCostMatrix[current][next]
        }

        visited.add(next)
        sequence.push(this.nodes[next])
        current = next
      } else {
        break
      }
    }

    // Return to depot
    if (visited.size > 1) {
      totalDistance += this.distanceMatrix[current][0]
      totalTime += this.timeMatrix[current][0]
      if (this.fuelCostMatrix.length > 0) {
        fuelCost += this.fuelCostMatrix[current][0]
      }
    }

    const efficiency = this.calculateEfficiency(totalDistance, totalTime, fuelCost)

    return {
      sequence,
      totalDistance,
      totalTime,
      fuelCost,
      efficiency
    }
  }

  /**
   * Select next node for ant based on probability
   */
  private selectNextAntNode(
    current: number,
    visited: Set<number>,
    pheromones: number[][],
    alpha: number,
    beta: number
  ): number {
    const probabilities: { node: number; prob: number }[] = []
    let totalProb = 0

    for (let i = 0; i < this.nodes.length; i++) {
      if (visited.has(i)) continue

      const pheromone = Math.pow(pheromones[current][i], alpha)
      const heuristic = Math.pow(1.0 / (this.distanceMatrix[current][i] + 1), beta)
      const priority = this.nodes[i].priority / 100.0
      
      const prob = pheromone * heuristic * (1 + priority)
      probabilities.push({ node: i, prob })
      totalProb += prob
    }

    if (totalProb === 0) return -1

    // Roulette wheel selection
    const random = Math.random() * totalProb
    let cumulative = 0

    for (const { node, prob } of probabilities) {
      cumulative += prob
      if (cumulative >= random) {
        return node
      }
    }

    return probabilities[probabilities.length - 1]?.node || -1
  }

  /**
   * Update pheromone trails
   */
  private updatePheromones(
    pheromones: number[][],
    solutions: TSPSolution[],
    evaporation: number,
    deposit: number
  ): void {
    const n = pheromones.length

    // Evaporate pheromones
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        pheromones[i][j] *= (1 - evaporation)
      }
    }

    // Deposit new pheromones
    for (const solution of solutions) {
      const pheromoneAmount = deposit / solution.totalDistance
      
      for (let i = 0; i < solution.sequence.length - 1; i++) {
        const from = this.nodes.findIndex(n => n.id === solution.sequence[i].id)
        const to = this.nodes.findIndex(n => n.id === solution.sequence[i + 1].id)
        
        if (from !== -1 && to !== -1) {
          pheromones[from][to] += pheromoneAmount
          pheromones[to][from] += pheromoneAmount
        }
      }
    }
  }

  /**
   * Hybrid algorithm combining multiple approaches
   */
  private async solveHybrid(options: {
    maxIterations: number
    populationSize: number
    mutationRate: number
    timeLimitMs: number
    priorityWeight: number
    fuelOptimization: boolean
  }): Promise<TSPSolution> {
    const startTime = Date.now()
    const timePerAlgorithm = options.timeLimitMs / 3

    // Run nearest neighbor for quick initial solution
    let bestSolution = this.solveNearestNeighbor(options.priorityWeight)

    // Run genetic algorithm
    if (Date.now() - startTime < options.timeLimitMs) {
      const geneticOptions = {
        ...options,
        timeLimitMs: Math.min(timePerAlgorithm, options.timeLimitMs - (Date.now() - startTime))
      }
      const geneticSolution = await this.solveGenetic(geneticOptions)
      if (geneticSolution.totalDistance < bestSolution.totalDistance) {
        bestSolution = geneticSolution
      }
    }

    // Run ant colony optimization
    if (Date.now() - startTime < options.timeLimitMs) {
      const acoOptions = {
        maxIterations: Math.floor(options.maxIterations / 2),
        timeLimitMs: options.timeLimitMs - (Date.now() - startTime),
        priorityWeight: options.priorityWeight,
        fuelOptimization: options.fuelOptimization
      }
      const acoSolution = await this.solveAntColony(acoOptions)
      if (acoSolution.totalDistance < bestSolution.totalDistance) {
        bestSolution = acoSolution
      }
    }

    return bestSolution
  }

  /**
   * Convert chromosome to TSP solution
   */
  private chromosomeToSolution(
    chromosome: number[],
    priorityWeight: number,
    fuelOptimization: boolean
  ): TSPSolution {
    const sequence = [this.nodes[0]] // Start at depot
    let totalDistance = 0
    let totalTime = 0
    let fuelCost = 0
    let current = 0

    for (const next of chromosome) {
      totalDistance += this.distanceMatrix[current][next]
      totalTime += this.timeMatrix[current][next]
      if (fuelOptimization && this.fuelCostMatrix.length > 0) {
        fuelCost += this.fuelCostMatrix[current][next]
      }
      
      sequence.push(this.nodes[next])
      current = next
    }

    // Return to depot
    totalDistance += this.distanceMatrix[current][0]
    totalTime += this.timeMatrix[current][0]
    if (fuelOptimization && this.fuelCostMatrix.length > 0) {
      fuelCost += this.fuelCostMatrix[current][0]
    }

    const efficiency = this.calculateEfficiency(totalDistance, totalTime, fuelCost)

    return {
      sequence,
      totalDistance,
      totalTime,
      fuelCost,
      efficiency
    }
  }

  /**
   * Calculate efficiency improvement over naive approach
   */
  private calculateEfficiency(distance: number, time: number, fuel: number): number {
    // Naive approach: visit streets in original order
    const naiveDistance = this.nodes.length * 1000 // Assume 1km between each street
    const naiveTime = this.nodes.length * 30 // 30 minutes per street
    const naiveFuel = this.nodes.length * 3 // 3L per street

    const distanceImprovement = Math.max(0, (naiveDistance - distance) / naiveDistance)
    const timeImprovement = Math.max(0, (naiveTime - time) / naiveTime)
    const fuelImprovement = fuel > 0 ? Math.max(0, (naiveFuel - fuel) / naiveFuel) : 0

    return (distanceImprovement + timeImprovement + fuelImprovement) / 3 * 100
  }

  /**
   * Convert TSP solution to optimized street segments
   */
  convertToOptimizedSegments(solution: TSPSolution): OptimizedStreetSegment[] {
    const segments: OptimizedStreetSegment[] = []

    // Skip the start depot node
    const streetNodes = solution.sequence.slice(1)

    streetNodes.forEach((node, index) => {
      if (node.street.id === 'start') return

      const segment: OptimizedStreetSegment = {
        streetId: node.street.id,
        sequence: index + 1,
        path: node.street.path,
        cleaningDirection: 'forward',
        estimatedTime: this.calculateSegmentTime(node.street),
        fuelCost: this.calculateSegmentFuelCost(node.street),
        priority: node.street.priority
      }

      segments.push(segment)
    })

    return segments
  }

  private calculateSegmentTime(street: Street): number {
    const cleaningSpeed = this.getCleaningSpeed(street)
    return (street.length / 1000 / cleaningSpeed) * 60 // minutes
  }

  private calculateSegmentFuelCost(street: Street): number {
    const distance = street.length / 1000 // km
    const baseFuel = distance / (this.vehicle?.fuelEfficiency || 10)
    
    // Apply street-specific factors
    const surfaceFactors = {
      'asphalt': 1.0,
      'concrete': 1.15,
      'cobblestone': 1.3
    }
    
    const cleanlinessFactors = {
      'very_dirty': 1.5,
      'dirty': 1.3,
      'moderate': 1.1,
      'clean': 1.0,
      'very_clean': 0.9
    }

    return baseFuel * 
           (surfaceFactors[street.surfaceType] || 1.0) * 
           cleanlinessFactors[street.cleanliness]
  }
}