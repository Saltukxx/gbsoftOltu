/**
 * Route Optimization Service
 * Main entry point for route optimization functionality
 */

import { TSPSolver } from './tspSolver';
import {
  validateCoordinates,
  roundCoordinates,
} from './types';
import { removeDuplicateNodes } from './utils';
import type {
  TSPNode,
  TSPOptions,
  VehicleProfile,
  OptimizationRequest,
  OptimizationResult,
  OptimizationAlgorithm,
  OptimizationPattern,
} from './types';
import prisma from '@/db';
import { OptimizationAlgorithm as PrismaAlgorithm, OptimizationPattern as PrismaPattern } from '@prisma/client';

export * from './types';

/**
 * Main optimization service class
 */
export class RouteOptimizationService {
  /**
   * Optimize a route given nodes and options
   */
  async optimizeRoute(request: OptimizationRequest): Promise<OptimizationResult> {
    const startTime = Date.now();

    // Validate and prepare nodes
    const validatedNodes = this.validateAndPrepareNodes(request.nodes, request.startPosition);

    if (validatedNodes.length === 0) {
      throw new Error('No valid nodes provided for optimization');
    }

    // Default options
    const options: TSPOptions = {
      algorithm: 'hybrid',
      maxIterations: 1000,
      populationSize: 50,
      mutationRate: 0.1,
      eliteRatio: 0.2,
      timeLimitMs: 15000, // 15 seconds for backend
      priorityWeight: 0.3,
      fuelOptimization: true,
      ...request.options,
    };

    // Create solver and run optimization
    const solver = new TSPSolver(validatedNodes, request.vehicle, options.constraints);
    const solution = await solver.solve(options);

    const optimizationTimeMs = Date.now() - startTime;

    // Calculate savings (comparing to naive sequential approach)
    const naiveSolution = await this.calculateNaiveRoute(validatedNodes, request.vehicle, options.constraints);

    const result: OptimizationResult = {
      solution,
      algorithm: options.algorithm,
      pattern: 'none', // Pattern will be set by street cleaning optimizer
      optimizationTimeMs,
      parameters: options,
      originalDistance: naiveSolution.totalDistance,
      originalTime: naiveSolution.totalTime,
      originalFuelCost: naiveSolution.fuelCost,
      distanceSavings: naiveSolution.totalDistance - solution.totalDistance,
      distanceSavingsPercent: this.calculateSavingsPercent(
        naiveSolution.totalDistance,
        solution.totalDistance
      ),
      timeSavings: naiveSolution.totalTime - solution.totalTime,
      timeSavingsPercent: this.calculateSavingsPercent(
        naiveSolution.totalTime,
        solution.totalTime
      ),
      fuelSavings: naiveSolution.fuelCost - solution.fuelCost,
      fuelSavingsPercent: this.calculateSavingsPercent(
        naiveSolution.fuelCost,
        solution.fuelCost
      ),
    };

    console.log(`Optimization completed in ${optimizationTimeMs}ms:`, {
      algorithm: result.algorithm,
      nodes: validatedNodes.length,
      distanceSavings: `${result.distanceSavingsPercent?.toFixed(1)}%`,
      fuelSavings: `${result.fuelSavingsPercent?.toFixed(1)}%`,
    });

    return result;
  }

  /**
   * Validate and prepare nodes for optimization
   */
  private validateAndPrepareNodes(
    nodes: TSPNode[],
    startPosition: [number, number]
  ): TSPNode[] {
    // Validate start position
    if (!validateCoordinates(startPosition)) {
      throw new Error('Invalid start position coordinates');
    }

    // Filter and validate nodes
    const validNodes: TSPNode[] = [];

    for (const node of nodes) {
      // Validate coordinates
      if (!validateCoordinates(node.position)) {
        console.warn(`Skipping node ${node.id} with invalid coordinates:`, node.position);
        continue;
      }

      // Round coordinates for consistency
      const roundedPosition = roundCoordinates(node.position, 6);

      // Ensure priority is within valid range
      const priority = Math.max(1, Math.min(100, node.priority || 50));

      validNodes.push({
        ...node,
        position: roundedPosition,
        priority,
      });
    }

    // Remove duplicate nodes (very close together)
    const uniqueNodes = removeDuplicateNodes(validNodes);

    // Add start position as first node if not already included
    const hasStartNode = uniqueNodes.some(
      (node) =>
        Math.abs(node.position[0] - startPosition[0]) < 0.0001 &&
        Math.abs(node.position[1] - startPosition[1]) < 0.0001
    );

    if (!hasStartNode) {
      uniqueNodes.unshift({
        id: 'start',
        position: roundCoordinates(startPosition, 6),
        priority: 0,
        metadata: { isStart: true },
      });
    }

    return uniqueNodes;
  }

  /**
   * Calculate naive sequential route for comparison
   */
  private async calculateNaiveRoute(
    nodes: TSPNode[],
    vehicle?: VehicleProfile,
    constraints?: any
  ) {
    const solver = new TSPSolver(nodes, vehicle, constraints);
    // Nearest neighbor is our "naive" baseline
    return solver.solve({
      algorithm: 'nearest_neighbor',
      priorityWeight: 0,
      fuelOptimization: false,
      constraints,
    });
  }

