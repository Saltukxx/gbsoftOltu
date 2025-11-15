import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/services/api'
import { websocketService } from '@/services/websocketService'
import { useToast, useNetworkStatus } from '@/components/ui/Toast'
import type { Vehicle, VehicleLocation, TelemetryData, WebSocketMessage } from '@/types'
import { MAX_ROUTE_POINTS } from '@/types/vehicles'

export interface VehicleWithLocation extends Vehicle {
  lastLocation?: VehicleLocation
  lastTelemetry?: TelemetryData
}

/**
 * Normalizes vehicle location data from various sources (WebSocket, API, etc.)
 */
function normalizeVehicleLocation(event: WebSocketMessage | VehicleLocation | any): VehicleLocation | null {
  if (!event) return null

  const payload = (event as WebSocketMessage)?.data ?? event
  const vehicleId = payload?.vehicleId ?? event?.vehicleId ?? payload?.vehicle?.id
  const latitude = payload?.latitude ?? payload?.lat ?? payload?.gps?.lat
  const longitude = payload?.longitude ?? payload?.lng ?? payload?.gps?.lng

  if (typeof vehicleId !== 'string' || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null
  }

  const heading = payload?.heading ?? payload?.gps?.heading
  const speed = payload?.speed ?? payload?.gps?.speed
  const recordedRaw = payload?.recordedAt ?? (event as WebSocketMessage)?.timestamp ?? Date.now()
  const recordedAt =
    typeof recordedRaw === 'string' ? recordedRaw : new Date(recordedRaw).toISOString()

  return {
    id: payload?.id ?? `${vehicleId}-${recordedAt}`,
    vehicleId,
    latitude,
    longitude,
    speed: typeof speed === 'number' ? speed : undefined,
    heading: typeof heading === 'number' ? heading : undefined,
    recordedAt,
    vehicle: payload?.vehicle ?? undefined
  }
}

/**
 * Groups locations by vehicle ID and limits to MAX_ROUTE_POINTS per vehicle
 */
function groupLocationsByVehicle(locations: VehicleLocation[]): Record<string, VehicleLocation[]> {
  const grouped: Record<string, VehicleLocation[]> = {}

  // Safety check: ensure locations is an array
  if (!Array.isArray(locations)) {
    console.warn('groupLocationsByVehicle: locations is not an array', locations)
    return {}
  }

  locations.forEach((location) => {
    if (!location?.vehicleId) return
    if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') return

    if (!grouped[location.vehicleId]) {
      grouped[location.vehicleId] = []
    }

    grouped[location.vehicleId].push(location)
  })

  Object.keys(grouped).forEach((vehicleId) => {
    grouped[vehicleId] = grouped[vehicleId]
      .slice()
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
      .slice(0, MAX_ROUTE_POINTS)
  })

  return grouped
}

interface UseVehicleLiveDataReturn {
  vehicles: VehicleWithLocation[]
  locationHistory: Record<string, VehicleLocation[]>
  isLoading: boolean
  error: Error | null
  setSelectedVehicle: (vehicle: VehicleWithLocation | null) => void
  selectedVehicle: VehicleWithLocation | null
  getVehicleStatus: (vehicle: VehicleWithLocation) => {
    status: 'ONLINE' | 'IDLE' | 'OFFLINE'
    color: string
    bg: string
  }
  getFuelLevel: (vehicle: VehicleWithLocation) => number
}

/**
 * Hook to manage vehicle data fetching, WebSocket subscriptions, and location history
 * Handles polling, real-time updates, and batched history updates
 */
