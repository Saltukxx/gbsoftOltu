/**
 * Enhanced route visualization for cleaning operations
 * Shows cleaning patterns, efficiency metrics, and optimization results
 */

import { useMemo } from 'react'
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'
import type { VehicleRouteSegment } from '@/types/vehicles'
import type { OptimizedCleaningRoute } from '@/utils/streetCleaningOptimizer'

export interface CleaningRouteVisualizationProps {
  originalRoutes: VehicleRouteSegment[]
  optimizedRoutes: OptimizedCleaningRoute[]
  showOriginal?: boolean
  showOptimized?: boolean
  showCleaningPattern?: boolean
  showFuelEfficiency?: boolean
  selectedVehicleId?: string | null
}

export interface CleaningVisualizationLayers {
  originalRouteLayers: Layer[]
  optimizedRouteLayers: Layer[]
  cleaningPatternLayers: Layer[]
  efficiencyLayers: Layer[]
}

/**
 * Hook to generate cleaning-specific visualization layers
 */
export function useCleaningRouteVisualization({
  originalRoutes,
  optimizedRoutes,
  showOriginal = true,
  showOptimized = true,
  showCleaningPattern = false,
  showFuelEfficiency = false,
  selectedVehicleId
}: CleaningRouteVisualizationProps): CleaningVisualizationLayers {
  
  const originalRouteLayers = useMemo(() => {
    if (!showOriginal || originalRoutes.length === 0) return []

    return [
      new PathLayer({
        id: 'original-routes',
        data: originalRoutes,
        pickable: false,
        getPath: (d: VehicleRouteSegment) => d.path,
        widthMinPixels: 2,
        widthMaxPixels: 6,
        getWidth: (d: VehicleRouteSegment) => selectedVehicleId === d.vehicleId ? 5 : 3,
        getColor: [128, 128, 128, 120], // Gray for original routes
        capRounded: true,
        jointRounded: true,
        dashJustified: true,
        getDashArray: [3, 2], // Dashed line for original
        updateTriggers: {
          getWidth: selectedVehicleId
        }
      })
    ]
  }, [originalRoutes, showOriginal, selectedVehicleId])

  const optimizedRouteLayers = useMemo(() => {
    if (!showOptimized || optimizedRoutes.length === 0) return []

    const layers: Layer[] = []

    for (const route of optimizedRoutes) {
      // Main route path
      layers.push(
        new PathLayer({
          id: `optimized-route-${route.vehicleId}`,
          data: route.streets,
          pickable: true,
          getPath: (d) => d.path,
          widthMinPixels: 3,
          widthMaxPixels: 8,
          getWidth: (d) => selectedVehicleId === route.vehicleId ? 7 : 4,
          getColor: getRouteColor(route),
          capRounded: true,
          jointRounded: true,
          updateTriggers: {
            getWidth: selectedVehicleId,
            getColor: [route.cleaningPattern, route.efficiency.fuelSavings]
          }
        })
      )

      // Cleaning direction arrows
      if (showCleaningPattern) {
        layers.push(
          new ScatterplotLayer({
            id: `cleaning-direction-${route.vehicleId}`,
            data: generateDirectionArrows(route),
            pickable: false,
            radiusMinPixels: 3,
            radiusMaxPixels: 6,
            getPosition: (d: any) => d.position,
            getRadius: 4,
            getFillColor: [59, 130, 246, 180], // Blue arrows
            updateTriggers: {
              data: route.streets
            }
          })
        )
      }
    }

    return layers
  }, [optimizedRoutes, showOptimized, showCleaningPattern, selectedVehicleId])

  const cleaningPatternLayers = useMemo(() => {
    if (!showCleaningPattern || optimizedRoutes.length === 0) return []

    const layers: Layer[] = []

    for (const route of optimizedRoutes) {
      // Coverage areas for cleaning patterns
      if (route.cleaningPattern === 'spiral') {
        layers.push(createSpiralPatternLayer(route))
      } else if (route.cleaningPattern === 'grid') {
        layers.push(createGridPatternLayer(route))
      } else if (route.cleaningPattern === 'back_forth') {
        layers.push(createBackForthPatternLayer(route))
      }
    }

    return layers
  }, [optimizedRoutes, showCleaningPattern])

  const efficiencyLayers = useMemo(() => {
    if (!showFuelEfficiency || optimizedRoutes.length === 0) return []

    const layers: Layer[] = []

    for (const route of optimizedRoutes) {
      // Color-code route segments by fuel efficiency
      const efficiencySegments = route.streets.map(street => ({
        ...street,
        fuelEfficiency: calculateSegmentEfficiency(street)
      }))

      layers.push(
        new PathLayer({
          id: `fuel-efficiency-${route.vehicleId}`,
          data: efficiencySegments,
          pickable: true,
          getPath: (d: any) => d.path,
          widthMinPixels: 6,
          widthMaxPixels: 10,
          getWidth: 8,
          getColor: (d: any) => getFuelEfficiencyColor(d.fuelEfficiency),
          capRounded: true,
          jointRounded: true,
          updateTriggers: {
            getColor: route.estimatedFuelConsumption
          }
        })
      )
    }

    return layers
  }, [optimizedRoutes, showFuelEfficiency])

  return {
    originalRouteLayers,
    optimizedRouteLayers,
    cleaningPatternLayers,
    efficiencyLayers
  }
}

