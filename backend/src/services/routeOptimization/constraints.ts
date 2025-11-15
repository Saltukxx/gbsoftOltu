/**
 * Route Optimization Constraints
 * Handles validation and enforcement of route constraints
 */

import type { TSPNode, RouteConstraints, VehicleProfile } from './types';
import { calculateDistance } from './utils';

/**
 * Constraint validator class
 */
export class ConstraintValidator {
  private constraints: RouteConstraints;
  private distanceMatrix: number[][];
  private vehicle?: VehicleProfile;

  constructor(
    constraints: RouteConstraints,
    distanceMatrix: number[][],
    vehicle?: VehicleProfile
  ) {
    this.constraints = constraints;
    this.distanceMatrix = distanceMatrix;
    this.vehicle = vehicle;
  }

  /**
   * Validate if a route satisfies all constraints
   */
  validateRoute(sequence: TSPNode[]): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    // Check max stops
    if (this.constraints.maxStops && sequence.length > this.constraints.maxStops) {
      violations.push(`Route exceeds maximum stops (${this.constraints.maxStops})`);
    }

    // Check mandatory nodes
    if (this.constraints.mandatoryNodes && this.constraints.mandatoryNodes.size > 0) {
      const visitedIds = new Set(sequence.map(n => n.id));
      for (const mandatoryId of this.constraints.mandatoryNodes) {
        if (!visitedIds.has(mandatoryId)) {
          violations.push(`Mandatory node ${mandatoryId} not visited`);
        }
      }
    }

    // Check maximum distance
    const totalDistance = this.calculateRouteDistance(sequence);
    if (this.constraints.maxRouteDistance && totalDistance > this.constraints.maxRouteDistance) {
      violations.push(
        `Route distance ${totalDistance.toFixed(0)}m exceeds maximum ${this.constraints.maxRouteDistance}m`
      );
    }

    // Check maximum duration
    const totalTime = this.calculateRouteDuration(sequence);
    if (this.constraints.maxRouteDuration && totalTime > this.constraints.maxRouteDuration) {
      violations.push(
        `Route duration ${totalTime.toFixed(0)}min exceeds maximum ${this.constraints.maxRouteDuration}min`
      );
    }

    // Check vehicle capacity
    if (this.constraints.vehicleCapacity && this.constraints.nodeCapacities) {
      let totalCapacity = 0;
      for (const node of sequence) {
        const nodeCapacity = this.constraints.nodeCapacities.get(node.id) || 0;
        totalCapacity += nodeCapacity;
      }

      if (totalCapacity > this.constraints.vehicleCapacity) {
        violations.push(
          `Total capacity ${totalCapacity} exceeds vehicle capacity ${this.constraints.vehicleCapacity}`
        );
      }
    }

    // Check time windows
    if (this.constraints.timeWindows && this.constraints.timeWindows.size > 0) {
      let currentTime = 0;

      for (let i = 0; i < sequence.length; i++) {
        const node = sequence[i];
        const timeWindow = this.constraints.timeWindows.get(node.id);

        if (timeWindow) {
          if (currentTime < timeWindow.earliest) {
            // Arrive early, wait until earliest time
            currentTime = timeWindow.earliest;
          }

          if (currentTime > timeWindow.latest) {
            violations.push(
              `Node ${node.id} visited after time window closes (${currentTime.toFixed(0)}min > ${timeWindow.latest}min)`
            );
          }
        }

        // Add service time
        const serviceTime = this.constraints.nodeServiceTimes?.get(node.id) || this.constraints.serviceTime || 0;
        currentTime += serviceTime;

        // Add travel time to next node
        if (i < sequence.length - 1) {
          const nextNode = sequence[i + 1];
          const distance = this.getDistance(node, nextNode);
          const travelTime = this.calculateTravelTime(distance);
          currentTime += travelTime;
        }
      }
    }

