/**
 * TSP Solver for Route Optimization
 * Implements multiple algorithms: Nearest Neighbor, Genetic Algorithm, Ant Colony Optimization
 */

import type {
  TSPNode,
  TSPSolution,
  TSPOptions,
  VehicleProfile,
  RouteConstraints,
} from './types';
import {
  buildDistanceMatrix,
  calculateRouteMetrics,
  calculateEfficiency,
  shuffleArray,
  randomInt,
} from './utils';
import { ConstraintValidator, applyConstraints } from './constraints';

export class TSPSolver {
  private distanceMatrix: number[][] = [];
  private nodes: TSPNode[] = [];
  private vehicle: VehicleProfile | undefined;
  private constraintValidator: ConstraintValidator | null = null;

  constructor(nodes: TSPNode[], vehicle?: VehicleProfile, constraints?: RouteConstraints) {
    this.nodes = nodes;
    this.vehicle = vehicle;
    this.distanceMatrix = buildDistanceMatrix(nodes);

    // Initialize constraint validator if constraints are provided
    if (constraints) {
      this.constraintValidator = new ConstraintValidator(
        constraints,
        this.distanceMatrix,
        vehicle
      );

      // Apply constraints to filter/modify nodes
      this.nodes = applyConstraints(nodes, constraints, this.distanceMatrix, vehicle);
    }
  }

  /**
   * Solve TSP using specified algorithm
   */
  async solve(options: TSPOptions): Promise<TSPSolution> {
    const {
      algorithm = 'hybrid',
      maxIterations = 1000,
      populationSize = 50,
      mutationRate = 0.1,
      eliteRatio = 0.2,
      timeLimitMs = 30000,
      priorityWeight = 0.3,
      fuelOptimization = true,
    } = options;

    const startTime = Date.now();

    let solution: TSPSolution;

    switch (algorithm) {
      case 'nearest_neighbor':
        solution = this.solveNearestNeighbor(priorityWeight);
        break;
      case 'genetic':
        solution = await this.solveGenetic({
          populationSize,
          maxIterations,
          mutationRate,
          eliteRatio,
          timeLimitMs,
          priorityWeight,
          fuelOptimization,
        });
        break;
      case 'ant_colony':
        solution = await this.solveAntColony({
          maxIterations,
          timeLimitMs,
          priorityWeight,
        });
        break;
      case 'hybrid':
      default:
        solution = await this.solveHybrid({
          maxIterations,
          populationSize,
          mutationRate,
          timeLimitMs,
          priorityWeight,
        });
        break;
    }

    const solveTime = Date.now() - startTime;
    console.log(`TSP solved in ${solveTime}ms using ${algorithm} algorithm`);

    return solution;
  }

  /**
   * Nearest Neighbor Algorithm
   * Fast greedy heuristic, good for initial solutions
   */
  private solveNearestNeighbor(priorityWeight: number): TSPSolution {
    if (this.nodes.length === 0) {
      throw new Error('No nodes to optimize');
    }

    if (this.nodes.length === 1) {
      return this.createSolution([this.nodes[0]]);
    }

    const visited = new Set<number>();
    const sequence: TSPNode[] = [];

    // Start with first node
    let currentIndex = 0;
    sequence.push(this.nodes[currentIndex]);
    visited.add(currentIndex);

    // Visit remaining nodes
    while (visited.size < this.nodes.length) {
      let bestIndex = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < this.nodes.length; i++) {
        if (visited.has(i)) continue;

        const distance = this.distanceMatrix[currentIndex][i];
        const priority = this.nodes[i].priority;

        // Score combines proximity and priority
        const distanceScore = 1000000 / (distance + 1);
        const priorityScore = priority * priorityWeight * 10000;
        const totalScore = distanceScore + priorityScore;

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestIndex = i;
        }
      }

      if (bestIndex === -1) break;

