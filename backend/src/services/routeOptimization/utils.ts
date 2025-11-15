/**
 * Utility functions for route optimization
 */

import type { TSPNode, VehicleProfile } from './types';

/**
 * Calculate Haversine distance between two points in meters
 */
export function calculateDistance(
  point1: [number, number],
  point2: [number, number]
): number {
  const [lng1, lat1] = point1;
  const [lng2, lat2] = point2;

  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Build distance matrix for all node pairs
 */
export function buildDistanceMatrix(nodes: TSPNode[]): number[][] {
  const n = nodes.length;
  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        matrix[i][j] = calculateDistance(nodes[i].position, nodes[j].position);
      }
    }
  }

  return matrix;
}

/**
 * Calculate estimated fuel consumption based on distance and vehicle profile
 */
export function calculateFuelCost(
  distanceMeters: number,
  vehicle?: VehicleProfile
): number {
  if (!vehicle) {
    // Default: assume 10L/100km for diesel vehicle
    return (distanceMeters / 1000) * (10 / 100);
  }

  const distanceKm = distanceMeters / 1000;
  return distanceKm * (vehicle.fuelConsumptionRate / 100);
}

/**
 * Calculate estimated travel time based on distance and vehicle speed
 */
export function calculateTravelTime(
  distanceMeters: number,
  vehicle?: VehicleProfile
): number {
  const averageSpeed = vehicle?.averageSpeed || 30; // Default 30 km/h for city driving
  const distanceKm = distanceMeters / 1000;
  return (distanceKm / averageSpeed) * 60; // Return time in minutes
}

/**
 * Calculate total route metrics
 */
export function calculateRouteMetrics(
  sequence: TSPNode[],
  distanceMatrix: number[][],
  vehicle?: VehicleProfile
): {
  totalDistance: number;
  totalTime: number;
  fuelCost: number;
} {
  let totalDistance = 0;

  for (let i = 0; i < sequence.length - 1; i++) {
    const currentIndex = sequence[i].id === 'start' ? 0 : parseInt(sequence[i].id);
    const nextIndex = sequence[i + 1].id === 'start' ? 0 : parseInt(sequence[i + 1].id);

    // Direct distance lookup if we have it, otherwise calculate
    if (distanceMatrix.length > currentIndex && distanceMatrix[currentIndex].length > nextIndex) {
      totalDistance += distanceMatrix[currentIndex][nextIndex];
    } else {
      totalDistance += calculateDistance(sequence[i].position, sequence[i + 1].position);
    }
  }

  const totalTime = calculateTravelTime(totalDistance, vehicle);
  const fuelCost = calculateFuelCost(totalDistance, vehicle);

  return { totalDistance, totalTime, fuelCost };
}

/**
 * Calculate efficiency score compared to naive (sequential) approach
 */
export function calculateEfficiency(
  optimizedDistance: number,
  naiveDistance: number
): number {
  if (naiveDistance === 0) return 100;
  const improvement = ((naiveDistance - optimizedDistance) / naiveDistance) * 100;
  return Math.max(0, Math.min(100, improvement));
}

/**
 * Shuffle array in place (Fisher-Yates algorithm)
 */
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Check if route is circular (starts and ends at same location)
 */
export function isCircularRoute(nodes: TSPNode[]): boolean {
  if (nodes.length < 2) return false;
  const start = nodes[0].position;
  const end = nodes[nodes.length - 1].position;
  return calculateDistance(start, end) < 10; // Within 10 meters
}

/**
 * Remove duplicate consecutive nodes
 */
export function removeDuplicateNodes(nodes: TSPNode[]): TSPNode[] {
  if (nodes.length === 0) return [];

  const result: TSPNode[] = [nodes[0]];

  for (let i = 1; i < nodes.length; i++) {
    const distance = calculateDistance(nodes[i].position, result[result.length - 1].position);
    if (distance > 1) { // Keep if more than 1 meter apart
      result.push(nodes[i]);
    }
  }

  return result;
}