  /**
   * Calculate savings percentage
   */
  private calculateSavingsPercent(original: number, optimized: number): number {
    if (original === 0) return 0;
    return ((original - optimized) / original) * 100;
  }

  /**
   * Save optimization result to database
   */
  async saveOptimization(
    result: OptimizationResult,
    vehicleId: string,
    vehicleRouteId?: string
  ): Promise<string> {
    // Map algorithm enum
    const algorithmMap: Record<OptimizationAlgorithm, PrismaAlgorithm> = {
      nearest_neighbor: 'NEAREST_NEIGHBOR',
      genetic: 'GENETIC_ALGORITHM',
      ant_colony: 'ANT_COLONY_OPTIMIZATION',
      hybrid: 'HYBRID',
    };

    // Map pattern enum
    const patternMap: Record<OptimizationPattern, PrismaPattern> = {
      none: 'NONE',
      spiral: 'SPIRAL',
      grid: 'GRID',
      back_and_forth: 'BACK_AND_FORTH',
      perimeter_first: 'PERIMETER_FIRST',
      tsp_optimal: 'TSP_OPTIMAL',
    };

    // Prepare optimized path (convert sequence to lat/lng format)
    const optimizedPath = result.solution.sequence.map((node) => ({
      lat: node.position[1],
      lng: node.position[0],
      id: node.id,
      priority: node.priority,
      metadata: node.metadata,
    }));

    // Save to database
    const optimizedRoute = await prisma.optimizedRoute.create({
      data: {
        vehicleId,
        vehicleRouteId: vehicleRouteId || null,
        algorithm: algorithmMap[result.algorithm],
        pattern: patternMap[result.pattern],
        algorithmParameters: JSON.parse(JSON.stringify(result.parameters)),

        // Original metrics
        originalDistance: result.originalDistance || null,
        originalTime: result.originalTime || null,
        originalFuelCost: result.originalFuelCost || null,

        // Optimized metrics
        optimizedDistance: result.solution.totalDistance,
        optimizedTime: result.solution.totalTime,
        optimizedFuelCost: result.solution.fuelCost,

        // Savings
        distanceSavings: result.distanceSavings || null,
        distanceSavingsPercent: result.distanceSavingsPercent || null,
        timeSavings: result.timeSavings || null,
        timeSavingsPercent: result.timeSavingsPercent || null,
        fuelSavings: result.fuelSavings || null,
        fuelSavingsPercent: result.fuelSavingsPercent || null,

        // Route data
        optimizedPath,
        waypoints: result.solution.sequence.map((node) => ({
          id: node.id,
          position: node.position,
          priority: node.priority,
        })),

        // Performance metadata
        optimizationTimeMs: result.optimizationTimeMs,
        numberOfStops: result.solution.sequence.length,

        // Status
        isApplied: false,
      },
    });

    console.log(`Saved optimization ${optimizedRoute.id} for vehicle ${vehicleId}`);

    return optimizedRoute.id;
  }

  /**
   * Get saved optimizations for a vehicle or all vehicles
   */
  async getOptimizationsForVehicle(
    vehicleId?: string,
    limit: number = 10
  ) {
    const where = vehicleId ? { vehicleId } : {};

    return prisma.optimizedRoute.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
            type: true,
            model: true,
          },
        },
        vehicleRoute: {
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
          },
        },
      },
    });
  }

  /**
   * Get a specific optimization by ID
   */
  async getOptimizationById(id: string) {
    return prisma.optimizedRoute.findUnique({
      where: { id },
      include: {
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
            type: true,
            model: true,
            fuelType: true,
          },
        },
        vehicleRoute: true,
      },
    });
  }

  /**
   * Mark an optimization as applied
   */
  async markOptimizationAsApplied(id: string) {
    return prisma.optimizedRoute.update({
      where: { id },
      data: {
        isApplied: true,
        appliedAt: new Date(),
      },
    });
  }

  /**
   * Get optimization statistics
   */
  async getOptimizationStats(vehicleId?: string) {
    const where = vehicleId ? { vehicleId } : {};

    const [totalOptimizations, appliedOptimizations, avgSavings] = await Promise.all([
      prisma.optimizedRoute.count({ where }),
      prisma.optimizedRoute.count({ where: { ...where, isApplied: true } }),
      prisma.optimizedRoute.aggregate({
        where,
        _avg: {
          distanceSavingsPercent: true,
          timeSavingsPercent: true,
          fuelSavingsPercent: true,
        },
      }),
    ]);

    return {
      totalOptimizations,
      appliedOptimizations,
      avgDistanceSavingsPercent: avgSavings._avg.distanceSavingsPercent || 0,
      avgTimeSavingsPercent: avgSavings._avg.timeSavingsPercent || 0,
      avgFuelSavingsPercent: avgSavings._avg.fuelSavingsPercent || 0,
    };
  }
}

// Export singleton instance
export const routeOptimizationService = new RouteOptimizationService();

// Export types and utilities
export { TSPSolver } from './tspSolver';
export * from './utils';
