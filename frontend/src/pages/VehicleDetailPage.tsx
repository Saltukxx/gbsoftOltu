import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/services/api'
import {
  ArrowLeft,
  MapPin,
  Fuel,
  Clock,
  Activity,
  AlertTriangle,
  Truck,
  Maximize2,
  RefreshCw
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { RoleGuard, UserRole } from '@/components/guards/RoleGuard'
import { PageLoading, LoadingSpinner } from '@/components/ui/LoadingStates'
import { useVehicleLiveData } from '@/hooks/useVehicleLiveData'
import { useLayerPreferences } from '@/hooks/useLayerPreferences'
import { useOptimizedRoutes } from '@/hooks/useOptimizedRoutes'
import { VehicleMapContainer } from '@/components/vehicles/FleetOverview/VehicleMapContainer'
import { LayerToggleGroup } from '@/components/vehicles/LayerToggleGroup'
import { fitBoundsToVehicles } from '@/utils/mapUtils'
import type { VehicleDeckPoint, VehicleRouteSegment } from '@/types/vehicles'
import type { VehicleWithLocation } from '@/hooks/useVehicleLiveData'

function VehicleDetailPageContent() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [hoveredVehicle, setHoveredVehicle] = useState<VehicleDeckPoint | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [routeTimeWindow, setRouteTimeWindow] = useState<'30min' | '1h' | '2h' | '6h' | '24h' | 'all'>('24h')

  // Use persisted layer preferences
  const {
    preferences: layerPreferences,
    updatePreference: updateLayerPreference
  } = useLayerPreferences()

  const showVehicleLayer = layerPreferences.showVehicleLayer
  const showRouteLayer = layerPreferences.showRouteLayer
  const showTripsLayer = layerPreferences.showTripsLayer
  const showRoadNetwork = layerPreferences.showRoadNetwork

  // Fetch vehicle data
  const { data: vehicleResponse, isLoading: isLoadingVehicle } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => apiClient.get<{ success: boolean; data: VehicleWithLocation }>(`/api/vehicles/${id}`),
    enabled: !!id
  })

  // Fetch vehicle location history with time window - optimized
  const { data: locationsResponse, isLoading: isLoadingLocations } = useQuery({
    queryKey: ['vehicle-locations', id, routeTimeWindow],
    queryFn: async () => {
      const hours = routeTimeWindow === 'all' ? 168 : 
                    routeTimeWindow === '24h' ? 24 :
                    routeTimeWindow === '6h' ? 6 :
                    routeTimeWindow === '2h' ? 2 :
                    routeTimeWindow === '1h' ? 1 : 0.5
      try {
        return await apiClient.get<{ success: boolean; data: any[] }>(
          `/api/vehicles/locations?vehicleId=${id}&hours=${Math.ceil(hours)}`
        )
      } catch (err: any) {
        if (err?.code === 'ECONNREFUSED' || !err?.response) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: !!id,
    refetchInterval: 30000, // Reduced to 30 seconds
    refetchOnWindowFocus: false,
    staleTime: 15000, // Consider data fresh for 15 seconds
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('Sunucuya bağlanılamıyor') || !error?.response) {
        return false
      }
      return failureCount < 1
    },
  })

  const vehicle = vehicleResponse?.data?.data
  const locations = locationsResponse?.data?.data || []

  // Get vehicle status helper
  const { getVehicleStatus, getFuelLevel } = useVehicleLiveData()

  // Stable color assignment
  const getColorIndex = useCallback((vehicleId: string) => {
    let hash = 0
    for (let i = 0; i < vehicleId.length; i++) {
      hash = ((hash << 5) - hash) + vehicleId.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash) % 10
  }, [])

  // Build vehicle point from current location
  const vehiclePoint = useMemo<VehicleDeckPoint | null>(() => {
    if (!vehicle) return null

    const latestLocation = locations[0] || vehicle.lastLocation
    if (!latestLocation) return null

    if (
      typeof latestLocation.longitude !== 'number' ||
      typeof latestLocation.latitude !== 'number' ||
      Number.isNaN(latestLocation.longitude) ||
      Number.isNaN(latestLocation.latitude)
    ) {
      return null
    }

    const status = getVehicleStatus(vehicle)
    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      position: [latestLocation.longitude, latestLocation.latitude],
      heading: latestLocation.heading ?? 0,
      speed: latestLocation.speed ?? 0,
      recordedAt: latestLocation.recordedAt,
      colorIndex: getColorIndex(vehicle.id),
      status: status.status
    }
  }, [vehicle, locations, getVehicleStatus, getColorIndex])

  // Build route segment from location history
  const rawRouteSegment = useMemo<VehicleRouteSegment | null>(() => {
    if (!vehicle || locations.length < 2) return null

    // Sort by timestamp
    const sortedLocations = locations
      .slice()
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())

    // Filter and validate coordinates
    const path = sortedLocations
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

    if (path.length < 2) return null

    return {
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      path,
      colorIndex: getColorIndex(vehicle.id),
      timestamps: sortedLocations.map((loc) => loc.recordedAt),
      startTime: sortedLocations[0].recordedAt,
      endTime: sortedLocations[sortedLocations.length - 1].recordedAt
    }
  }, [vehicle, locations, getColorIndex])

  // Optimize route to follow roads
  const rawRouteSegments = rawRouteSegment ? [rawRouteSegment] : []
  const { optimizedRoutes, isOptimizing: isOptimizingRoutes } = useOptimizedRoutes({
    routeSegments: rawRouteSegments,
    enabled: showRouteLayer,
    optimizationLevel: 'full'
  })

  const vehiclePoints = vehiclePoint ? [vehiclePoint] : []
  const routeSegments = optimizedRoutes

  // Handle vehicle hover
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
        }
      } else {
        setHoveredVehicle(null)
      }
    },
    []
  )

  // Fit bounds to vehicle route
  const handleFitBounds = useCallback(() => {
    const mapInstance = mapContainerRef.current
      ? (mapContainerRef.current as any).getMapInstance?.()
      : null
    if (!mapInstance || vehiclePoints.length === 0) return
    fitBoundsToVehicles(mapInstance, vehiclePoints)
  }, [vehiclePoints])

  // Center map on vehicle when it loads
  useEffect(() => {
    if (!vehiclePoint) return
    const mapInstance = mapContainerRef.current
      ? (mapContainerRef.current as any).getMapInstance?.()
      : null
    if (mapInstance) {
      mapInstance.flyTo({
        center: vehiclePoint.position,
        zoom: 15,
        duration: 1000
      })
    }
  }, [vehiclePoint])

  if (isLoadingVehicle) {
    return <PageLoading message="Araç verileri yükleniyor..." />
  }

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">Araç Bulunamadı</h3>
          <p className="text-sm text-gray-500 mt-1">Belirtilen araç bulunamadı.</p>
        </div>
        <button onClick={() => navigate('/vehicles')} className="btn btn-primary">
          Araç Listesine Dön
        </button>
      </div>
    )
  }

  const status = getVehicleStatus(vehicle)
  const fuelLevel = getFuelLevel(vehicle)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/vehicles')}
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Geri
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{vehicle.plateNumber}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {vehicle.type} • {vehicle.model || 'Model bilgisi yok'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleFitBounds}
            className="btn btn-secondary text-sm"
            disabled={vehiclePoints.length === 0}
          >
            <Maximize2 className="w-4 h-4 mr-1" />
            Rotayı Göster
          </button>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-secondary text-sm"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Yenile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Section */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Harita Görünümü</h3>
            <div className="flex items-center space-x-3">
              <select
                value={routeTimeWindow}
                onChange={(e) => setRouteTimeWindow(e.target.value as any)}
                className="input text-sm"
              >
                <option value="30min">Son 30 Dakika</option>
                <option value="1h">Son 1 Saat</option>
                <option value="2h">Son 2 Saat</option>
                <option value="6h">Son 6 Saat</option>
                <option value="24h">Son 24 Saat</option>
                <option value="all">Tümü</option>
              </select>
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
              selectedVehicleId={vehicle.id}
              onVehicleClick={() => {}}
              onVehicleHover={handleVehicleHover}
              hoveredVehicle={hoveredVehicle}
              hoverPosition={hoverPosition}
              center={vehiclePoint?.position || [41.987, 40.540]}
              zoom={15}
              className="h-96"
            />
            {isLoadingLocations && (
              <div className="absolute top-2 right-2 bg-blue-100 border border-blue-300 rounded-lg p-2">
                <div className="flex items-center text-sm text-blue-700">
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Konum verileri yükleniyor...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Status Card */}
          <div className="card p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Durum</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Durum</span>
                <span className={`px-2 py-1 text-xs rounded-full ${status.bg} ${status.color}`}>
                  {status.status === 'ONLINE' && 'Çevrimiçi'}
                  {status.status === 'IDLE' && 'Boşta'}
                  {status.status === 'OFFLINE' && 'Çevrimdışı'}
                </span>
              </div>
              {vehicle.lastLocation && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Son Güncelleme</span>
                    <span className="text-sm font-medium">
                      {new Date(vehicle.lastLocation.recordedAt).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Hız</span>
                    <span className="text-sm font-medium">
                      {vehicle.lastLocation.speed
                        ? Math.round(vehicle.lastLocation.speed)
                        : 0}{' '}
                      km/h
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Vehicle Info Card */}
          <div className="card p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Araç Bilgileri</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Plaka</span>
                <span className="font-medium">{vehicle.plateNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tip</span>
                <span>{vehicle.type}</span>
              </div>
              {vehicle.model && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Model</span>
                  <span>{vehicle.model}</span>
                </div>
              )}
              {vehicle.year && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Yıl</span>
                  <span>{vehicle.year}</span>
                </div>
              )}
            </div>
          </div>

          {/* Telemetry Card */}
          <div className="card p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Telemetri</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <Fuel className="w-4 h-4 text-gray-400 mr-2" />
                  <span className="text-gray-500">Yakıt Seviyesi</span>
                </div>
                <span
                  className={`font-medium ${
                    fuelLevel < 20 ? 'text-red-600' : fuelLevel < 50 ? 'text-yellow-600' : ''
                  }`}
                >
                  {fuelLevel}%
                </span>
              </div>
              {vehicle.lastLocation && (
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <Activity className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-gray-500">Hız</span>
                  </div>
                  <span className="font-medium">
                    {vehicle.lastLocation.speed
                      ? Math.round(vehicle.lastLocation.speed)
                      : 0}{' '}
                    km/h
                  </span>
                </div>
              )}
              {vehicle.lastLocation && (
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-gray-500">Koordinat</span>
                  </div>
                  <span className="text-xs font-mono">
                    {vehicle.lastLocation.latitude?.toFixed(6)},{' '}
                    {vehicle.lastLocation.longitude?.toFixed(6)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Route Info Card */}
          {rawRouteSegment && (
            <div className="card p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Rota Bilgileri</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Nokta Sayısı</span>
                  <span className="font-medium">{rawRouteSegment.path.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Başlangıç</span>
                  <span className="text-xs">
                    {new Date(rawRouteSegment.startTime).toLocaleString('tr-TR')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Son Güncelleme</span>
                  <span className="text-xs">
                    {new Date(rawRouteSegment.endTime).toLocaleString('tr-TR')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VehicleDetailPage() {
  return (
    <ErrorBoundary>
      <RoleGuard requiredRole={UserRole.MESSENGER}>
        <VehicleDetailPageContent />
      </RoleGuard>
    </ErrorBoundary>
  )
}

