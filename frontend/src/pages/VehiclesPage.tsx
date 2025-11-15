import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import {
  Filter,
  RefreshCw,
  MapPin,
  Maximize2,
  AlertTriangle,
  X,
  Navigation
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole, usePermission } from '@/components/guards/RoleGuard'
import { PageLoading, ConnectionStatus } from '@/components/ui/LoadingStates'
import { useNetworkStatus } from '@/components/ui/Toast'
import { useVehicleLiveData } from '@/hooks/useVehicleLiveData'
import { useLayerPreferences } from '@/hooks/useLayerPreferences'
import { useOptimizedRoutes } from '@/hooks/useOptimizedRoutes'
import { LayerToggleGroup } from '@/components/vehicles/LayerToggleGroup'
import { VehicleMapContainer } from '@/components/vehicles/FleetOverview/VehicleMapContainer'
import { VehicleListPanel } from '@/components/vehicles/FleetOverview/VehicleListPanel'
import { VehicleSummaryHeader } from '@/components/vehicles/FleetOverview/VehicleSummaryHeader'
import { useRoutePlanner, RoutePlannerUI } from '@/components/map/RoutePlanner'
import { fitBoundsToVehicles } from '@/utils/mapUtils'
import type { VehicleDeckPoint, VehicleRouteSegment } from '@/types/vehicles'

// Set Mapbox access token with validation
const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
if (!mapboxToken || mapboxToken.includes('your-') || mapboxToken.includes('token-here')) {
  console.error('⚠️ Mapbox token is missing or invalid. Maps will not work.')
} else {
  mapboxgl.accessToken = mapboxToken
}

