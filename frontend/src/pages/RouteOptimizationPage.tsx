/**
 * Route Optimization Page
 * Allows users to optimize vehicle routes using various algorithms
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  MapPin,
  Trash2,
  Play,
  Settings,
  TrendingDown,
  Clock,
  Fuel,
  Route,
  Download,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  History,
  Plus
} from 'lucide-react'
import { useRouteOptimization, RouteNode, OptimizationOptions } from '@/hooks/useRouteOptimization'
import { apiClient } from '@/services/api'
import { RouteHistoryPanel, RouteComparisonModal } from '@/components/routes/RouteHistoryPanel'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN

interface Vehicle {
  id: string
  plateNumber: string
  type: string
  fuelType: string
  fuelCapacity: number
  model: string
}

export default function RouteOptimizationPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('')
  const [nodes, setNodes] = useState<RouteNode[]>([])
  const [startPosition, setStartPosition] = useState<[number, number] | null>(null)
  const [isAddingWaypoints, setIsAddingWaypoints] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [viewMode, setViewMode] = useState<'create' | 'history'>('create')
  const [comparisonRoutes, setComparisonRoutes] = useState<any[]>([])
  const [showComparisonModal, setShowComparisonModal] = useState(false)
  const [options, setOptions] = useState<OptimizationOptions>({
    algorithm: 'hybrid',
    priorityWeight: 0.3,
    fuelOptimization: true,
    timeLimitMs: 15000,
    maxIterations: 1000,
  })

  const {
    optimizedRoute,
    isOptimizing,
    error,
    optimizeRoute,
    clearOptimization,
  } = useRouteOptimization({
    vehicleId: selectedVehicleId,
    saveToDatabase: true,
  })

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [41.5, 40.5], // Oltu, Erzurum coordinates
      zoom: 12,
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right')

    return () => {
      map.current?.remove()
    }
  }, [])

  // Fetch vehicles
  useEffect(() => {
    async function fetchVehicles() {
      try {
        const response = await apiClient.getVehicles()
        if (response.data) {
          setVehicles(response.data)
          if (response.data.length > 0 && !selectedVehicleId) {
            setSelectedVehicleId(response.data[0].id)
          }
        }
      } catch (error) {
        console.error('Failed to fetch vehicles:', error)
      }
    }
    fetchVehicles()
  }, [])

  // Handle map clicks for adding waypoints
  useEffect(() => {
    if (!map.current || !isAddingWaypoints) return

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat

      if (!startPosition) {
        // Set start position
        setStartPosition([lng, lat])
        addMarker([lng, lat], 'start', 'Start Point', '#22c55e')
      } else {
        // Add waypoint
        const newNode: RouteNode = {
          id: `node-${nodes.length + 1}`,
          position: [lng, lat],
          priority: 50,
          metadata: {},
        }
        setNodes((prev) => [...prev, newNode])
        addMarker([lng, lat], 'waypoint', `Stop ${nodes.length + 1}`, '#3b82f6')
      }
    }

    map.current.on('click', handleClick)

    return () => {
      map.current?.off('click', handleClick)
    }
  }, [isAddingWaypoints, startPosition, nodes.length])

  // Add marker to map
  const addMarker = (
    position: [number, number],
    type: 'start' | 'waypoint' | 'optimized',
    label: string,
    color: string
  ) => {
    if (!map.current) return

    const el = document.createElement('div')
    el.className = 'custom-marker'
    el.style.backgroundColor = color
    el.style.width = '32px'
    el.style.height = '32px'
    el.style.borderRadius = '50%'
    el.style.border = '3px solid white'
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'
    el.style.cursor = 'pointer'
    el.style.display = 'flex'
    el.style.alignItems = 'center'
    el.style.justifyContent = 'center'
    el.style.color = 'white'
    el.style.fontWeight = 'bold'
    el.style.fontSize = '12px'
    el.textContent = type === 'start' ? 'S' : nodes.length.toString()

    const marker = new mapboxgl.Marker(el)
      .setLngLat(position)
      .setPopup(new mapboxgl.Popup().setHTML(`<strong>${label}</strong>`))
      .addTo(map.current)

    markersRef.current.push(marker)
  }

  // Clear all markers
  const clearMarkers = () => {
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []
  }

  // Clear route and waypoints
  const handleClearRoute = () => {
    setNodes([])
    setStartPosition(null)
    clearMarkers()
    clearOptimization()
    if (map.current?.getSource('route')) {
      map.current.removeLayer('route')
      map.current.removeSource('route')
    }
  }

  // Handle optimization
  const handleOptimize = async () => {
    if (!selectedVehicleId) {
      alert('Please select a vehicle')
      return
    }

    if (!startPosition || nodes.length === 0) {
      alert('Please add a start point and at least one waypoint')
      return
    }

    const result = await optimizeRoute(nodes, startPosition, options)

    if (result) {
      // Draw optimized route on map
      drawOptimizedRoute(result.sequence)
    }
  }

  // Handle route selection from history
  const handleHistoryRouteSelect = (route: any) => {
    if (!route.optimizedPath || route.optimizedPath.length === 0) return

    // Switch to create mode to show the route
    setViewMode('create')

    // Draw the historical route
    drawHistoricalRoute(route.optimizedPath)
  }

  // Handle comparison
  const handleCompare = (routes: any[]) => {
    setComparisonRoutes(routes)
    setShowComparisonModal(true)
  }

  // Draw historical route
  const drawHistoricalRoute = (path: Array<[number, number]>) => {
    if (!map.current || path.length === 0) return

    // Clear existing
    handleClearRoute()

    // Draw route
    if (map.current.getSource('route')) {
      map.current.removeLayer('route')
      map.current.removeSource('route')
    }

    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: path,
        },
      },
    })

    map.current.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#8b5cf6',
        'line-width': 4,
        'line-opacity': 0.8,
      },
    })

    // Add markers
    path.forEach((coord, index) => {
      addMarker(
        coord,
        index === 0 ? 'start' : 'optimized',
        index === 0 ? 'Start' : `Stop ${index}`,
        index === 0 ? '#22c55e' : '#8b5cf6'
      )
    })

    // Fit map to route
    const bounds = new mapboxgl.LngLatBounds()
    path.forEach((coord) => bounds.extend(coord))
    map.current.fitBounds(bounds, { padding: 50 })
  }

  // Draw optimized route
  const drawOptimizedRoute = (sequence: RouteNode[]) => {
    if (!map.current) return

    // Clear existing route
    if (map.current.getSource('route')) {
      map.current.removeLayer('route')
      map.current.removeSource('route')
    }

    // Create line coordinates from sequence
    const coordinates = startPosition
      ? [startPosition, ...sequence.map((node) => node.position)]
      : sequence.map((node) => node.position)

    // Add route layer
    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
    })

    map.current.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#ef4444',
        'line-width': 4,
        'line-opacity': 0.8,
      },
    })

    // Fit map to show entire route
    const bounds = new mapboxgl.LngLatBounds()
    coordinates.forEach((coord) => bounds.extend(coord as [number, number]))
    map.current.fitBounds(bounds, { padding: 50 })

    // Update markers with optimized order
    clearMarkers()
    if (startPosition) {
      addMarker(startPosition, 'start', 'Start', '#22c55e')
    }
    sequence.forEach((node, index) => {
      addMarker(node.position, 'optimized', `Stop ${index + 1}`, '#ef4444')
    })
  }

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rota Optimizasyonu</h1>
            <p className="mt-1 text-sm text-gray-500">
              Araç rotalarını optimize ederek yakıt tasarrufu sağlayın
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Settings className="w-4 h-4 inline mr-2" />
              Ayarlar
            </button>
            <button
              onClick={handleClearRoute}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RotateCcw className="w-4 h-4 inline mr-2" />
              Temizle
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-96 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {/* Tab Switcher */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setViewMode('create')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                viewMode === 'create'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'bg-gray-50 text-gray-600 hover:text-gray-900'
              }`}
            >
              <Plus className="w-4 h-4 inline mr-2" />
              Yeni Rota Oluştur
            </button>
            <button
              onClick={() => setViewMode('history')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                viewMode === 'history'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'bg-gray-50 text-gray-600 hover:text-gray-900'
              }`}
            >
              <History className="w-4 h-4 inline mr-2" />
              Rota Geçmişi
            </button>
          </div>

          {/* Route Creation Panel */}
          {viewMode === 'create' && (
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Vehicle Selection */}
              <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Araç Seçimi
              </label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Araç seçin</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.plateNumber} - {vehicle.model}
                  </option>
                ))}
              </select>
              {selectedVehicle && (
                <div className="mt-2 text-xs text-gray-600 space-y-1">
                  <div>Tip: {selectedVehicle.type}</div>
                  <div>Yakıt: {selectedVehicle.fuelType}</div>
                  <div>Kapasite: {selectedVehicle.fuelCapacity}L</div>
                </div>
              )}
            </div>

            {/* Waypoint Controls */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rota Noktaları
              </label>
              <button
                onClick={() => setIsAddingWaypoints(!isAddingWaypoints)}
                className={`w-full px-4 py-2 text-sm font-medium rounded-lg ${
                  isAddingWaypoints
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <MapPin className="w-4 h-4 inline mr-2" />
                {isAddingWaypoints ? 'Haritaya Tıklayın' : 'Nokta Ekle'}
              </button>

              {/* Waypoint List */}
              <div className="mt-4 space-y-2">
                {startPosition && (
                  <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        S
                      </div>
                      <span className="text-sm font-medium">Başlangıç</span>
                    </div>
                  </div>
                )}
                {nodes.map((node, index) => (
                  <div
                    key={node.id}
                    className="flex items-center justify-between p-2 bg-blue-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {index + 1}
                      </div>
                      <span className="text-sm font-medium">Durak {index + 1}</span>
                    </div>
                    <button
                      onClick={() => {
                        setNodes(nodes.filter((_, i) => i !== index))
                        // Remove marker would need tracking
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
              <div className="border-t pt-4 space-y-4">
                <h3 className="font-medium text-gray-900">Optimizasyon Ayarları</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Algoritma
                  </label>
                  <select
                    value={options.algorithm}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        algorithm: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="nearest_neighbor">En Yakın Komşu (Hızlı)</option>
                    <option value="genetic">Genetik Algoritma</option>
                    <option value="ant_colony">Karınca Kolonisi</option>
                    <option value="hybrid">Hibrit (Önerilen)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Öncelik Ağırlığı: {options.priorityWeight}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={options.priorityWeight}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        priorityWeight: parseFloat(e.target.value),
                      })
                    }
                    className="w-full"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="fuelOptimization"
                    checked={options.fuelOptimization}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        fuelOptimization: e.target.checked,
                      })
                    }
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="fuelOptimization" className="ml-2 text-sm text-gray-700">
                    Yakıt Optimizasyonu
                  </label>
                </div>
              </div>
            )}

            {/* Optimize Button */}
            <button
              onClick={handleOptimize}
              disabled={isOptimizing || !startPosition || nodes.length === 0}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              {isOptimizing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline mr-2" />
                  Optimize Ediliyor...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 inline mr-2" />
                  Rotayı Optimize Et
                </>
              )}
            </button>

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {/* Results */}
            {optimizedRoute && (
              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <h3 className="font-medium">Optimizasyon Tamamlandı!</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Route className="w-4 h-4" />
                      <span className="text-xs font-medium">Mesafe</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {(optimizedRoute.totalDistance / 1000).toFixed(1)} km
                    </div>
                    {optimizedRoute.savings.distance.savedPercent && (
                      <div className="text-xs text-green-600 flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" />
                        {optimizedRoute.savings.distance.savedPercent.toFixed(1)}% tasarruf
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs font-medium">Süre</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {optimizedRoute.totalTime.toFixed(0)} dk
                    </div>
                    {optimizedRoute.savings.time.savedPercent && (
                      <div className="text-xs text-green-600 flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" />
                        {optimizedRoute.savings.time.savedPercent.toFixed(1)}% tasarruf
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Fuel className="w-4 h-4" />
                      <span className="text-xs font-medium">Yakıt</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {optimizedRoute.fuelCost.toFixed(1)} L
                    </div>
                    {optimizedRoute.savings.fuel.savedPercent && (
                      <div className="text-xs text-green-600 flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" />
                        {optimizedRoute.savings.fuel.savedPercent.toFixed(1)}% tasarruf
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Settings className="w-4 h-4" />
                      <span className="text-xs font-medium">Algoritma</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 capitalize">
                      {optimizedRoute.algorithm}
                    </div>
                    <div className="text-xs text-gray-500">
                      {optimizedRoute.optimizationTimeMs}ms
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Route History Panel */}
          {viewMode === 'history' && (
            <RouteHistoryPanel
              vehicleId={selectedVehicleId}
              onRouteSelect={handleHistoryRouteSelect}
              onCompare={handleCompare}
            />
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapContainer} className="absolute inset-0" />

          {/* Map Instructions Overlay */}
          {isAddingWaypoints && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-10">
              <MapPin className="w-4 h-4 inline mr-2" />
              {!startPosition
                ? 'Başlangıç noktasını seçmek için haritaya tıklayın'
                : 'Durak noktalarını eklemek için haritaya tıklayın'}
            </div>
          )}
        </div>
      </div>

      {/* Route Comparison Modal */}
      {showComparisonModal && (
        <RouteComparisonModal
          routes={comparisonRoutes}
          onClose={() => setShowComparisonModal(false)}
          onSelectRoute={handleHistoryRouteSelect}
        />
      )}
    </div>
  )
}
