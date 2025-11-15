/**
 * Type definitions for route optimization service
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface TSPNode {
  id: string;
  position: [number, number]; // [lng, lat] for GeoJSON compatibility
  priority: number; // Higher values = higher priority (1-100)
  metadata?: Record<string, any>; // Additional data like street info, location details, etc.
}

export interface TSPSolution {
  sequence: TSPNode[];
  totalDistance: number; // meters
  totalTime: number; // minutes
  fuelCost: number; // liters
  efficiency: number; // Efficiency score vs naive approach (0-100%)
}

export type OptimizationAlgorithm = 'nearest_neighbor' | 'genetic' | 'ant_colony' | 'hybrid';

export type OptimizationPattern = 'none' | 'spiral' | 'grid' | 'back_and_forth' | 'perimeter_first' | 'tsp_optimal';

export interface RouteConstraints {
  // Time windows for specific nodes
  timeWindows?: Map<string, { earliest: number; latest: number }>; // minutes from start

  // Maximum route duration
  maxRouteDuration?: number; // minutes

  // Maximum route distance
  maxRouteDistance?: number; // meters

  // Vehicle capacity constraint
  vehicleCapacity?: number; // units
  nodeCapacities?: Map<string, number>; // capacity required at each node

  // Must-visit nodes (cannot be skipped)
  mandatoryNodes?: Set<string>;

  // Forbidden edges (cannot travel between certain node pairs)
  forbiddenEdges?: Array<[string, string]>;

  // Service time at each node
  serviceTime?: number; // minutes (default for all nodes)
  nodeServiceTimes?: Map<string, number>; // specific service time per node

  // Maximum number of stops
  maxStops?: number;

  // Break time requirements
  breakAfterHours?: number; // hours of driving before break required
  breakDuration?: number; // minutes
}

export interface TSPOptions {
  algorithm: OptimizationAlgorithm;
  maxIterations?: number;
  populationSize?: number; // For genetic algorithm
  mutationRate?: number; // For genetic algorithm
  eliteRatio?: number; // Percentage of best solutions to keep
  timeLimitMs?: number;
  priorityWeight?: number; // How much to weight priority vs distance (0-1)
  fuelOptimization?: boolean;
  constraints?: RouteConstraints; // Route constraints
}

export interface VehicleProfile {
  id: string;
  fuelType: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
  fuelCapacity: number; // liters
  averageSpeed: number; // km/h
  fuelConsumptionRate: number; // liters per 100km
}

export interface OptimizationRequest {
  nodes: TSPNode[];
  startPosition: [number, number];
  vehicle?: VehicleProfile;
  options?: Partial<TSPOptions>;
}

export interface OptimizationResult {
  solution: TSPSolution;
  algorithm: OptimizationAlgorithm;
  pattern: OptimizationPattern;
  optimizationTimeMs: number;
  parameters: TSPOptions;
  // Metrics for database storage
  originalDistance?: number;
  originalTime?: number;
  originalFuelCost?: number;
  distanceSavings?: number;
  distanceSavingsPercent?: number;
  timeSavings?: number;
  timeSavingsPercent?: number;
  fuelSavings?: number;
  fuelSavingsPercent?: number;
}

/**
 * Validate GPS coordinates
 */
export function validateCoordinates(coords: [number, number]): boolean {
  const [lng, lat] = coords;
  return (
    !isNaN(lng) &&
    !isNaN(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * Round coordinates to specified decimal places for consistency
 */
export function roundCoordinates(
  coords: [number, number],
  precision: number = 6
): [number, number] {
  const factor = Math.pow(10, precision);
  return [
    Math.round(coords[0] * factor) / factor,
    Math.round(coords[1] * factor) / factor
  ];
}
