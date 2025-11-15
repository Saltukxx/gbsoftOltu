import { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapboxWithDeck } from '@/hooks/useMapboxWithDeck'
import { useVehicleDeckLayers } from '@/hooks/useVehicleDeckLayers'
import { useVehicleIconAtlas } from '@/hooks/useVehicleIconAtlas'
import { useCleaningOptimizedRoutes, useCleaningVehicleData } from '@/hooks/useCleaningOptimizedRoutes'
import { useCleaningRouteVisualization } from '@/components/cleaning/CleaningRouteVisualization'
import { useRoadNetworkLayer } from '@/components/map/RoadNetworkLayer'
import { VehicleTooltip } from '@/components/vehicles/VehicleTooltip'
import { LoadingSpinner } from '@/components/ui/LoadingStates'
import type { VehicleDeckPoint, VehicleRouteSegment } from '@/types/vehicles'
import type { Layer } from '@deck.gl/core'

export interface VehicleMapContainerProps {
  vehiclePoints: VehicleDeckPoint[]
  routeSegments: VehicleRouteSegment[]
  showVehicleLayer: boolean
  showRouteLayer: boolean
  showTripsLayer: boolean
  showRoadNetwork?: boolean
  plannedRouteLayers?: Layer[] // Additional layers for planned routes
  selectedVehicleId: string | null
  onVehicleClick: (point: VehicleDeckPoint) => void
  onVehicleHover: (point: VehicleDeckPoint | null, event: any) => void
  hoveredVehicle: VehicleDeckPoint | null
  hoverPosition: { x: number; y: number }
  center?: [number, number]
  zoom?: number
  className?: string
  // Cleaning optimization props
  enableCleaningOptimization?: boolean
  cleaningOptimizationLevel?: 'basic' | 'standard' | 'advanced' | 'maximum'
  showCleaningPattern?: boolean
  showFuelEfficiency?: boolean
  vehicles?: any[] // Vehicle data for cleaning optimization
}

/**
 * VehicleMapContainer - Main map component for fleet overview
 * Handles map initialization, layer management, and interactions
 */
