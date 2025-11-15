import { useRef, useEffect, useMemo, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { Layer } from '@deck.gl/core'
import { devLog } from '@/utils/logger'
import { useToast } from '@/components/ui/Toast'

// Set Mapbox access token with validation
const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
if (!mapboxToken || mapboxToken.includes('your-') || mapboxToken.includes('token-here')) {
  console.error('⚠️ Mapbox token is missing or invalid. Maps will not work.')
} else {
  mapboxgl.accessToken = mapboxToken
}

export interface VehicleMapProps {
  containerRef: React.RefObject<HTMLDivElement>
  center?: [number, number]
  zoom?: number
  layers?: Layer[]
  onMapLoad?: (map: mapboxgl.Map) => void
  onError?: (error: Error) => void
  className?: string
}

/**
 * VehicleMap - Abstraction component for Mapbox + Deck.gl integration
 * Provides a clean interface for rendering vehicle tracking maps
 */
export function VehicleMap({
  containerRef,
  center = [41.987, 40.540], // Oltu, Erzurum default
  zoom = 13,
  layers = [],
  onMapLoad,
  onError,
  className = ''
}: VehicleMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const toast = useToast()

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
    if (!token || token.includes('your-') || token.includes('token-here')) {
      const error = new Error('Mapbox token is missing or invalid')
      onError?.(error)
      toast.error('Harita hatası', 'Mapbox token eksik veya geçersiz')
      return
    }

    try {
      // Create Mapbox map
      mapRef.current = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center,
        zoom,
        accessToken: token
      })

      // Handle map load event
      mapRef.current.on('load', () => {
        devLog.log('Map loaded successfully')

        try {
          if (mapRef.current) {
            // Disable rotation for better UX
            mapRef.current.dragRotate.disable()
            mapRef.current.touchZoomRotate.disableRotation()

            // Create and attach Deck.gl overlay
            if (!overlayRef.current) {
              overlayRef.current = new MapboxOverlay({ layers: [] })
              mapRef.current.addControl(overlayRef.current)
            }
          }
        } catch (err) {
          devLog.warn('Could not configure map controls:', err)
        }

        setMapLoaded(true)
        onMapLoad?.(mapRef.current!)
      })

      // Handle map errors
      mapRef.current.on('error', (e: any) => {
        devLog.error('Mapbox error:', e)
        setMapLoaded(false)

        const error = new Error(
          e.error?.message?.includes('token') || e.error?.message?.includes('unauthorized')
            ? 'Mapbox token geçersiz veya yetkisiz'
            : e.error?.message || 'Bilinmeyen hata'
        )
        onError?.(error)
      })
    } catch (error) {
      devLog.error('Failed to initialize map:', error)
      onError?.(error as Error)
    }

    // Cleanup
    return () => {
      if (overlayRef.current && mapRef.current) {
        try {
          mapRef.current.removeControl(overlayRef.current)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      overlayRef.current = null
    }
  }, [containerRef, center, zoom, onMapLoad, onError, toast])

  // Update layers when they change
  useEffect(() => {
    if (!mapLoaded || !overlayRef.current) return

    try {
      overlayRef.current.setProps({ layers })
    } catch (error) {
      devLog.error('Failed to update map layers:', error)
    }
  }, [mapLoaded, layers])

  // Expose map instance via ref (for external control)
  useEffect(() => {
    if (containerRef.current) {
      ;(containerRef.current as any).__mapInstance = mapRef.current
    }
  }, [containerRef, mapLoaded])

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`} data-map-container />
  )
}

/**
 * Hook to get map instance from VehicleMap
 */
export function useMapInstance(containerRef: React.RefObject<HTMLDivElement>) {
  return useMemo(() => {
    if (!containerRef.current) return null
    return (containerRef.current as any).__mapInstance as mapboxgl.Map | null
  }, [containerRef])
}