function VehiclesPageContent() {
  const navigate = useNavigate()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [hoveredVehicle, setHoveredVehicle] = useState<VehicleDeckPoint | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [routePlannerEnabled, setRoutePlannerEnabled] = useState(false)

  // Use persisted layer preferences
  const {
    preferences: layerPreferences,
    updatePreference: updateLayerPreference
  } = useLayerPreferences()

  const showVehicleLayer = layerPreferences.showVehicleLayer
  const showRouteLayer = layerPreferences.showRouteLayer
  const showTripsLayer = layerPreferences.showTripsLayer
  const showRoadNetwork = layerPreferences.showRoadNetwork

  const { hasRole } = usePermission()
  const canViewAll = hasRole(UserRole.OPERATOR)
  const { isOnline } = useNetworkStatus()

  // Stable map center and zoom to prevent re-initialization
  const mapCenter = useMemo<[number, number]>(() => [41.987, 40.540], []) // Oltu, Erzurum
  const mapZoom = useMemo(() => 13, [])

  // Fetch and manage vehicle data
  const {
    vehicles,
    locationHistory,
    isLoading,
    error,
    selectedVehicle,
    setSelectedVehicle,
    getVehicleStatus,
    getFuelLevel
  } = useVehicleLiveData()

  // Build vehicle points and route segments from location history
  const vehicleMeta = useMemo(() => {
    return new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
  }, [vehicles])

  // Stable color assignment based on vehicle ID hash
  const getColorIndex = useCallback((vehicleId: string, totalVehicles: number) => {
    let hash = 0
    for (let i = 0; i < vehicleId.length; i++) {
      hash = ((hash << 5) - hash) + vehicleId.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash) % totalVehicles
  }, [])

  // Optimized vehicle points computation with memoization
  const vehiclePoints = useMemo<VehicleDeckPoint[]>(() => {
    const points: VehicleDeckPoint[] = []
    const vehicleArray = Array.from(vehicleMeta.values())
    const processedVehicles = new Set<string>()

    // First, process vehicles with location history
    Object.entries(locationHistory).forEach(([vehicleId, history]) => {
      if (!history?.length) return
      const latest = history[0]

      if (
        typeof latest.longitude !== 'number' ||
        typeof latest.latitude !== 'number' ||
        Number.isNaN(latest.longitude) ||
        Number.isNaN(latest.latitude)
      ) {
        return
      }

      const vehicle = vehicleMeta.get(vehicleId)
      if (!vehicle) return
      
      processedVehicles.add(vehicleId)
      const status = getVehicleStatus(vehicle)
      points.push({
        vehicleId,
        plateNumber: vehicle?.plateNumber ?? vehicleId,
        position: [latest.longitude, latest.latitude],
        heading: latest.heading ?? 0,
        speed: latest.speed ?? 0,
        recordedAt: latest.recordedAt,
        colorIndex: getColorIndex(vehicleId, vehicleArray.length || 1),
        status: status.status
      })
    })

    // Then, add vehicles with lastLocation but no history
    vehicleArray.forEach((vehicle) => {
      if (processedVehicles.has(vehicle.id)) return
      if (!vehicle.lastLocation) return

      const loc = vehicle.lastLocation
      if (
        typeof loc.longitude !== 'number' ||
        typeof loc.latitude !== 'number' ||
        Number.isNaN(loc.longitude) ||
        Number.isNaN(loc.latitude)
      ) {
        return
      }

      const status = getVehicleStatus(vehicle)
      points.push({
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        position: [loc.longitude, loc.latitude],
        heading: loc.heading ?? 0,
        speed: loc.speed ?? 0,
        recordedAt: loc.recordedAt,
        colorIndex: getColorIndex(vehicle.id, vehicleArray.length || 1),
        status: status.status
      })
    })

    return points
  }, [locationHistory, vehicleMeta, getColorIndex, getVehicleStatus])

  // Build route segments with proper validation and sorting
  const rawRouteSegments = useMemo<VehicleRouteSegment[]>(() => {
    const routes: VehicleRouteSegment[] = []
    const vehicleArray = Array.from(vehicleMeta.values())

    Object.entries(locationHistory).forEach(([vehicleId, history]) => {
      if (!history || history.length < 2) return
      if (!vehicleMeta.has(vehicleId)) return

      // Sort by timestamp and filter invalid coordinates
      const sortedHistory = history
        .slice()
        .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())

      const path = sortedHistory
        .map((location) => [location.longitude, location.latitude] as [number, number])
        .filter(
          (coords) =>
            typeof coords[0] === 'number' &&
            typeof coords[1] === 'number' &&
            !Number.isNaN(coords[0]) &&
            !Number.isNaN(coords[1]) &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90
        )

      if (path.length < 2) return

      const vehicle = vehicleMeta.get(vehicleId)
      routes.push({
        vehicleId,
        plateNumber: vehicle?.plateNumber ?? vehicleId,
        path,
        colorIndex: getColorIndex(vehicleId, vehicleArray.length || 1),
        timestamps: sortedHistory.map((loc) => loc.recordedAt),
        startTime: sortedHistory[0].recordedAt,
        endTime: sortedHistory[sortedHistory.length - 1].recordedAt
      })
    })

    return routes
  }, [locationHistory, vehicleMeta, getColorIndex])

  // Optimize routes to follow roads using Mapbox Directions API
  const { optimizedRoutes: routeSegments } = useOptimizedRoutes({
    routeSegments: rawRouteSegments,
    enabled: showRouteLayer,
    optimizationLevel: 'full' // Use Mapbox Directions API for road-following routes
  })

  // Get map instance for route planner - use ref to avoid stale closures
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  
  const getMapInstance = useCallback(() => {
    if (mapContainerRef.current) {
      const instance = (mapContainerRef.current as any).getMapInstance?.()
      if (instance) {
        mapInstanceRef.current = instance
      }
      return instance
    }
    return mapInstanceRef.current
  }, [])

  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  
  // Update map instance when container becomes available or changes
  useEffect(() => {
    if (!mapContainerRef.current) return

    // Check immediately
    const checkMapInstance = () => {
      const instance = getMapInstance()
      if (instance && instance !== mapInstanceRef.current) {
        mapInstanceRef.current = instance
        setMapInstance(instance)
      }
    }

    checkMapInstance()

    // Listen for map instance ready event from VehicleMapContainer
    const handleMapReady = (event: Event) => {
      const customEvent = event as CustomEvent<{ map: mapboxgl.Map }>
      if (customEvent.detail?.map) {
        mapInstanceRef.current = customEvent.detail.map
        setMapInstance(customEvent.detail.map)
      }
    }

    mapContainerRef.current.addEventListener('mapInstanceReady', handleMapReady)

    // Fallback: Poll periodically until map is available (max 5 seconds)
    let pollCount = 0
    const maxPolls = 50 // 5 seconds at 100ms intervals
    const interval = setInterval(() => {
      pollCount++
      checkMapInstance()
      // Stop polling once we have a map instance or after max attempts
      if (mapInstanceRef.current || pollCount >= maxPolls) {
        clearInterval(interval)
      }
    }, 100)

    return () => {
      if (mapContainerRef.current) {
        mapContainerRef.current.removeEventListener('mapInstanceReady', handleMapReady)
      }
      clearInterval(interval)
    }
  }, [getMapInstance])

  const {
    startPoint,
    endPoint,
    plannedRoute,
    isPlanning: isPlanningRoute,
    clearRoute,
    routeLayer: plannedRouteLayers
  } = useRoutePlanner({
    map: mapInstance,
    enabled: routePlannerEnabled,
    onRoutePlanned: (route) => {
      // Fit map to route bounds
      const instance = getMapInstance()
      if (instance && route.geometry.coordinates.length > 0) {
        const bounds = new mapboxgl.LngLatBounds()
        route.geometry.coordinates.forEach(coord => bounds.extend(coord))
        instance.fitBounds(bounds, { padding: 50, duration: 1000 })
      }
    },
    onClear: () => {
      // Route cleared
    }
  })

  // Handle vehicle icon click - navigate to detail page
  const handleVehicleLayerPick = useCallback(
    (point: VehicleDeckPoint) => {
      const vehicle = vehicleMeta.get(point.vehicleId)
      if (vehicle) {
        navigate(`/vehicles/${vehicle.id}`)
      }
    },
    [vehicleMeta, navigate]
  )

  // Handle vehicle hover for tooltip
  const handleVehicleHover = useCallback(
    (point: VehicleDeckPoint | null, event: any) => {
      if (point && event) {
        setHoveredVehicle(point)
        if (mapContainerRef.current) {
          const rect = mapContainerRef.current.getBoundingClientRect()
          setHoverPosition({
            x: rect.left + (event.x || 0),
            y: rect.top + (event.y || 0)
          })
        } else {
          setHoverPosition({
            x: event.x || 0,
            y: event.y || 0
          })
        }
      } else {
        setHoveredVehicle(null)
      }
    },
    []
  )

  // Fit bounds to show all vehicles
  const handleFitBounds = useCallback(() => {
    const mapInstance = mapContainerRef.current
      ? (mapContainerRef.current as any).getMapInstance?.()
      : null
    if (!mapInstance || vehiclePoints.length === 0) return
    fitBoundsToVehicles(mapInstance, vehiclePoints)
  }, [vehiclePoints])

  // Handle vehicle selection from list
  const handleVehicleSelect = useCallback(
    (vehicle: typeof vehicles[0]) => {
      setSelectedVehicle(vehicle)
      const latest = locationHistory[vehicle.id]?.[0]
      const mapInstance = mapContainerRef.current
        ? (mapContainerRef.current as any).getMapInstance?.()
        : null
      if (mapInstance && latest) {
        mapInstance.flyTo({
          center: [latest.longitude, latest.latitude],
          zoom: Math.max(mapInstance.getZoom(), 14),
          duration: 1000
        })
      }
    },
    [locationHistory, setSelectedVehicle]
  )

  const handleVehicleDeselect = useCallback(() => {
    setSelectedVehicle(null)
  }, [setSelectedVehicle])

  // Check if server is not running
  const isServerError = error?.message?.includes('Sunucuya bağlanılamıyor') || 
                        error?.message?.includes('ECONNREFUSED') ||
                        (error && !(error as any)?.response)

  if (isLoading) {
    return <PageLoading message="Araç verileri yükleniyor..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">
            {isServerError ? 'Sunucuya Bağlanılamıyor' : 'Veriler Yüklenemedi'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {isServerError 
              ? 'Sunucu çalışmıyor gibi görünüyor. Lütfen backend sunucusunun çalıştığından emin olun.'
              : 'Araç verileri alınamadı. Lütfen tekrar deneyin.'}
          </p>
          {isServerError && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-left text-sm">
              <p className="font-medium text-yellow-800 mb-1">Çözüm önerileri:</p>
              <ul className="list-disc list-inside text-yellow-700 space-y-1">
                <li>Backend sunucusunu başlatın: <code className="bg-yellow-100 px-1 rounded">npm run dev</code> (backend klasöründe)</li>
                <li>Sunucunun doğru portta çalıştığını kontrol edin</li>
                <li>API URL'sinin doğru yapılandırıldığından emin olun</li>
              </ul>
            </div>
          )}
        </div>
        <button onClick={() => window.location.reload()} className="btn btn-primary">
          Sayfayı Yenile
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!isOnline && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 text-orange-600 mr-2" />
              <span className="text-orange-800 font-medium">İnternet bağlantısı yok</span>
              <span className="text-orange-600 ml-2">Canlı takip devre dışı</span>
            </div>
            <ConnectionStatus status="offline" showText={false} />
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Araç Takibi</h1>
          <p className="mt-1 text-sm text-gray-500">
            Araç konumları ve telemetri verilerini canlı izleyin
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canViewAll && (
            <button className="btn btn-secondary" disabled={!isOnline}>
              <Filter className="w-4 h-4 mr-2" />
              Filtrele
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => window.location.reload()}
            disabled={!isOnline}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Yenile
          </button>
          <ConnectionStatus status={isOnline ? 'online' : 'offline'} className="ml-2" />
        </div>
      </div>

      <VehicleSummaryHeader
        vehicles={vehicles}
        getVehicleStatus={getVehicleStatus}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <VehicleListPanel
            vehicles={vehicles}
            selectedVehicle={selectedVehicle}
            onVehicleSelect={handleVehicleSelect}
            onVehicleDeselect={handleVehicleDeselect}
            getVehicleStatus={getVehicleStatus}
            getFuelLevel={getFuelLevel}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>

        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Harita Görünümü</h3>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  const mapInstance = mapContainerRef.current
                    ? (mapContainerRef.current as any).getMapInstance?.()
                    : null
                  if (mapInstance) {
                    mapInstance.flyTo({
                      center: [41.987, 40.540],
                      zoom: 13,
                      duration: 1500
                    })
                  }
                }}
                className="btn btn-secondary text-sm"
                title="Oltu'ya dön"
              >
                <MapPin className="w-4 h-4 mr-1" />
                Oltu'ya Dön
              </button>
              {canViewAll && (
                <>
                  <button
                    onClick={() => setRoutePlannerEnabled(!routePlannerEnabled)}
                    className={`btn btn-secondary text-sm ${
                      routePlannerEnabled ? 'bg-blue-50 border-blue-300 text-blue-700' : ''
                    }`}
                    title="Rota planlayıcıyı aç/kapat"
                  >
                    <Navigation className="w-4 h-4 mr-1" />
                    Rota Planla
                  </button>
                  <button
                    onClick={handleFitBounds}
                    className="btn btn-secondary text-sm"
                    title="Tüm araçları göster"
                    disabled={vehiclePoints.length === 0}
                  >
                    <Maximize2 className="w-4 h-4 mr-1" />
                    Tümünü Göster
                  </button>
                  <LayerToggleGroup
                    showVehicleLayer={showVehicleLayer}
                    showRouteLayer={showRouteLayer}
                    showTripsLayer={showTripsLayer}
                    showRoadNetwork={showRoadNetwork}
                    onToggleVehicleLayer={() => updateLayerPreference('showVehicleLayer', !showVehicleLayer)}
                    onToggleRouteLayer={() => updateLayerPreference('showRouteLayer', !showRouteLayer)}
                    onToggleTripsLayer={() => updateLayerPreference('showTripsLayer', !showTripsLayer)}
                    onToggleRoadNetwork={() => updateLayerPreference('showRoadNetwork', !showRoadNetwork)}
                  />
                </>
              )}
            </div>
          </div>

          <div className="relative" ref={mapContainerRef}>
            <VehicleMapContainer
              vehiclePoints={vehiclePoints}
              routeSegments={routeSegments}
              showVehicleLayer={showVehicleLayer}
              showRouteLayer={showRouteLayer}
              showTripsLayer={showTripsLayer}
              showRoadNetwork={showRoadNetwork}
              plannedRouteLayers={plannedRouteLayers}
              selectedVehicleId={selectedVehicle?.id ?? null}
              onVehicleClick={handleVehicleLayerPick}
              onVehicleHover={handleVehicleHover}
              hoveredVehicle={hoveredVehicle}
              hoverPosition={hoverPosition}
              center={mapCenter}
              zoom={mapZoom}
              className="h-96"
            />
            
            {/* Route Planner UI */}
            {routePlannerEnabled && (
              <div className="absolute top-4 right-4 z-10 max-w-xs">
                <RoutePlannerUI
                  startPoint={startPoint}
                  endPoint={endPoint}
                  plannedRoute={plannedRoute}
                  isPlanning={isPlanningRoute}
                  onClear={clearRoute}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedVehicle && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">
              Araç Detayları - {selectedVehicle.plateNumber}
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/vehicles/${selectedVehicle.id}`)}
                className="btn btn-primary text-sm"
              >
                Detaylı Görünüm
              </button>
              <button
                onClick={handleVehicleDeselect}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Araç Bilgileri</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Plaka:</span>
                  <span className="font-medium">{selectedVehicle.plateNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tip:</span>
                  <span>{selectedVehicle.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Model:</span>
                  <span>{selectedVehicle.model || '-'}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Konum Bilgileri</h4>
              <div className="space-y-2 text-sm">
                {selectedVehicle.lastLocation ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Hız:</span>
                      <span>
                        {selectedVehicle.lastLocation.speed
                          ? Math.round(selectedVehicle.lastLocation.speed)
                          : 0}{' '}
                        km/h
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Son Güncelleme:</span>
                      <span>
                        {new Date(selectedVehicle.lastLocation.recordedAt).toLocaleString('tr-TR')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Koordinat:</span>
                      <span className="text-xs">
                        {selectedVehicle.lastLocation.latitude?.toFixed(6)},{' '}
                        {selectedVehicle.lastLocation.longitude?.toFixed(6)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500 italic">Konum bilgisi bulunamadı</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Telemetri</h4>
              <div className="space-y-2 text-sm">
                {selectedVehicle.lastTelemetry ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Yakıt Seviyesi:</span>
                      <span
                        className={
                          getFuelLevel(selectedVehicle) < 20 ? 'text-red-600 font-medium' : ''
                        }
                      >
                        {getFuelLevel(selectedVehicle)}%
                      </span>
                    </div>
                    {selectedVehicle.lastTelemetry.speed !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Hız:</span>
                        <span>{Math.round(selectedVehicle.lastTelemetry.speed)} km/h</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500 italic">Telemetri verisi bulunamadı</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function VehiclesPage() {
  return (
    <ErrorBoundary>
      <RoleGuard requiredRole={UserRole.MESSENGER}>
        <VehiclesPageContent />
      </RoleGuard>
    </ErrorBoundary>
  )
}