export function useVehicleLiveData(): UseVehicleLiveDataReturn {
  const [vehicles, setVehicles] = useState<VehicleWithLocation[]>([])
  const [locationHistory, setLocationHistory] = useState<Record<string, VehicleLocation[]>>({})
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleWithLocation | null>(null)
  const vehiclesRef = useRef<VehicleWithLocation[]>([])
  const rafRef = useRef<number | null>(null)
  const pendingUpdatesRef = useRef<VehicleLocation[]>([])

  const toast = useToast()
  const { isOnline } = useNetworkStatus()

  // Fetch vehicles data
  const { data: vehiclesResponse, isLoading, error } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      try {
        return await apiClient.get<{ success: boolean; data: VehicleWithLocation[] }>('/api/vehicles')
      } catch (err: any) {
        // Check if server is not running (connection refused, network error)
        if (
          err?.code === 'ECONNREFUSED' ||
          err?.message?.includes('Network Error') ||
          err?.message?.includes('Failed to fetch') ||
          !err?.response
        ) {
          throw new Error('Sunucuya bağlanılamıyor. Sunucunun çalıştığından emin olun.')
        }
        throw err
      }
    },
    refetchInterval: isOnline ? 60000 : false, // 60 seconds
    refetchOnWindowFocus: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: (failureCount, error: any) => {
      // Don't retry if server is not running
      if (
        error?.message?.includes('Sunucuya bağlanılamıyor') ||
        error?.code === 'ECONNREFUSED' ||
        !error?.response
      ) {
        return false
      }
      // Don't retry on 429 (Too Many Requests) errors
      if (error?.response?.status === 429) {
        return false
      }
      return failureCount < 2 // Only retry up to 2 times for other errors
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    onError: (err: any) => {
      // Don't show error toast for rate limit errors or server not running (handled by UI)
      if (err?.response?.status !== 429 && !err?.message?.includes('Sunucuya bağlanılamıyor')) {
        toast.error('Araç verileri alınamadı', err.message)
      }
    }
  })

  const vehiclesData = vehiclesResponse?.data

  // Fetch vehicle locations - optimized for performance
  // Defer initial load slightly to prioritize vehicles data
  const { data: locationsResponse } = useQuery({
    queryKey: ['vehicle-locations'],
    queryFn: async () => {
      try {
        return await apiClient.get<{ success: boolean; data: VehicleLocation[]; period?: any; count?: number }>('/api/vehicles/locations?hours=24')
      } catch (err: any) {
        // Check if server is not running
        if (
          err?.code === 'ECONNREFUSED' ||
          err?.message?.includes('Network Error') ||
          err?.message?.includes('Failed to fetch') ||
          !err?.response
        ) {
          throw new Error('Sunucuya bağlanılamıyor')
        }
        throw err
      }
    },
    enabled: isOnline && !!vehiclesData, // Only fetch after vehicles are loaded
    refetchInterval: isOnline ? 30000 : false, // 30 seconds (reduced frequency)
    refetchOnWindowFocus: false,
    staleTime: 20000, // Consider data fresh for 20 seconds
    retry: (failureCount, error: any) => {
      // Don't retry if server is not running
      if (
        error?.message?.includes('Sunucuya bağlanılamıyor') ||
        error?.code === 'ECONNREFUSED' ||
        !error?.response
      ) {
        return false
      }
      if (error?.response?.status === 429) {
        return false
      }
      return failureCount < 1
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    onError: (err: any) => {
      // Don't show error toast for server not running or rate limits
      if (err?.response?.status !== 429 && !err?.message?.includes('Sunucuya bağlanılamıyor')) {
        toast.warning('Konum verileri alınamadı', 'Bağlantınızı kontrol edin')
      }
    }
  })

  // Update location history from API data
  // Merge with existing WebSocket updates, keeping most recent per location
  useEffect(() => {
    if (!locationsResponse?.data || !Array.isArray(locationsResponse.data)) return
    
    setLocationHistory((prevHistory) => {
      const apiHistory = groupLocationsByVehicle(locationsResponse.data)
      const merged: Record<string, VehicleLocation[]> = {}
      
      // Merge API and WebSocket data, keeping most recent per vehicle
      const allVehicleIds = new Set([
        ...Object.keys(prevHistory),
        ...Object.keys(apiHistory)
      ])
      
      allVehicleIds.forEach((vehicleId) => {
        const apiLocations = apiHistory[vehicleId] || []
        const wsLocations = prevHistory[vehicleId] || []
        
        // Combine and deduplicate by ID, then sort by timestamp
        const locationMap = new Map<string, VehicleLocation>()
        
        // Add API locations
        apiLocations.forEach((loc) => {
          locationMap.set(loc.id, loc)
        })
        
        // Add WebSocket locations (will overwrite API if same ID, or add new)
        wsLocations.forEach((loc) => {
          const existing = locationMap.get(loc.id)
          if (!existing || new Date(loc.recordedAt) > new Date(existing.recordedAt)) {
            locationMap.set(loc.id, loc)
          }
        })
        
        // Convert to array, sort by timestamp, limit to MAX_ROUTE_POINTS
        merged[vehicleId] = Array.from(locationMap.values())
          .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
          .slice(0, MAX_ROUTE_POINTS)
      })
      
      return merged
    })
  }, [locationsResponse])

  // Batch WebSocket updates using requestAnimationFrame
  const flushPendingUpdates = useCallback(() => {
    if (pendingUpdatesRef.current.length === 0) {
      rafRef.current = null
      return
    }

    const updates = [...pendingUpdatesRef.current]
    pendingUpdatesRef.current = []

    setLocationHistory((prev) => {
      const next = { ...prev }
      updates.forEach((location) => {
        if (!next[location.vehicleId]) {
          next[location.vehicleId] = []
        }
        // Remove duplicate by ID, then add new location
        const existing = next[location.vehicleId].filter((item) => item.id !== location.id)
        const updated = [location, ...existing]
          .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
          .slice(0, MAX_ROUTE_POINTS)
        next[location.vehicleId] = updated
      })
      return next
    })

    rafRef.current = null
  }, [])

  // Add location to history with batching
  const addLocationToHistory = useCallback((location: VehicleLocation) => {
    pendingUpdatesRef.current.push(location)
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(flushPendingUpdates)
    }
  }, [flushPendingUpdates])

  // Update vehicles state when API data changes
  useEffect(() => {
    if (!vehiclesData) return
    setVehicles((prev) => {
      const next = vehiclesData.map((vehicle) => {
        const previous = prev.find((item) => item.id === vehicle.id)
        const history = locationHistory[vehicle.id]
        const latestLocation = history?.[0] ?? vehicle.lastLocation ?? previous?.lastLocation
        const latestTelemetry = vehicle.lastTelemetry ?? previous?.lastTelemetry

        // Skip update if nothing changed
        if (
          previous &&
          previous.lastLocation?.id === latestLocation?.id &&
          previous.lastTelemetry?.timestamp === latestTelemetry?.timestamp &&
          previous.assignedOperatorId === vehicle.assignedOperatorId &&
          previous.plateNumber === vehicle.plateNumber &&
          previous.type === vehicle.type &&
          previous.model === vehicle.model
        ) {
          return previous
        }

        return {
          ...vehicle,
          lastLocation: latestLocation,
          lastTelemetry: latestTelemetry
        }
      })

      return next
    })
  }, [vehiclesData, locationHistory])

  // Keep vehicles ref updated for WebSocket handlers
  useEffect(() => {
    vehiclesRef.current = vehicles
  }, [vehicles])

  // Update selected vehicle when vehicles change
  useEffect(() => {
    if (!selectedVehicle) return

    const updated = vehicles.find((vehicle) => vehicle.id === selectedVehicle.id)
    if (!updated) {
      setSelectedVehicle(null)
      return
    }

    if (
      updated.lastLocation?.id !== selectedVehicle.lastLocation?.id ||
      updated.lastTelemetry?.timestamp !== selectedVehicle.lastTelemetry?.timestamp
    ) {
      setSelectedVehicle(updated)
    }
  }, [vehicles, selectedVehicle])

  // WebSocket subscriptions
  useEffect(() => {
    if (!isOnline || !vehiclesData?.length) return

    const vehicleIds = vehiclesData.map((vehicle) => vehicle.id)
    websocketService.subscribeToVehicles(vehicleIds)

    return () => {
      websocketService.unsubscribeFromVehicles(vehicleIds)
    }
  }, [isOnline, vehiclesData])

  // WebSocket event handlers
  useEffect(() => {
    if (!isOnline) return

    const handleVehicleLocation = (message: WebSocketMessage | VehicleLocation) => {
      const normalized = normalizeVehicleLocation(message)
      if (!normalized) return

      addLocationToHistory(normalized)
      setVehicles((prev) =>
        prev.map((vehicle) =>
          vehicle.id === normalized.vehicleId
            ? { ...vehicle, lastLocation: normalized }
            : vehicle
        )
      )
    }

    const handleTelemetryData = (message: WebSocketMessage | TelemetryData) => {
      const payload = (message as WebSocketMessage)?.data ?? message
      if (!payload || typeof (payload as any).vehicleId !== 'string') return

      const telemetry = payload as TelemetryData

      setVehicles((prev) =>
        prev.map((vehicle) =>
          vehicle.id === telemetry.vehicleId
            ? { ...vehicle, lastTelemetry: telemetry }
            : vehicle
        )
      )

      if (telemetry.fuelLevel && telemetry.fuelLevel < 20) {
        const vehicle = vehiclesRef.current.find((item) => item.id === telemetry.vehicleId)
        toast.warning(
          'Düşük yakıt seviyesi',
          `${vehicle?.plateNumber ?? telemetry.vehicleId}: %${Math.round(telemetry.fuelLevel)}`
        )
      }
    }

    websocketService.onVehicleLocation(handleVehicleLocation)
    websocketService.onTelemetryData(handleTelemetryData)

    return () => {
      websocketService.off('vehicle:location', handleVehicleLocation)
      websocketService.off('vehicle:telemetry', handleTelemetryData)
    }
  }, [isOnline, addLocationToHistory, toast])

  // Helper functions
  const getVehicleStatus = useCallback((vehicle: VehicleWithLocation) => {
    if (!vehicle.lastLocation) return { status: 'OFFLINE' as const, color: 'text-gray-500', bg: 'bg-gray-100' }

    const lastUpdate = new Date(vehicle.lastLocation.recordedAt)
    const now = new Date()
    const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60)

    if (minutesSinceUpdate < 5) {
      return { status: 'ONLINE' as const, color: 'text-green-700', bg: 'bg-green-100' }
    } else if (minutesSinceUpdate < 30) {
      return { status: 'IDLE' as const, color: 'text-yellow-700', bg: 'bg-yellow-100' }
    } else {
      return { status: 'OFFLINE' as const, color: 'text-gray-500', bg: 'bg-gray-100' }
    }
  }, [])

  const getFuelLevel = useCallback((vehicle: VehicleWithLocation) => {
    return vehicle.lastTelemetry?.fuelLevel || 0
  }, [])

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  return {
    vehicles,
    locationHistory,
    isLoading,
    error: error as Error | null,
    setSelectedVehicle,
    selectedVehicle,
    getVehicleStatus,
    getFuelLevel
  }
}