    // Check forbidden edges
    if (this.constraints.forbiddenEdges && this.constraints.forbiddenEdges.length > 0) {
      const forbiddenSet = new Set(
        this.constraints.forbiddenEdges.map(([a, b]) => `${a}-${b}`)
      );

      for (let i = 0; i < sequence.length - 1; i++) {
        const edge = `${sequence[i].id}-${sequence[i + 1].id}`;
        const reverseEdge = `${sequence[i + 1].id}-${sequence[i].id}`;

        if (forbiddenSet.has(edge) || forbiddenSet.has(reverseEdge)) {
          violations.push(`Forbidden edge: ${sequence[i].id} -> ${sequence[i + 1].id}`);
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Check if a swap operation violates constraints
   */
  isSwapValid(
    sequence: TSPNode[],
    index1: number,
    index2: number
  ): boolean {
    // Create swapped sequence
    const swapped = [...sequence];
    [swapped[index1], swapped[index2]] = [swapped[index2], swapped[index1]];

    // Validate swapped sequence
    const result = this.validateRoute(swapped);
    return result.valid;
  }

  /**
   * Filter nodes based on constraints
   */
  filterValidNodes(nodes: TSPNode[]): TSPNode[] {
    // If max stops constraint exists, prioritize mandatory nodes
    if (this.constraints.maxStops && nodes.length > this.constraints.maxStops) {
      const mandatory = nodes.filter(n => this.constraints.mandatoryNodes?.has(n.id));
      const optional = nodes
        .filter(n => !this.constraints.mandatoryNodes?.has(n.id))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0)); // Sort by priority

      const maxOptional = this.constraints.maxStops - mandatory.length;
      return [...mandatory, ...optional.slice(0, maxOptional)];
    }

    return nodes;
  }

  /**
   * Calculate total route distance
   */
  private calculateRouteDistance(sequence: TSPNode[]): number {
    let distance = 0;

    for (let i = 0; i < sequence.length - 1; i++) {
      distance += this.getDistance(sequence[i], sequence[i + 1]);
    }

    return distance;
  }

  /**
   * Calculate total route duration including service times
   */
  private calculateRouteDuration(sequence: TSPNode[]): number {
    let duration = 0;

    for (let i = 0; i < sequence.length; i++) {
      const node = sequence[i];

      // Add service time
      const serviceTime = this.constraints.nodeServiceTimes?.get(node.id) || this.constraints.serviceTime || 0;
      duration += serviceTime;

      // Add travel time to next node
      if (i < sequence.length - 1) {
        const distance = this.getDistance(node, sequence[i + 1]);
        duration += this.calculateTravelTime(distance);
      }
    }

    // Add break times if necessary
    if (this.constraints.breakAfterHours && this.constraints.breakDuration) {
      const breakInterval = this.constraints.breakAfterHours * 60; // Convert to minutes
      const numBreaks = Math.floor(duration / breakInterval);
      duration += numBreaks * this.constraints.breakDuration;
    }

    return duration;
  }

  /**
   * Get distance between two nodes
   */
  private getDistance(node1: TSPNode, node2: TSPNode): number {
    // Try to use distance matrix first
    const index1 = parseInt(node1.id);
    const index2 = parseInt(node2.id);

    if (
      !isNaN(index1) &&
      !isNaN(index2) &&
      this.distanceMatrix.length > index1 &&
      this.distanceMatrix[index1].length > index2
    ) {
      return this.distanceMatrix[index1][index2];
    }

    // Fallback to direct calculation
    return calculateDistance(node1.position, node2.position);
  }

  /**
   * Calculate travel time based on distance and vehicle speed
   */
  private calculateTravelTime(distanceMeters: number): number {
    const averageSpeed = this.vehicle?.averageSpeed || 30; // km/h
    const distanceKm = distanceMeters / 1000;
    return (distanceKm / averageSpeed) * 60; // Convert to minutes
  }

  /**
   * Get penalty score for constraint violations
   * Used in optimization to discourage invalid solutions
   */
  getPenaltyScore(sequence: TSPNode[]): number {
    const result = this.validateRoute(sequence);

    if (result.valid) return 0;

    let penalty = 0;

    // Apply penalties based on violation type
    for (const violation of result.violations) {
      if (violation.includes('Mandatory node')) {
        penalty += 1000000; // Very high penalty for missing mandatory nodes
      } else if (violation.includes('Forbidden edge')) {
        penalty += 500000; // High penalty for forbidden edges
      } else if (violation.includes('time window')) {
        penalty += 100000; // High penalty for time window violations
      } else if (violation.includes('capacity')) {
        penalty += 50000; // Medium penalty for capacity violations
      } else if (violation.includes('distance') || violation.includes('duration')) {
        penalty += 10000; // Lower penalty for distance/duration overruns
      } else if (violation.includes('maximum stops')) {
        penalty += 5000; // Low penalty for too many stops
      }
    }

    return penalty;
  }
}

/**
 * Apply constraints to a route sequence
 * Returns modified sequence that satisfies constraints
 */
export function applyConstraints(
  sequence: TSPNode[],
  constraints: RouteConstraints,
  distanceMatrix: number[][],
  vehicle?: VehicleProfile
): TSPNode[] {
  const validator = new ConstraintValidator(constraints, distanceMatrix, vehicle);

  // Filter nodes if maxStops constraint
  let filteredSequence = validator.filterValidNodes(sequence);

  // Ensure mandatory nodes are included
  if (constraints.mandatoryNodes && constraints.mandatoryNodes.size > 0) {
    const mandatoryIds = new Set(constraints.mandatoryNodes);
    const visitedIds = new Set(filteredSequence.map(n => n.id));

    // Add any missing mandatory nodes
    for (const mandatoryId of mandatoryIds) {
      if (!visitedIds.has(mandatoryId)) {
        const mandatoryNode = sequence.find(n => n.id === mandatoryId);
        if (mandatoryNode) {
          filteredSequence.push(mandatoryNode);
        }
      }
    }
  }

  return filteredSequence;
}