/**
 * Get color for optimized route based on efficiency
 */
function getRouteColor(route: OptimizedCleaningRoute): [number, number, number, number] {
  const fuelSavings = route.efficiency.fuelSavings
  
  if (fuelSavings >= 30) {
    return [34, 197, 94, 200] // Green for high efficiency
  } else if (fuelSavings >= 15) {
    return [59, 130, 246, 200] // Blue for medium efficiency
  } else if (fuelSavings >= 5) {
    return [249, 115, 22, 200] // Orange for low efficiency
  } else {
    return [239, 68, 68, 200] // Red for very low efficiency
  }
}

/**
 * Generate direction arrows for cleaning route
 */
function generateDirectionArrows(route: OptimizedCleaningRoute): Array<{ position: [number, number] }> {
  const arrows: Array<{ position: [number, number] }> = []
  
  for (const street of route.streets) {
    if (street.path.length < 2) continue
    
    // Add arrow at 25%, 50%, and 75% of the path
    const positions = [0.25, 0.5, 0.75]
    
    for (const pos of positions) {
      const index = Math.floor(street.path.length * pos)
      if (index < street.path.length) {
        arrows.push({
          position: street.path[index]
        })
      }
    }
  }
  
  return arrows
}

/**
 * Create spiral pattern visualization layer
 */
function createSpiralPatternLayer(route: OptimizedCleaningRoute): Layer {
  // Generate spiral grid points
  const spiralPoints = generateSpiralGrid(route.streets)
  
  return new ScatterplotLayer({
    id: `spiral-pattern-${route.vehicleId}`,
    data: spiralPoints,
    pickable: false,
    radiusMinPixels: 2,
    radiusMaxPixels: 4,
    getPosition: (d: any) => d.position,
    getRadius: 3,
    getFillColor: [168, 85, 247, 100], // Purple for spiral
    updateTriggers: {
      data: route.streets
    }
  })
}

/**
 * Create grid pattern visualization layer
 */
function createGridPatternLayer(route: OptimizedCleaningRoute): Layer {
  const gridPoints = generateGridPoints(route.streets)
  
  return new ScatterplotLayer({
    id: `grid-pattern-${route.vehicleId}`,
    data: gridPoints,
    pickable: false,
    radiusMinPixels: 1,
    radiusMaxPixels: 3,
    getPosition: (d: any) => d.position,
    getRadius: 2,
    getFillColor: [34, 197, 94, 80], // Green for grid
    updateTriggers: {
      data: route.streets
    }
  })
}

