/**
 * Route Optimization API Endpoints
 */

import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/middleware/auth';
import { logger } from '@/services/logger';
import { routeOptimizationService } from '@/services/routeOptimization';
import type {
  OptimizationRequest,
  OptimizationAlgorithm,
  TSPNode,
  VehicleProfile,
} from '@/services/routeOptimization';

const router = express.Router();

/**
 * POST /api/routes/optimize
 * Optimize a route using TSP algorithms
 *
 * Request body:
 * - nodes: Array of TSPNode (id, position [lng, lat], priority, metadata)
 * - startPosition: [lng, lat] coordinates of starting point
 * - vehicle: Optional VehicleProfile (fuelType, fuelCapacity, averageSpeed, fuelConsumptionRate)
 * - options: Optional TSPOptions (algorithm, maxIterations, etc.)
 *
 * Response:
 * - best: The best optimized solution
 * - all: All alternative solutions (if multiple algorithms were run)
 * - metadata: Optimization metrics and parameters
 */
router.post(
  '/optimize',
  [
    body('nodes')
      .isArray({ min: 1 })
      .withMessage('Nodes must be a non-empty array'),
    body('nodes.*.id')
      .isString()
      .withMessage('Each node must have an id'),
    body('nodes.*.position')
      .isArray({ min: 2, max: 2 })
      .withMessage('Each node must have a position [lng, lat]'),
    body('nodes.*.position.*')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Position coordinates must be valid numbers'),
    body('nodes.*.priority')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Priority must be between 1 and 100'),
    body('startPosition')
      .isArray({ min: 2, max: 2 })
      .withMessage('Start position must be [lng, lat]'),
    body('startPosition.*')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Start position coordinates must be valid numbers'),
    body('vehicle')
      .optional()
      .isObject()
      .withMessage('Vehicle must be an object'),
    body('vehicle.id')
      .optional()
      .isString(),
    body('vehicle.fuelType')
      .optional()
      .isIn(['gasoline', 'diesel', 'electric', 'hybrid'])
      .withMessage('Invalid fuel type'),
    body('vehicle.fuelCapacity')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Fuel capacity must be a positive number'),
    body('vehicle.averageSpeed')
      .optional()
      .isFloat({ min: 0, max: 200 })
      .withMessage('Average speed must be between 0 and 200 km/h'),
    body('vehicle.fuelConsumptionRate')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Fuel consumption rate must be between 0 and 100 L/100km'),
    body('options')
      .optional()
      .isObject()
      .withMessage('Options must be an object'),
    body('options.algorithm')
      .optional()
      .isIn(['nearest_neighbor', 'genetic', 'ant_colony', 'hybrid'])
      .withMessage('Invalid algorithm'),
    body('options.maxIterations')
      .optional()
      .isInt({ min: 1, max: 10000 })
      .withMessage('Max iterations must be between 1 and 10000'),
    body('options.populationSize')
      .optional()
      .isInt({ min: 10, max: 500 })
      .withMessage('Population size must be between 10 and 500'),
    body('options.mutationRate')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Mutation rate must be between 0 and 1'),
    body('options.timeLimitMs')
      .optional()
      .isInt({ min: 1000, max: 60000 })
      .withMessage('Time limit must be between 1000ms and 60000ms'),
    body('options.priorityWeight')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Priority weight must be between 0 and 1'),
    body('options.fuelOptimization')
      .optional()
      .isBoolean()
      .withMessage('Fuel optimization must be a boolean'),
    body('vehicleId')
      .isUUID()
      .withMessage('Vehicle ID must be a valid UUID'),
    body('vehicleRouteId')
      .optional()
      .isUUID()
      .withMessage('Vehicle route ID must be a valid UUID'),
    body('saveToDatabase')
      .optional()
      .isBoolean()
      .withMessage('saveToDatabase must be a boolean'),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { nodes, startPosition, vehicle, options, vehicleId, vehicleRouteId, saveToDatabase = true } = req.body;

    logger.info('Route optimization requested', {
      userId: req.user?.id,
      nodeCount: nodes.length,
      algorithm: options?.algorithm || 'hybrid',
      hasVehicle: !!vehicle,
      vehicleId,
      saveToDatabase,
    });

    try {
      // Prepare optimization request
      const optimizationRequest: OptimizationRequest = {
        nodes: nodes.map((node: any) => ({
          id: node.id,
          position: [
            parseFloat(node.position[0]),
            parseFloat(node.position[1]),
          ] as [number, number],
          priority: node.priority || 50,
          metadata: node.metadata || {},
        })),
        startPosition: [
          parseFloat(startPosition[0]),
          parseFloat(startPosition[1]),
        ] as [number, number],
        vehicle: vehicle
          ? {
              id: vehicle.id || 'default',
              fuelType: vehicle.fuelType || 'diesel',
              fuelCapacity: parseFloat(vehicle.fuelCapacity) || 100,
              averageSpeed: parseFloat(vehicle.averageSpeed) || 30,
              fuelConsumptionRate: parseFloat(vehicle.fuelConsumptionRate) || 10,
            }
          : undefined,
        options: options || {},
      };

      // Run optimization
      const result = await routeOptimizationService.optimizeRoute(optimizationRequest);

      logger.info('Route optimization completed', {
        userId: req.user?.id,
        nodeCount: nodes.length,
        algorithm: result.algorithm,
        optimizationTimeMs: result.optimizationTimeMs,
        distanceSavingsPercent: result.distanceSavingsPercent?.toFixed(1),
        fuelSavingsPercent: result.fuelSavingsPercent?.toFixed(1),
      });

      // Save to database if requested
      let savedOptimizationId: string | undefined;
      if (saveToDatabase) {
        savedOptimizationId = await routeOptimizationService.saveOptimization(
          result,
          vehicleId,
          vehicleRouteId
        );
        logger.info('Optimization saved to database', {
          optimizationId: savedOptimizationId,
          vehicleId,
        });
      }

      // Return response
      res.json({
        success: true,
        data: {
          optimizationId: savedOptimizationId,
          best: {
            sequence: result.solution.sequence,
            totalDistance: result.solution.totalDistance,
            totalTime: result.solution.totalTime,
            fuelCost: result.solution.fuelCost,
            efficiency: result.solution.efficiency,
          },
          metadata: {
            algorithm: result.algorithm,
            pattern: result.pattern,
            optimizationTimeMs: result.optimizationTimeMs,
            parameters: result.parameters,
            savings: {
              distance: {
                original: result.originalDistance,
                optimized: result.solution.totalDistance,
                saved: result.distanceSavings,
                savedPercent: result.distanceSavingsPercent,
              },
              time: {
                original: result.originalTime,
                optimized: result.solution.totalTime,
                saved: result.timeSavings,
                savedPercent: result.timeSavingsPercent,
              },
              fuel: {
                original: result.originalFuelCost,
                optimized: result.solution.fuelCost,
                saved: result.fuelSavings,
                savedPercent: result.fuelSavingsPercent,
              },
            },
          },
        },
      });
    } catch (error: any) {
      logger.error('Route optimization failed', {
        userId: req.user?.id,
        error: error.message,
        stack: error.stack,
      });

      throw createAppError(
        error.message || 'Failed to optimize route',
        500
      );
    }
  })
);