export function VehicleMapContainer({
  vehiclePoints,
  routeSegments,
  showVehicleLayer,
  showRouteLayer,
  showTripsLayer,
  showRoadNetwork = false,
  plannedRouteLayers = [],
  selectedVehicleId,
  onVehicleClick,
  onVehicleHover,
  hoveredVehicle,
  hoverPosition,
  center = [41.987, 40.540],
  zoom = 13,
  className = '',
  // Cleaning optimization props
  enableCleaningOptimization = false,
  cleaningOptimizationLevel = 'standard',
  showCleaningPattern = false,
  showFuelEfficiency = false,
  vehicles = []
}: VehicleMapContainerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [isUpdatingLayers, setIsUpdatingLayers] = useState(false)

  // Initialize map with Deck.gl overlay
  const { map, mapLoaded, updateLayers } = useMapboxWithDeck({
    containerRef: mapContainerRef,
    center,
    zoom
  })

  // Add road network layer
  useRoadNetworkLayer({
    map: map.current,
    enabled: showRoadNetwork,
    style: 'all' // Show all roads
  })

  // Generate icon atlas
  const iconAtlas = useVehicleIconAtlas()

  // Convert vehicles to cleaning vehicle format
  const cleaningVehicles = useCleaningVehicleData(vehicles)

  // Apply cleaning optimization if enabled
  const {
    optimizedRoutes,
    isOptimizing: isCleaningOptimizing,
    cleaningOptimization,
    performanceMetrics,
    recommendations
  } = useCleaningOptimizedRoutes({
    routeSegments,
    vehicles: cleaningVehicles,
    enabled: enableCleaningOptimization,
    optimizationLevel: cleaningOptimizationLevel,
    cleaningMode: enableCleaningOptimization,
    cleaningOptions: {
      prioritizeBy: 'fuel_efficiency',
      cleaningPattern: 'optimal'
    }
  })

  // Use optimized routes if cleaning optimization is enabled, otherwise use original
  const activeRouteSegments = enableCleaningOptimization ? optimizedRoutes : routeSegments

  // Generate cleaning visualization layers
  const cleaningVisualization = useCleaningRouteVisualization({
    originalRoutes: routeSegments,
    optimizedRoutes: cleaningOptimization?.vehicleRoutes || [],
    showOriginal: enableCleaningOptimization,
    showOptimized: enableCleaningOptimization,
    showCleaningPattern,
    showFuelEfficiency,
    selectedVehicleId
  })

  // Ensure vehicle layer is shown when there are vehicles (unless explicitly disabled)
  const effectiveShowVehicleLayer = showVehicleLayer && vehiclePoints.length > 0

  // Build Deck.gl layers
  const deckLayers = useVehicleDeckLayers({
    vehiclePoints,
    routeSegments: activeRouteSegments,
    iconAtlas,
    mapLoaded,
    showVehicleLayer: effectiveShowVehicleLayer,
    showRouteLayer,
    showTripsLayer,
    selectedVehicleId,
    onVehicleClick,
    onVehicleHover
  })

  // Combine vehicle layers with planned route layers and cleaning visualization
  const allLayers = useMemo(() => {
    const layers = [...deckLayers, ...plannedRouteLayers]
    
    // Add cleaning visualization layers if enabled
    if (enableCleaningOptimization) {
      layers.push(...cleaningVisualization.layers)
    }
    
    return layers
  }, [deckLayers, plannedRouteLayers, cleaningVisualization, enableCleaningOptimization])

  // Update layers when they change
  useEffect(() => {
    if (!mapLoaded) return

    setIsUpdatingLayers(true)
    updateLayers(allLayers)
    
    // Clear loading state after brief delay
    const timeout = setTimeout(() => {
      setIsUpdatingLayers(false)
    }, 150)

    return () => clearTimeout(timeout)
  }, [mapLoaded, allLayers, updateLayers])

  // Expose map instance for external control
  const getMapInstance = useCallback(() => {
    return map.current
  }, [map])

  // Store map instance in ref for parent access and notify when map becomes available
  useEffect(() => {
    if (mapContainerRef.current) {
      ;(mapContainerRef.current as any).getMapInstance = getMapInstance
    }
    
    // Also update when map becomes available
    if (mapLoaded && map.current && mapContainerRef.current) {
      // Trigger a re-check in parent component by updating the ref
      const event = new CustomEvent('mapInstanceReady', { detail: { map: map.current } })
      mapContainerRef.current.dispatchEvent(event)
    }
  }, [getMapInstance, mapLoaded, map])

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full rounded-lg" data-map-container />
      {!mapLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 rounded-lg space-y-2">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-gray-600">Harita yükleniyor...</p>
        </div>
      )}
      {mapLoaded && (isUpdatingLayers || isCleaningOptimizing) && (
        <div className="absolute top-2 left-2 bg-blue-100 border border-blue-300 rounded-lg p-2">
          <div className="flex items-center text-sm text-blue-700">
            <LoadingSpinner size="sm" />
            <span className="ml-2">
              {isCleaningOptimizing ? 'Temizlik rotası optimize ediliyor...' : 'Katmanlar güncelleniyor...'}
            </span>
          </div>
        </div>
      )}
      
      {enableCleaningOptimization && performanceMetrics && (
        <div className="absolute top-2 right-2 bg-green-100 border border-green-300 rounded-lg p-2">
          <div className="text-sm text-green-700">
            <div className="font-medium">Optimizasyon Başarılı!</div>
            <div className="text-xs">
              %{performanceMetrics.fuelEfficiencyImprovement.toFixed(1)} yakıt tasarrufu
            </div>
          </div>
        </div>
      )}
      {hoveredVehicle && mapLoaded && (
        <VehicleTooltip
          point={hoveredVehicle}
          x={hoverPosition.x}
          y={hoverPosition.y}
        />
      )}
    </div>
  )
}