/**
 * Create back-and-forth pattern visualization layer
 */
function createBackForthPatternLayer(route: OptimizedCleaningRoute): Layer {
  const backForthLines = generateBackForthLines(route.streets)
  
  return new PathLayer({
    id: `back-forth-pattern-${route.vehicleId}`,
    data: backForthLines,
    pickable: false,
    getPath: (d: any) => d.path,
    widthMinPixels: 1,
    widthMaxPixels: 2,
    getWidth: 1,
    getColor: [249, 115, 22, 120], // Orange for back-and-forth
    capRounded: true,
    updateTriggers: {
      data: route.streets
    }
  })
}

/**
 * Generate spiral grid points for visualization
 */
function generateSpiralGrid(streets: any[]): Array<{ position: [number, number] }> {
  if (streets.length === 0) return []
  
  // Calculate bounds
  const allPoints = streets.flatMap(s => s.path)
  const lngs = allPoints.map(p => p[0])
  const lats = allPoints.map(p => p[1])
  
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  
  const points: Array<{ position: [number, number] }> = []
  const gridSize = 20
  
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const lng = minLng + (maxLng - minLng) * (i / gridSize)
      const lat = minLat + (maxLat - minLat) * (j / gridSize)
      points.push({ position: [lng, lat] })
    }
  }
  
  return points
}

/**
 * Generate grid points for visualization
 */
function generateGridPoints(streets: any[]): Array<{ position: [number, number] }> {
  return generateSpiralGrid(streets) // Same grid, different color
}

/**
 * Generate back-and-forth pattern lines
 */
function generateBackForthLines(streets: any[]): Array<{ path: [number, number][] }> {
  if (streets.length === 0) return []
  
  const lines: Array<{ path: [number, number][] }> = []
  
  // Create connecting lines between parallel streets
  for (let i = 0; i < streets.length - 1; i++) {
    const current = streets[i]
    const next = streets[i + 1]
    
    if (current.path.length > 0 && next.path.length > 0) {
      lines.push({
        path: [
          current.path[current.path.length - 1],
          next.path[0]
        ]
      })
    }
  }
  
  return lines
}

/**
 * Calculate fuel efficiency for a route segment
 */
function calculateSegmentEfficiency(street: any): number {
  // Simplified efficiency calculation
  // In practice, this would use real fuel consumption data
  const baseEfficiency = 12 // km/L
  
  // Apply factors based on street characteristics
  let efficiency = baseEfficiency
  
  if (street.priority === 'critical') {
    efficiency *= 0.8 // More intensive cleaning
  } else if (street.priority === 'low') {
    efficiency *= 1.2 // Light cleaning
  }
  
  return efficiency
}

/**
 * Get color based on fuel efficiency
 */
function getFuelEfficiencyColor(efficiency: number): [number, number, number, number] {
  // Green for high efficiency, red for low efficiency
  if (efficiency >= 15) {
    return [34, 197, 94, 200] // Green
  } else if (efficiency >= 12) {
    return [101, 163, 13, 200] // Light green
  } else if (efficiency >= 10) {
    return [249, 115, 22, 200] // Orange
  } else {
    return [239, 68, 68, 200] // Red
  }
}

/**
 * React component wrapper for cleaning route visualization
 */
export function CleaningRouteVisualization(props: CleaningRouteVisualizationProps) {
  const layers = useCleaningRouteVisualization(props)
  
  // Combine all layers
  const allLayers = [
    ...layers.originalRouteLayers,
    ...layers.optimizedRouteLayers,
    ...layers.cleaningPatternLayers,
    ...layers.efficiencyLayers
  ]
  
  return {
    layers: allLayers,
    layerCount: allLayers.length
  }
}

export default CleaningRouteVisualization