/**
 * GET /api/routes/optimize/history
 * Get optimization history for a vehicle or all vehicles
 */
router.get(
  '/optimize/history',
  [
    query('vehicleId').optional().isUUID().withMessage('Vehicle ID must be a valid UUID'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { vehicleId, limit = 10 } = req.query;

    const optimizations = await routeOptimizationService.getOptimizationsForVehicle(
      vehicleId as string | undefined,
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: optimizations,
    });
  })
);

/**
 * GET /api/routes/optimize/:id
 * Get a specific optimization by ID
 */
router.get(
  '/optimize/:id',
  [param('id').isUUID().withMessage('ID must be a valid UUID')],
  asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    const optimization = await routeOptimizationService.getOptimizationById(id);

    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: 'Optimization not found',
      });
    }

    res.json({
      success: true,
      data: optimization,
    });
  })
);

/**
 * PATCH /api/routes/optimize/:id/apply
 * Mark an optimization as applied
 */
router.patch(
  '/optimize/:id/apply',
  [param('id').isUUID().withMessage('ID must be a valid UUID')],
  asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    const optimization = await routeOptimizationService.markOptimizationAsApplied(id);

    logger.info('Optimization marked as applied', {
      userId: req.user?.id,
      optimizationId: id,
    });

    res.json({
      success: true,
      data: optimization,
    });
  })
);

/**
 * GET /api/routes/optimize/stats
 * Get optimization statistics
 */
router.get(
  '/optimize/stats',
  [query('vehicleId').optional().isUUID().withMessage('Vehicle ID must be a valid UUID')],
  asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { vehicleId } = req.query;

    const stats = await routeOptimizationService.getOptimizationStats(
      vehicleId as string | undefined
    );

    res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * GET /api/routes/optimize/algorithms
 * Get list of available optimization algorithms
 */
router.get(
  '/optimize/algorithms',
  asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    res.json({
      success: true,
      data: {
        algorithms: [
          {
            id: 'nearest_neighbor',
            name: 'Nearest Neighbor',
            description: 'Fast greedy heuristic, good for quick solutions',
            complexity: 'O(n²)',
            recommended: 'Small routes (<20 nodes)',
            speed: 'Very Fast',
          },
          {
            id: 'genetic',
            name: 'Genetic Algorithm',
            description: 'Population-based evolutionary optimization',
            complexity: 'O(n² × generations × population)',
            recommended: 'Medium routes (10-100 nodes)',
            speed: 'Medium',
          },
          {
            id: 'ant_colony',
            name: 'Ant Colony Optimization',
            description: 'Swarm intelligence algorithm',
            complexity: 'O(n² × iterations × ants)',
            recommended: 'Large routes (50-200 nodes)',
            speed: 'Slow',
          },
          {
            id: 'hybrid',
            name: 'Hybrid (Recommended)',
            description: 'Runs multiple algorithms and picks best result',
            complexity: 'Combined',
            recommended: 'All route sizes',
            speed: 'Adaptive',
          },
        ],
      },
    });
  })
);

export default router;
