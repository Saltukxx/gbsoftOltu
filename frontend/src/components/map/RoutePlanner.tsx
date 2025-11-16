import { useState, useCallback, useEffect, useRef } from 'react'
import { MapPin, X, Navigation, Route as RouteIcon } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import { planRoute, formatDistance, formatDuration, type RoutePlan } from '@/utils/routePlanning'
import { PathLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'

interface RoutePlannerProps {
  map: mapboxgl.Map | null
  enabled: boolean
  onRoutePlanned?: (route: RoutePlan) => void
  onClear?: () => void
}

interface RouteMarker {
  id: 'start' | 'end'
  position: [number, number]
}

/**
 * RoutePlanner - Component for planning routes between two points
 * Allows users to click on map to set start/end points and get optimal routes
 */
export function useRoutePlanner({
  map,
  enabled,
  onRoutePlanned,
  onClear
}: RoutePlannerProps) {
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null)
  const [endPoint, setEndPoint] = useState<[number, number] | null>(null)
  const [plannedRoute, setPlannedRoute] = useState<RoutePlan | null>(null)
  const [isPlanning, setIsPlanning] = useState(false)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  // Handle map click to set waypoints
  useEffect(() => {
    if (!map || !enabled) {
      // Cleanup markers
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
      return
    }

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat
      const position: [number, number] = [lng, lat]

      if (!startPoint) {
        // Set start point
        setStartPoint(position)
        addMarker(map, position, 'start', 'Başlangıç')
      } else if (!endPoint) {
        // Set end point
        setEndPoint(position)
        addMarker(map, position, 'end', 'Bitiş')
      } else {
        // Reset and set new start point
        clearMarkers()
        setStartPoint(position)
        setEndPoint(null)
        setPlannedRoute(null)
        onClear?.()
        addMarker(map, position, 'start', 'Başlangıç')
      }
    }

    map.on('click', handleMapClick)

    return () => {
      map.off('click', handleMapClick)
      clearMarkers()
    }
  }, [map, enabled, startPoint, endPoint, onClear])

  // Plan route when both points are set
  useEffect(() => {
    if (!startPoint || !endPoint || !enabled) return

    const calculateRoute = async () => {
      setIsPlanning(true)
      try {
        const route = await planRoute(startPoint, endPoint, {
          profile: 'driving',
          steps: true
        })
        
        if (route) {
          setPlannedRoute(route)
          onRoutePlanned?.(route)
        }
      } catch (error) {
        console.error('Failed to plan route:', error)
      } finally {
        setIsPlanning(false)
      }
    }

    calculateRoute()
  }, [startPoint, endPoint, enabled, onRoutePlanned])

  const addMarker = (
    mapInstance: mapboxgl.Map,
    position: [number, number],
    type: 'start' | 'end',
    label: string
  ) => {
    const el = document.createElement('div')
    el.className = 'route-marker'
    el.style.width = '32px'
    el.style.height = '32px'
    el.style.borderRadius = '50%'
    el.style.backgroundColor = type === 'start' ? '#10b981' : '#ef4444'
    el.style.border = '3px solid white'
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'
    el.style.cursor = 'pointer'
    el.title = label

    const marker = new mapboxgl.Marker(el)
      .setLngLat(position)
      .addTo(mapInstance)

    markersRef.current.push(marker)
  }

  const clearMarkers = () => {
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []
  }

  const clearRoute = useCallback(() => {
    clearMarkers()
    setStartPoint(null)
    setEndPoint(null)
    setPlannedRoute(null)
    onClear?.()
  }, [onClear])

  // Generate Deck.gl layer for planned route
  const routeLayer = plannedRoute
    ? new PathLayer({
        id: 'planned-route',
        data: [
          {
            path: plannedRoute.geometry.coordinates,
            color: [59, 130, 246, 200] // Blue route
          }
        ],
        getPath: (d: any) => d.path,
        getColor: (d: any) => d.color,
        widthMinPixels: 4,
        widthMaxPixels: 8,
        pickable: false
      })
    : null

  return {
    startPoint,
    endPoint,
    plannedRoute,
    isPlanning,
    clearRoute,
    routeLayer: routeLayer ? [routeLayer] : []
  }
}

/**
 * RoutePlanner UI Component
 */
interface RoutePlannerUIProps {
  startPoint: [number, number] | null
  endPoint: [number, number] | null
  plannedRoute: RoutePlan | null
  isPlanning: boolean
  onClear: () => void
  className?: string
}

export function RoutePlannerUI({
  startPoint,
  endPoint,
  plannedRoute,
  isPlanning,
  onClear,
  className = ''
}: RoutePlannerUIProps) {
  if (!startPoint && !endPoint) {
    return (
      <div className={`card p-4 ${className}`}>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Navigation className="w-4 h-4" />
          <span>Haritaya tıklayarak başlangıç noktası seçin</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-900 flex items-center">
          <RouteIcon className="w-4 h-4 mr-2" />
          Rota Planlama
        </h4>
        <button
          onClick={onClear}
          className="text-gray-400 hover:text-gray-600"
          title="Temizle"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 text-sm">
        {startPoint && (
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-gray-600">Başlangıç</span>
            <span className="text-gray-400 text-xs">
              {startPoint[1].toFixed(6)}, {startPoint[0].toFixed(6)}
            </span>
          </div>
        )}

        {endPoint && (
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-gray-600">Bitiş</span>
            <span className="text-gray-400 text-xs">
              {endPoint[1].toFixed(6)}, {endPoint[0].toFixed(6)}
            </span>
          </div>
        )}

        {isPlanning && (
          <div className="text-blue-600 text-xs">Rota hesaplanıyor...</div>
        )}

        {plannedRoute && !isPlanning && (
          <div className="pt-2 border-t border-gray-200 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Mesafe:</span>
              <span className="font-medium">{formatDistance(plannedRoute.distance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Süre:</span>
              <span className="font-medium">{formatDuration(plannedRoute.duration)}</span>
            </div>
            {plannedRoute.steps.length > 0 && (
              <div className="text-xs text-gray-500 mt-2">
                {plannedRoute.steps.length} adım
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}