      currentIndex = bestIndex;
      sequence.push(this.nodes[currentIndex]);
      visited.add(currentIndex);
    }

    return this.createSolution(sequence);
  }

  /**
   * Genetic Algorithm
   * Population-based evolutionary optimization
   */
  private async solveGenetic(options: {
    populationSize: number;
    maxIterations: number;
    mutationRate: number;
    eliteRatio: number;
    timeLimitMs: number;
    priorityWeight: number;
    fuelOptimization: boolean;
  }): Promise<TSPSolution> {
    if (this.nodes.length < 2) {
      return this.solveNearestNeighbor(options.priorityWeight);
    }

    const {
      populationSize,
      maxIterations,
      mutationRate,
      eliteRatio,
      timeLimitMs,
      priorityWeight,
      fuelOptimization,
    } = options;

    const startTime = Date.now();

    // Generate initial population
    let population: number[][] = [];
    const nodeIndices = this.nodes.map((_, i) => i);

    for (let i = 0; i < populationSize; i++) {
      population.push(shuffleArray(nodeIndices));
    }

    let bestSolution: number[] = population[0];
    let bestFitness = -Infinity;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Check time limit
      if (Date.now() - startTime > timeLimitMs) {
        console.log(`Genetic algorithm stopped at iteration ${iteration} due to time limit`);
        break;
      }

      // Evaluate fitness
      const fitnesses = population.map((individual) =>
        this.evaluateFitness(individual, priorityWeight, fuelOptimization)
      );

      // Track best solution
      const currentBestIndex = fitnesses.indexOf(Math.max(...fitnesses));
      if (fitnesses[currentBestIndex] > bestFitness) {
        bestFitness = fitnesses[currentBestIndex];
        bestSolution = [...population[currentBestIndex]];
      }

      // Selection: Tournament selection
      const newPopulation: number[][] = [];
      const eliteCount = Math.floor(populationSize * eliteRatio);

      // Keep elite individuals
      const elite = population
        .map((individual, i) => ({ individual, fitness: fitnesses[i] }))
        .sort((a, b) => b.fitness - a.fitness)
        .slice(0, eliteCount)
        .map((item) => item.individual);

      newPopulation.push(...elite);

      // Generate offspring
      while (newPopulation.length < populationSize) {
        const parent1 = this.tournamentSelection(population, fitnesses, 3);
        const parent2 = this.tournamentSelection(population, fitnesses, 3);

        const offspring = this.orderCrossover(parent1, parent2);

        if (Math.random() < mutationRate) {
          this.swapMutation(offspring);
        }

        newPopulation.push(offspring);
      }

      population = newPopulation;
    }

    const sequence = bestSolution.map((i) => this.nodes[i]);
    return this.createSolution(sequence);
  }

  /**
   * Ant Colony Optimization
   * Swarm intelligence algorithm
   */
  private async solveAntColony(options: {
    maxIterations: number;
    timeLimitMs: number;
    priorityWeight: number;
  }): Promise<TSPSolution> {
    if (this.nodes.length < 2) {
      return this.solveNearestNeighbor(options.priorityWeight);
    }

    const { maxIterations, timeLimitMs, priorityWeight } = options;
    const startTime = Date.now();

    const n = this.nodes.length;
    const numAnts = Math.min(20, n);

    // ACO parameters
    const alpha = 1.0; // Pheromone importance
    const beta = 2.0; // Heuristic importance
    const evaporationRate = 0.5;
    const pheromoneDeposit = 100.0;

    // Initialize pheromone matrix
    const pheromones: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(1.0));

    let bestPath: number[] = [];
    let bestDistance = Infinity;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Check time limit
      if (Date.now() - startTime > timeLimitMs) {
        console.log(`ACO stopped at iteration ${iteration} due to time limit`);
        break;
      }

      const paths: number[][] = [];

      // Each ant constructs a solution
      for (let ant = 0; ant < numAnts; ant++) {
        const path: number[] = [];
        const visited = new Set<number>();

        // Start from random node
        let current = randomInt(0, n - 1);
        path.push(current);
        visited.add(current);

        // Build path
        while (visited.size < n) {
          const probabilities: number[] = [];
          let sum = 0;

          for (let j = 0; j < n; j++) {
            if (visited.has(j)) {
              probabilities.push(0);
            } else {
              const pheromone = Math.pow(pheromones[current][j], alpha);
              const heuristic = Math.pow(
                1 / (this.distanceMatrix[current][j] + 1),
                beta
              );
              const priority = 1 + this.nodes[j].priority * priorityWeight;
              const prob = pheromone * heuristic * priority;
              probabilities.push(prob);
              sum += prob;
            }
          }

          // Select next node probabilistically
          let rand = Math.random() * sum;
          let next = -1;
          for (let j = 0; j < n; j++) {
            rand -= probabilities[j];
            if (rand <= 0) {
              next = j;
              break;
            }
          }

          if (next === -1) next = probabilities.findIndex((p) => p > 0);

          current = next;
          path.push(current);
          visited.add(current);
        }

        paths.push(path);

        // Calculate path distance
        let distance = 0;
        for (let i = 0; i < path.length - 1; i++) {
          distance += this.distanceMatrix[path[i]][path[i + 1]];
        }

        if (distance < bestDistance) {
          bestDistance = distance;
          bestPath = [...path];
        }
      }

      // Evaporate pheromones
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          pheromones[i][j] *= 1 - evaporationRate;
        }
      }

      // Deposit pheromones
      for (const path of paths) {
        let distance = 0;
        for (let i = 0; i < path.length - 1; i++) {
          distance += this.distanceMatrix[path[i]][path[i + 1]];
        }

        const deposit = pheromoneDeposit / (distance + 1);

        for (let i = 0; i < path.length - 1; i++) {
          pheromones[path[i]][path[i + 1]] += deposit;
          pheromones[path[i + 1]][path[i]] += deposit;
        }
      }
    }

    const sequence = bestPath.map((i) => this.nodes[i]);
    return this.createSolution(sequence);
  }

  /**
   * Hybrid Algorithm
   * Runs multiple algorithms and picks best result
   */
  private async solveHybrid(options: {
    maxIterations: number;
    populationSize: number;
    mutationRate: number;
    timeLimitMs: number;
    priorityWeight: number;
  }): Promise<TSPSolution> {
    const timePerAlgorithm = options.timeLimitMs / 3;

    const solutions = await Promise.all([
      this.solveNearestNeighbor(options.priorityWeight),
      this.solveGenetic({ ...options, timeLimitMs: timePerAlgorithm, fuelOptimization: true, eliteRatio: 0.2 }),
      this.solveAntColony({ ...options, timeLimitMs: timePerAlgorithm }),
    ]);

    // Return solution with best (lowest) distance
    return solutions.reduce((best, current) =>
      current.totalDistance < best.totalDistance ? current : best
    );
  }

  /**
   * Helper: Evaluate fitness of a route
   */
  private evaluateFitness(
    route: number[],
    priorityWeight: number,
    fuelOptimization: boolean
  ): number {
    let distance = 0;
    let prioritySum = 0;

    for (let i = 0; i < route.length - 1; i++) {
      distance += this.distanceMatrix[route[i]][route[i + 1]];
      prioritySum += this.nodes[route[i]].priority;
    }

    // Higher priority nodes should be visited (negative because we minimize)
    const priorityScore = prioritySum * priorityWeight * 1000;

    // Lower distance is better (we want to minimize)
    let fitness = priorityScore - distance;

    // Apply constraint penalties if validator exists
    if (this.constraintValidator) {
      const sequence = route.map(i => this.nodes[i]);
      const penalty = this.constraintValidator.getPenaltyScore(sequence);
      fitness -= penalty; // Subtract penalty from fitness (makes it worse)
    }

    return fitness;
  }

  /**
   * Helper: Tournament selection for genetic algorithm
   */
  private tournamentSelection(
    population: number[][],
    fitnesses: number[],
    tournamentSize: number
  ): number[] {
    let best = randomInt(0, population.length - 1);

    for (let i = 1; i < tournamentSize; i++) {
      const competitor = randomInt(0, population.length - 1);
      if (fitnesses[competitor] > fitnesses[best]) {
        best = competitor;
      }
    }

    return population[best];
  }

  /**
   * Helper: Order crossover (OX) for TSP
   */
  private orderCrossover(parent1: number[], parent2: number[]): number[] {
    const size = parent1.length;
    const start = randomInt(0, size - 1);
    const end = randomInt(start, size - 1);

    const offspring: number[] = Array(size).fill(-1);

    // Copy segment from parent1
    for (let i = start; i <= end; i++) {
      offspring[i] = parent1[i];
    }

    // Fill remaining from parent2
    let currentIndex = (end + 1) % size;
    for (let i = 0; i < size; i++) {
      const index = (end + 1 + i) % size;
      const gene = parent2[index];

      if (!offspring.includes(gene)) {
        offspring[currentIndex] = gene;
        currentIndex = (currentIndex + 1) % size;
      }
    }

    return offspring;
  }

  /**
   * Helper: Swap mutation
   */
  private swapMutation(route: number[]): void {
    const i = randomInt(0, route.length - 1);
    const j = randomInt(0, route.length - 1);
    [route[i], route[j]] = [route[j], route[i]];
  }

  /**
   * Helper: Create TSP solution from node sequence
   */
  private createSolution(sequence: TSPNode[]): TSPSolution {
    const { totalDistance, totalTime, fuelCost } = calculateRouteMetrics(
      sequence,
      this.distanceMatrix,
      this.vehicle
    );

    // Calculate naive sequential distance for efficiency comparison
    const naiveDistance = this.calculateNaiveDistance();
    const efficiency = calculateEfficiency(totalDistance, naiveDistance);

    return {
      sequence,
      totalDistance,
      totalTime,
      fuelCost,
      efficiency,
    };
  }

  /**
   * Calculate naive sequential route distance
   */
  private calculateNaiveDistance(): number {
    let distance = 0;
    for (let i = 0; i < this.nodes.length - 1; i++) {
      distance += this.distanceMatrix[i][i + 1];
    }
    return distance;
  }
}
